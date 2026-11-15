import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import ts from "typescript";
import { createBlobObjectStore } from "../server/blob-material-store.mjs";
import { createPersonalRepository } from "../server/personal-repository.mjs";
import { validatePersonalMaterial } from "../server/personal-material.mjs";
import { createMaterialsHandler } from "../server/materials-handler.mjs";
import { createReleaseHandler } from "../server/release-handler.mjs";
import { createDownloadHandler } from "../server/download-handler.mjs";
import { publishMaterial, readPrivateConfig } from "./publish-personal-material.mjs";

const token = "test-only-connection-token-0001";
const env = { FLY_VIEW_SYNC_TOKEN: token, BLOB_STORE_ID: "test-private-store" };
const endpoint = "https://fly-view-personal.vercel.app";
const now = "2026-11-16T00:00:00.000Z";
function fixture(id = "sample-neutral", revision = 1) {
  return { id, title: "示例英语表达", category: "general", kind: "expression", textEn: "Please check the sample.", textZh: "请检查样品。",
    terms: [{ term: "sample", meaningZh: "样品", exampleEn: "Please check the sample." }], summary: "通用学习示例。",
    createdAt: now, updatedAt: now, revision, source: "desktop" };
}
function mockBlob() {
  const records = new Map();
  let sequence = 0;
  const stats = { reads: 0, writes: 0, lists: 0, failSnapshot: false, failAllReads: false };
  const sdk = {
    async get(pathname, options) {
      stats.reads++;
      assert.equal(options.access, "private"); assert.equal(options.useCache, false);
      if (stats.failAllReads) throw new Error(`secret provider message ${token}`);
      const entry = records.get(pathname);
      if (!entry) return null;
      return { statusCode: 200, stream: new Response(entry.body).body,
        blob: { size: Buffer.byteLength(entry.body), etag: entry.etag } };
    },
    async put(pathname, body, options) {
      stats.writes++;
      assert.equal(options.access, "private"); assert.equal(options.addRandomSuffix, false);
      if (stats.failSnapshot && /\/r\d+\.json$/.test(pathname)) { stats.failSnapshot = false; throw new Error("simulated interrupted snapshot write"); }
      const existing = records.get(pathname);
      if (options.allowOverwrite === false && existing) throw new Error("occupied");
      if (options.allowOverwrite === true) {
        assert.ok(options.ifMatch, "Every mutable head update must have a compare-and-swap condition");
        if (existing?.etag !== options.ifMatch) throw new Error("precondition failed");
      }
      const etag = `etag-${++sequence}`;
      records.set(pathname, { body, etag });
      return { etag };
    },
    async list(options) {
      stats.lists++;
      assert.equal(options.prefix, "personal-heads/"); assert.equal(options.limit, 1);
      const names = [...records.keys()].filter((item) => item.startsWith(options.prefix)).sort();
      const start = options.cursor ? Number(options.cursor) : 0;
      const selected = names.slice(start, start + options.limit);
      return { blobs: selected.map((pathname) => ({ pathname })), hasMore: start + selected.length < names.length,
        cursor: String(start + selected.length) };
    }
  };
  return { sdk, records, stats };
}
const mock = mockBlob();
const store = createBlobObjectStore({ sdk: mock.sdk, env });
const repository = createPersonalRepository(store);
const handler = createMaterialsHandler({ env, storeFactory: () => store });
const request = (method, body, suffix = "", authorization = `Bearer ${token}`, origin = "https://localhost") => new Request(`${endpoint}/api/materials${suffix}`, {
  method, headers: { ...(authorization ? { Authorization: authorization } : {}), Origin: origin, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
  ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) })
});

