import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const extensionPath = path.resolve("extension");
const userDataDir = path.resolve("scratch", "e2e-profile-ext-json-" + Date.now());

if (!fs.existsSync(userDataDir)) {
  fs.mkdirSync(userDataDir, { recursive: true });
}

console.log("=== INSPECTING CDP TARGET LIST FROM http://127.0.0.1:9222/json/list ===");

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
  const res = await fetch("http://127.0.0.1:9222/json/list").then((r) => r.json());
  console.log("CDP JSON Targets:");
  console.log(JSON.stringify(res, null, 2));
} catch (err) {
  console.error("Fetch error:", err);
} finally {
  try {
    proc.kill();
  } catch (e) {}
}
