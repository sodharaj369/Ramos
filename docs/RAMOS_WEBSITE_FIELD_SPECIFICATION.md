# RAMOS Website Intelligence Field Specification

**Current Version:** `v1.0.6`  
**Current Phase:** Phase 9 (Release Candidate / Pilot Ready)  
**Status:** **CODE FROZEN**  
**Next Phase:** Phase 10 (Multi-Website & Corporate Relationship Intelligence — PLANNED)

---

## 1. Field Architecture Overview

RAMOS lead data is structured across 6 distinct functional dimensions:
1. **Business Identity & Core Attributes**
2. **Contact & Location Details (Multi-Contact Preservation)**
3. **Executive & Decision Maker Intelligence**
4. **Lead Scoring & Qualification Tiers**
5. **Social Media Profiles**
6. **Internal Evidence & Provenance Metadata**

---

## 2. Comprehensive Field Dictionary

### 2.1 Business Identity & Core Attributes

| Field Name | Type | Description | Source Precedence | Sample Value |
| :--- | :--- | :--- | :--- | :--- |
| `company_name` | `string` | Legal or commercial business name | **Maps Authority**; Website fills only if missing | `"Acme Robotics Inc."` |
| `website` | `string` | Canonical website URL | Maps / Website normalized URL | `"https://acme.com"` |
| `category` | `string` | Industry or business category | Maps Authority; Website description fills if missing | `"Industrial Automation"` |
| `business_type` | `string` | Additional business classification or multi-contact summary | Maps / Website | `"Manufacturing"` |
| `description` | `string` | Summary of company offerings | OpenGraph description, meta description | `"Next-gen industrial automation."` |
| `booking_url` | `string` | Appointment or demo reservation URL | Maps / Website action link | `"https://calendly.com/acme/demo"` |
| `ordering_url` | `string` | Online store or ordering URL | Maps / Website action link | `"https://acme.com/shop"` |
| `menu_url` | `string` | Digital menu or product catalog URL | Maps / Website action link | `"https://acme.com/catalog"` |

---

### 2.2 Contact & Location Fields (Multi-Contact)

| Field Name | Type | Description | Primary Sources | Sample Value |
| :--- | :--- | :--- | :--- | :--- |
| `email` | `string` | Primary commercial contact email | Website `mailto:`, JSON-LD, `/contact` page | `"sales@acme.com"` |
| `email_status` | `string` | Email classification (`business_role`, `business_individual`) | Website validator | `"business_role"` |
| `email_role` | `string` | Commercial role (`sales`, `general`, `support`, etc.) | Website validator | `"sales"` |
| `emails` | `Array<Object>`| All discovered corporate emails with roles and confidence | Website multi-contact engine | `[ { email, type, emailRole, confidence } ]` |
| `additional_emails`| `Array<string>`| Secondary corporate emails | Website multi-contact engine | `["info@acme.com", "support@acme.com"]` |
| `phone` | `string` | Primary business telephone number | **Maps Authority**; Website fills only if missing | `"+1 555-234-5678"` |
| `phones` | `Array<Object>`| All discovered corporate phone numbers with confidence | Website multi-contact engine | `[ { phone, confidence, sourceType } ]` |
| `additional_phones`| `Array<string>`| Secondary corporate phone numbers | Website multi-contact engine | `["+1 555-987-6543"]` |
| `address` | `string` | Full physical address | **Maps Authority**; Website fills only if missing | `"100 Tech Blvd, Austin, TX 78701"` |
| `city` | `string` | City / locality name | Maps / Website Address Parser | `"Austin"` |
| `region` | `string` | State, province, or region | Maps / Website Address Parser | `"Texas"` |
| `country` | `string` | Country name | Maps / Website Address Parser | `"United States"` |
| `postal_code` | `string` | Postal code / ZIP code | Maps / Website Address Parser | `"78701"` |

---

### 2.3 Executive & Decision Maker Intelligence

| Field Name | Type | Description | Primary Sources | Sample Value |
| :--- | :--- | :--- | :--- | :--- |
| `decision_maker_name` | `string` | Name of highest-ranking executive | Website `people-extractor.js` | `"Sarah Connor"` |
| `decision_maker_title` | `string` | Job title / designation | Website `people-extractor.js` | `"Chief Executive Officer & Founder"` |
| `decision_maker_email` | `string` | Direct email of decision maker | Direct mailto in leadership card | `"sarah@acme.com"` |
| `decision_maker_linkedin`| `string` | Direct LinkedIn profile URL of decision maker | LinkedIn anchor in leadership card | `"https://linkedin.com/in/sarah-connor"` |
| `people_count` | `number` | Total number of extracted personnel | Website `people-extractor.js` | `4` |
| `people` | `Array<Object>`| Relational roster of team members & executives | Website `people-extractor.js` | See schema below |

#### Structure of `lead.people[]`:
```typescript
interface ExtractedPerson {
  name: string;              // e.g. "Sarah Connor"
  title: string | null;      // e.g. "CEO & Founder"
  profile_url: string | null;// e.g. "https://acme.com/team/sarah"
  linkedin_url: string | null;// e.g. "https://linkedin.com/in/sarah-connor"
  email: string | null;      // e.g. "sarah@acme.com"
  phone: string | null;      // e.g. "+1 555-987-6543"
  seniorityScore: number;    // e.g. 1.0 (Tier 1 C-Suite/Ownership)
  confidence: number;        // e.g. 0.95
}
```

---

### 2.4 Lead Scoring & Quality Tiers

