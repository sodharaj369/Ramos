# RAMOS Website Extraction & Priority Rules

## 1. Core Principles

RAMOS Website Extraction follows a strict **Evidence-Based Extraction Model**.

1. **Accuracy Over Completeness**: A verified empty field is infinitely better than an incorrect or fabricated field.
2. **Deterministic Confidence**: Every extracted field must be accompanied by an evidence trace and confidence score ($0.00$ to $1.00$).
3. **No Selector Fragility**: Extraction strategies must not rely on generated classes (e.g. `css-1x8zq`) or unstable DOM paths.
4. **Zero Contamination**: Data from third-party widgets, adverts, footer copyright notices for web agencies, or social media share buttons must be isolated and rejected.

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

### 3.2 Email Address
- **Tier 1**: `JSON-LD -> email` or `ContactPoint.email`
- **Tier 2**: `a[href^="mailto:"]` links (strip query parameters like `?subject=...`)
- **Tier 3**: Labelled text near `"Email:"`, `"Contact:"`, `"Write to us:"`
- **Tier 4**: Body text regex matching standard RFC 5322 compliant email patterns
- **Exclusion Filters**:
  - Image files: `user@domain.png`, `icon@2x.png`
  - Template dummy placeholders: `example@example.com`, `user@domain.com`, `test@test.com`, `name@email.com`
  - Web design agency signatures: `designed by info@webdesign.com`
  - Sentry/bug tracking: `sentry.io`, `wixpress.com`, `shopify.com` internal emails

### 3.3 Phone Number
- **Tier 1**: `JSON-LD -> telephone` or `ContactPoint.telephone`
- **Tier 2**: `a[href^="tel:"]` links (sanitized to remove whitespace and special characters)
- **Tier 3**: `<address>` block phone numbers
- **Tier 4**: Labelled text near `"Phone:"`, `"Call:"`, `"Tel:"`, `"WhatsApp:"`
- **Tier 5**: Text pattern matching national / international phone notations
- **Validation**:
  - Must contain between 7 and 18 digits.
  - Must not match common invalid sequences (e.g. `123456789`, `0000000000`, `9999999999`).
  - Must be preserved as text in exports to prevent leading zero truncation.

### 3.4 Physical Address, City, State, Country, Postal Code
- **Tier 1**: `JSON-LD -> address` (`PostalAddress` object with `streetAddress`, `addressLocality`, `addressRegion`, `postalCode`, `addressCountry`)
- **Tier 2**: `<address>` tag in footer or contact section
- **Tier 3**: Microdata `itemprop="address"`
- **Tier 4**: Labelled block near `"Office:"`, `"Address:"`, `"Visit us:"`
- **Parsing**: Passed through RAMOS Address Parser to segment `city`, `region`, `country`, and `postal_code`.

### 3.5 Social Media Profiles
- **Allowed Platforms**:
  - **LinkedIn**: `linkedin.com/company/...` or `linkedin.com/in/...`
  - **Instagram**: `instagram.com/...` (excluding `/p/`, `/stories/`, `/explore/`)
  - **Facebook**: `facebook.com/...` (excluding `/sharer/`, `/events/`, `/share.php`)
  - **Twitter / X**: `twitter.com/...` or `x.com/...` (excluding `/intent/`, `/share`)
  - **YouTube**: `youtube.com/@...` or `youtube.com/channel/...` or `youtube.com/c/...`
- **Validation**:
  - Remove URL tracking parameters (`?ref=...`, `?utm_source=...`, `?trk=...`).
  - Must point to the business/person entity, not platform utility URLs (e.g. login, terms, share).

### 3.6 People & Team Extraction
- **Scope**: Targeted to pages matching `/team`, `/about`, `/people`, `/leadership`, `/our-team`, `/staff`.
- **Criteria**:
  - A person candidate requires a structural card/container containing:
    - **Full Name** (2-4 words, capitalized, no corporate words like "Inc", "LLC", "Ltd", "Solutions")
    - **Title / Role** (e.g. "CEO", "Founder", "Managing Director", "VP of Sales", "Head of Engineering")
  - Optional associated fields: Profile URL, Person LinkedIn URL, Direct Email, Direct Phone.
- **Rule**: Do not infer employee identity from standalone mentions in blog posts or press releases.

---

## 4. Confidence Scoring Formula

Confidence score $C$ for a candidate is computed as:

$$C = \min\left(1.0, \quad W_{\text{source}} + B_{\text{context}} + B_{\text{validation}} - P_{\text{distance}}\right)$$

Where:
- $W_{\text{source}}$ = Base weight of the extraction mechanism ($0.50$ to $0.98$).
- $B_{\text{context}}$ = Context bonus ($+0.05$ for finding candidate on a dedicated `/contact` or `/about` page; $+0.05$ if inside `<header>` or `<footer>`).
- $B_{\text{validation}}$ = Validation bonus ($+0.05$ if email domain matches the website domain; $+0.05$ for valid international phone format).
- $P_{\text{distance}}$ = Penalty ($-0.15$ if found in generic body text without nearby labels).

### Confidence Thresholds
- **High Confidence ($\ge 0.85$)**: Automatically selected as primary field value.
- **Medium Confidence ($0.50 - 0.84$)**: Accepted if no higher confidence candidate exists.
- **Low Confidence ($< 0.50$)**: Rejected. Field remains empty.

---

## 5. Conflict Resolution & Merge Policy

When multiple candidates are found across different pages of the website:
1. Compare candidates by **Confidence Score**.
2. If confidence is equal, prefer candidates discovered on high-priority pages (`/contact` > `/about` > `/homepage` > subpages).
3. If candidates are of identical confidence and page weight, prefer the most complete record (e.g. formatted international phone over local phone).
4. For arrays (e.g. `People`, `Social Links`), aggregate unique validated items.
