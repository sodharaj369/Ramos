/** Minimal RFC4180-ish CSV parsing + serialisation (client safe). */

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export function parseCsv(text: string): ParsedCsv {
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += char;
      continue;
    }
    if (char === '"') inQuotes = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ""));
  const headers = (nonEmpty.shift() ?? []).map((h) => h.trim());
  return { headers, rows: nonEmpty };
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return "";
  const cols = columns ?? Object.keys(rows[0]!);
  const escape = (value: unknown) => {
    if (value === null || value === undefined) return "";
    const str = typeof value === "object" ? JSON.stringify(value) : String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => escape(r[c])).join(","))].join("\n");
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Guesses which internal field a CSV header maps to. */
export function guessFieldForHeader(header: string): string | null {
  const h = header.toLowerCase().replace(/[^a-z]/g, "");
  const table: Record<string, string> = {
    company: "company_name",
    companyname: "company_name",
    business: "company_name",
    businessname: "company_name",
    name: "company_name",
    organisation: "company_name",
    organization: "company_name",
    website: "website",
    url: "website",
    site: "website",
    domain: "domain",
    email: "email",
    emailaddress: "email",
    phone: "phone",
    telephone: "phone",
    phonenumber: "phone",
    mobile: "phone",
    address: "address",
    street: "address",
    city: "city",
    town: "city",
    region: "region",
    state: "region",
    county: "region",
    country: "country",
    postcode: "postal_code",
    postalcode: "postal_code",
    zip: "postal_code",
    zipcode: "postal_code",
    industry: "category",
    category: "category",
    sector: "category",
    type: "business_type",
    businesstype: "business_type",
    description: "description",
    rating: "rating",
    reviews: "review_count",
    reviewcount: "review_count",
    contactpage: "contact_page_url",
  };
  return table[h] ?? null;
}
