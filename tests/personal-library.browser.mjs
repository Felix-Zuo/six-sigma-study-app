import * as library from "/library.js";
import * as legacy from "/legacy.js";

const results = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
async function test(name, run) {
  try { await run(); results.push({ name, ok: true }); }
  catch (error) { results.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) }); }
}
const now = "2026-01-01T00:00:00.000Z";
const fixture = (id, changes = {}) => ({ id, title: "Original practice", category: "general", kind: "article",
  textEn: "I check the plan.\n\nWe learn every day.", textZh: "我核对计划。我们每天学习。",
  terms: [{ term: "plan", meaningZh: "计划", exampleEn: "I check the plan." }], summary: "A practice text.",
  createdAt: now, updatedAt: now, revision: 1, source: "desktop", ...changes });
const emptyBackup = (changes = {}) => ({ format: "fly-view-learning-backup", schemaVersion: 1, exportedAt: now,
  materials: [], memories: [], messages: [], legacyStorage: {}, ...changes });
let latest;

await test("native IndexedDB commits survive a fresh connection", async () => {
  latest = await library.savePersonalMaterial(fixture("main"));
  assert(latest.revision === 1, "new revision must be 1");
  const db = await new Promise((resolve, reject) => { const request = indexedDB.open(library.personalLibraryDatabaseName); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  const stored = await new Promise((resolve, reject) => { const request = db.transaction("materials").objectStore("materials").get("main"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  db.close();
  assert(stored.material.title === latest.title, "write did not commit");
});
await test("concurrent stale edits cannot overwrite each other", async () => {
  const edits = await Promise.allSettled([
    library.savePersonalMaterial({ ...latest, title: "Edit A" }),
    library.savePersonalMaterial({ ...latest, title: "Edit B" })
  ]);
  assert(edits.filter((item) => item.status === "fulfilled").length === 1, "one edit should win");
  assert(edits.filter((item) => item.status === "rejected" && item.reason.name === "PersonalLibraryConflictError").length === 1, "stale edit must report conflict");
  latest = (await library.listPersonalMaterials()).find((item) => item.id === "main");
  assert(latest.revision === 2, "committed revision must increment once");
});
await test("remote changes preserve local edits and report a durable conflict", async () => {
  const result = await library.applyRemoteMaterials([{ ...latest, title: "Remote edit", revision: 3 }]);
  assert(result.conflicts.length === 1 && result.applied.length === 0, "remote conflict missing");
  assert((await library.listPersonalMaterials())[0].title === latest.title, "local edit was overwritten");
  assert((await library.listMaterialConflicts()).length === 1, "conflict not durable");
});
await test("stale upload acknowledgements cannot mark newer edits synced", async () => {
  await library.acknowledgeMaterialsSynced([{ id: "main", revision: 1 }]);
  assert((await library.listPendingMaterials()).some((item) => item.id === "main"), "newer edit lost dirty flag");
  await library.acknowledgeMaterialsSynced([{ id: "main", revision: latest.revision }]);
  assert(!(await library.listPendingMaterials()).some((item) => item.id === "main"), "matching ack not applied");
});
await test("clean remote updates apply, stale versions do not roll them back", async () => {
  const remote = { ...latest, title: "Remote edit", revision: 3 };
  assert((await library.applyRemoteMaterials([remote])).applied.length === 1, "clean update missing");
  assert((await library.applyRemoteMaterials([latest])).unchanged.length === 1, "stale remote should be ignored");
  assert((await library.listPersonalMaterials())[0].revision === 3, "revision regressed");
  assert((await library.applyRemoteMaterials([{ ...remote, title: "Conflicting same revision" }])).conflicts.length === 1, "same revision conflict missing");
});
await test("invalid remote batches cannot partially commit", async () => {
  let failed = false;
  try { await library.applyRemoteMaterials([fixture("must-not-exist"), fixture("invalid", { revision: -1 })]); }
  catch { failed = true; }
  assert(failed && !(await library.listPersonalMaterials()).some((item) => item.id === "must-not-exist"), "partial invalid batch was applied");
});
await test("local deletions leave tombstones and resist remote resurrection", async () => {
  const material = await library.savePersonalMaterial(fixture("delete-me"));
  await library.deletePersonalMaterial(material.id, material.revision);
  assert(!(await library.listPersonalMaterials()).some((item) => item.id === material.id), "deleted item visible");
  assert((await library.listPersonalMaterials({ includeDeleted: true })).some((item) => item.id === material.id && item.deletedAt), "tombstone missing");
  assert((await library.applyRemoteMaterials([{ ...material, revision: 5 }])).conflicts.length === 1, "deleted edit overwritten");
});
await test("memories persist toggles and chat appends are idempotent", async () => {
  await library.saveLearningMemory({ id: "memory", text: "Use short examples.", source: "user", enabled: true, createdAt: now });
  await library.saveLearningMemory({ ...(await library.listLearningMemories())[0], enabled: false });
  assert(!(await library.listLearningMemories())[0].enabled, "toggle missing");
  const message = { id: "chat-1", role: "user", content: "Explain this example.", createdAt: now };
  await library.appendChatMessage(message); await library.appendChatMessage(message);
  let failed = false;
  try { await library.appendChatMessage({ ...message, content: "different" }); } catch { failed = true; }
  assert(failed && (await library.listChatMessages()).length === 1, "message identity is unsafe");
  assert((await library.listChatMessages(0)).length === 0, "zero limit not respected");
});
await test("book conversion preserves whole-text translation and stable anchors", async () => {
  const source = fixture("reading");
  const first = library.materialToManual(source);
  const second = library.materialToManual({ ...source, revision: 2 });
  const content = first.chapters[0].sections[0].content;
  assert(content.en.length === 1 && content.zh.length === 1, "whole translation duplicated onto separate paragraphs");
  assert(content.zh[0].text === source.textZh && content.en[0].text === source.textEn, "source changed");
  assert(first.chapters[0].sections[0].id === second.chapters[0].sections[0].id, "version changed anchor");
  assert(first.version !== second.version, "version did not change");
  assert(first.dictionary[0].lookupKeys.includes("plan"), "lookup index missing");
  assert(library.materialToBookManifest(source).contentPath === "personal:reading", "reader routing contract changed");
  assert(library.materialToManual({ ...source, textZh: "" }).chapters[0].sections[0].content.zh.length === 0, "invented missing translation");
});
await test("backup excludes key/token credentials, retains learning data and token counts", async () => {
  localStorage.setItem("six-sigma-study:deepseek-key", "fake-key-do-not-export");
  localStorage.setItem("six-sigma-study:auth-token", "fake-token-do-not-export");
  localStorage.setItem("unrelated:key", "unrelated");
  localStorage.setItem("six-sigma-study:notes:v1", JSON.stringify([{ id: "note", text: "A learning note.", deepSeekApiKey: "fake-nested-key", usage: { promptTokens: 12 } }]));
  const backup = await library.exportLearningBackup();
  const json = JSON.stringify(backup);
  assert(!json.includes("fake-key") && !json.includes("fake-token") && !json.includes("fake-nested-key") && !json.includes("unrelated"), "credential leaked");
  assert(json.includes("A learning note.") && json.includes("promptTokens"), "learning data lost");
  assert(backup.materials.some((item) => item.deletedAt), "backup lost tombstones");
  assert(backup.memories.length === 1 && backup.messages.length === 1, "personal data missing");
});
await test("restore merges new records and reports conflicts without overwriting", async () => {
  const result = await library.restoreLearningBackup(emptyBackup({
    materials: [fixture("main", { title: "Should not replace local" }), fixture("restored")],
    memories: [{ id: "memory", text: "Should not replace local memory", source: "user", enabled: true, createdAt: now }],
    messages: [{ id: "restored-chat", role: "assistant", content: "A saved explanation.", createdAt: now }],
    legacyStorage: { "six-sigma-study:notes:v1": "[]", "six-sigma-study:reader-position:v1": "{}", "six-sigma-study:api-key": "excluded" }
  }));
  assert(result.materials === 1 && result.messages === 1 && result.conflicts.length === 3, "merge counts/conflicts incorrect");
  assert(!(await library.listLearningMemories())[0].enabled, "existing memory overwritten");
  assert(!localStorage.getItem("six-sigma-study:api-key"), "restore imported credential");
});
await test("legacy storage failure compensates earlier writes and never touches IndexedDB", async () => {
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) { if (key === "six-sigma-study:failure-second") throw new DOMException("Test quota", "QuotaExceededError"); return original.call(this, key, value); };
  let failed = false;
  try { await library.restoreLearningBackup(emptyBackup({ materials: [fixture("quota-not-saved")], legacyStorage: { "six-sigma-study:failure-first": "{}", "six-sigma-study:failure-second": "{}" } })); }
  catch (error) { failed = error.name === "PersonalLibraryError"; }
  finally { Storage.prototype.setItem = original; }
  assert(failed && localStorage.getItem("six-sigma-study:failure-first") === null, "legacy rollback failed");
  assert(!(await library.listPersonalMaterials()).some((item) => item.id === "quota-not-saved"), "database changed despite quota failure");
});
await test("database abort rolls back all records and compensates legacy inserts", async () => {
  const original = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function (...args) { const request = original.apply(this, args); if (args[0]?.id === "abort-db") this.transaction.abort(); return request; };
  let failed = false;
  try { await library.restoreLearningBackup(emptyBackup({ materials: [fixture("abort-first"), fixture("abort-db")], legacyStorage: { "six-sigma-study:abort-legacy": "{}" } })); }
  catch (error) { failed = error.name === "PersonalLibraryError"; }
  finally { IDBObjectStore.prototype.add = original; }
  assert(failed, "abort was not reported");
  assert(!(await library.listPersonalMaterials()).some((item) => item.id.startsWith("abort-")), "partial database transaction committed");
  assert(localStorage.getItem("six-sigma-study:abort-legacy") === null, "legacy compensation failed");
});

await test("offline revision jumps retain the last acknowledged server base", async () => {
  await library.applyRemoteMaterials([fixture("offline-edits", { revision: 4 })]);
  const first = await library.savePersonalMaterial(fixture("offline-edits", { revision: 4, title: "First offline edit" }));
  await library.savePersonalMaterial({ ...first, title: "Second offline edit" });
  const pending = (await library.listPendingMaterials()).find((item) => item.id === "offline-edits");
  assert(pending.revision === 6 && pending.baseRevision === 4, "offline edit lost server base revision");
  await library.acknowledgeMaterialsSynced([{ id: pending.id, revision: 6 }]);
  const third = await library.savePersonalMaterial({ ...pending, title: "Third edit" });
  const next = (await library.listPendingMaterials()).find((item) => item.id === pending.id);
  assert(third.revision === 7 && next.baseRevision === 6, "acknowledged base was not advanced");
});

await test("upload acknowledgements advance the base while preserving edits made in flight", async () => {
  await library.applyRemoteMaterials([fixture("in-flight", { revision: 1 })]);
  const uploading = await library.savePersonalMaterial(fixture("in-flight", { revision: 1, title: "Version being uploaded" }));
  const edited = await library.savePersonalMaterial({ ...uploading, title: "New edit during upload" });
  await library.acknowledgeMaterialsSynced([{ id: uploading.id, revision: uploading.revision }]);
  const next = (await library.listPendingMaterials()).find((item) => item.id === uploading.id);
  assert(next.revision === 3 && next.baseRevision === 2 && next.title === edited.title, "ack lost pending edit or failed to advance server base");
  await library.acknowledgeMaterialsSynced([{ id: uploading.id, revision: 1 }]);
  assert((await library.listPendingMaterials()).find((item) => item.id === uploading.id).baseRevision === 2, "stale acknowledgement regressed base");
});

await test("new memories respect AI length limits without discarding legacy backup text", async () => {
  let rejected = false;
  try { await library.saveLearningMemory({ id: "too-long", text: "a".repeat(601), source: "user", enabled: true, createdAt: now }); }
  catch { rejected = true; }
  assert(rejected, "oversized new memory accepted");
  await library.restoreLearningBackup(emptyBackup({ memories: [{ id: "legacy-long-memory", text: "a".repeat(700), source: "user", enabled: true, createdAt: now }] }));
  const legacyMemory = (await library.listLearningMemories()).find((item) => item.id === "legacy-long-memory");
  await library.saveLearningMemory({ ...legacyMemory, enabled: false });
  const disabled = (await library.listLearningMemories()).find((item) => item.id === "legacy-long-memory");
  assert(disabled.text.length === 700 && !disabled.enabled, "legacy memory was lost or could not be disabled");
});

await test("keep both resolves conflicts atomically and preserves the newest local edit", async () => {
  const local = await library.savePersonalMaterial(fixture("keep-both", { title: "Local original" }));
  const remote = fixture("keep-both", { title: "Cloud version", revision: 3 });
  await library.applyRemoteMaterials([remote]);
  await library.savePersonalMaterial({ ...local, title: "Edited after conflict appeared" });
  const resolved = await library.resolveMaterialConflictKeepBoth(local.id);
  assert(resolved.localCopy.title === "Edited after conflict appeared（本机副本）", "newer local edit was lost");
  assert(resolved.localCopy.id !== local.id && resolved.localCopy.revision === 1, "copy identity is not independent");
  const materials = await library.listPersonalMaterials();
  assert(materials.find((item) => item.id === local.id).title === remote.title, "original did not adopt cloud record");
  const pending = await library.listPendingMaterials();
  assert(pending.some((item) => item.id === resolved.localCopy.id && item.baseRevision === 0), "local copy is not pending upload");
  assert(!pending.some((item) => item.id === local.id), "cloud original remained dirty");
  assert(!(await library.listMaterialConflicts()).some((item) => item.id === local.id), "resolved conflict not removed");
  let rejected = false; try { await library.resolveMaterialConflictKeepBoth(local.id); } catch { rejected = true; }
  assert(rejected, "repeated resolution created another copy");
});

await test("keep both transaction abort cannot leave partial copies or erase conflicts", async () => {
  const local = await library.savePersonalMaterial(fixture("keep-both-abort"));
  await library.applyRemoteMaterials([{ ...local, title: "Remote version", revision: 2 }]);
  const originalPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) { const request = originalPut.apply(this, args); if (args[0]?.id === "keep-both-abort") this.transaction.abort(); return request; };
  const before = (await library.listPersonalMaterials()).length;
  let rejected = false;
  try { await library.resolveMaterialConflictKeepBoth(local.id); } catch { rejected = true; }
  finally { IDBObjectStore.prototype.put = originalPut; }
  assert(rejected && (await library.listPersonalMaterials()).length === before, "failed resolution left a partial copy");
  assert((await library.listMaterialConflicts()).some((item) => item.id === local.id), "failed resolution erased conflict");
});

await test("all legacy persistence failures return false and emit a usable UI event", async () => {
  const events = [];
  const listener = (event) => events.push(event.detail);
  window.addEventListener(legacy.storageErrorEvent, listener);
  const originalSet = Storage.prototype.setItem;
  const originalRemove = Storage.prototype.removeItem;
  const writes = [
    () => legacy.persistSavedNotes([]), () => legacy.persistSavedFavorites([]),
    () => legacy.persistChapterProgress({}), () => legacy.persistDailyStats(legacy.normalizeDailyStats(undefined)),
    () => legacy.persistSavedTerms([]), () => legacy.persistReaderPosition({ bookId: "test-book", page: 2 }),
    () => legacy.persistContextCorrectionBundle({ schemaVersion: "1.0.0", format: "six-sigma-context-corrections", bookId: "test-book", contentVersion: "1", exportedAt: now, corrections: [] }),
    () => legacy.persistUserQuestionBank(null), () => legacy.persistQuestionProgress({}), () => legacy.persistExamResults([]),
    () => legacy.persistAiStudyCache({ id: "test-ai", kind: "reading", model: "test", generatedAt: now, result: {}, usage: { promptTokens: 1, completionTokens: 1 } }),
    () => legacy.clearAiStudyCache(), () => legacy.clearContextCorrectionBundle("test-book")
  ];
  const before = new Map(Array.from({ length: localStorage.length }, (_, index) => { const key = localStorage.key(index); return [key, localStorage.getItem(key)]; }));
  Storage.prototype.setItem = () => { throw new DOMException("private details must not leak", "QuotaExceededError"); };
  Storage.prototype.removeItem = () => { throw new DOMException("private details must not leak", "SecurityError"); };
  try { for (const write of writes) assert(write() === false, "failed write reported success"); }
  finally { Storage.prototype.setItem = originalSet; Storage.prototype.removeItem = originalRemove; window.removeEventListener(legacy.storageErrorEvent, listener); }
  assert(events.length === writes.length && events.every((item) => typeof item.message === "string" && item.message.length > 5 && !item.message.includes("private details")), "storage error notification missing or leaked exception");
  assert([...before].every(([key, value]) => localStorage.getItem(key) === value), "failed writes changed existing records");
  assert(legacy.persistSavedNotes([{ id: "persisted-note", text: "Study note", note: "Keep me", savedAt: now, updatedAt: now }]) === true, "successful write did not report success");
  assert(legacy.loadSavedNotes()[0].note === "Keep me", "legacy read normalization regressed");
});

await test("full backup restores on an empty device without credentials or lost records", async () => {
  const backup = await library.exportLearningBackup();
  const db = await new Promise((resolve, reject) => { const request = indexedDB.open(library.personalLibraryDatabaseName); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  await new Promise((resolve, reject) => {
    const tx = db.transaction(["materials", "memories", "messages", "conflicts"], "readwrite");
    for (const name of ["materials", "memories", "messages", "conflicts"]) tx.objectStore(name).clear();
    tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
  });
  db.close(); localStorage.clear();
  const restored = await library.restoreLearningBackup(JSON.stringify(backup));
  assert(restored.conflicts.length === 0, "empty-device restore reported conflicts");
  const again = await library.exportLearningBackup();
  for (const name of ["materials", "memories", "messages", "legacyStorage", "conflicts"]) assert(JSON.stringify(again[name]) === JSON.stringify(backup[name]), `round-trip changed ${name}`);
});

await fetch("/result", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: results.every((item) => item.ok), tests: results }) });
