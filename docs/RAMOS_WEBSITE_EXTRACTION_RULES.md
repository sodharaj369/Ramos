# RAMOS Website Extraction & Priority Rules

**Current Version:** `v1.0.6`  
**Current Phase:** Phase 9 (Release Candidate / Pilot Ready)  
**Status:** **CODE FROZEN**  
**Next Phase:** Phase 10 (Multi-Website & Corporate Relationship Intelligence — PLANNED)

---

## 1. Core Extraction Principles

RAMOS Website Extraction follows a strict **Evidence-Based Extraction Model**:

1. **Accuracy Over Completeness**: A verified empty field is infinitely better than an incorrect or fabricated field.
2. **Deterministic Confidence**: Every extracted field must be accompanied by an evidence trace and confidence score ($0.00$ to $1.00$).
3. **No Selector Fragility**: Extraction strategies must not rely on generated classes (e.g. `css-1x8zq`) or unstable DOM paths.
4. **Zero Contamination**: Data from third-party widgets, adverts, footer copyright notices for web agencies, or social media share buttons must be isolated and rejected.
5. **Strict Personal Contact Isolation**: Direct employee emails and phones found on personal/leadership cards attach strictly to `lead.people` and `lead.decision_maker_*`. They are **never** attributed to company primary contacts (`lead.email` or `lead.phone`).

---

## 2. Extraction Source Hierarchy

When extracting fields, candidates are evaluated from the following sources in descending order of intrinsic reliability:

| Tier | Extraction Source | Typical Confidence Weight | Description |
| :--- | :--- | :--- | :--- |
| **Tier 1** | **JSON-LD Schema** | `0.95 - 0.99` | Structured `<script type="application/ld+json">` declaring `Organization`, `LocalBusiness`, `PostalAddress`, `Person`. |
| **Tier 2** | **Microdata / Schema.org** | `0.90 - 0.95` | In-DOM attributes: `itemscope`, `itemtype="https://schema.org/..."`, `itemprop="..."`. |
| **Tier 3** | **Explicit Link Protocols** | `0.90 - 0.98` | Direct anchor links: `href="mailto:..."`, `href="tel:..."`. |
| **Tier 4** | **Semantic HTML Containers** | `0.80 - 0.90` | Standard semantic tags: `<address>`, `<header>`, `<footer>`, `<nav>`, `<main>`, `<meta property="og:...">`. |
| **Tier 5** | **Labelled Context Fields** | `0.70 - 0.85` | Elements immediately adjacent to keywords: `"Phone:"`, `"Call us:"`, `"Email:"`, `"Headquarters:"`, `"Location:"`. |
| **Tier 6** | **Social Link Analyzers** | `0.85 - 0.95` | Clean social profile links matching specific business accounts (excluding generic share links). |
| **Tier 7** | **Visual / Text Heuristics** | `0.50 - 0.70` | Regex patterns evaluated within visible body text with bounding context checks. |

---

## 3. Field-by-Field Extraction Rules

### 3.1 Company Name
- **Tier 1**: `JSON-LD -> Organization.name` or `LocalBusiness.name`
- **Tier 2**: `meta[property="og:site_name"]` or `meta[property="og:title"]`
- **Tier 3**: Domain branding from Page `<title>` (e.g. `Acme Corp | Home` -> `Acme Corp`)
- **Tier 4**: `header .logo img[alt]` or `header h1`
- **Exclusion Filters**: Filter out generic titles like "Home", "Welcome", "Homepage", "Index".

### 3.2 Corporate Emails & Multi-Contact Handling
- **Discovery Sources**: `mailto:` links, JSON-LD `email`, `/contact` page semantic blocks, body text regex.
- **Classification (`evaluateEmail`)**:
  - `business_role`: Role accounts (`info@`, `sales@`, `contact@`, `support@`, `hello@`, `team@`, `admin@`).
  - `business_individual`: Custom domain personal email (`john.doe@company.com`).
  - `freemail`: Common public domains (`gmail.com`, `yahoo.com`, `outlook.com`). Freemail receives a confidence penalty unless anchored in JSON-LD or direct mailto.
  - `disposable`: Temporary domains; strictly rejected.
- **Role Account Priority**:
  - `sales`: $+0.15$ bonus (highest commercial value)
  - `general` (`info@`, `contact@`, `hello@`): $+0.08$ bonus
  - `support`: $+0.02$ bonus
  - `marketing`: $-0.02$ penalty
  - `careers`: $-0.10$ penalty
- **Multi-Email Preservation**:
  - All valid company emails are preserved in `lead.emails[]`.
  - The top-ranked email becomes `lead.email`.
  - Secondary emails are preserved in `lead.additional_emails[]`.
- **Exclusion Filters**: Image assets (`user@2x.png`), dummy templates (`example@example.com`), web agency signatures (`designed by agency@web.com`).

### 3.3 Corporate Phones & Multi-Phone Handling
- **Discovery Sources**: `tel:` links, JSON-LD `telephone`, `<address>` tag, labelled text near `"Phone:"`, `"Call:"`, `"Tel:"`.
- **Validation**:
  - Must contain between 7 and 18 digits.
  - Repetitive digits (`0000000000`, `9999999999`) or sequential patterns (`123456789`) are rejected.
  - Preserved as text in exports to prevent leading zero truncation.
- **Multi-Phone Preservation**:
  - Multiple distinct company phone numbers are retained in `lead.phones[]`.
  - The highest confidence phone becomes `lead.phone`.
  - Secondary phones are preserved in `lead.additional_phones[]`.

