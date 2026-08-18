import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const extensionPath = path.resolve("extension");
const userDataDir = path.resolve("scratch", "e2e-native-popup-test-" + Date.now());

if (!fs.existsSync(userDataDir)) {
  fs.mkdirSync(userDataDir, { recursive: true });
}

console.log("=== DYNAMIC EXTENSION ID DISCOVERY & POPUP ACCESS TEST ===");

const proc = spawn(
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
  const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222" });
  
  // Wait up to 10 seconds for extension target to appear
  let extensionId = "";
  let swTarget = null;

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const targets = browser.targets();
    const found = targets.find(
      (t) => t.url().startsWith("chrome-extension://") && !t.url().includes("nkeimhogjdpnpccoofpliimaahmaaome")
    );
    if (found) {
      swTarget = found;
      const m = /chrome-extension:\/\/([a-z0-9]+)/.exec(found.url());
      if (m) {
        extensionId = m[1];
        break;
      }
    }
  }

  console.log("ALL ACTIVE TARGETS:");
  for (const t of browser.targets()) {
    console.log(` - type=${t.type()} | url=${t.url()}`);
  }

  console.log("Discovered Current Extension ID:", extensionId || "NONE");

  if (extensionId) {
    const popupPage = await browser.newPage();
    const popupUrl = `chrome-extension://${extensionId}/popup.html`;
    console.log("Navigating popup page to:", popupUrl);

    await popupPage.goto(popupUrl, { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 1000));

    const popupTitle = await popupPage.title();
    const btnText = await popupPage.evaluate(() => {
      const btn = document.querySelector("#extractBtn, #quickCsvBtn");
      return btn ? btn.textContent.trim() : "NOT_FOUND";
    });

    console.log(`SUCCESS! Popup Title: "${popupTitle}", Extract Button Text: "${btnText}"`);
  }

  await browser.disconnect();
} catch (err) {
  console.error("Error:", err);
} finally {
  try {
    proc.kill();
  } catch (e) {}
}
