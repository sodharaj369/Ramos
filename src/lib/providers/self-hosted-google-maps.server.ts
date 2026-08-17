/**
 * Self-hosted Google Maps lead source.
 *
 * Talks to a user-operated `gosom/google-maps-scraper` service (MIT licence)
 * over its HTTP API. The scraper runs OUTSIDE this application (Docker
 * container / worker); nothing is scraped from the browser or from this
 * server. We only submit a search term and read back the public business
 * listing data the service returns.
 *
 * Two deployment shapes are supported, selected with GMAPS_SCRAPER_MODE:
 *   "web"  (default) — the OSS binary started with `-web`:
 *       POST   /api/v1/jobs            { name, keywords[], lang, zoom, depth, email, max_time }
 *       GET    /api/v1/jobs/{id}       -> { status: ... }
 *       GET    /api/v1/jobs/{id}/download -> CSV of results
 *   "saas" — the optional SaaS edition (requires an API key):
 *       POST   /api/v1/scrape          { keyword, lang, max_depth, email, timeout }
 *       GET    /api/v1/jobs/{job_id}   -> { status, results[], result_count }
 *
 * No CAPTCHA solving, login bypass or access-control circumvention exists
 * here or is supported by this adapter.
 */
import type { LeadSearchRequest, RawLead } from "@/lib/domain-types";
import { parseCsv } from "@/lib/csv";
import {
  ProviderNotConfiguredError,
  ProviderUnavailableError,
  fetchWithTimeout,
} from "./runtime.server";

export const SELF_HOSTED_GMAPS_ID = "self-hosted-google-maps";

interface Config {
  baseUrl: string;
  apiKey: string | null;
  mode: "web" | "saas";
  lang: string;
  zoom: number;
  maxWaitMs: number;
}

/** Product ceiling; the UI defaults to a small limit on constrained hosting. */
const MAX_DISCOVERY_RESULTS = 50;
const DEFAULT_DISCOVERY_RESULTS = 5;
/**
 * The scraper can internally restart its job provider (Google Maps page hits a
 * "context deadline exceeded") while keeping the accepted job alive. During that
 * window the HTTP front-end may answer 502/503/504 or briefly 404. Allow a
 * bounded recovery budget instead of a fixed failure count.
 */
const TRANSIENT_RECOVERY_BUDGET_MS = 90000;
const MISSING_JOB_RECOVERY_BUDGET_MS = 45000;

const TRANSIENT_HTTP_STATUSES = new Set([502, 503, 504]);


export function readConfig(): Config | null {
  const baseUrl = (process.env["GMAPS_SCRAPER_URL"] ?? "").trim().replace(/\/+$/, "");
  if (!baseUrl) return null;
  const mode = (process.env["GMAPS_SCRAPER_MODE"] ?? "web").trim().toLowerCase();
  return {
    baseUrl,
    apiKey: (process.env["GMAPS_SCRAPER_API_KEY"] ?? "").trim() || null,
    mode: mode === "saas" ? "saas" : "web",
    lang: (process.env["GMAPS_SCRAPER_LANG"] ?? "en").trim().slice(0, 2) || "en",
    zoom: Number(process.env["GMAPS_SCRAPER_ZOOM"] ?? 15) || 15,
    // Real Google Maps scrapes routinely take several minutes. Default to
    // 6 minutes; the scraper stays responsible for its own job timeout.
    maxWaitMs: Math.min(
      Math.max(Number(process.env["GMAPS_SCRAPER_MAX_WAIT_MS"] ?? 360000) || 360000, 15000),
      600000,
    ),
  };
}

export function isConfigured(): boolean {
  return readConfig() !== null;
}

/* ---------------------------------------------------------------- query -- */

/**
 * Builds one Google-Maps-style search term out of the Lead Finder inputs
 * without repeating information the user already typed.
 * "Dentists near Gota, Ahmedabad" + location "Ahmedabad, India"
 *   -> "dentists, Gota, Ahmedabad, India"
 */
