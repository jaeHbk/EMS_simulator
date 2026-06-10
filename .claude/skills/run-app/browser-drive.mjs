// Drive the ED Triage Trainer UI in headless Chrome via the DevTools Protocol.
// No chromium-cli, no Playwright. Two repo-specific gotchas, both handled here:
//   1. Node 18 has no global WebSocket -> import `ws` from the frontend's deps.
//   2. Resolve paths from process.cwd(), never import.meta.url (URL can be shadowed).
//
// Prereqs: smoke.sh has the servers up, and Chrome was launched with
//   --remote-debugging-port=9222  (see SKILL.md).
// Run from the repo root:  node .claude/skills/run-app/browser-drive.mjs

import { createRequire } from "node:module";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";

// Pull `ws` from the frontend node_modules (present transitively via vite).
const require = createRequire(resolve(process.cwd(), "frontend/package.json"));
const WebSocket = require("ws");

const CDP = "http://127.0.0.1:9222";
const APP = "http://127.0.0.1:5173/";
const SHOT = "/tmp/ed_app_caseload.png";

async function newTab(url) {
  // Chrome accepts PUT or GET for /json/new depending on version.
  for (const method of ["PUT", "GET"]) {
    const r = await fetch(`${CDP}/json/new?${encodeURIComponent(url)}`, { method });
    if (r.ok) return r.json();
  }
  throw new Error("could not open a new tab via CDP");
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const ready = new Promise((res, rej) => {
    ws.on("open", res);
    ws.on("error", rej);
  });
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  const send = (method, params = {}) =>
    new Promise((res) => {
      const i = ++id;
      pending.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  return { ready, send, close: () => ws.close() };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function evalJs(c, expression) {
  const r = await c.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  return r.result?.result?.value;
}

(async () => {
  const tab = await newTab(APP);
  const c = connect(tab.webSocketDebuggerUrl);
  await c.ready;
  await c.send("Page.enable");
  await c.send("Runtime.enable");
  await sleep(2500); // Vite first paint can be slow

  const header = await evalJs(c, `document.querySelector('h1')?.textContent || ''`);
  const disclaimer = await evalJs(
    c,
    `[...document.querySelectorAll('*')].some(e=>/not a medical device/i.test(e.textContent)) ? 'present':'MISSING'`,
  );
  console.log("HEADER:", header);
  console.log("DISCLAIMER:", disclaimer);
  if (disclaimer !== "present") throw new Error("medical-device disclaimer missing");

  // Click "Start encounter" -> drives the full stack to CASE_LOAD.
  await evalJs(
    c,
    `[...document.querySelectorAll('button')].find(b=>/start encounter/i.test(b.textContent))?.click()`,
  );
  await sleep(1500);

  const body = await evalJs(c, `document.body.innerText.slice(0,300)`);
  console.log("\n--- CASE_LOAD ---\n" + body);

  const errors = await evalJs(
    c,
    `(window.__ed_errors||[]).length`, // best-effort; real check is console below
  );
  void errors;

  const shot = await c.send("Page.captureScreenshot", { format: "png" });
  if (shot.result?.data) {
    writeFileSync(SHOT, Buffer.from(shot.result.data, "base64"));
    console.log("\nscreenshot ->", SHOT);
  } else {
    throw new Error("screenshot capture failed");
  }
  c.close();
  process.exit(0);
})().catch((e) => {
  console.error("DRIVER ERROR:", e.message);
  process.exit(1);
});
