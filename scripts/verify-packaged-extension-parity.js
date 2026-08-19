import fs from "fs";
import path from "path";

const srcDir = path.resolve("extension");
const pubDir = path.resolve("public/sales-intel-maps-connector-v1.0.16");

function verifyParity() {
  console.log("====================================================");
  console.log("  VERIFYING PACKAGED EXTENSION PARITY (v1.0.16)");
  console.log("====================================================\n");

  const filesToCheck = ["manifest.json", "popup.html", "popup.css", "popup.js", "background.js"];

  let allMatch = true;
  for (const f of filesToCheck) {
    const srcPath = path.join(srcDir, f);
    const pubPath = path.join(pubDir, f);

    const srcBuf = fs.readFileSync(srcPath);
    const pubBuf = fs.readFileSync(pubPath);

    const match = srcBuf.equals(pubBuf);
    console.log(`- ${f}: ${match ? "[MATCH 100%]" : "[MISMATCH ❌]"}`);
    if (!match) allMatch = false;
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(srcDir, "manifest.json"), "utf8"));
  console.log("\nPackage Version:", manifest.version);

  if (allMatch && manifest.version === "1.0.16") {
    console.log("\n[PASS] Extension source and public packaged artifact are 100% synchronized (v1.0.16).");
  } else {
    throw new Error("Parity check failed!");
  }
}

verifyParity();
