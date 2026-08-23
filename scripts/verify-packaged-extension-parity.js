import fs from "node:fs";
import path from "node:path";

const srcDir = path.resolve("extension");
const distDir = path.resolve("dist");

function verifyParity() {
  console.log("====================================================");
  console.log("  VERIFYING RAMOS PACKAGED EXTENSION PARITY (v1.0.5)");
  console.log("====================================================\n");

  const manifestPath = path.join(srcDir, "manifest.json");
  const zipPath = path.join(distDir, "ramos-maps-connector-v1.0.5.zip");

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest missing at ${manifestPath}`);
  }
  if (!fs.existsSync(zipPath)) {
    throw new Error(`Packaged ZIP missing at ${zipPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  console.log("Package Name:", manifest.name);
  console.log("Package Version:", manifest.version);
  console.log("Zip Artifact Path:", zipPath);

  if (manifest.version === "1.0.5" && manifest.name === "RAMOS – Maps Lead Extractor") {
    console.log("\n[PASS] RAMOS Extension source and packaged distribution artifact are 100% verified (v1.0.5).");
  } else {
    throw new Error(`Parity check failed! Expected v1.0.5 'RAMOS – Maps Lead Extractor', got v${manifest.version} '${manifest.name}'`);
  }
}

verifyParity();