### 3.4 Physical Address & Location
- **Discovery Sources**: JSON-LD `PostalAddress`, `<address>` tag, labelled blocks near `"Office:"`, `"Address:"`, `"Visit us:"`.
- **Address Parsing**: Passed through RAMOS Address Parser to segment `city`, `region`, `country`, and `postal_code`.

### 3.5 Social Media Profiles
- **Allowed Platforms**:
  - **LinkedIn**: `linkedin.com/company/...` or `linkedin.com/school/...` (individual `linkedin.com/in/...` profiles are routed to People).
  - **Twitter / X**: `twitter.com/{handle}` or `x.com/{handle}` (excluding `/intent/`, `/share`).
  - **Facebook**: `facebook.com/{page}` (excluding `/sharer/`, `/events/`).
  - **Instagram**: `instagram.com/{handle}` (excluding `/p/`, `/stories/`).
  - **YouTube**: `youtube.com/@...` or `youtube.com/channel/...` or `youtube.com/c/...`.
  - **GitHub**: `github.com/{org}`.
- **Validation**: Tracking query parameters (`?ref=...`, `?utm_source=...`) are stripped; non-profile utility URLs are rejected.

---

## 4. People & Decision Maker Extraction Rules

### 4.1 Discovery & Verification
- **Target Pages**: `/team`, `/about`, `/people`, `/leadership`, `/our-team`, `/staff`, `/management`, `/board`.
- **Extraction Requirements**:
  - Candidate must be enclosed in a structured team card or Schema.org `Person` node.
  - Must contain a valid capitalized full name (2–4 words; non-name tokens like "Team", "Inc", "LLC", "Read More" rejected).
  - Job title must match legitimate executive/professional keywords (tested against `TITLE_REGEX`).
  - Direct LinkedIn profile link (`linkedin.com/in/...`), direct email, and direct phone are extracted if present inside the card.

### 4.2 Seniority Scoring & Ranking
`people-extractor.js` scores every extracted person by organizational seniority:
- **Tier 1 (Score: 1.00)**: Ownership & Top Executive (`Founder`, `Co-Founder`, `Owner`, `CEO`, `President`, `Managing Director`, `Managing Partner`, `Principal`).
- **Tier 2 (Score: 0.90)**: Other C-Suite (`COO`, `CFO`, `CTO`, `CMO`, `CRO`, `CIO`).
- **Tier 4 (Score: 0.85)**: Vice Presidents (`Vice President`, `VP`, `SVP`, `EVP`, `Head of`).
- **Tier 5 (Score: 0.80)**: Directors & General Managers (`Director`, `Partner`, `General Manager`).
- **Tier 6 (Score: 0.65)**: Managers & Team Leads (`Manager`, `Lead`, `Supervisor`).
- **Tier 7 (Score: 0.50)**: Staff & Associates.

### 4.3 Primary Decision Maker Selection
- `lead.people[]` is sorted descending by Seniority Score, with secondary tie-breakers for direct email, LinkedIn URL, and confidence.
- The top-ranked individual is assigned to `lead.decision_maker_name`, `lead.decision_maker_title`, `lead.decision_maker_email`, `lead.decision_maker_linkedin`.

---

## 5. Lead Quality Scoring Formula

`lead-scorer.js` evaluates every enriched or Maps lead across 4 pillars (0–100 scale):

1. **Physical Identity & Validity (0–25 points)**:
   - Valid company name: $+10$
   - Verified address with city & country: $+10$
   - Category / industry specified: $+5$
2. **Contactability (0–35 points)**:
   - Verified primary email: $+15$
   - Role account bonus (`sales@` or `info@`): $+5$
   - Additional corporate email: $+3$
   - Primary phone number: $+10$
   - Additional phone number: $+2$
3. **Decision Maker Discovery (0–25 points)**:
   - Identified decision maker name & title: $+10$
   - Top executive seniority (Owner/C-level): $+5$
   - Decision maker direct email: $+5$
   - Decision maker LinkedIn URL: $+5$
4. **Digital Footprint (0–15 points)**:
   - Active, accessible website: $+5$
   - Verified LinkedIn company page: $+4$
   - Other verified social profiles (Twitter, Facebook, Instagram, YouTube): $+2$ each (up to $+6$)

### Quality Tier Assignment
- **HIGH ($\ge 75$)**: Complete, high-priority sales lead with direct decision-maker contact.
- **MEDIUM ($50 - 74$)**: Valid business with direct phone and primary email.
- **LOW ($< 50$)**: Incomplete lead lacking actionable contact channels.

---

## 6. Conservative Deduplication Rules

`deduplicator.js` enforces strict, high-precision deduplication to prevent merging distinct businesses:

1. **Place ID Check**:
   - If both leads have Google Maps `place_id`, they must match exactly.
   - Different place IDs represent distinct physical locations; **never merge**.
2. **Domain + Phone Check**:
   - Identical normalized root domain AND matching phone digits ($\ge 7$ digits).
   - Conflicting phones on the same domain indicate separate branch offices; **never merge**.
3. **Domain + Name Similarity**:
   - Identical root domain AND name token Jaccard similarity $\ge 0.75$ (provided neither record has conflicting phone numbers).
4. **Negative Rule**:
   - Never merge businesses based on similar names if domains differ or are missing.
5. **Data Preservation**:
   - Merging unions all discovered corporate emails (`additional_emails`), corporate phones (`additional_phones`), executive team members (`people[]`), and social accounts.
