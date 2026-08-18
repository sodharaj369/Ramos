import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const extensionPath = path.resolve("extension");
const userDataDir = path.resolve("scratch", "e2e-direct-search-test-" + Date.now());

if (!fs.existsSync(userDataDir)) {
  fs.mkdirSync(userDataDir, { recursive: true });
}

console.log("=== NAVIGATING DIRECTLY TO MAPS SEARCH ===");

const proc = spawn(
  chromePath,
  [
    "--remote-debugging-port=9222",
    `--load-extension=${extensionPath}`,
    `--disable-extensions-except=${extensionPath}`,
    `--user-data-dir=${userDataDir}`,
    "https://www.google.com/maps/search/vadapav+near+me",
  ],
  { detached: true }
);

await new Promise((r) => setTimeout(r, 4000));

try {
  const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222" });
  const pages = await browser.pages();
  const mapsPage = pages.find((p) => p.url().includes("google.com/maps")) || pages[0];

  mapsPage.on("console", (msg) => console.log(`[MAPS_CONSOLE] ${msg.text()}`));

  console.log("Waiting for Google Maps search cards...");
  await mapsPage.waitForSelector('div[role="article"].Nv2PK, div.Nv2PK, a.hfpxzc', { timeout: 30000 });
  
  const cardCount = await mapsPage.evaluate(() => {
    return document.querySelectorAll('div[role="article"].Nv2PK, div.Nv2PK, a.hfpxzc').length;
  });

  console.log(`Google Maps cards detected: ${cardCount}`);

  // Query extension service worker target
  let swTarget = null;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const targets = browser.targets();
    swTarget = targets.find(
      (t) => t.type() === "service_worker" && t.url().includes("chrome-extension://") && !t.url().includes("nkeimhogjdpnpccoofpliimaahmaaome")
    );
    if (swTarget) break;
  }

  if (swTarget) {
    console.log("Found Extension Service Worker Target:", swTarget.url());
    const worker = await swTarget.worker();
    worker.on("console", (msg) => console.log(`[SW_CONSOLE] ${msg.text()}`));

    console.log("Dispatching SI_START_DISCOVERY limit=5 in worker context...");
    const res = await worker.evaluate(() => {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "SI_START_DISCOVERY", limit: 5 }, (res) => {
          resolve(res || { ok: true, sent: true });
        });
      });
    });
    console.log("Dispatch Result:", JSON.stringify(res, null, 2));

    console.log("Monitoring background candidate enrichment execution for 20 seconds...");
    await new Promise((r) => setTimeout(r, 20000));
  } else {
    console.error("Service worker target not found after waiting for cards!");
    for (const t of browser.targets()) {
      console.log(` - type=${t.type()} url=${t.url()}`);
    }
  }

  await browser.disconnect();
} catch (err) {
  console.error("Error:", err);
} finally {
  try {
    proc.kill();
  } catch (e) {}
}
