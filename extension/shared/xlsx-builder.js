/**
 * RAMOS Standalone OpenXML XLSX Builder (v1.0.5)
 * 100% Browser-Native Client-Side XLSX Generator.
 * Uses native Uint8Array, TextEncoder, and DataView primitives.
 * Zero Node.js Buffer dependencies, zero runtime npm packages.
 *
 * Produces 100% ECMA-376 OOXML Strict Compliant Excel Spreadsheets:
 * - Mandatory <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
 * - Custom text format numFmtId="164" declared in <numFmts>
 * - Strict element ordering inside <styleSheet> and <font>
 * - Preserved whitespace via xml:space="preserve" on all <t> nodes
 * - Control character sanitization (\x00-\x08, \x0B, \x0C, \x0E-\x1F)
 * - Valid MS-DOS Zip timestamps (Jan 1, 2024)
 * - Top row freeze & AutoFilter enabled
 * - RAMOS Deep Violet (#7C3AED) header fill & alternating row fills (#F8FAFC)
 */
(function (root, factory) {
  const instance = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = instance;
  }
  if (root) {
    root.RamosXlsxBuilder = instance;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const textEncoder = new TextEncoder();

  function stringToUint8(str) {
    return textEncoder.encode(str);
  }

  function writeUInt16LE(arr, val, offset) {
    arr[offset] = val & 0xff;
    arr[offset + 1] = (val >>> 8) & 0xff;
  }

  function writeUInt32LE(arr, val, offset) {
    arr[offset] = val & 0xff;
    arr[offset + 1] = (val >>> 8) & 0xff;
    arr[offset + 2] = (val >>> 16) & 0xff;
    arr[offset + 3] = (val >>> 24) & 0xff;
  }

  function concatUint8Arrays(arrays) {
    let totalLen = 0;
    for (let i = 0; i < arrays.length; i++) {
      totalLen += arrays[i].length;
    }
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (let i = 0; i < arrays.length; i++) {
      result.set(arrays[i], offset);
      offset += arrays[i].length;
    }
    return result;
  }

  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function escapeXml(val) {
    if (val == null) return "";
    return String(val)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  // Create Zip Archive Uint8Array containing OpenXML files
  function createZipArchive(files) {
    const localHeaders = [];
    const centralHeaders = [];
    let offset = 0;

    // Valid MS-DOS Date/Time: Jan 1, 2024 00:00:00
    const dosTime = 0x0000;
    const dosDate = 0x5821;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filenameBuf = stringToUint8(file.name.replace(/\\/g, "/"));
      const contentBuf = file.data instanceof Uint8Array ? file.data : stringToUint8(file.data);
      const crc = crc32(contentBuf);

      const compressedBuf = contentBuf;
      const compMethod = 0; // Store method (100% browser-native & Excel compatible)

      // Local file header (30 bytes + filename length)
      const localHeader = new Uint8Array(30 + filenameBuf.length);
      writeUInt32LE(localHeader, 0x04034b50, 0);
      writeUInt16LE(localHeader, 20, 4);
      writeUInt16LE(localHeader, 0, 6);
      writeUInt16LE(localHeader, compMethod, 8);
      writeUInt16LE(localHeader, dosTime, 10);
      writeUInt16LE(localHeader, dosDate, 12);
      writeUInt32LE(localHeader, crc, 14);
      writeUInt32LE(localHeader, compressedBuf.length, 18);
      writeUInt32LE(localHeader, contentBuf.length, 22);
      writeUInt16LE(localHeader, filenameBuf.length, 26);
      writeUInt16LE(localHeader, 0, 28);
      localHeader.set(filenameBuf, 30);

      const localPart = concatUint8Arrays([localHeader, compressedBuf]);
      localHeaders.push(localPart);

      // Central directory header (46 bytes + filename length)
      const centralHeader = new Uint8Array(46 + filenameBuf.length);
      writeUInt32LE(centralHeader, 0x02014b50, 0);
      writeUInt16LE(centralHeader, 20, 4);
      writeUInt16LE(centralHeader, 20, 6);
      writeUInt16LE(centralHeader, 0, 8);
      writeUInt16LE(centralHeader, compMethod, 10);
      writeUInt16LE(centralHeader, dosTime, 12);
      writeUInt16LE(centralHeader, dosDate, 14);
      writeUInt32LE(centralHeader, crc, 16);
      writeUInt32LE(centralHeader, compressedBuf.length, 20);
      writeUInt32LE(centralHeader, contentBuf.length, 24);
      writeUInt16LE(centralHeader, filenameBuf.length, 28);
      writeUInt16LE(centralHeader, 0, 30);
      writeUInt16LE(centralHeader, 0, 32);
      writeUInt16LE(centralHeader, 0, 34);
      writeUInt16LE(centralHeader, 0, 36);
      writeUInt32LE(centralHeader, 0, 38);
      writeUInt32LE(centralHeader, offset, 42);
      centralHeader.set(filenameBuf, 46);

      centralHeaders.push(centralHeader);
      offset += localPart.length;
    }

    const centralDirStart = offset;
    let centralDirSize = 0;
    for (let i = 0; i < centralHeaders.length; i++) {
      centralDirSize += centralHeaders[i].length;
    }

    const eocd = new Uint8Array(22);
    writeUInt32LE(eocd, 0x06054b50, 0);
    writeUInt16LE(eocd, 0, 4);
    writeUInt16LE(eocd, 0, 6);
    writeUInt16LE(eocd, files.length, 8);
    writeUInt16LE(eocd, files.length, 10);
    writeUInt32LE(eocd, centralDirSize, 12);
    writeUInt32LE(eocd, centralDirStart, 16);
    writeUInt16LE(eocd, 0, 20);

    return concatUint8Arrays([...localHeaders, ...centralHeaders, eocd]);
  }

  // Canonical Column Specifications (24 Fields with Deliberate Widths & Formatting)
  const COLUMN_SPECS = [
    { header: "Company", width: 30, type: "str", align: "left" },
    { header: "Phone", width: 18, type: "text", align: "left" },
    { header: "Website", width: 32, type: "url", align: "left" },
    { header: "Email", width: 30, type: "str", align: "left" },
    { header: "Email Status", width: 16, type: "str", align: "left" },
    { header: "Address", width: 45, type: "str", align: "left" },
    { header: "City", width: 18, type: "str", align: "left" },
    { header: "State / Region", width: 18, type: "str", align: "left" },
    { header: "Country", width: 15, type: "str", align: "left" },
    { header: "Postal Code", width: 14, type: "text", align: "left" },
    { header: "Industry", width: 22, type: "str", align: "left" },
    { header: "Business Type", width: 22, type: "str", align: "left" },
    { header: "Rating", width: 10, type: "num", align: "right" },
    { header: "Reviews", width: 12, type: "num", align: "right" },
    { header: "Opening Status", width: 20, type: "str", align: "left" },
    { header: "Price Range", width: 16, type: "str", align: "left" },
    { header: "Booking URL", width: 32, type: "url", align: "left" },
    { header: "Ordering URL", width: 32, type: "url", align: "left" },
    { header: "Menu URL", width: 32, type: "url", align: "left" },
    { header: "Imported At", width: 24, type: "str", align: "left" },
    { header: "Source URL", width: 40, type: "url", align: "left" },
    { header: "Place ID", width: 35, type: "str", align: "left" },
    { header: "Source Query", width: 28, type: "str", align: "left" },
    { header: "Run ID", width: 32, type: "str", align: "left" },
  ];

  const HEADERS = COLUMN_SPECS.map((c) => c.header);

  function getColLetter(colIdx) {
    let temp = colIdx + 1;
    let letter = "";
    while (temp > 0) {
      const mod = (temp - 1) % 26;
      letter = String.fromCharCode(65 + mod) + letter;
      temp = Math.floor((temp - mod) / 26);
    }
    return letter;
  }

  function isUrl(val) {
    if (!val || typeof val !== "string") return false;
    return /^https?:\/\//i.test(val.trim());
  }

  function buildXlsx(leads) {
    const validLeads = (leads || []).filter((l) => l && (l.company_name || l.website || l.email || l.phone));
    const now = new Date().toISOString();

    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

    const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

    const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

    const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="RAMOS Leads" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

    // ECMA-376 OOXML Strict Stylesheet Definition with exact element ordering and mandatory cellStyles
    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="@"/>
  </numFmts>
  <fonts count="4">
    <!-- 0: Default Font -->
    <font><sz val="10"/><color rgb="FF0F172A"/><name val="Segoe UI"/></font>
    <!-- 1: Bold White Header Font -->
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Segoe UI"/></font>
    <!-- 2: Hyperlink Font (Blue/Underline) -->
    <font><u val="single"/><sz val="10"/><color rgb="FF0284C7"/><name val="Segoe UI"/></font>
    <!-- 3: Bold Data Font -->
    <font><b/><sz val="10"/><color rgb="FF0F172A"/><name val="Segoe UI"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF7C3AED"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/></border>
    <border>
      <left style="thin"><color rgb="FFE2E8F0"/></left>
      <right style="thin"><color rgb="FFE2E8F0"/></right>
      <top style="thin"><color rgb="FFE2E8F0"/></top>
      <bottom style="thin"><color rgb="FFE2E8F0"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="10">
    <!-- 0: Default -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <!-- 1: Header (RAMOS Violet #7C3AED, Bold White text, Centered/Top, Wrapped) -->
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <!-- 2: Data Row Even - Standard Text (Left/Top, Wrapped) -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf>
    <!-- 3: Data Row Odd - Standard Text (Light Fill #F8FAFC, Left/Top, Wrapped) -->
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf>
    <!-- 4: Data Row Even - Raw Text Format (Phone/Postal) (Left/Top) -->
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>
    <!-- 5: Data Row Odd - Raw Text Format (Phone/Postal) (Left/Top) -->
    <xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>
    <!-- 6: Data Row Even - Numeric (Rating/Reviews) (Right/Top) -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
    <!-- 7: Data Row Odd - Numeric (Rating/Reviews) (Right/Top) -->
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
    <!-- 8: Data Row Even - Hyperlink (Blue/Underline, Left/Top) -->
    <xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>
    <!-- 9: Data Row Odd - Hyperlink (Blue/Underline, Left/Top) -->
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`;

    const maxRow = validLeads.length + 1;
    const maxColLetter = getColLetter(COLUMN_SPECS.length - 1);
    const tableDimension = `A1:${maxColLetter}${maxRow}`;

    let colsXml = "<cols>";
    for (let i = 0; i < COLUMN_SPECS.length; i++) {
      const colIdx = i + 1;
      const spec = COLUMN_SPECS[i];
      colsXml += `<col min="${colIdx}" max="${colIdx}" width="${spec.width}" customWidth="1"/>`;
    }
    colsXml += "</cols>";

    let rowsXml = `<row r="1" customHeight="1" ht="28">`;
    COLUMN_SPECS.forEach((spec, colIdx) => {
      const cellRef = `${getColLetter(colIdx)}1`;
      rowsXml += `<c r="${cellRef}" s="1" t="inlineStr"><is><t xml:space="preserve">${escapeXml(spec.header)}</t></is></c>`;
    });
    rowsXml += `</row>`;

    validLeads.forEach((lead, rowIdx) => {
      const r = rowIdx + 2;
      const isOdd = r % 2 !== 0;

      const values = [
        { v: lead.company_name || lead.website || "—", spec: COLUMN_SPECS[0] },
        { v: lead.phone, spec: COLUMN_SPECS[1] },
        { v: lead.website, spec: COLUMN_SPECS[2] },
        { v: lead.email, spec: COLUMN_SPECS[3] },
        { v: lead.email_status, spec: COLUMN_SPECS[4] },
        { v: lead.address, spec: COLUMN_SPECS[5] },
        { v: lead.city, spec: COLUMN_SPECS[6] },
        { v: lead.region || lead.state, spec: COLUMN_SPECS[7] },
        { v: lead.country, spec: COLUMN_SPECS[8] },
        { v: lead.postal_code, spec: COLUMN_SPECS[9] },
        { v: lead.category, spec: COLUMN_SPECS[10] },
        { v: lead.business_type || lead.category, spec: COLUMN_SPECS[11] },
        { v: lead.rating, spec: COLUMN_SPECS[12] },
        { v: lead.review_count, spec: COLUMN_SPECS[13] },
        { v: lead.opening_status, spec: COLUMN_SPECS[14] },
        { v: lead.price_range, spec: COLUMN_SPECS[15] },
        { v: lead.booking_url, spec: COLUMN_SPECS[16] },
        { v: lead.ordering_url, spec: COLUMN_SPECS[17] },
        { v: lead.menu_url, spec: COLUMN_SPECS[18] },
        { v: lead.discovered_at || lead.created_at || now, spec: COLUMN_SPECS[19] },
        { v: lead.source_url, spec: COLUMN_SPECS[20] },
        { v: lead.place_id, spec: COLUMN_SPECS[21] },
        { v: lead.sourceQuery, spec: COLUMN_SPECS[22] },
        { v: lead.runId, spec: COLUMN_SPECS[23] },
      ];

      rowsXml += `<row r="${r}">`;
      values.forEach((item, colIdx) => {
        const cellRef = `${getColLetter(colIdx)}${r}`;
        const valStr = item.v != null ? String(item.v).trim() : "";
        const type = item.spec.type;

        let styleId = isOdd ? 3 : 2;

        if (!valStr.length) {
          rowsXml += `<c r="${cellRef}" s="${styleId}"/>`;
        } else if (type === "num" && !isNaN(Number(valStr))) {
          styleId = isOdd ? 7 : 6;
          rowsXml += `<c r="${cellRef}" s="${styleId}"><v>${Number(valStr)}</v></c>`;
        } else if (type === "text") {
          styleId = isOdd ? 5 : 4;
          rowsXml += `<c r="${cellRef}" s="${styleId}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(valStr)}</t></is></c>`;
        } else if (type === "url" && isUrl(valStr)) {
          styleId = isOdd ? 9 : 8;
          rowsXml += `<c r="${cellRef}" s="${styleId}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(valStr)}</t></is></c>`;
        } else {
          rowsXml += `<c r="${cellRef}" s="${styleId}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(valStr)}</t></is></c>`;
        }
      });
      rowsXml += `</row>`;
    });

    const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="${tableDimension}"/>
  <sheetViews>
    <sheetView showGridLines="1" tabSelected="1">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  ${colsXml}
  <sheetData>
    ${rowsXml}
  </sheetData>
  <autoFilter ref="${tableDimension}"/>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;

    const files = [
      { name: "[Content_Types].xml", data: contentTypesXml },
      { name: "_rels/.rels", data: rootRelsXml },
      { name: "xl/_rels/workbook.xml.rels", data: workbookRelsXml },
      { name: "xl/workbook.xml", data: workbookXml },
      { name: "xl/styles.xml", data: stylesXml },
      { name: "xl/worksheets/sheet1.xml", data: sheetXml },
    ];

    return createZipArchive(files);
  }

  return {
    COLUMN_SPECS,
    HEADERS,
    buildXlsx,
    buildWebsiteXlsx,
  };

  // ─── WEBSITE INTELLIGENCE EXTENDED EXPORT ─────────────────────────────────
  // Produces a 2-sheet XLSX:
  //   Sheet 1 "Leads"  – all contact/social columns (no Maps-specific Rating/Reviews/etc.)
  //   Sheet 2 "People" – one row per extracted person
  // The existing buildXlsx() remains 100% unchanged for Maps.

  function buildWebsiteXlsx(leads) {
    const validLeads = (leads || []).filter((l) => l && (l.company_name || l.website || l.email || l.phone));
    const now = new Date().toISOString();

    // ── Sheet 1: Leads (extended columns) ─────────────────────────────────────
    const WEB_COLUMN_SPECS = [
      { header: "Company",             width: 30, type: "str",  align: "left"  },
      { header: "Website",             width: 34, type: "url",  align: "left"  },
      { header: "Primary Email",       width: 30, type: "str",  align: "left"  },
      { header: "Additional Emails",   width: 40, type: "str",  align: "left"  },
      { header: "Email Status",        width: 16, type: "str",  align: "left"  },
      { header: "Primary Phone",       width: 18, type: "text", align: "left"  },
      { header: "Additional Phones",   width: 34, type: "str",  align: "left"  },
      { header: "Address",             width: 45, type: "str",  align: "left"  },
      { header: "City",                width: 18, type: "str",  align: "left"  },
      { header: "State / Region",      width: 18, type: "str",  align: "left"  },
      { header: "Country",             width: 15, type: "str",  align: "left"  },
      { header: "Postal Code",         width: 14, type: "text", align: "left"  },
      { header: "Industry",            width: 28, type: "str",  align: "left"  },
      { header: "Description",         width: 50, type: "str",  align: "left"  },
      { header: "LinkedIn",            width: 40, type: "url",  align: "left"  },
      { header: "Twitter / X",         width: 34, type: "url",  align: "left"  },
      { header: "Facebook",            width: 34, type: "url",  align: "left"  },
      { header: "Instagram",           width: 34, type: "url",  align: "left"  },
      { header: "YouTube",             width: 34, type: "url",  align: "left"  },
      { header: "GitHub",              width: 34, type: "url",  align: "left"  },
      { header: "Booking URL",         width: 32, type: "url",  align: "left"  },
      { header: "Ordering URL",        width: 32, type: "url",  align: "left"  },
      { header: "Menu URL",            width: 32, type: "url",  align: "left"  },
      { header: "Source URL",          width: 40, type: "url",  align: "left"  },
      { header: "Imported At",         width: 24, type: "str",  align: "left"  },
      { header: "Source Query",        width: 28, type: "str",  align: "left"  },
    ];

    // ── Sheet 2: People ───────────────────────────────────────────────────────
    const PEOPLE_COLUMN_SPECS = [
      { header: "Company",      width: 30, type: "str",  align: "left" },
      { header: "Name",         width: 24, type: "str",  align: "left" },
      { header: "Title",        width: 26, type: "str",  align: "left" },
      { header: "Email",        width: 30, type: "str",  align: "left" },
      { header: "Phone",        width: 18, type: "text", align: "left" },
      { header: "LinkedIn",     width: 40, type: "url",  align: "left" },
      { header: "Profile URL",  width: 40, type: "url",  align: "left" },
    ];

    // Helper: build sheet XML from column specs + rows of value arrays
    function buildSheetXml(colSpecs, dataRows) {
      const maxRow = dataRows.length + 1;
      const maxColLetter = getColLetter(colSpecs.length - 1);
      const tableDimension = `A1:${maxColLetter}${maxRow}`;

      let colsXml = "<cols>";
      for (let i = 0; i < colSpecs.length; i++) {
        const colIdx = i + 1;
        colsXml += `<col min="${colIdx}" max="${colIdx}" width="${colSpecs[i].width}" customWidth="1"/>`;
      }
      colsXml += "</cols>";

      // Header row
      let rowsXml = `<row r="1" customHeight="1" ht="28">`;
      colSpecs.forEach((spec, colIdx) => {
        const cellRef = `${getColLetter(colIdx)}1`;
        rowsXml += `<c r="${cellRef}" s="1" t="inlineStr"><is><t xml:space="preserve">${escapeXml(spec.header)}</t></is></c>`;
      });
      rowsXml += `</row>`;

      // Data rows
      dataRows.forEach((vals, rowIdx) => {
        const r = rowIdx + 2;
        const isOdd = r % 2 !== 0;
        rowsXml += `<row r="${r}">`;
        vals.forEach((val, colIdx) => {
          const cellRef = `${getColLetter(colIdx)}${r}`;
          const spec = colSpecs[colIdx];
          const valStr = val != null ? String(val).trim() : "";
          let styleId = isOdd ? 3 : 2;

          if (!valStr.length) {
            rowsXml += `<c r="${cellRef}" s="${styleId}"/>`;
          } else if (spec.type === "num" && !isNaN(Number(valStr))) {
            styleId = isOdd ? 7 : 6;
            rowsXml += `<c r="${cellRef}" s="${styleId}"><v>${Number(valStr)}</v></c>`;
          } else if (spec.type === "text") {
            styleId = isOdd ? 5 : 4;
            rowsXml += `<c r="${cellRef}" s="${styleId}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(valStr)}</t></is></c>`;
          } else if (spec.type === "url" && isUrl(valStr)) {
            styleId = isOdd ? 9 : 8;
            rowsXml += `<c r="${cellRef}" s="${styleId}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(valStr)}</t></is></c>`;
          } else {
            rowsXml += `<c r="${cellRef}" s="${styleId}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(valStr)}</t></is></c>`;
          }
        });
        rowsXml += `</row>`;
      });

      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="${tableDimension}"/>
  <sheetViews>
    <sheetView showGridLines="1" tabSelected="1">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  ${colsXml}
  <sheetData>
    ${rowsXml}
  </sheetData>
  <autoFilter ref="${tableDimension}"/>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;
    }

    // Build Leads sheet rows
    const leadsRows = validLeads.map((l) => {
      const social = l.social || {};
      const extraEmails = Array.isArray(l.emails) && l.emails.length > 1
        ? l.emails.slice(1).map((e) => e.email || e).join("; ")
        : "";
      const extraPhones = Array.isArray(l.phones) && l.phones.length > 1
        ? l.phones.slice(1).map((p) => p.phone || p).join("; ")
        : "";
      return [
        l.company_name || l.website || "—",
        l.website,
        l.email,
        extraEmails,
        l.email_status,
        l.phone,
        extraPhones,
        l.address,
        l.city,
        l.region || l.state,
        l.country,
        l.postal_code,
        l.category,
        l.business_type || "",
        social.linkedin || "",
        social.twitter_x || "",
        social.facebook || "",
        social.instagram || "",
        social.youtube || "",
        social.github || "",
        l.booking_url,
        l.ordering_url,
        l.menu_url,
        l.source_url,
        l.discovered_at || l.imported_at || now,
        l.sourceQuery,
      ];
    });

    // Build People sheet rows (one row per person, across all leads)
    const peopleRows = [];
    for (const l of validLeads) {
      if (!Array.isArray(l.people) || l.people.length === 0) continue;
      for (const p of l.people) {
        peopleRows.push([
          l.company_name || l.website || "—",
          p.name || "",
          p.title || "",
          p.email || "",
          p.phone || "",
          p.linkedin_url || "",
          p.profile_url || p.linkedin_url || "",
        ]);
      }
    }

    const sheet1Xml = buildSheetXml(WEB_COLUMN_SPECS, leadsRows);
    const sheet2Xml = buildSheetXml(PEOPLE_COLUMN_SPECS, peopleRows.length > 0 ? peopleRows : [["(No people detected)", "", "", "", "", "", ""]]);

    // OOXML structural parts (same styles as Maps export)
    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

    const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

    const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

    const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Leads" sheetId="1" r:id="rId1"/>
    <sheet name="People" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`;

    // Reuse same styles as Maps export (copied verbatim for self-containment)
    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="@"/>
  </numFmts>
  <fonts count="4">
    <font><sz val="10"/><color rgb="FF0F172A"/><name val="Segoe UI"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Segoe UI"/></font>
    <font><u val="single"/><sz val="10"/><color rgb="FF0284C7"/><name val="Segoe UI"/></font>
    <font><b/><sz val="10"/><color rgb="FF0F172A"/><name val="Segoe UI"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF7C3AED"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/></border>
    <border>
      <left style="thin"><color rgb="FFE2E8F0"/></left>
      <right style="thin"><color rgb="FFE2E8F0"/></right>
      <top style="thin"><color rgb="FFE2E8F0"/></top>
      <bottom style="thin"><color rgb="FFE2E8F0"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="10">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>
    <xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`;

    const files = [
      { name: "[Content_Types].xml", data: contentTypesXml },
      { name: "_rels/.rels", data: rootRelsXml },
      { name: "xl/_rels/workbook.xml.rels", data: workbookRelsXml },
      { name: "xl/workbook.xml", data: workbookXml },
      { name: "xl/styles.xml", data: stylesXml },
      { name: "xl/worksheets/sheet1.xml", data: sheet1Xml },
      { name: "xl/worksheets/sheet2.xml", data: sheet2Xml },
    ];

    return createZipArchive(files);
  }

});
