import * as library from "/library.js";
import * as sync from "/sync.js";

const nativeFetch = window.fetch;
const results = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
async function test(name, run) { try { await run(); results.push({ name, ok: true }); } catch (error) { results.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) }); } }
const now = "2026-01-01T00:00:00.000Z";
const fakeToken = "test-only-not-a-real-credential";
const connection = { endpoint: sync.SERVICE_URL, token: fakeToken };
const encode = (value) => btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const code = `flyview://connect#${encode(connection)}`;
const fixture = (id, changes = {}) => ({ id, title: "Original practice", category: "general", kind: "article", textEn: "We check the plan.", textZh: "我们核对计划。", terms: [], summary: "", createdAt: now, updatedAt: now, revision: 1, source: "desktop", ...changes });
const cloud = new Map([["remote-a", fixture("remote-a")], ["remote-b", fixture("remote-b")]]);
let calls = [];
let behavior = "normal";
let waitResolve;
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
window.fetch = async (input, options = {}) => {
  const url = new URL(input);
  assert(url.origin === sync.SERVICE_URL && url.pathname === "/api/materials", "request escaped trusted origin");
  assert(options.credentials === "omit" && options.redirect === "error", "request safety options missing");
  assert(options.headers.Authorization === `Bearer ${fakeToken}`, "authorization missing");
  calls.push({ method: options.method, query: url.search, body: options.body ? JSON.parse(options.body) : undefined });
  if (behavior === "auth") return json({}, 401);
  if (behavior === "wait") await new Promise((resolve, reject) => { waitResolve = resolve; options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }); });
  if (behavior === "timeout") return new Promise((_, reject) => { options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }); });
  if (options.method === "POST") {
    const payload = JSON.parse(options.body);
    assert(!("baseRevision" in payload.material), "sync metadata leaked into material payload");
    const existing = cloud.get(payload.material.id);
    if ((existing?.revision ?? 0) !== payload.baseRevision) return json({ material: existing }, 409);
    assert(payload.material.revision > payload.baseRevision, "revision did not advance");
    const material = behavior === "enrich" && payload.material.id === "card-sync"
      ? { ...payload.material, terms: payload.material.terms.map((term) => ({ ...term, sourceSentence: payload.material.textEn, contextMeaning: "这里指需要核对的计划", usageTip: "check 后接名词", exampleZh: "我们核对计划。" })) }
      : payload.material;
    cloud.set(material.id, material);
    return json({ material, revision: material.revision, idempotent: false });
  }
  if (behavior === "loop") return json({ materials: [], hasMore: true, cursor: "same" });
  const entries = [...cloud.values()].sort((a, b) => a.id.localeCompare(b.id));
  const offset = Number(url.searchParams.get("cursor") || 0);
  const items = entries.slice(offset, offset + 1);
  const more = offset + 1 < entries.length;
  return json({ materials: items, hasMore: more, ...(more ? { cursor: String(offset + 1) } : {}) });
};

