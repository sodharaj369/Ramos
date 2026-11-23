/**
 * RAMOS Master File Merger & Deduplication Utility (v1.0.6)
 * Multi-File Client-Side Lead Parser, Merger, and Deduplicator.
 * 100% Client-Side. Zero runtime npm packages, zero external APIs.
 */
(function (root, factory) {
  const instance = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = instance;
  }
  if (root) {
    root.RamosFileMerger = instance;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function (root) {
  "use strict";

  const Deduplicator = (root && root.RamosDeduplicator) || null;
  const XlsxBuilder = (root && root.RamosXlsxBuilder) || null;

  // ─── 1. CSV PARSER (RFC-4180 Single-Pass Streaming) ──────────────────────
  function parseCsv(csvText) {
    if (!csvText || typeof csvText !== "string") {
      return { headers: [], rows: [] };
    }

    const clean = csvText.replace(/^\uFEFF/, "").trim();
    if (!clean.length) return { headers: [], rows: [] };

    const parsedRows = [];
    let currentRow = [];
    let currentCell = "";
    let inQuotes = false;

    for (let i = 0; i < clean.length; i++) {
      const ch = clean[i];
      const nextCh = clean[i + 1];

      if (inQuotes) {
        if (ch === '"') {
          if (nextCh === '"') {
            currentCell += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          currentCell += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === "," || ch === "\t" || ch === ";") {
          currentRow.push(currentCell.trim());
          currentCell = "";
        } else if (ch === "\r") {
          // ignore CR
        } else if (ch === "\n") {
          currentRow.push(currentCell.trim());
          currentCell = "";
          if (currentRow.some((c) => c.length > 0)) {
            parsedRows.push(currentRow);
          }
          currentRow = [];
        } else {
          currentCell += ch;
        }
      }
    }

    if (currentCell.length > 0 || currentRow.length > 0) {
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c.length > 0)) {
        parsedRows.push(currentRow);
      }
    }

    if (!parsedRows.length) return { headers: [], rows: [] };

    const headers = parsedRows[0].map((h, i) => (h && h.trim()) || `Column_${i + 1}`);
    const dataRows = [];

    for (let r = 1; r < parsedRows.length; r++) {
      const rowArr = parsedRows[r];
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = rowArr[idx] !== undefined ? rowArr[idx] : "";
      });
      dataRows.push(obj);
    }

    return { headers, rows: dataRows };
  }

  // ─── 2. ZERO-DEPENDENCY XLSX PARSER ──────────────────────────────────────
  // Reads OpenXML ZIP structure using native Uint8Array + DecompressionStream
  async function parseXlsx(uint8Data) {
    if (!uint8Data || !(uint8Data instanceof Uint8Array || uint8Data instanceof ArrayBuffer)) {
      return { headers: [], rows: [] };
    }

    const bytes = uint8Data instanceof Uint8Array ? uint8Data : new Uint8Array(uint8Data);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 0;
    const entries = {};

    while (offset + 30 <= bytes.length) {
      const sig = view.getUint32(offset, true);
      if (sig !== 0x04034b50) break; // Local file header signature PK\x03\x04

      const method = view.getUint16(offset + 8, true);
      const compSize = view.getUint32(offset + 18, true);
      const nameLen = view.getUint16(offset + 26, true);
      const extraLen = view.getUint16(offset + 28, true);

      const filename = new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + nameLen));
      const dataStart = offset + 30 + nameLen + extraLen;
      const dataBuf = bytes.subarray(dataStart, dataStart + compSize);

      let uncompressed;
      if (method === 0) {
        uncompressed = dataBuf;
      } else if (method === 8) {
        if (typeof DecompressionStream !== "undefined") {
          const ds = new DecompressionStream("deflate-raw");
          const resp = new Response(new Response(dataBuf).body.pipeThrough(ds));
          uncompressed = new Uint8Array(await resp.arrayBuffer());
        }
      }

      if (uncompressed) {
        entries[filename] = new TextDecoder().decode(uncompressed);
      }

      offset = dataStart + compSize;
    }

    // 1. Shared Strings Table (if present)
    const sharedStrings = [];
    const sharedXml = entries["xl/sharedStrings.xml"] || entries["xl/sharedstrings.xml"];
    if (sharedXml) {
      const siMatches = sharedXml.match(/<si>[\s\S]*?<\/si>/g) || [];
      for (const si of siMatches) {
        const tMatches = si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
        const fullStr = tMatches
          .map((m) => m.replace(/<t[^>]*>/, "").replace(/<\/t>/, ""))
          .join("");
        sharedStrings.push(unescapeXml(fullStr));
      }
    }

    // 2. Locate Main Worksheet (prioritize sheet1.xml)
    let sheetXml = entries["xl/worksheets/sheet1.xml"] || entries["xl/worksheets/sheet1.XML"];
    if (!sheetXml) {
      const sheetKey = Object.keys(entries).find((k) => k.toLowerCase().startsWith("xl/worksheets/sheet") && k.toLowerCase().endsWith(".xml"));
      sheetXml = sheetKey ? entries[sheetKey] : null;
    }
    if (!sheetXml) {
      return { headers: [], rows: [] };
    }

    function colLetterToIndex(colStr) {
      let idx = 0;
      for (let i = 0; i < colStr.length; i++) {
        idx = idx * 26 + (colStr.charCodeAt(i) - 64);
      }
      return idx - 1;
    }

    const rowMatches = sheetXml.match(/<row\b[\s\S]*?<\/row>/g) || [];
    const parsedRows = [];

    for (const rowXml of rowMatches) {
      const rAttr = rowXml.match(/<row[^>]*\br="(\d+)"/);
      const rowIdx = rAttr ? parseInt(rAttr[1], 10) - 1 : parsedRows.length;

      const cells = [];
      // Match self-closing <c .../> FIRST to avoid swallowing subsequent tags
      const cellMatches = rowXml.match(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g) || [];

      for (const cellXml of cellMatches) {
        const refMatch = cellXml.match(/\br="([A-Z]+)(\d+)"/);
        if (!refMatch) continue;

        const colIndex = colLetterToIndex(refMatch[1]);
        const typeMatch = cellXml.match(/\bt="([a-zA-Z]+)"/);
        const cellType = typeMatch ? typeMatch[1] : "";

        let cellValue = "";
        if (cellType === "s") {
          // Shared string lookup
          const vMatch = cellXml.match(/<v>(\d+)<\/v>/);
          if (vMatch) {
            const sIdx = parseInt(vMatch[1], 10);
            cellValue = sharedStrings[sIdx] || "";
          }
        } else if (cellType === "inlineStr") {
          const tMatch = cellXml.match(/<t[^>]*>([\s\S]*?)<\/t>/);
          if (tMatch) {
            cellValue = unescapeXml(tMatch[1]);
          }
        } else {
          // Plain value (number, date, string)
          const vMatch = cellXml.match(/<v>([\s\S]*?)<\/v>/);
          if (vMatch) {
            cellValue = unescapeXml(vMatch[1]);
          }
        }

        cells[colIndex] = cellValue.trim();
      }

      parsedRows[rowIdx] = cells;
    }

    // Filter empty rows
    const compactRows = parsedRows.filter((r) => Array.isArray(r) && r.some((c) => c && c.length > 0));
    if (!compactRows.length) return { headers: [], rows: [] };

    const headers = (compactRows[0] || []).map((h, i) => (h && h.trim()) || `Column_${i + 1}`);
    const rows = [];

    for (let i = 1; i < compactRows.length; i++) {
      const rowArr = compactRows[i];
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = rowArr[idx] !== undefined ? rowArr[idx] : "";
      });
      rows.push(obj);
    }

    return { headers, rows };
  }

  function unescapeXml(str) {
    if (!str || typeof str !== "string") return "";
    return str
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }

  // ─── 3. COLUMN MAPPING & NORMALIZATION ────────────────────────────────────
  const ALIAS_MAP = {
    company_name: [
      "company", "company name", "company_name", "business name", "business_name",
      "organization", "account name", "place name", "firm name", "agency name"
    ],
    website: [
      "website", "domain", "url", "web", "site", "web address", "company website",
      "homepage", "web_url", "website url"
    ],
    phone: [
      "phone", "primary phone", "phone number", "telephone", "tel", "mobile",
      "cell", "contact number", "phone_number", "main phone"
    ],
    email: [
      "email", "primary email", "email address", "e-mail", "mail", "contact email",
      "corporate email", "business email"
    ],
    additional_emails: [
      "additional emails", "additional email", "secondary emails", "other emails", "emails"
    ],
    additional_phones: [
      "additional phones", "additional phone", "secondary phones", "other phones", "phones"
    ],
    address: [
      "address", "full address", "street address", "location", "street", "formatted address"
    ],
    city: ["city", "town", "locality", "municipality"],
    region: [
      "region", "state", "state region", "state / region", "state/region", "province", "area"
    ],
    country: ["country", "nation"],
    postal_code: [
      "postal code", "postal_code", "zip", "zip code", "zipcode", "postcode", "pin code", "pincode"
    ],
    category: [
      "category", "industry", "business type", "business_type", "type", "sector"
    ],
    rating: ["rating", "score", "stars", "google rating", "user rating"],
    review_count: [
      "reviews", "review count", "review_count", "reviews count", "num reviews", "ratings count"
    ],
    lead_score: ["lead score", "lead_score"],
    quality_tier: ["quality tier", "quality_tier", "tier"],
    place_id: ["place id", "place_id", "placeid", "google place id"],
    source_url: ["source url", "source_url", "maps url", "google maps url", "link", "google_maps_url"],
    imported_at: ["imported at", "imported_at", "discovered at", "date added"],
    source_query: ["source query", "source_query", "search query", "query"],
    decision_maker_name: [
      "decision maker name", "decision maker", "contact name", "executive name",
      "owner", "ceo", "founder", "principal", "contact person"
    ],
    decision_maker_title: [
      "decision maker title", "title", "position", "role", "executive title", "job title"
    ],
    decision_maker_email: [
      "decision maker email", "executive email", "direct email", "dm email"
    ],
    decision_maker_linkedin: [
      "decision maker linkedin", "executive linkedin", "dm linkedin", "contact linkedin"
    ],
    linkedin: ["linkedin", "linkedin url", "company linkedin", "linkedin_url"],
    twitter_x: ["twitter x", "twitter / x", "twitter", "x", "twitter url", "twitter_url"],
    facebook: ["facebook", "facebook url", "facebook_url"],
    instagram: ["instagram", "instagram url", "instagram_url"],
    youtube: ["youtube", "youtube url", "youtube_url"],
    github: ["github", "github url", "github_url"],
    booking_url: ["booking url", "booking_url", "reservation url"],
    ordering_url: ["ordering url", "ordering_url", "order url"],
    menu_url: ["menu url", "menu_url"]
  };

  function normalizeRecord(rawObj) {
    if (!rawObj || typeof rawObj !== "object") return null;

    const lead = {
      company_name: null,
      phone: null,
      website: null,
      email: null,
      address: null,
      city: null,
      region: null,
      country: null,
      postal_code: null,
      category: null,
      rating: null,
      review_count: null,
      lead_score: null,
      quality_tier: null,
      place_id: null,
      source_url: null,
      imported_at: null,
      sourceQuery: null,
      decision_maker_name: null,
      decision_maker_title: null,
      decision_maker_email: null,
      decision_maker_linkedin: null,
      additional_emails: [],
      additional_phones: [],
      people: [],
      social: {},
      _raw: rawObj,
    };

    const keys = Object.keys(rawObj);
    for (const key of keys) {
      const val = rawObj[key] != null ? String(rawObj[key]).trim() : "";
      if (!val) continue;

      const normKey = key.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();

      // Find matching standard field
      let matchedField = null;
      for (const [canonField, aliases] of Object.entries(ALIAS_MAP)) {
        if (aliases.includes(normKey)) {
          matchedField = canonField;
          break;
        }
      }

      if (matchedField) {
        if (["linkedin", "twitter_x", "facebook", "instagram", "youtube", "github"].includes(matchedField)) {
          lead.social[matchedField] = val;
        } else if (matchedField === "rating") {
          const num = parseFloat(val);
          lead.rating = !isNaN(num) ? num : val;
        } else if (matchedField === "review_count") {
          const num = parseInt(val.replace(/\D/g, ""), 10);
          lead.review_count = !isNaN(num) ? num : val;
        } else if (matchedField === "additional_emails") {
          const list = val.split(/[;,]/).map((e) => e.trim()).filter(Boolean);
          lead.additional_emails.push(...list);
        } else if (matchedField === "additional_phones") {
          const list = val.split(/[;,]/).map((p) => p.trim()).filter(Boolean);
          lead.additional_phones.push(...list);
        } else if (matchedField === "source_query") {
          lead.sourceQuery = val;
        } else {
          lead[matchedField] = val;
        }
      }
    }

    // Explicit fallback for company_name if still null
    if (!lead.company_name) {
      lead.company_name = rawObj.company_name || rawObj.company || rawObj.Company || rawObj["Company Name"] || rawObj["Business Name"] || rawObj.name || null;
    }

    return lead.company_name || lead.website || lead.phone || lead.email ? lead : null;
  }

  // ─── 4. MULTI-FILE MERGE & DEDUPLICATION ─────────────────────────────────
  /**
   * Merges multiple files (CSV or XLSX) into one master deduplicated lead list.
   * Accepts files with either `content` or `data` property.
   * @param {Array<{ name: string, content?: string | Uint8Array | ArrayBuffer, data?: string | Uint8Array | ArrayBuffer }>} files
   * @returns {Promise<{
   *   totalFiles: number,
   *   totalRawLeads: number,
   *   rawCount: number,
   *   duplicatesRemoved: number,
   *   masterLeads: Array<Object>,
   *   breakdown: Array<{ name: string, rowCount: number }>,
   *   fileBreakdown: Array<{ fileName: string, leadCount: number, name: string, rowCount: number }>
   * }>}
   */
  async function mergeLeadFiles(files) {
    if (!Array.isArray(files) || files.length === 0) {
      return {
        totalFiles: 0,
        totalRawLeads: 0,
        rawCount: 0,
        duplicatesRemoved: 0,
        masterLeads: [],
        breakdown: [],
        fileBreakdown: [],
      };
    }

    const allLeads = [];
    const breakdown = [];

    for (const file of files) {
      const fileName = file.name || "unnamed";
      const payload = file.content !== undefined ? file.content : (file.data !== undefined ? file.data : file);
      const isXlsx = fileName.toLowerCase().endsWith(".xlsx") || payload instanceof Uint8Array || payload instanceof ArrayBuffer;

      let parsed;
      if (isXlsx && typeof payload !== "string") {
        parsed = await parseXlsx(payload);
      } else {
        const text = typeof payload === "string" ? payload : new TextDecoder().decode(payload);
        parsed = parseCsv(text);
      }

      const fileLeads = [];
      for (const row of parsed.rows) {
        const normalized = normalizeRecord(row);
        if (normalized) {
          normalized._sourceFile = fileName;
          fileLeads.push(normalized);
        }
      }

      breakdown.push({
        name: fileName,
        rowCount: fileLeads.length,
      });

      allLeads.push(...fileLeads);
    }

    // Deduplicate all combined leads using RAMOS Deduplication Engine
    let deduplicatedLeads = allLeads;
    let duplicatesRemoved = 0;

    const Dedup = Deduplicator || (root && root.RamosDeduplicator);
    if (Dedup && typeof Dedup.deduplicateLeads === "function") {
      const dedupResult = Dedup.deduplicateLeads(allLeads);
      deduplicatedLeads = dedupResult.deduplicatedLeads;
      duplicatesRemoved = dedupResult.duplicatesRemoved;
    }

    const fileBreakdown = breakdown.map((b) => ({
      fileName: b.name,
      leadCount: b.rowCount,
      name: b.name,
      rowCount: b.rowCount,
    }));

    return {
      totalFiles: files.length,
      totalRawLeads: allLeads.length,
      rawCount: allLeads.length,
      duplicatesRemoved,
      masterLeads: deduplicatedLeads,
      breakdown,
      fileBreakdown,
    };
  }

  return {
    parseCsv,
    parseXlsx,
    normalizeRecord,
    mergeLeadFiles,
  };
});
