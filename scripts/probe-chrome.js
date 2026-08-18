import puppeteer from "puppeteer-core";
import path from "node:path";
import fs from "node:fs";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const extensionPath = path.resolve("extension");

console.log("Testing Chrome launch with extension:", extensionPath);

try {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  });

  console.log("Chrome launched successfully!");
  
  // Wait a second to allow background service worker to initialize
  await new Promise((r) => setTimeout(r, 2000));

  const targets = browser.targets();
  console.log("Discovered Browser Targets:");
  for (const t of targets) {
    console.log(` - type=${t.type()} url=${t.url()}`);
  }

  await browser.close();
  console.log("Chrome closed cleanly.");
} catch (err) {
  console.error("Chrome Launch Error:", err);
}