| Field Name | Type | Description | Range | Sample Value |
| :--- | :--- | :--- | :--- | :--- |
| `lead_score` | `number` | Transparent composite lead quality score | `0` to `100` | `88` |
| `quality_tier` | `string` | Actionable sales readiness tier | `"HIGH"` \| `"MEDIUM"` \| `"LOW"` | `"HIGH"` |

---

### 2.5 Social Media Profiles (`lead.social`)

| Field Name | Type | Description | Pattern | Sample Value |
| :--- | :--- | :--- | :--- | :--- |
| `linkedin` | `string` | Official LinkedIn company page | `linkedin.com/company/{slug}` | `"https://linkedin.com/company/acme"` |
| `twitter_x` | `string` | Official Twitter / X profile | `twitter.com/{handle}` or `x.com/{handle}` | `"https://x.com/acmerobotics"` |
| `facebook` | `string` | Official Facebook company page | `facebook.com/{page}` | `"https://facebook.com/acmerobotics"` |
| `instagram` | `string` | Official Instagram company profile | `instagram.com/{handle}` | `"https://instagram.com/acmerobotics"` |
| `youtube` | `string` | Official YouTube channel | `youtube.com/@{channel}` | `"https://youtube.com/@acmerobotics"` |
| `github` | `string` | Official GitHub organization | `github.com/{org}` | `"https://github.com/acme-robotics"` |

---

### 2.6 Internal Provenance & Evidence Metadata

- `_provenance`: Field-by-field dictionary specifying data origin (`GOOGLE_MAPS` vs `WEBSITE`), source URL, confidence, and lead score breakdown.
- `_evidence`: Complete array of all candidate evidence objects collected across pages during crawl.
- `_crawlStats`: Summary of pages scanned, pages budget, early exit reason, and skipped pages count.

---

## 3. Export Mapping Reference

### 3.1 Google Maps Standalone Export (Strictly 24 Columns) — FROZEN

Exported via `buildXlsx()` and `generateCSV()`:
1. `Company`
2. `Phone`
3. `Website`
4. `Email`
5. `Email Status`
6. `Address`
7. `City`
8. `State / Region`
9. `Country`
10. `Postal Code`
11. `Industry`
12. `Business Type`
13. `Rating`
14. `Reviews`
15. `Opening Status`
16. `Price Range`
17. `Booking URL`
18. `Ordering URL`
19. `Menu URL`
20. `Imported At`
21. `Source URL`
22. `Place ID`
23. `Source Query`
24. `Run ID`

---

### 3.2 Enriched Export (Strictly 34 Columns + 2-Sheet XLSX)

Exported via `buildWebsiteXlsx()` and `generateWebsiteCSV()`:

#### Sheet 1 — "Leads" (34 Columns):

| Col # | Header Name | Data Source |
| :--- | :--- | :--- |
| 1 | **Company** | `lead.company_name \|\| lead.website \|\| "—"` |
| 2 | **Lead Score** | `lead.lead_score` (0–100) |
| 3 | **Quality Tier** | `lead.quality_tier` (`HIGH`, `MEDIUM`, `LOW`) |
| 4 | **Website** | `lead.website` |
| 5 | **Primary Email** | `lead.email` |
| 6 | **Email Role** | `lead.email_role \|\| lead.emailRole` |
| 7 | **Additional Emails** | `lead.additional_emails` joined by `"; "` |
| 8 | **Email Status** | `lead.email_status` |
| 9 | **Primary Phone** | `lead.phone` (raw text format) |
| 10 | **Additional Phones** | `lead.additional_phones` joined by `"; "` |
| 11 | **Decision Maker Name** | `lead.decision_maker_name` |
| 12 | **Decision Maker Title**| `lead.decision_maker_title` |
| 13 | **Decision Maker Email**| `lead.decision_maker_email` |
| 14 | **Decision Maker LinkedIn**| `lead.decision_maker_linkedin` (hyperlink) |
| 15 | **People Count** | `lead.people_count` |
| 16 | **Address** | `lead.address` |
| 17 | **City** | `lead.city` |
| 18 | **State / Region** | `lead.region \|\| lead.state` |
| 19 | **Country** | `lead.country` |
| 20 | **Postal Code** | `lead.postal_code` (raw text format) |
| 21 | **Industry** | `lead.category` |
| 22 | **Description** | `lead.description` |
| 23 | **LinkedIn** | `lead.social.linkedin` (hyperlink) |
| 24 | **Twitter / X** | `lead.social.twitter_x` (hyperlink) |
| 25 | **Facebook** | `lead.social.facebook` (hyperlink) |
| 26 | **Instagram** | `lead.social.instagram` (hyperlink) |
| 27 | **YouTube** | `lead.social.youtube` (hyperlink) |
| 28 | **GitHub** | `lead.social.github` (hyperlink) |
| 29 | **Booking URL** | `lead.booking_url` (hyperlink) |
| 30 | **Ordering URL** | `lead.ordering_url` (hyperlink) |
| 31 | **Menu URL** | `lead.menu_url` (hyperlink) |
| 32 | **Source URL** | `lead.source_url` (hyperlink) |
| 33 | **Imported At** | `lead.imported_at \|\| now` |
| 34 | **Source Query** | `lead.sourceQuery` |

#### Sheet 2 — "People" (7 Columns):

| Col # | Header Name | Person Attribute |
| :--- | :--- | :--- |
| 1 | **Company** | Associated company name or root domain |
| 2 | **Name** | `person.name` |
| 3 | **Title** | `person.title` |
| 4 | **Email** | `person.email` |
| 5 | **Phone** | `person.phone` (raw text format) |
| 6 | **LinkedIn** | `person.linkedin_url` (hyperlink) |
| 7 | **Profile URL** | `person.profile_url` (hyperlink) |
