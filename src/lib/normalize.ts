/** Shared, client-safe normalisation helpers used for dedup + matching + canonical lead normalization. */

const OPEN_STATUS_STRICT_RE = /\b(open|closed|closes|opens|24\s*hours|temporarily\s*closed|permanently\s*closed)\b/i;
const GOOGLE_MAPS_URL_RE = /(google\.[^/]+\/maps|maps\.google\.|goo\.gl\/maps)/i;
const DOMAIN_TEXT_RE = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/i;

const UI_TITLE_BLACKLIST = new Set([
  "results",
  "search",
  "filters",
  "all filters",
  "nearby",
  "directions",
  "save",
  "share",
  "send to phone",
  "menu",
  "reviews",
  "overview",
  "about",
  "more",
  "back",
  "next",
  "showing results",
  "search instead for",
  "loading",
  "map options",
  "layers",
  "copy address",
  "copied",
]);

export function cleanUnicode(str?: string | null): string {
  if (!str) return "";
  return String(str)
    .replace(/[\uFFFD\u2605\u2b50★\u25A1□]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isPlusCodeText(part?: string | null): boolean {
  if (!part) return false;
  const p = cleanUnicode(part);
  if (!p) return false;
  return /\b[2-9CFGHJKMPQRVWX0-9]{4,7}\+[2-9CFGHJKMPQRVWX0-9]{2,4}\b/i.test(p);
}

export function isUIElementTitle(str?: string | null): boolean {
  if (!str) return true;
  const cleaned = cleanUnicode(str).toLowerCase();
  if (!cleaned.length) return true;
  if (UI_TITLE_BLACKLIST.has(cleaned)) return true;
  if (/^(showing results|search instead for|results for|copy address|copied)\b/i.test(cleaned)) return true;
  return false;
}

export function normalizeText(value?: string | null): string | null {
  if (!value) return null;
  const v = cleanUnicode(value).toLowerCase();
  return v.length ? v : null;
}

export function normalizeCompanyName(value?: string | null): string | null {
  const base = normalizeText(value);
  if (!base) return null;
  const stripped = base
    .replace(/[.,'"`&]/g, "")
    .replace(
      /\b(ltd|limited|llc|inc|incorporated|plc|gmbh|bv|pvt|private|pty|co|company|corp|corporation|llp)\b/g,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length ? stripped : base;
}

export function normalizeDomain(value?: string | null): string | null {
  if (!value) return null;
  let v = value.trim().toLowerCase();
  if (!v) return null;
  v = v.replace(/^https?:\/\//, "").replace(/^www\./, "");
  v = v.split("/")[0]!.split("?")[0]!.split("#")[0]!;
  if (!v.includes(".") || /\s/.test(v)) return null;
  return v;
}

export function normalizeWebsite(value?: string | null): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  if (GOOGLE_MAPS_URL_RE.test(v)) return null;
  if (/^https?:\/\//i.test(v)) return v.replace(/\/$/, "");
  if (DOMAIN_TEXT_RE.test(v)) return `https://${v}`.replace(/\/$/, "");
  return null;
}

export function normalizeEmail(value?: string | null): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  return v.includes("@") ? v : null;
}

export function normalizePhone(value?: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/[^\d+]/g, "");
  return digits.length >= 6 ? digits : null;
}

export function domainFromEmail(email?: string | null): string | null {
  const e = normalizeEmail(email);
  if (!e) return null;
  return normalizeDomain(e.split("@")[1] ?? null);
}

export function isPriceRangeText(part?: string | null): boolean {
  if (!part) return false;
  const p = cleanUnicode(part);
  if (!p) return false;
  if (!/[$\u20b9\u20ac\u00a3\u00a5€£¥₹]/.test(p)) return false;
  return (
    /^[$\u20b9\u20ac\u00a3\u00a5€£¥₹\s]+$/i.test(p) ||
    /^[$\u20b9\u20ac\u00a3\u00a5€£¥₹\s]*\d+[\d–\s\-,.]*$/i.test(p) ||
    /^[$\u20b9\u20ac\u00a3\u00a5€£¥₹]\d+([–\-]\d+)?$/i.test(p) ||
    /^\$\$\$?\$?$/i.test(p) ||
    /^₹\s*\d+([–\-,]\d+)?$/i.test(p) ||
    /\b[$\u20b9\u20ac\u00a3\u00a5€£¥₹]\d+[\d–\s\-,.]*\b/.test(p)
  );
}

export function isRatingOrReviewText(part?: string | null): boolean {
  if (!part) return false;
  const p = cleanUnicode(part);
  if (!p) return false;
  if (/^\d{5,6}(-\d{4})?$/.test(p)) return false;
  return (
    /^\d(\.\d)?\s*\([\d,]+\s*(reviews?)?\)$/i.test(p) ||
    /^\d\.\d$/i.test(p) ||
    /^\([\d,]+\s*(reviews?)?\)$/i.test(p) ||
    /^[\d,]+\s*reviews?$/i.test(p) ||
    /^\d(\.\d)?\s*stars?$/i.test(p) ||
    /\b\d\.\d\s*\([\d,]+\)/.test(p) ||
    /^\d{1,4}$/.test(p)
  );
}

export function sanitizeCategory(category?: string | null): string | null {
  if (!category) return null;
  const trimmed = cleanUnicode(category);
  if (!trimmed || isRatingOrReviewText(trimmed) || isPriceRangeText(trimmed) || isPlusCodeText(trimmed)) return null;
  return trimmed;
}

export function sanitizeAddress(address?: string | null): string | null {
  if (!address) return null;
  const trimmed = cleanUnicode(address);
  if (!trimmed || isRatingOrReviewText(trimmed) || isPriceRangeText(trimmed) || isPlusCodeText(trimmed)) return null;
  return trimmed;
}

/** Sanitize and validate opening status strings strictly. Rejects descriptions and attributes. */
export function sanitizeOpeningStatus(status?: string | null): string | null {
  if (!status) return null;
  const cleaned = cleanUnicode(status);
  if (!cleaned.length) return null;
  if (cleaned.length > 60) return null;
  if (/^(brunch|dinner|lunch|breakfast|dine-in|takeout|delivery|drive-through|in-store pickup)$/i.test(cleaned)) {
    return null;
  }
  if (/\b(chain|known|pizza|restaurant|food|shop|store|service|family|friendly|cozy|casual|popular|serving|located)\b/i.test(cleaned)) {
    return null;
  }
  if (OPEN_STATUS_STRICT_RE.test(cleaned)) {
    return cleaned;
  }
  return null;
}

/** Sanitize and unwrap URLs (handles JSON array strings e.g. '["https://..."]'). Rejects Google Maps URLs. */
export function sanitizeUrl(val?: unknown): string | null {
  if (!val) return null;
  let strVal = String(val).trim();
  if (!strVal.length) return null;

  if (strVal.startsWith("[") && strVal.endsWith("]")) {
    try {
      const parsed = JSON.parse(strVal);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const first = parsed.find((item) => typeof item === "string" && /^https?:\/\//i.test(item.trim()));
        if (first) strVal = String(first).trim();
      }
    } catch {
      const m = /(https?:\/\/[^\s"',\]]+)/i.exec(strVal);
      if (m) strVal = m[1]!;
    }
  }

  if (GOOGLE_MAPS_URL_RE.test(strVal)) return null;

  if (!/^https?:\/\//i.test(strVal)) {
    if (DOMAIN_TEXT_RE.test(strVal)) {
      strVal = `https://${strVal}`;
    } else {
      return null;
    }
  }

  try {
    const u = new URL(strVal);
    if (u.hostname && u.hostname.includes(".")) {
      return u.href.endsWith("/") && u.pathname === "/" ? u.href.slice(0, -1) : u.href;
    }
  } catch {
    return null;
  }

  return null;
}

export function parseAddressLocation(address?: string | null) {
  const clean = sanitizeAddress(address);
  if (!clean) return { city: null, region: null, country: null };
  const parts = clean
    .split(",")
    .map((p) => cleanUnicode(p))
    .filter((p) => Boolean(p) && !isRatingOrReviewText(p) && !isPriceRangeText(p) && !isPlusCodeText(p));
  if (parts.length === 0) return { city: null, region: null, country: null };
  if (parts.length === 1) return { city: parts[0]!, region: null, country: null };
  if (parts.length === 2) return { city: parts[0]!, region: parts[1]!, country: null };
  if (parts.length === 3) return { city: parts[0]!, region: parts[1]!, country: parts[2]! };
  return {
    city: parts[parts.length - 3] || parts[0]!,
    region: parts[parts.length - 2] || parts[1]!,
    country: parts[parts.length - 1] || null,
  };
}

export interface CanonicalLead {
  company_name: string;
  website: string | null;
  domain: string | null;
  category: string | null;
  business_type: string | null;
  description: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  rating: number | null;
  review_count: number | null;
  opening_status: string | null;
  booking_url: string | null;
  ordering_url: string | null;
  menu_url: string | null;
  source_url: string | null;
  place_id: string | null;
  latitude: number | null;
  longitude: number | null;
  price_range: string | null;
  attributes: Record<string, unknown>;
}

/** One authoritative canonical normalization pipeline for any raw lead input. */
export function normalizeBusinessLead(raw: Record<string, any>): CanonicalLead | null {
  if (!raw || typeof raw !== "object") return null;
  const company_name = cleanUnicode(raw.company_name ?? raw.name ?? raw.title);
  if (!company_name || isUIElementTitle(company_name)) return null;

  const website = sanitizeUrl(raw.website);
  const domain = normalizeDomain(raw.domain ?? website) ?? domainFromEmail(raw.email);
  const email = normalizeEmail(raw.email);
  const phone = raw.phone ? String(raw.phone).trim() : null;

  const category = sanitizeCategory(raw.category);
  const business_type = sanitizeCategory(raw.business_type) ?? category;

  const opening_status = sanitizeOpeningStatus(raw.opening_status ?? raw.status);
  const address = sanitizeAddress(raw.address);
  const loc = parseAddressLocation(address);

  const city = sanitizeAddress(raw.city) ?? loc.city ?? null;
  const region = sanitizeAddress(raw.region) ?? loc.region ?? null;
  const country = sanitizeAddress(raw.country) ?? loc.country ?? null;

  let postal_code: string | null = null;
  if (raw.postal_code != null) {
    const pc = String(raw.postal_code).trim();
    if (pc.length && !isRatingOrReviewText(pc) && !isPriceRangeText(pc) && !isPlusCodeText(pc)) {
      postal_code = pc;
    }
  }

  let rating: number | null = null;
  if (raw.rating != null || raw.review_rating != null) {
    const r = Number(raw.rating ?? raw.review_rating);
    if (Number.isFinite(r) && r >= 1.0 && r <= 5.0) rating = r;
  }

  let review_count: number | null = null;
  if (raw.review_count != null) {
    const rc = Number(raw.review_count);
    if (Number.isFinite(rc) && rc >= 0) review_count = Math.floor(rc);
  }

  let price_range: string | null = null;
  if (raw.price_range != null) {
    const pr = cleanUnicode(raw.price_range);
    if (pr.length && isPriceRangeText(pr)) price_range = pr;
  }

  let latitude: number | null = null;
  let longitude: number | null = null;
  if (raw.latitude != null) {
    const lat = Number(raw.latitude);
    if (Number.isFinite(lat)) latitude = lat;
  }
  if (raw.longitude != null) {
    const lng = Number(raw.longitude);
    if (Number.isFinite(lng)) longitude = lng;
  }

  return {
    company_name,
    website,
    domain,
    category,
    business_type,
    description: raw.description ? cleanUnicode(raw.description) : null,
    address,
    city,
    region,
    country,
    postal_code,
    phone,
    email,
    rating,
    review_count,
    opening_status,
    booking_url: sanitizeUrl(raw.booking_url ?? raw.reservations),
    ordering_url: sanitizeUrl(raw.ordering_url ?? raw.order_online),
    menu_url: sanitizeUrl(raw.menu_url ?? raw.menu),
    source_url: sanitizeUrl(raw.source_url ?? raw.link),
    place_id: raw.place_id ? String(raw.place_id).trim() : null,
    latitude,
    longitude,
    price_range,
    attributes: raw.attributes ?? {},
  };
}
