import puppeteer from "puppeteer-core";
import path from "node:path";
import fs from "node:fs";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const extensionPath = path.resolve("extension");
const userDataDir = path.resolve("scratch", "e2e-chrome-profile-" + Date.now());

if (!fs.existsSync(userDataDir)) {
  fs.mkdirSync(userDataDir, { recursive: true });
}

console.log("=== PROBING MV3 SERVICE WORKER TARGET DISCOVERY ===");
console.log("Chrome Binary:", chromePath);
console.log("Extension Path:", extensionPath);
console.log("User Data Dir:", userDataDir);

try {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: false,
    defaultViewport: { width: 1280, height: 900 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });

  console.log("Chrome launched. Waiting 5 seconds for service worker target discovery...");
  await new Promise((r) => setTimeout(r, 5000));

  let extensionId = "";
  const targets = browser.targets();
  
  console.log("\nALL TARGETS DISCOVERED:");
  for (const t of targets) {
    const url = t.url();
    console.log(` - type=${t.type()} | url=${url}`);
    if (url.includes("chrome-extension://")) {
      const m = /chrome-extension:\/\/([a-z0-9]+)/.exec(url);
      if (m) extensionId = m[1];
    }
  }

  console.log(`\nExtension ID: "${extensionId || "NOT_FOUND"}"`);

  await browser.close();
} catch (err) {
  console.error("Probe Error:", err);
}
