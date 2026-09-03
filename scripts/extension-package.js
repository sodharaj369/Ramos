import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to compute CRC-32
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

function createZip(files) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const file of files) {
    const filenameBuf = Buffer.from(file.name.replace(/\\/g, "/"), "utf8");
    const contentBuf = file.data;
    const crc = crc32(contentBuf);
    const compressedBuf = zlib.deflateRawSync(contentBuf);

    // Local file header
    const localHeader = Buffer.alloc(30 + filenameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local header signature
    localHeader.writeUInt16LE(20, 4); // Version needed to extract
    localHeader.writeUInt16LE(0, 6); // General purpose bit flag
    localHeader.writeUInt16LE(8, 8); // Compression method (Deflate)
    localHeader.writeUInt16LE(0, 10); // Last mod file time
    localHeader.writeUInt16LE(0, 12); // Last mod file date
    localHeader.writeUInt32LE(crc, 14); // CRC-32
    localHeader.writeUInt32LE(compressedBuf.length, 18); // Compressed size
    localHeader.writeUInt32LE(contentBuf.length, 22); // Uncompressed size
    localHeader.writeUInt16LE(filenameBuf.length, 26); // Filename length
    localHeader.writeUInt16LE(0, 28); // Extra field length
    filenameBuf.copy(localHeader, 30);

    const localPart = Buffer.concat([localHeader, compressedBuf]);
    localHeaders.push(localPart);

    // Central directory header
    const centralHeader = Buffer.alloc(46 + filenameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Central directory signature
    centralHeader.writeUInt16LE(20, 4); // Version made by
    centralHeader.writeUInt16LE(20, 6); // Version needed to extract
    centralHeader.writeUInt16LE(0, 8); // General purpose bit flag
    centralHeader.writeUInt16LE(8, 10); // Compression method
    centralHeader.writeUInt16LE(0, 12); // Last mod file time
    centralHeader.writeUInt16LE(0, 14); // Last mod file date
    centralHeader.writeUInt32LE(crc, 16); // CRC-32
    centralHeader.writeUInt32LE(compressedBuf.length, 20); // Compressed size
    centralHeader.writeUInt32LE(contentBuf.length, 24); // Uncompressed size
    centralHeader.writeUInt16LE(filenameBuf.length, 28); // Filename length
    centralHeader.writeUInt16LE(0, 30); // Extra field length
    centralHeader.writeUInt16LE(0, 32); // File comment length
    centralHeader.writeUInt16LE(0, 34); // Disk number start
    centralHeader.writeUInt16LE(0, 36); // Internal file attributes
    centralHeader.writeUInt32LE(0, 38); // External file attributes
    centralHeader.writeUInt32LE(offset, 42); // Relative offset of local header
    filenameBuf.copy(centralHeader, 46);

    centralHeaders.push(centralHeader);
    offset += localPart.length;
  }

  const centralDirStart = offset;
  let centralDirSize = 0;
  for (const ch of centralHeaders) centralDirSize += ch.length;

  // End of central directory record
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4); // Disk number
  eocd.writeUInt16LE(0, 6); // Disk where central directory starts
  eocd.writeUInt16LE(files.length, 8); // Number of central directory records on this disk
  eocd.writeUInt16LE(files.length, 10); // Total number of central directory records
  eocd.writeUInt32LE(centralDirSize, 12); // Size of central directory
  eocd.writeUInt32LE(centralDirStart, 16); // Offset of start of central directory
  eocd.writeUInt16LE(0, 20); // Comment length

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

function packageExtension() {
  const rootDir = path.resolve(__dirname, "..");
  const extensionDir = path.join(rootDir, "extension");
  const manifestPath = path.join(extensionDir, "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    console.error("❌ Manifest file not found at:", manifestPath);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  console.log(`📦 Packaging RAMOS Maps Connector v${manifest.version}...`);

  // Collect standalone files to package
  const requiredFiles = [
    "manifest.json",
    "background.js",
    "popup.html",
    "popup.css",
    "popup.js",
    "assets/ramos-icon-16.png",
    "assets/ramos-icon-32.png",
    "assets/ramos-icon-48.png",
    "assets/ramos-icon-128.png",
    "discovery.js",
    "shared/constants.js",
    "shared/schema.js",
    "shared/xlsx-builder.js",
    "content/maps/dom-utils.js",
    "content/maps/selectors.js",
    "content/maps/validators.js",
    "content/maps/address-parser.js",
    "content/maps/result-card-extractor.js",
    "content/maps/detail-extractor.js",
    "content/maps/maps-adapter.js",
    "content/website/page-acquisition.js",
    "content/website/normalizers.js",
    "content/website/validators.js",
    "content/website/page-analyzer.js",
    "content/website/structured-data.js",
    "content/website/field-extractors.js",
    "content/website/crawl-policy.js",
    "content/website/page-priority.js",
    "content/website/link-discovery.js",
    "content/website/crawl-queue.js",
    "content/website/people-extractor.js",
    "content/website/confidence.js",
    "content/website/enricher.js",
    "content/website/website-adapter.js",
  ];

  // Validate manifest script references
  const manifestScripts = [];
  if (manifest.background && manifest.background.service_worker) {
    manifestScripts.push(manifest.background.service_worker);
  }
  if (manifest.content_scripts) {
    for (const cs of manifest.content_scripts) {
      if (cs.js) manifestScripts.push(...cs.js);
    }
  }

  const missingFiles = [];
  for (const rel of manifestScripts) {
    const full = path.join(extensionDir, rel);
    if (!fs.existsSync(full)) {
      missingFiles.push(rel);
    }
  }

  if (missingFiles.length) {
    console.error("❌ Manifest references files that do not exist:", missingFiles);
    process.exit(1);
  }

  const zipFiles = [];
  for (const rel of requiredFiles) {
    const full = path.join(extensionDir, rel);
    if (!fs.existsSync(full)) {
      console.error(`❌ Required extension file missing: ${rel}`);
      process.exit(1);
    }
    const data = fs.readFileSync(full);
    zipFiles.push({ name: rel, data });
  }

  const zipBuffer = createZip(zipFiles);

  const distDir = path.join(rootDir, "dist");
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  const versionedZipPath = path.join(distDir, `ramos-maps-connector-v${manifest.version}.zip`);
  const standaloneZipPath = path.join(distDir, "ramos-maps-connector.zip");

  fs.writeFileSync(versionedZipPath, zipBuffer);
  fs.writeFileSync(standaloneZipPath, zipBuffer);

  console.log(`✅ Successfully packaged RAMOS Chrome Extension to: ${versionedZipPath}`);
  console.log(`✅ Copy maintained at: ${standaloneZipPath}`);
  console.log(`   Total packaged files: ${zipFiles.length}`);
  console.log(`   ZIP size: ${(zipBuffer.length / 1024).toFixed(1)} KB`);
}

packageExtension();
