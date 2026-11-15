// Real-browser tests: no IndexedDB mocks and no changes to the user's browser profile.
// Run: node tests/personal-library.test.mjs (CHROME_PATH may override the browser path).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import ts from "typescript";
import { build } from "esbuild";

const candidates = [process.env.CHROME_PATH, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].filter(Boolean);
const browserPath = candidates.find((candidate) => fs.existsSync(candidate));
if (!browserPath) throw new Error("Set CHROME_PATH to a Chromium browser executable to run native IndexedDB tests.");
const source = fs.readFileSync("apps/reader/src/lib/personalLibrary.ts", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const syncSuite = process.argv[2] === "sync";
const syncBundle = syncSuite ? await build({ entryPoints: ["apps/reader/src/lib/personalSync.ts"], bundle: true, write: false, platform: "browser", format: "esm", target: "es2022" }) : null;
const legacyModules = ["storageHealth", "noteStore", "favoriteStore", "chapterProgressStore", "streakStore", "vocabStore", "readerPositionStore", "contextCorrectionStore", "questionBank", "aiStudyCache"];
const legacyBundle = await build({ stdin: { contents: legacyModules.map((name) => `export * from "./apps/reader/src/lib/${name}.ts";`).join("\n"), resolveDir: process.cwd() }, bundle: true, write: false, platform: "browser", format: "esm", target: "es2022" });
const browserTests = fs.readFileSync(new URL(syncSuite ? "./personal-sync.browser.mjs" : "./personal-library.browser.mjs", import.meta.url), "utf8");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "fly-view-storage-test-"));
let finish;
const result = new Promise((resolve) => { finish = resolve; });
const server = http.createServer((request, response) => {
  if (request.url === "/result" && request.method === "POST") {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => { try { finish(JSON.parse(Buffer.concat(chunks).toString())); response.end("ok"); } catch { response.writeHead(400).end(); } });
  } else if (request.url === "/library.js") { response.setHeader("Content-Type", "text/javascript"); response.end(compiled); }
  else if (request.url === "/legacy.js") { response.setHeader("Content-Type", "text/javascript"); response.end(legacyBundle.outputFiles[0].text); }
  else if (request.url === "/sync.js" && syncBundle) { response.setHeader("Content-Type", "text/javascript"); response.end(syncBundle.outputFiles[0].text); }
  else if (request.url === "/tests.js") { response.setHeader("Content-Type", "text/javascript"); response.end(browserTests); }
  else { response.setHeader("Content-Type", "text/html"); response.end('<!doctype html><title>Isolated storage tests</title><script type="module" src="/tests.js"></script>'); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const child = spawn(browserPath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  "--disable-background-networking", `--user-data-dir=${profile}`, `http://127.0.0.1:${address.port}/`], { windowsHide: true, stdio: "ignore" });
child.on("error", (error) => finish({ ok: false, error: error.message }));
const timer = setTimeout(() => finish({ ok: false, error: "Native IndexedDB tests timed out after 45 seconds." }), 45_000);
const report = await result;
clearTimeout(timer);
child.kill();
server.closeAllConnections();
await new Promise((resolve) => server.close(resolve));
// The isolated profile is retained only if a browser process still owns a file.
const resolvedProfile = path.resolve(profile);
if (path.dirname(resolvedProfile) !== path.resolve(os.tmpdir()) || !path.basename(resolvedProfile).startsWith("fly-view-storage-test-")) {
  throw new Error("Refusing to clean a profile outside the dedicated temporary directory.");
}
try { fs.rmSync(resolvedProfile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* OS temp cleanup will remove an in-use profile. */ }
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.ok ? 0 : 1;