await test("pairing links are parsed without saving credentials or making requests", async () => {
  assert(sync.parsePairingCode(code).endpoint === sync.SERVICE_URL, "link parsing failed");
  assert(sync.parsePairingCode(encode(connection)).token === fakeToken, "plain code parsing failed");
  for (const endpoint of ["https://example.com", `${sync.SERVICE_URL}/extra`, `${sync.SERVICE_URL}?redirect=elsewhere`, `https://user@fly-view-personal.vercel.app`]) {
    let failed = false; try { sync.parsePairingCode(encode({ ...connection, endpoint })); } catch (error) { failed = error.code === "invalid-pairing"; }
    assert(failed, "untrusted pairing endpoint accepted");
  }
  assert(sessionStorage.length === 0 && calls.length === 0, "parsing performed a connection action");
});
await test("unconnected sync has a distinct error and does not pretend success", async () => {
  let failed = false; try { await sync.syncPersonalLibrary(); } catch (error) { failed = error.code === "not-connected"; }
  assert(failed && sync.getPersonalSyncStatus().phase === "not-connected" && calls.length === 0, "unconnected state is ambiguous");
});
await test("connect verifies first, uploads conditional revisions and downloads all pages", async () => {
  const first = await library.savePersonalMaterial(fixture("local"));
  await library.savePersonalMaterial({ ...first, title: "Offline second revision" });
  const result = await sync.connectPersonalLibrary(code);
  assert(calls[0].method === "GET", "credentials were not verified before upload");
  const upload = calls.find((item) => item.method === "POST");
  assert(upload.body.baseRevision === 0 && upload.body.material.revision === 2, "offline jump was not uploaded with its base");
  assert(result.uploaded === 1 && result.downloaded === 2 && result.conflicts.length === 0, "sync counts differ");
  assert((await library.listPersonalMaterials()).length === 3, "paginated materials are missing");
  assert((await library.listPendingMaterials()).length === 0, "upload was not acknowledged");
  assert(!JSON.stringify(await library.exportLearningBackup()).includes(fakeToken), "backup contains connection credentials");
});
await test("concurrent callers share one active sync", async () => {
  behavior = "wait"; calls = [];
  const first = sync.syncPersonalLibrary();
  const second = sync.syncPersonalLibrary();
  assert(first === second, "concurrent sync was not deduplicated");
  for (let i = 0; i < 30 && !waitResolve; i++) await new Promise((resolve) => setTimeout(resolve, 1));
  assert(calls.length === 1, "multiple initial network requests");
  behavior = "normal"; waitResolve(); waitResolve = undefined;
  await first;
});
await test("HTTP conflict retains local edits and preserves the remote version", async () => {
  const local = (await library.listPersonalMaterials()).find((item) => item.id === "local");
  await library.savePersonalMaterial({ ...local, title: "New unsynced local title" });
  cloud.set("local", { ...cloud.get("local"), revision: 3, title: "Remote title" });
  const result = await sync.syncPersonalLibrary();
  assert(result.conflicts.some((item) => item.id === "local" && item.remote.title === "Remote title"), "HTTP conflict not surfaced");
  assert((await library.listPersonalMaterials()).find((item) => item.id === "local").title === "New unsynced local title", "local edit overwritten");
  assert((await library.listPendingMaterials()).some((item) => item.id === "local"), "conflict incorrectly acknowledged");
});
await test("authorization failures preserve connection and unsynced data", async () => {
  behavior = "auth";
  let failed = false; try { await sync.syncPersonalLibrary(); } catch (error) { failed = error.code === "auth"; }
  behavior = "normal";
  assert(failed && sync.getPersonalSyncStatus().phase === "error", "authentication failure not surfaced");
  assert((await library.listPendingMaterials()).some((item) => item.id === "local"), "failed request cleared local edits");
});
await test("request timeout aborts network and reports a retryable failure", async () => {
  const originalTimeout = window.setTimeout;
  window.setTimeout = (callback, delay, ...args) => originalTimeout(callback, delay === 20000 ? 5 : delay, ...args);
  behavior = "timeout";
  let failed = false;
  try { await sync.syncPersonalLibrary(); } catch (error) { failed = error.code === "timeout"; }
  finally { window.setTimeout = originalTimeout; behavior = "normal"; }
  assert(failed, "request timeout was not distinguished");
});
await test("repeated pagination cursors stop safely instead of looping", async () => {
  // Acknowledging the conflict here isolates pagination from the upload phase.
  const pending = await library.listPendingMaterials();
  await library.acknowledgeMaterialsSynced(pending.map(({ id, revision }) => ({ id, revision })));
  behavior = "loop";
  let failed = false; try { await sync.syncPersonalLibrary(); } catch (error) { failed = error.code === "invalid-response"; }
  behavior = "normal";
  assert(failed, "pagination loop not detected");
});
await test("disconnect aborts in-flight work and prevents late cloud data application", async () => {
  behavior = "wait"; calls = [];
  const running = sync.syncPersonalLibrary();
  const observed = running.catch((error) => error);
  for (let i = 0; i < 30 && !waitResolve; i++) await new Promise((resolve) => setTimeout(resolve, 1));
  await sync.disconnectPersonalLibrary();
  const error = await observed;
  behavior = "normal"; waitResolve = undefined;
  assert(error.code === "cancelled" && sync.getPersonalSyncStatus().phase === "not-connected", "disconnect failed to cancel sync");
  assert((await library.listPersonalMaterials()).length === 3, "disconnect deleted local materials");
  assert(!sessionStorage.getItem("fly-view:online-connection:v1"), "connection credentials remain");
});

await test("local saves auto-sync and unresolved conflicts do not create request loops", async () => {
  await sync.connectPersonalLibrary(code);
  const originalTimeout = window.setTimeout;
  const pause = (ms) => new Promise((resolve) => originalTimeout(resolve, ms));
  window.setTimeout = (callback, delay, ...args) => originalTimeout(callback, delay === 1200 ? 10 : delay, ...args);
  const stop = sync.startPersonalLibraryAutoSync();
  try {
    await pause(30);
    await library.savePersonalMaterial(fixture("auto-save"));
    for (let i = 0; i < 100 && !cloud.has("auto-save"); i++) await pause(5);
    assert(cloud.has("auto-save"), "new local material was not automatically uploaded");
    await pause(40);
    const local = (await library.listPersonalMaterials()).find((item) => item.id === "remote-a");
    cloud.set(local.id, { ...cloud.get(local.id), revision: local.revision + 1, title: "Another cloud edit" });
    await library.savePersonalMaterial({ ...local, title: "Conflicting offline local edit" });
    for (let i = 0; i < 100 && !(await library.listMaterialConflicts()).some((item) => item.id === local.id); i++) await pause(5);
    await pause(60);
    const settledCalls = calls.length;
    await pause(80);
    assert(calls.length === settledCalls, "persistent conflict caused repeated automatic sync");
    assert((await library.listPendingMaterials()).some((item) => item.id === local.id), "conflict discarded unsynced local edit");
  } finally { stop(); window.setTimeout = originalTimeout; }
});

await test("server-preserved card fields enrich the upload acknowledgement without a false conflict", async () => {
  const original = await library.savePersonalMaterial(fixture("card-sync", { terms: [{ term: "plan", meaningZh: "计划", exampleEn: "We check the plan." }] }));
  behavior = "enrich";
  let result;
  try { result = await sync.syncPersonalLibrary(); } finally { behavior = "normal"; }
  const stored = (await library.listPersonalMaterials()).find((item) => item.id === original.id);
  assert(stored.terms[0].contextMeaning === "这里指需要核对的计划", "acknowledgement omitted enriched fields");
  assert(!(await library.listPendingMaterials()).some((item) => item.id === original.id), "enriched upload remains dirty");
  assert(!result.conflicts.some((item) => item.id === original.id), "metadata-only acknowledgement created a conflict");
});

window.fetch = nativeFetch;
await nativeFetch("/result", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: results.every((item) => item.ok), tests: results }) });
