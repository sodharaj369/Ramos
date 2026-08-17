/** Shared, client-safe normalisation helpers used for dedup + matching. */

export function cleanUnicode(str?: string | null): string {
  if (!str) return "";
  return str
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
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
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

export function parseAddressLocation(address?: string | null) {
  const clean = sanitizeAddress(address);
  if (!clean) return { city: null, region: null, country: null };
  const parts = clean
    .split(",")
    .map((p) => cleanUnicode(p))
    .filter((p) => Boolean(p) && !isRatingOrReviewText(p) && !isPriceRangeText(p) && !isPlusCodeText(p));
  if (parts.length === 0) return { city: null, region: null, country: null };
  if (parts.length === 1) return { city: parts[0], region: null, country: null };
  if (parts.length === 2) return { city: parts[0], region: parts[1], country: null };
  if (parts.length === 3) return { city: parts[0], region: parts[1], country: parts[2] };
  return {
    city: parts[parts.length - 3] || parts[0],
    region: parts[parts.length - 2] || parts[1],
    country: parts[parts.length - 1] || null,
  };
}
