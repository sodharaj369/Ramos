/** Client-safe shared domain types for leads, verification and jobs. */

export type EmailStatus =
  | "valid"
  | "invalid"
  | "catch_all"
  | "disposable"
  | "role"
  | "risky"
  | "unknown"
  | "not_checked"
  | "pending"
  | "unverified";


export type JobType = "discovery" | "verification" | "import";
export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

/** Provider-neutral lead shape returned by any LeadSource adapter. */
export interface RawLead {
  company_name: string;
  website?: string | null | undefined;
  domain?: string | null | undefined;
  category?: string | null | undefined;
  description?: string | null | undefined;
  address?: string | null | undefined;
  city?: string | null | undefined;
  region?: string | null | undefined;
  country?: string | null | undefined;
  postal_code?: string | null | undefined;
  phone?: string | null | undefined;
  email?: string | null | undefined;
  location_count?: number | null | undefined;
  rating?: number | null | undefined;
  review_count?: number | null | undefined;
  social_urls?: Record<string, string> | undefined;
  contact_page_url?: string | null | undefined;
  booking_url?: string | null | undefined;
  ordering_url?: string | null | undefined;
  has_ecommerce?: boolean | null | undefined;
  business_type?: string | null | undefined;
  opening_status?: string | null | undefined;
  attributes?: Record<string, unknown> | undefined;
  source_url?: string | null | undefined;
}

export interface LeadSearchRequest {
  query: string;
  location?: string | null | undefined;
  industry?: string | null | undefined;
  keyword?: string | null | undefined;
  requireWebsite?: boolean | undefined;
  requirePhone?: boolean | undefined;
  requireEmail?: boolean | undefined;
  limit?: number | undefined;
}

export interface ProviderDescriptor {
  id: string;
  name: string;
  kind: "lead_source" | "email_verifier";
  description: string;
  configured: boolean;
  configurationHint?: string | undefined;
  capabilities: string[];
  estimatedCostPerUnit?: number | null | undefined;
}

export interface VerificationChecks {
  syntax_valid: boolean | null;
  domain_valid: boolean | null;
  mx_valid: boolean | null;
  smtp_result: string | null;
  disposable: boolean | null;
  role_account: boolean | null;
  catch_all: boolean | null;
}

export interface VerificationResult extends VerificationChecks {
  email: string;
  status: EmailStatus;
  reason: string;
  confidence: number;
  provider: string;
  metadata?: Record<string, unknown> | undefined;
}

export const EMAIL_STATUS_LABEL: Record<EmailStatus, string> = {
  valid: "Valid",
  invalid: "Invalid",
  catch_all: "Catch-all",
  disposable: "Disposable",
  role: "Role",
  risky: "Risky",
  unknown: "Unknown",
  not_checked: "Not checked",
  pending: "Pending",
  unverified: "Not verified",
};

/** Statuses a verification provider can return (excludes lifecycle-only values). */
export const VERIFICATION_STATUSES: EmailStatus[] = [
  "valid",
  "invalid",
  "catch_all",
  "unknown",
  "disposable",
  "role",
  "not_checked",
];

export const SMTP_HELP_TEXT =
  "SMTP verification checks whether the recipient server accepts the mailbox. Catch-all domains cannot be confirmed as a specific mailbox.";


/** Canonical internal lead fields used by CSV import mapping + export. */
export const LEAD_FIELDS = [
  "company_name",
  "website",
  "domain",
  "category",
  "description",
  "address",
  "city",
  "region",
  "country",
  "postal_code",
  "phone",
  "email",
  "business_type",
  "rating",
  "review_count",
  "contact_page_url",
] as const;

export type LeadField = (typeof LEAD_FIELDS)[number];

export const LEAD_FIELD_LABELS: Record<LeadField, string> = {
  company_name: "Company name",
  website: "Website",
  domain: "Domain",
  category: "Industry / category",
  description: "Description",
  address: "Address",
  city: "City",
  region: "Region / state",
  country: "Country",
  postal_code: "Postal code",
  phone: "Public phone",
  email: "Public email",
  business_type: "Business type",
  rating: "Rating",
  review_count: "Review count",
  contact_page_url: "Contact page URL",
};
