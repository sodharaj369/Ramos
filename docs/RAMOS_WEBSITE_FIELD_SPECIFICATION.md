# RAMOS Website Intelligence Field Specification

## 1. Field Architecture Overview

Extracted fields are categorized into 4 domain layers plus an internal evidence provenance layer:

1. **Business Identity Fields**
2. **Contact & Location Fields**
3. **Social Media Profiles**
4. **People & Leadership Fields**
5. **Internal Evidence & Confidence Metadata**

---

## 2. Comprehensive Field Dictionary

### 2.1 Business Identity Fields

| Field Name | Type | Description | Primary Sources | Sample Value |
| :--- | :--- | :--- | :--- | :--- |
| `company_name` | `string` | Legal or operating trade name | JSON-LD `name`, OpenGraph `site_name`, `<title>` branding | `"Acme Robotics Inc."` |
| `website` | `string` | Canonical root domain URL | Canonical tag, user input URL | `"https://acme.com"` |
| `industry` | `string` | Industry classification | JSON-LD `industry`, Meta tags | `"Industrial Automation"` |
| `business_type` | `string` | Specific business category | Schema `@type`, meta keywords | `"Manufacturing"` |
| `description` | `string` | Summary of company offerings | OpenGraph `description`, Meta description | `"Next-generation industrial automation and robotics."` |
| `logo_url` | `string` | URL to primary logo image | JSON-LD `logo`, OpenGraph `image` | `"https://acme.com/assets/logo.png"` |
| `founded_year` | `number` | Year company was established | JSON-LD `foundingDate`, regex `"Founded in YYYY"` | `2018` |

---

### 2.2 Contact & Location Fields

| Field Name | Type | Description | Primary Sources | Sample Value |
| :--- | :--- | :--- | :--- | :--- |
| `email` | `string` | Primary business contact email | `mailto:` link, JSON-LD `email`, `/contact` page | `"contact@acme.com"` |
| `email_status` | `string` | Syntax & domain validation status | Domain syntax verifier | `"valid_syntax"` |
| `phone` | `string` | Standardized phone number | `tel:` link, JSON-LD `telephone`, Contact block | `"+1 (555) 234-5678"` |
| `phone_raw` | `string` | Unformatted extracted phone text | Direct text match | `"(555) 234-5678 ext. 101"` |
| `address` | `string` | Full street address string | JSON-LD `PostalAddress`, `<address>` tag | `"100 Tech Blvd, Suite 400, Austin, TX 78701"` |
| `city` | `string` | City / locality name | Address parser, JSON-LD `addressLocality` | `"Austin"` |
| `region` | `string` | State, province, or region | Address parser, JSON-LD `addressRegion` | `"Texas"` |
| `country` | `string` | Country name or ISO code | Address parser, JSON-LD `addressCountry` | `"United States"` |
| `postal_code` | `string` | Postal code / ZIP code | Address parser, JSON-LD `postalCode` | `"78701"` |

---

### 2.3 Social Media Profile Fields

| Field Name | Type | Description | Matching Pattern | Sample Value |
| :--- | :--- | :--- | :--- | :--- |
| `linkedin` | `string` | Official LinkedIn company page | `linkedin.com/company/{slug}` | `"https://linkedin.com/company/acme-robotics"` |
| `twitter_x` | `string` | Official Twitter / X profile | `twitter.com/{handle}` or `x.com/{handle}` | `"https://x.com/acmerobotics"` |
| `facebook` | `string` | Official Facebook page | `facebook.com/{page}` | `"https://facebook.com/acmerobotics"` |
| `instagram` | `string` | Official Instagram profile | `instagram.com/{handle}` | `"https://instagram.com/acmerobotics"` |
| `youtube` | `string` | Official YouTube channel | `youtube.com/@{channel}` | `"https://youtube.com/@acmerobotics"` |
| `github` | `string` | GitHub organization profile | `github.com/{org}` | `"https://github.com/acme-robotics"` |

---

### 2.4 Action & Navigation Links

| Field Name | Type | Description | Matching Pattern | Sample Value |
| :--- | :--- | :--- | :--- | :--- |
| `booking_url` | `string` | Calendly, ChiliPiper, or booking link | `calendly.com/...`, `/book`, `/schedule` | `"https://calendly.com/acme-sales/demo"` |
| `ordering_url` | `string` | E-commerce or order link | `/shop`, `/order`, `shopify.com/...` | `"https://acme.com/shop"` |
| `menu_url` | `string` | Digital menu or catalog | `/menu`, `/catalog`, `/products` | `"https://acme.com/products"` |
| `contact_url` | `string` | Primary contact page link | `/contact`, `/get-in-touch` | `"https://acme.com/contact"` |

---

### 2.5 People & Leadership Fields (`people[]`)

Extracted as an array of structured objects representing key personnel and leadership discovered on `/team`, `/about`, `/people`, or `/leadership` pages:

```typescript
interface ExtractedPerson {
  name: string;              // e.g. "Sarah Connor"
  title: string;             // e.g. "Chief Executive Officer & Founder"
  profile_url: string | null;// e.g. "https://acme.com/team/sarah-connor"
  linkedin_url: string | null;// e.g. "https://linkedin.com/in/sarah-connor"
  email: string | null;      // e.g. "sarah@acme.com"
  phone: string | null;      // e.g. "+1 (555) 987-6543"
  confidence: number;        // e.g. 0.92
}
```

---

### 2.6 Internal Evidence Model (Not Exported to Plain CSV by Default)

Every extracted property tracks an evidence object during extraction for conflict resolution:

```typescript
interface FieldEvidence<T> {
  value: T;
  source: "json-ld" | "microdata" | "mailto-tel" | "semantic-dom" | "labelled-context" | "regex-pattern";
  confidence: number;      // 0.00 to 1.00
  foundOnUrl: string;      // e.g. "https://acme.com/contact"
  rawMatch: string;        // Raw extracted snippet
}
```

---

## 3. Canonical Export Mapping

To preserve compatibility with the frozen RAMOS Canonical Exporter (`CSV` and `XLSX`), website extracted fields map directly into the existing 24-column layout:

| Export Column | RAMOS Lead Field | Website Extractor Source |
| :--- | :--- | :--- |
| **Company** | `company_name` | `company_name` (or primary leader name if solo practitioner) |
| **Phone** | `phone` | Standardized `phone` |
| **Website** | `website` | Sanitized `website` |
| **Email** | `email` | Standardized `email` |
| **Email Status** | `email_status` | `email_status` |
| **Address** | `address` | Full parsed `address` |
| **City** | `city` | `city` |
| **State / Region** | `region` | `region` |
| **Country** | `country` | `country` |
| **Postal Code** | `postal_code` | `postal_code` |
| **Industry** | `category` | `industry` |
| **Business Type** | `business_type` | `business_type` |
| **Booking URL** | `booking_url` | Discovered `booking_url` |
| **Ordering URL** | `ordering_url`| Discovered `ordering_url` |
| **Menu URL** | `menu_url` | Discovered `menu_url` |
| **Source URL** | `source_url` | Visited root URL |
| **Source Query** | `sourceQuery` | User input URL or domain |
