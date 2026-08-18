import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const extensionPath = path.resolve("extension");
const userDataDir = path.resolve("scratch", "e2e-native-profile-" + Date.now());

if (!fs.existsSync(userDataDir)) {
  fs.mkdirSync(userDataDir, { recursive: true });
}

console.log("=== DISCOVERING ALL EXTENSION TARGETS ===");

const chromeProc = spawn(
  chromePath,
  [
    "--remote-debugging-port=9222",
    `--load-extension=${extensionPath}`,
    `--disable-extensions-except=${extensionPath}`,
    `--user-data-dir=${userDataDir}`,
    "https://www.google.com/maps",
  ],
  { detached: true }
);

await new Promise((r) => setTimeout(r, 4000));

try {
  const browser = await puppeteer.connect({
    browserURL: "http://127.0.0.1:9222",
    defaultViewport: { width: 1280, height: 900 },
  });

  const targets = browser.targets();
  console.log(`Total Targets Found: ${targets.length}`);
  
  for (const t of targets) {
    let title = "n/a";
    try {
      if (t.type() === "page") {
        const p = await t.page();
        if (p) title = await p.title();
      }
    } catch (e) {}
    console.log(` - type=${t.type()} | title="${title}" | url=${t.url()}`);
  }

  await browser.disconnect();
} catch (err) {
  console.error("Connect error:", err);
} finally {
  try {
    chromeProc.kill();
  } catch (e) {}
}