export function buildSearchTerm(request: LeadSearchRequest): string {
  const raw = request.query.trim();
  const split = /\b(?:near|in|around|based in)\b/i.exec(raw);
  const subjectFromQuery = split ? raw.slice(0, split.index).trim() : raw;
  const locationFromQuery = split ? raw.slice(split.index + split[0].length).trim() : "";

  const candidates = [
    request.industry?.trim() || subjectFromQuery,
    request.keyword?.trim() ?? "",
    locationFromQuery,
    request.location?.trim() ?? "",
  ];

  const parts: string[] = [];
  for (const candidate of candidates) {
    for (const piece of candidate
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)) {
      const key = piece.toLowerCase();
      const already = parts.some(
        (p) =>
          p.toLowerCase() === key || p.toLowerCase().includes(key) || key.includes(p.toLowerCase()),
      );
      if (!already) parts.push(piece);
    }
  }
  return parts.join(", ") || raw;
}

/* ------------------------------------------------------------ transport -- */

function headers(config: Config): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (config.apiKey) {
    h["x-api-key"] = config.apiKey;
    h["authorization"] = `Bearer ${config.apiKey}`;
  }
  return h;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function depthForLimit(limit: number): number {
  return Math.max(1, Math.min(10, Math.ceil(limit / 20)));
}

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  return `${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 200)}` : ""}`;
}

function describeHttpFailure(res: Response, detail: string): Error {
  if (res.status === 401 || res.status === 403) {
    return new ProviderNotConfiguredError(
      "Self-hosted Google Maps",
      "The scraper rejected the credentials. Check GMAPS_SCRAPER_API_KEY.",
    );
  }
  if (res.status === 404) {
    return new ProviderUnavailableError(
      `Scraper endpoint not found (${detail}). Check GMAPS_SCRAPER_URL and GMAPS_SCRAPER_MODE.`,
    );
  }
  if (res.status === 429) {
    return new ProviderUnavailableError(
      "The scraper service is rate limiting requests. Try a smaller search or lower concurrency.",
    );
  }
  // Cloudflare tunnel edge errors: the tunnel URL is up but no origin is connected.
  if ([521, 522, 523, 525, 526, 530].includes(res.status)) {
    return new ProviderUnavailableError(
      `The scraper tunnel is not connected (Cloudflare ${res.status}). Make sure Docker and the cloudflared tunnel are running on your machine, then update GMAPS_SCRAPER_URL with the current tunnel URL.`,
    );
  }
  return new ProviderUnavailableError(`Scraper service error: ${detail}`);

}

async function submitJob(config: Config, term: string, limit: number): Promise<string> {
  const timeoutSeconds = Math.round(config.maxWaitMs / 1000);
  const url =
    config.mode === "saas" ? `${config.baseUrl}/api/v1/scrape` : `${config.baseUrl}/api/v1/jobs`;
  const body =
    config.mode === "saas"
      ? {
          keyword: term,
          lang: config.lang,
          max_depth: depthForLimit(limit),
          // Keep discovery lightweight. Website crawling/email extraction is a
          // separate enrichment concern and is expensive on small hosts.
          email: false,
          timeout: Math.min(300, Math.max(30, timeoutSeconds)),
        }
      : {
          name: `sales-intelligence: ${term}`.slice(0, 120),
          keywords: [term],
          lang: config.lang,
          zoom: config.zoom,
          depth: depthForLimit(limit),
          email: false,
          max_time: Math.max(30, timeoutSeconds),
        };

  let res: Response;
  try {
    res = await fetchWithTimeout(
      url,
      { method: "POST", headers: headers(config), body: JSON.stringify(body) },
      20000,
    );
  } catch {
    throw new ProviderUnavailableError(
      "Could not reach the self-hosted scraper. Check that the service is running and GMAPS_SCRAPER_URL is correct.",
    );
  }
  if (!res.ok) throw describeHttpFailure(res, await readError(res));

  const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const id =
    (typeof payload?.["id"] === "string" && payload["id"]) ||
    (typeof payload?.["job_id"] === "string" && payload["job_id"]) ||
    (typeof payload?.["ID"] === "string" && payload["ID"]);
  if (!id) {
    throw new ProviderUnavailableError(
      "The scraper accepted the request but returned no job id (unexpected response shape).",
    );
  }
  return id;
}

function statusOf(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const obj = payload as Record<string, unknown>;
  const value = obj["status"] ?? obj["Status"] ?? obj["state"];
  return typeof value === "string" ? value.toLowerCase() : "";
}

const DONE = /^(ok|done|complete|completed|finished|success|succeeded)$/;
const FAILED = /^(fail|failed|error|cancelled|canceled|stopped)$/;

export async function pollJob(
  config: Config,
  jobId: string,
  options: {
    sleep?: (ms: number) => Promise<void>;
    retryBaseMs?: number;
    retryCapMs?: number;
    log?: (message: string) => void;
  } = {},
): Promise<Record<string, unknown>> {
  const started = Date.now();
  const deadline = started + config.maxWaitMs;
  let delay = 3000;
  const wait = options.sleep ?? sleep;
  const retryBaseMs = options.retryBaseMs ?? 2000;
  const retryCapMs = options.retryCapMs ?? 30000;
  const log = options.log ?? ((message: string) => console.info(`[gmaps-scraper] ${message}`));
  // Transient failures back off exponentially (2s→4s→8s→16s→30s, then capped)
  // and are bounded by a *time* budget, not an attempt count: the scraper can
  // internally restart its job provider and recover while still working.
  let transientStreak = 0;
  let transientSince = 0;
  let missingStreak = 0;
  let missingSince = 0;

  let lastTransient: string | null = null;
  let last: Record<string, unknown> = {};

  const elapsed = () => Math.round((Date.now() - started) / 1000);
  const transientBackoff = () =>
    Math.min(retryBaseMs * 2 ** Math.max(0, transientStreak - 1), retryCapMs);

  const recordTransientFailure = (detail: string) => {
    if (transientStreak === 0) transientSince = Date.now();
    transientStreak++;
    lastTransient = detail;
    const recovering = Date.now() - transientSince;
    log(
      `job=${jobId} transient=${detail} count=${transientStreak} recovering=${Math.round(
        recovering / 1000,
      )}s elapsed=${elapsed()}s`,
    );
    if (recovering >= TRANSIENT_RECOVERY_BUDGET_MS) {
      throw new ProviderUnavailableError(
        `Scraper service kept returning transient errors for ${Math.round(
          recovering / 1000,
        )}s (${detail}). The provider may be sleeping, restarting, or unavailable. No leads were saved.`,
      );
    }
  };

  while (Date.now() < deadline) {
    const waitMs = transientStreak > 0 ? transientBackoff() : delay;
    if (Date.now() + waitMs >= deadline) break;
    await wait(waitMs);
    if (Date.now() >= deadline) break;
    delay = Math.min(delay * 1.4, 8000);

    let res: Response;
    try {
      res = await fetchWithTimeout(
        `${config.baseUrl}/api/v1/jobs/${encodeURIComponent(jobId)}`,
        { headers: headers(config) },
        15000,
      );
    } catch {
      recordTransientFailure("no response from the scraper service");
      continue; // never re-submits the job; the deadline bounds this loop
    }

    if (!res.ok) {
      if (TRANSIENT_HTTP_STATUSES.has(res.status)) {
        recordTransientFailure(`${res.status} ${res.statusText}`.trim());
        continue;
      }
      if (res.status === 404) {
        // 404 is common right after submit (job not registered yet) and while
        // the scraper restarts its internal job provider. Only conclude the job
        // is genuinely gone after the missing-job budget is exhausted.
        if (missingStreak === 0) missingSince = Date.now();
        missingStreak++;
        if (Date.now() - missingSince < MISSING_JOB_RECOVERY_BUDGET_MS) {
          recordTransientFailure("404 job not found (yet)");
          continue;
        }
        log(`job=${jobId} missing for ${Math.round((Date.now() - missingSince) / 1000)}s — giving up`);
        throw new ProviderUnavailableError(
          "The scraper no longer knows about this search job. No leads were saved. Please retry with fewer results.",
        );
      }
      // Other non-transient responses fail immediately.
      throw describeHttpFailure(res, await readError(res));
    }
    missingStreak = 0;

    if (transientStreak > 0) {
      log(
        `job=${jobId} recovered after ${transientStreak} transient failure(s) in ${Math.round(
          (Date.now() - transientSince) / 1000,
        )}s`,
      );
    }
    transientStreak = 0;
    last = ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    const status = statusOf(last);
    if (DONE.test(status)) {
      log(`job=${jobId} final status=${status} elapsed=${elapsed()}s`);
      return last;
    }
    if (FAILED.test(status)) {
      const message = typeof last["error"] === "string" && last["error"] ? last["error"] : status;
      log(`job=${jobId} final status=${status} elapsed=${elapsed()}s`);
      throw new ProviderUnavailableError(`The scraper job failed: ${message}`);
    }
  }

  if (transientStreak > 0) {
    throw new ProviderUnavailableError(
      `Scraper service repeatedly returned transient errors until the search deadline (last response: ${lastTransient}). The provider may be sleeping, restarting, or unavailable. No leads were saved.`,
    );
  }
  throw new ProviderUnavailableError(
    `The scraper did not finish within ${Math.round(config.maxWaitMs / 1000)}s. No leads were saved. Please retry with fewer results or adjust the configured polling deadline.`,
  );
}


async function downloadCsvRows(config: Config, jobId: string): Promise<Record<string, string>[]> {
  let res!: Response;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(3000);
    try {
      res = await fetchWithTimeout(
        `${config.baseUrl}/api/v1/jobs/${encodeURIComponent(jobId)}/download`,
        { headers: headers(config) },
        60000,
      );
    } catch {
      continue;
    }
    if (res.ok || res.status < 500) break;
  }
  if (!res) {
    throw new ProviderUnavailableError(
      "Could not download the scraper results (service unreachable).",
    );
  }
  if (!res.ok) throw describeHttpFailure(res, await readError(res));
  const text = await res.text();
  if (!text.trim()) return [];
  const { headers: cols, rows } = parseCsv(text);
  return rows.map((row) => {
    const record: Record<string, string> = {};
    cols.forEach((col, i) => {
      record[col.trim().toLowerCase()] = (row[i] ?? "").trim();
    });
    return record;
  });
}

/* ----------------------------------------------------------- normalising -- */

function str(value: unknown): string | null {
  if (typeof value === "number") return String(value);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[,\s]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
function maybeJson(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string" && value.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
}
function firstEmail(value: unknown): string | null {
  if (Array.isArray(value)) return str(value[0]);
  const text = str(value);
  if (!text) return null;
  const cleaned = text.replace(/^\[|\]$/g, "").replace(/"/g, "");
  const candidate = cleaned.split(/[,;\s]+/).find((v) => v.includes("@"));
  return candidate ?? null;
}

import { parseAddressLocation, sanitizeAddress } from "@/lib/normalize";

/** Maps one scraper record (CSV row or SaaS JSON object) onto our RawLead. */
export function mapScraperRecord(record: Record<string, unknown>): RawLead {
  const compAddr = maybeJson(record["complete_address"]);
  const website = str(record["website"]);

  const rawAddr = sanitizeAddress(str(record["address"]));
  const streetAddr = sanitizeAddress(str(compAddr?.["street"]));

  const structuredParts = [
    streetAddr,
    str(compAddr?.["city"]),
    str(compAddr?.["state"]) ?? str(compAddr?.["region"]),
    str(compAddr?.["postal_code"]),
    str(compAddr?.["country"]),
  ].filter(Boolean);

  const fullStructuredAddr = structuredParts.length > 0 ? structuredParts.join(", ") : null;
  const finalAddress = fullStructuredAddr ?? rawAddr;

  const loc = parseAddressLocation(finalAddress);

  const attributes: Record<string, unknown> = {};
  const keep: [string, unknown][] = [
    ["place_id", str(record["place_id"])],
    ["cid", str(record["cid"])],
    ["data_id", str(record["data_id"])],
    ["plus_code", str(record["plus_code"])],
    ["latitude", num(record["latitude"])],
    ["longitude", num(record["longitude"])],
    ["timezone", str(record["timezone"])],
    ["price_range", str(record["price_range"])],
    ["open_hours", record["open_hours"] ?? null],
    ["thumbnail", str(record["thumbnail"])],
    ["reviews_link", str(record["reviews_link"])],
    ["menu", str(record["menu"])],
    ["owner", str(record["owner"])],
    ["about", record["about"] ?? null],
  ];
  for (const [key, value] of keep) {
    if (value !== null && value !== undefined && value !== "") attributes[key] = value;
  }

  return {
    company_name: str(record["title"]) ?? str(record["name"]) ?? "",
    website,
    domain: website,
    category: str(record["category"]),
    description: str(record["descriptions"]) ?? str(record["about_summary"]),
    address: finalAddress,
    city: str(compAddr?.["city"]) ?? loc.city ?? null,
    region: str(compAddr?.["state"]) ?? str(compAddr?.["region"]) ?? loc.region ?? null,
    country: str(compAddr?.["country"]) ?? loc.country ?? null,
    postal_code: str(compAddr?.["postal_code"]) ?? null,
    phone: str(record["phone"]),
    email: firstEmail(record["emails"] ?? record["email"]),
    rating: num(record["review_rating"]) ?? num(record["rating"]),
    review_count: num(record["review_count"]),
    business_type: str(record["category"]),
    opening_status: str(record["status"]),
    booking_url: str(record["reservations"]),
    ordering_url: str(record["order_online"]),
    contact_page_url: null,
    source_url: str(record["link"]),
    attributes,
  };
}

/* ------------------------------------------------------------- executor -- */

export async function searchSelfHostedGoogleMaps(request: LeadSearchRequest): Promise<RawLead[]> {
  const config = readConfig();
  if (!config) {
    throw new ProviderNotConfiguredError(
      "Self-hosted Google Maps",
      "Set the GMAPS_SCRAPER_URL secret to your scraper service URL.",
    );
  }

  const limit = Math.min(
    Math.max(request.limit ?? DEFAULT_DISCOVERY_RESULTS, 1),
    MAX_DISCOVERY_RESULTS,
  );
  const term = buildSearchTerm(request);
  const jobId = await submitJob(config, term, limit);
  console.info(`[gmaps-scraper] submitted job=${jobId} limit=${limit} mode=${config.mode}`);
  const job = await pollJob(config, jobId);

  let records: Record<string, unknown>[];
  if (config.mode === "saas") {
    const results = job["results"];
    records = Array.isArray(results) ? (results as Record<string, unknown>[]) : [];
  } else {
    records = await downloadCsvRows(config, jobId);
  }
  console.info(`[gmaps-scraper] job=${jobId} downloaded ${records.length} record(s)`);


  const leads = records
    .map((record) => mapScraperRecord(record))
    .filter((lead) => Boolean(lead.company_name))
    .filter((lead) => {
      if (request.requireWebsite && !lead.website) return false;
      if (request.requireEmail && !lead.email) return false;
      if (request.requirePhone && !lead.phone) return false;
      return true;
    });

  return leads.slice(0, limit);
}