let response = await handler(request("GET", undefined, "", ""));
assert.equal(response.status, 401); assert.equal(mock.stats.reads, 0); assert.equal(mock.stats.lists, 0);
assert.equal((await handler(request("GET", undefined, "", "Bearer wrong-long-token-0000"))).status, 401);
assert.equal((await handler(request("OPTIONS", undefined, "", ""))).status, 204);
assert.equal((await handler(request("GET", undefined, "", `Bearer ${token}`, "https://untrusted.example"))).status, 403);
assert.equal((await handler(request("POST", { material: { ...fixture(), id: "../escape" } }))).status, 400);
assert.equal((await handler(request("POST", { material: { ...fixture(), textEn: 123 } }))).status, 400);
assert.equal((await handler(request("POST", "{invalid"))).status, 400);
assert.equal((await handler(request("POST", { material: fixture(), baseRevision: 1 }))).status, 400);
assert.equal((await handler(new Request(`${endpoint}/api/materials`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/plain" }, body: "{}" }))).status, 415);

const first = fixture();
response = await handler(request("POST", { material: first, baseRevision: 0 }));
assert.equal(response.status, 200);
assert.equal((await response.json()).revision, 1);
assert.ok(mock.records.has("personal/sample-neutral/r1.json"));
assert.ok(mock.records.has("personal/sample-neutral/claims/b0.json"));
response = await handler(request("POST", { material: first, baseRevision: 0 }));
assert.equal(response.status, 200); assert.equal((await response.json()).idempotent, true);
const changedAtSameVersion = { ...first, title: "另一个版本" };
response = await handler(request("POST", { material: changedAtSameVersion, baseRevision: 0 }));
assert.equal(response.status, 409); assert.equal((await response.json()).material.title, first.title);
const seventh = { ...first, revision: 7, updatedAt: "2026-11-16T01:00:00.000Z", title: "离线编辑后版本" };
response = await handler(request("POST", { material: seventh, baseRevision: 1 }));
assert.equal(response.status, 200, "Offline revision jumps must be accepted against the last acknowledged base");
response = await handler(request("POST", { material: { ...first, revision: 8 }, baseRevision: 1 }));
assert.equal(response.status, 409); assert.equal((await response.json()).material.revision, 7);
const tombstone = { ...seventh, revision: 8, deletedAt: "2026-11-16T02:00:00.000Z", updatedAt: "2026-11-16T02:00:00.000Z" };
await repository.put({ material: tombstone, baseRevision: 7 });
response = await handler(request("GET", undefined, "?id=sample-neutral"));
assert.equal((await response.json()).materials[0].deletedAt, tombstone.deletedAt);
response = await handler(request("POST", { material: first, baseRevision: 0 }));
assert.equal(response.status, 200); assert.equal((await response.json()).idempotent, true);
assert.equal((await repository.get(first.id)).revision, 8, "A delayed retry must not roll back a newer head");

const left = fixture("race", 3);
const right = { ...fixture("race", 6), title: "另一设备修改" };
const concurrent = await Promise.all([
  handler(request("POST", { material: left, baseRevision: 0 })),
  handler(request("POST", { material: right, baseRevision: 0 }))
]);
assert.deepEqual(concurrent.map((result) => result.status).sort(), [200, 409], "One base revision must have exactly one different successor");
const cloudRace = await repository.get("race");
assert.ok(cloudRace.revision === 3 || cloudRace.revision === 6);
const claim = JSON.parse(mock.records.get("personal/race/claims/b0.json").body);
assert.deepEqual(claim.material, cloudRace);
const identical = await Promise.all([
  repository.put({ material: fixture("same-request", 4), baseRevision: 0 }),
  repository.put({ material: fixture("same-request", 4), baseRevision: 0 })
]);
assert.equal(identical.length, 2); assert.ok(identical.some((result) => result.idempotent));

mock.stats.failSnapshot = true;
response = await handler(request("POST", { material: fixture("interrupted", 5), baseRevision: 0 }));
assert.equal(response.status, 503);
assert.ok(mock.records.has("personal/interrupted/claims/b0.json"));
assert.equal(mock.records.has("personal/interrupted/r5.json"), false);
response = await handler(request("GET", undefined, "?id=interrupted"));
assert.equal(response.status, 200); assert.equal((await response.json()).materials[0].revision, 5);
assert.ok(mock.records.has("personal/interrupted/r5.json"), "Interrupted snapshot must be repaired from the immutable claim");
response = await handler(request("POST", { material: fixture("interrupted", 5), baseRevision: 0 }));
assert.equal(response.status, 200); assert.equal((await response.json()).idempotent, true);

let cursor; const ids = []; let pages = 0;
do {
  const result = await repository.list({ cursor, limit: 1 });
  ids.push(...result.materials.map((material) => material.id));
  cursor = result.cursor; pages++;
  assert.ok(pages < 20);
} while (cursor);
assert.equal(new Set(ids).size, 4); assert.equal(ids.length, 4);
assert.equal((await handler(request("GET", undefined, "?limit=999"))).status, 400);
mock.stats.failAllReads = true;
response = await handler(request("GET", undefined, "?id=sample-neutral"));
assert.equal(response.status, 503); assert.equal((await response.text()).includes(token), false);
mock.stats.failAllReads = false;

// Keep the duplicated server validator behavior aligned with the client schema.
const source = fs.readFileSync(new URL("../apps/reader/src/lib/personalLibrary.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const client = { exports: {} };
new Function("require", "module", "exports", compiled)(() => ({}), client, client.exports);
assert.deepEqual(validatePersonalMaterial(first), client.exports.validatePersonalMaterial(first));
assert.deepEqual(validatePersonalMaterial(tombstone), client.exports.validatePersonalMaterial(tombstone));

const manifest = { version: "0.9.0", versionCode: 900, notes: ["通用测试更新"], apkUrl: `${endpoint}/api/download`,
  sha256: createHash("sha256").update("test-apk").digest("hex"), size: 8, publishedAt: now };
const releaseHandler = createReleaseHandler({ env, manifest });
assert.equal((await releaseHandler(new Request(`${endpoint}/api/release`))).status, 200, "Public release metadata must not need the pairing token");
assert.equal((await createReleaseHandler({ env, manifest: null })(new Request(`${endpoint}/api/release`))).status, 404);
assert.equal((await createReleaseHandler({ env, manifest: { ...manifest, apkUrl: "https://other.example/app.apk" } })(new Request(`${endpoint}/api/release`))).status, 503);

let downloadReads = 0; let emitted = 0;
const apkSize = 6 * 1024 * 1024;
const downloadHandler = createDownloadHandler({ env, getBlob: async (pathname, options) => {
  downloadReads++; assert.equal(pathname, "releases/fly-view-0.9.0.apk"); assert.equal(options.access, "private");
  return { statusCode: 200, blob: { size: apkSize }, stream: new ReadableStream({ pull(controller) {
    if (emitted >= apkSize) { controller.close(); return; }
    const chunk = new Uint8Array(Math.min(65536, apkSize - emitted)); emitted += chunk.byteLength; controller.enqueue(chunk);
  } }) };
} });
assert.equal((await downloadHandler(new Request(`${endpoint}/api/download`))).status, 401); assert.equal(downloadReads, 0);
response = await downloadHandler(new Request(`${endpoint}/api/download?pathname=private/secret`, { headers: { Authorization: `Bearer ${token}` } }));
assert.equal(response.status, 200); assert.match(response.headers.get("cache-control"), /no-store/);
assert.equal(response.headers.get("content-type"), "application/vnd.android.package-archive");
assert.ok(emitted < apkSize, "APK must remain streamed, not buffered before the response");
let received = 0;
for await (const chunk of response.body) received += chunk.byteLength;
assert.equal(received, apkSize);

const published = await publishMaterial({ endpoint, token }, { material: fixture("desktop-publish"), baseRevision: 0 }, async (url, init) => handler(new Request(url, init)));
assert.equal(published.ok, true); assert.equal(JSON.stringify(published).includes(token), false);
await assert.rejects(readPrivateConfig(new URL("../package.json", import.meta.url)), /项目目录之外/);

console.log("PASS: auth before storage, schema parity, safe paths, revision jumps, atomic competing commits, idempotence, interrupted-commit recovery, tombstones, bounded pagination, sanitized errors, public release metadata, authenticated streamed APK, desktop publication.");
