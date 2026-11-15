import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

// Exercise the shipped parser with a native-plugin stub; no network or credentials.
const source = readFileSync(new URL("../apps/reader/src/lib/appUpdates.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
const session = new Map();
let platform = "web";
let backupSaved = true;
const nativeBackupCalls = [];
const require = createRequire(import.meta.url);
const context = {
  exports: module.exports, module, URL, AbortSignal, TextEncoder,
  require(name) {
    if (name === "@capacitor/core") return { Capacitor: { getPlatform: () => platform, isNativePlatform: () => platform !== "web" }, registerPlugin: () => ({ exportBackup: async options => { nativeBackupCalls.push(options); return { saved: backupSaved }; } }) };
    return require(name);
  },
  window: { sessionStorage: { getItem: key => session.get(key) ?? null, setItem: (key, value) => session.set(key, value), removeItem: key => session.delete(key) } }
};
vm.runInNewContext(compiled, context);
const api = module.exports;
const endpoint = "https://fly-view-personal.vercel.app";
const valid = { version: "0.9.1-beta", versionCode: 901, notes: ["学习功能更新"], apkUrl: `${endpoint}/downloads/fly-view.apk`, sha256: "a".repeat(64), size: 123456, publishedAt: "2026-11-16T10:00:00Z" };
const requests = [];
context.fetch = async (url, options) => {
  requests.push({ url, options });
  return { ok: true, headers: { get: () => "application/json" }, text: async () => JSON.stringify({ ...valid, apkUrl: new URL("/api/download", url).href }) };
};
assert.equal(api.releaseEndpoint(`${endpoint}/`), `${endpoint}/api/release`);
assert.equal(api.releaseEndpoint(`${endpoint}/service/`), `${endpoint}/service/api/release`);
assert.equal(api.validateReleaseManifest(valid, endpoint).versionCode, 901);
for (const url of ["http://evil.example", "https://user:pass@evil.example", `${endpoint}/?token=secret`, `${endpoint}/#secret`]) assert.throws(() => api.releaseEndpoint(url));
for (const apkUrl of ["http://fly-view-personal.vercel.app/a.apk", "https://evil.example/a.apk", "https://fly-view-personal.vercel.app.evil.example/a.apk", "https://user@fly-view-personal.vercel.app/a.apk", `${endpoint}/a.apk#fragment`, `${endpoint}/a.apk?token=private`]) assert.throws(() => api.validateReleaseManifest({ ...valid, apkUrl }, endpoint));
for (const changed of [{ sha256: "invalid" }, { size: 0 }, { size: api.MAX_UPDATE_BYTES + 1 }, { versionCode: 1.5 }, { notes: [42] }, { publishedAt: "yesterday" }, { apkUrl: undefined }]) assert.throws(() => api.validateReleaseManifest({ ...valid, ...changed }, endpoint));
const connection = { endpoint, token: "test-only-not-a-real-credential" };
await api.saveSavedConnection(connection);
assert.equal((await api.getSavedConnection()).endpoint, endpoint);
assert.equal(session.size, 1);
await api.checkAppRelease(endpoint);
assert.equal(requests.at(-1).options.headers.Authorization, `Bearer ${connection.token}`);
await api.checkAppRelease("https://another-service.example");
assert.equal(requests.at(-1).options.headers.Authorization, undefined);
await api.clearSavedConnection();
assert.equal(await api.getSavedConnection(), null);
await api.checkAppRelease(endpoint);
assert.equal(requests.at(-1).options.headers.Authorization, undefined);
await assert.rejects(api.saveSavedConnection({ ...connection, endpoint: "http://example.com" }));
await assert.rejects(api.saveSavedConnection({ ...connection, token: "has spaces in a token" }));
await assert.rejects(api.exportNativeLearningBackup({ json: "{}", fileName: "backup.json" }));
platform = "android";
assert.equal((await api.exportNativeLearningBackup({ json: '{"note":"学习"}', fileName: "学习备份.json" })).saved, true);
backupSaved = false;
assert.equal((await api.exportNativeLearningBackup({ json: "{}", fileName: "backup.json" })).saved, false);
assert.equal(nativeBackupCalls.length, 2);
await assert.rejects(api.exportNativeLearningBackup({ json: "{}", fileName: "../backup.json" }));
await assert.rejects(api.exportNativeLearningBackup({ json: "中".repeat(Math.floor(20 * 1024 * 1024 / 3) + 1), fileName: "backup.json" }));
assert.equal(nativeBackupCalls.length, 2);
console.log("PASS: update manifest gates; bearer endpoint isolation; connection session; native backup success/cancel, filename and UTF-8 size limits");
