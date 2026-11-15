/** Private learning data stays on this device unless the user exports or syncs it. */
export type PersonalMaterial = {
  id: string;
  title: string;
  category: "interview" | "ielts" | "work" | "general";
  kind: "article" | "expression" | "memo";
  textEn: string;
  textZh: string;
  terms: Array<{ term: string; meaningZh: string; exampleEn?: string }>;
  summary: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  source: "chat" | "desktop";
  deletedAt?: string;
};

export type LearningMemory = {
  id: string;
  text: string;
  createdAt: string;
  source: "user" | "assistant";
  enabled: boolean;
};
export type PersonalChatMessage = { id: string; role: "user" | "assistant"; content: string; createdAt: string };
export type ChatMessage = PersonalChatMessage;
/** Revision can advance several times offline; baseRevision is the server compare-and-set value. */
export type PendingMaterial = PersonalMaterial & { baseRevision: number };
export type MaterialConflict = { id: string; local: PersonalMaterial; remote: PersonalMaterial; reason: "local-changes" | "same-revision" };
export type RemoteApplyResult = { applied: string[]; unchanged: string[]; conflicts: MaterialConflict[] };
export type LearningBackup = {
  format: "fly-view-learning-backup";
  schemaVersion: 1;
  exportedAt: string;
  materials: PersonalMaterial[];
  memories: LearningMemory[];
  messages: PersonalChatMessage[];
  legacyStorage: Record<string, string>;
  conflicts?: MaterialConflict[];
};
export type RestoreResult = {
  materials: number;
  memories: number;
  messages: number;
  legacyKeys: number;
  conflicts: string[];
};

type StoredMaterial = { id: string; material: PersonalMaterial; dirty: boolean; baseRevision: number };
const dbName = "fly-view-personal-library";
const stores = ["materials", "memories", "messages", "conflicts"] as const;
type StoreName = typeof stores[number];
export const personalLibraryDatabaseName = dbName;
export const personalLibraryChangedEvent = "fly-view-personal-library-changed";
let database: Promise<IDBDatabase> | undefined;

export class PersonalLibraryError extends Error {
  constructor(message: string, options?: ErrorOptions) { super(message, options); this.name = "PersonalLibraryError"; }
}
export class PersonalLibraryConflictError extends PersonalLibraryError {
  constructor(public readonly current: PersonalMaterial) {
    super("素材已在其他窗口或设备中更新，请重新打开后再保存。");
    this.name = "PersonalLibraryConflictError";
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PersonalLibraryError("学习数据格式不正确。");
  return value as Record<string, unknown>;
}
function string(value: unknown, field: string, max = 500_000, allowEmpty = true): string {
  if (typeof value !== "string" || value.length > max || (!allowEmpty && !value.trim())) {
    throw new PersonalLibraryError(`${field}格式不正确或超出长度限制。`);
  }
  return value;
}
function identifier(value: unknown): string {
  const id = string(value, "记录标识", 180, false);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id)) throw new PersonalLibraryError("记录标识只能包含字母、数字、点、横线和下划线。");
  return id;
}
function date(value: unknown): string {
  const text = string(value, "日期", 50, false);
  if (!Number.isFinite(Date.parse(text))) throw new PersonalLibraryError("记录日期无效。");
  return new Date(text).toISOString();
}
function choice<T extends string>(value: unknown, options: readonly T[], field: string): T {
  if (!options.includes(value as T)) throw new PersonalLibraryError(`${field}无效。`);
  return value as T;
}
export function validatePersonalMaterial(value: unknown): PersonalMaterial {
  const item = record(value);
  if (!Number.isSafeInteger(item.revision) || (item.revision as number) < 1) throw new PersonalLibraryError("素材版本必须为正整数。");
  if (!Array.isArray(item.terms) || item.terms.length > 2_000) throw new PersonalLibraryError("词汇列表无效。");
  const textEn = string(item.textEn, "英文内容");
  const textZh = string(item.textZh, "中文内容");
  if (!textEn.trim() && !textZh.trim()) throw new PersonalLibraryError("请填写中文或英文学习内容。");
  return {
    id: identifier(item.id), title: string(item.title, "标题", 500, false),
    category: choice(item.category, ["interview", "ielts", "work", "general"], "分类"),
    kind: choice(item.kind, ["article", "expression", "memo"], "素材类型"),
    textEn, textZh,
    terms: item.terms.map((entry) => {
      const term = record(entry);
      return { term: string(term.term, "单词", 200, false), meaningZh: string(term.meaningZh, "释义", 2_000, false),
        ...(term.exampleEn === undefined ? {} : { exampleEn: string(term.exampleEn, "例句", 5_000) }) };
    }),
    summary: string(item.summary, "摘要", 20_000), createdAt: date(item.createdAt), updatedAt: date(item.updatedAt),
    revision: item.revision as number, source: choice(item.source, ["chat", "desktop"], "来源"),
    ...(item.deletedAt === undefined ? {} : { deletedAt: date(item.deletedAt) })
  };
}
function validateMemory(value: unknown, maxLength = 20_000): LearningMemory {
  const item = record(value);
  if (typeof item.enabled !== "boolean") throw new PersonalLibraryError("记忆启用状态无效。");
  return { id: identifier(item.id), text: string(item.text, "记忆", maxLength, false), createdAt: date(item.createdAt),
    source: choice(item.source, ["user", "assistant"], "记忆来源"), enabled: item.enabled };
}
function validateMessage(value: unknown): PersonalChatMessage {
  const item = record(value);
  return { id: identifier(item.id), role: choice(item.role, ["user", "assistant"], "消息角色"),
    content: string(item.content, "消息", 100_000, false), createdAt: date(item.createdAt) };
}
function same(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right); }

function openDatabase(): Promise<IDBDatabase> {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new PersonalLibraryError("此环境无法使用本地数据库，数据尚未保存。")); return; }
    const request = globalThis.indexedDB.open(dbName, 1);
    let rejected = false;
    request.onupgradeneeded = () => {
      for (const name of stores) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: "id" });
    };
    request.onerror = () => reject(new PersonalLibraryError("无法打开学习数据库。", { cause: request.error }));
    request.onblocked = () => { rejected = true; reject(new PersonalLibraryError("数据库被另一个页面占用，请关闭旧页面后重试。")); };
    request.onsuccess = () => {
      if (rejected) { request.result.close(); return; }
      request.result.onversionchange = () => { request.result.close(); database = undefined; };
      resolve(request.result);
    };
  });
  database.catch(() => { database = undefined; });
  return database;
}

/** Resolves only after commit, never after the individual write request. */
async function transaction<T>(names: StoreName[], mode: IDBTransactionMode,
  work: (tx: IDBTransaction, done: (value: T) => void, fail: (error: Error) => void) => void): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    let tx: IDBTransaction;
    try { tx = db.transaction(names, mode); } catch (error) { reject(new PersonalLibraryError("无法开始保存，请重试。", { cause: error })); return; }
    let value: T;
    let completed = false;
    let failure: Error | undefined;
    const fail = (error: Error) => { failure = error; try { tx.abort(); } catch { reject(error); } };
    tx.oncomplete = () => {
      if (!completed) { reject(new PersonalLibraryError("学习数据操作未完成。")); return; }
      if (mode === "readwrite" && typeof window !== "undefined") window.dispatchEvent(new Event(personalLibraryChangedEvent));
      resolve(value);
    };
    tx.onabort = () => reject(failure ?? new PersonalLibraryError("学习数据保存失败，原数据已保留。", { cause: tx.error }));
    tx.onerror = () => { /* Abort reports the durable write failure. */ };
    try { work(tx, (result) => { value = result; completed = true; }, fail); }
    catch (error) { fail(error instanceof Error ? error : new PersonalLibraryError("学习数据操作失败。")); }
  });
}
async function all<T>(name: StoreName): Promise<T[]> {
  return transaction([name], "readonly", (tx, done) => { tx.objectStore(name).getAll().onsuccess = (event) => done((event.target as IDBRequest<T[]>).result); });
}
function byDate<T extends { createdAt: string; id: string }>(a: T, b: T): number { return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id); }

export async function listPersonalMaterials(options: { includeDeleted?: boolean } = {}): Promise<PersonalMaterial[]> {
  return (await all<StoredMaterial>("materials")).map((item) => item.material).filter((item) => options.includeDeleted || !item.deletedAt)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}
export async function savePersonalMaterial(input: PersonalMaterial): Promise<PersonalMaterial> {
  const material = validatePersonalMaterial(input);
  return transaction(["materials"], "readwrite", (tx, done, fail) => {
    const store = tx.objectStore("materials");
    const request = store.get(material.id);
    request.onsuccess = () => {
      const existing = request.result as StoredMaterial | undefined;
      if (existing && existing.material.revision !== material.revision) { fail(new PersonalLibraryConflictError(existing.material)); return; }
      const next: PersonalMaterial = { ...material, createdAt: existing?.material.createdAt ?? material.createdAt,
        updatedAt: new Date().toISOString(), revision: existing ? existing.material.revision + 1 : 1 };
      store.put({ id: next.id, material: next, dirty: true, baseRevision: existing?.baseRevision ?? 0 } satisfies StoredMaterial);
      done(next);
    };
  });
}
export async function deletePersonalMaterial(id: string, expectedRevision?: number): Promise<void> {
  identifier(id);
  return transaction(["materials"], "readwrite", (tx, done, fail) => {
    const store = tx.objectStore("materials");
    const request = store.get(id);
    request.onsuccess = () => {
      const existing = request.result as StoredMaterial | undefined;
      if (!existing || existing.material.deletedAt) { done(undefined); return; }
      if (expectedRevision !== undefined && existing.material.revision !== expectedRevision) { fail(new PersonalLibraryConflictError(existing.material)); return; }
      const now = new Date().toISOString();
      store.put({ ...existing, dirty: true, material: { ...existing.material, revision: existing.material.revision + 1, deletedAt: now, updatedAt: now } });
      done(undefined);
    };
  });
}
export async function listLearningMemories(): Promise<LearningMemory[]> { return (await all<LearningMemory>("memories")).sort(byDate); }
export async function saveLearningMemory(input: LearningMemory): Promise<LearningMemory> {
  const memory = validateMemory(input);
  return transaction(["memories"], "readwrite", (tx, done, fail) => {
    const store = tx.objectStore("memories");
    const request = store.get(memory.id);
    request.onsuccess = () => {
      const existing = request.result as LearningMemory | undefined;
      const unchangedLegacyText = existing?.text === memory.text && existing.createdAt === memory.createdAt && existing.source === memory.source;
      if (memory.text.length > 600 && !unchangedLegacyText) { fail(new PersonalLibraryError("记忆请控制在600字以内，方便学习助教准确使用。")); return; }
      store.put(memory); done(memory);
    };
  });
}
export async function deleteLearningMemory(id: string): Promise<void> {
  identifier(id);
  return transaction(["memories"], "readwrite", (tx, done) => { tx.objectStore("memories").delete(id); done(undefined); });
}
export async function appendChatMessage(input: PersonalChatMessage): Promise<void> {
  const message = validateMessage(input);
  return transaction(["messages"], "readwrite", (tx, done, fail) => {
    const store = tx.objectStore("messages");
    const request = store.get(message.id);
    request.onsuccess = () => {
      if (request.result && !same(request.result, message)) { fail(new PersonalLibraryError("消息标识已存在，原消息未被覆盖。")); return; }
      if (!request.result) store.add(message);
      done(undefined);
    };
  });
}
export async function listChatMessages(limit = 100): Promise<PersonalChatMessage[]> {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new PersonalLibraryError("消息数量无效。");
  const messages = (await all<PersonalChatMessage>("messages")).sort(byDate);
  return limit === 0 ? [] : messages.slice(-limit);
}

export async function applyRemoteMaterials(input: PersonalMaterial[]): Promise<RemoteApplyResult> {
  const incoming = unique(input.map(validatePersonalMaterial));
  return transaction(["materials", "conflicts"], "readwrite", (tx, done) => {
    const result: RemoteApplyResult = { applied: [], unchanged: [], conflicts: [] };
    const store = tx.objectStore("materials");
    for (const remote of incoming) {
      const request = store.get(remote.id);
      request.onsuccess = () => {
        const existing = request.result as StoredMaterial | undefined;
        if (existing && same(existing.material, remote)) {
          store.put({ ...existing, dirty: false, baseRevision: remote.revision });
          tx.objectStore("conflicts").delete(remote.id);
          result.unchanged.push(remote.id);
        } else if (existing && remote.revision < existing.material.revision && !existing.dirty) {
          result.unchanged.push(remote.id);
        } else if (existing && (existing.dirty || remote.revision === existing.material.revision)) {
          const conflict: MaterialConflict = { id: remote.id, local: existing.material, remote, reason: existing.dirty ? "local-changes" : "same-revision" };
          tx.objectStore("conflicts").put(conflict);
          result.conflicts.push(conflict);
        } else {
          store.put({ id: remote.id, material: remote, dirty: false, baseRevision: remote.revision } satisfies StoredMaterial);
          tx.objectStore("conflicts").delete(remote.id);
          result.applied.push(remote.id);
        }
      };
    }
    done(result);
  });
}
export async function listMaterialConflicts(): Promise<MaterialConflict[]> { return all<MaterialConflict>("conflicts"); }
/** Keep the latest local edit under a new identity and let the original follow its cloud record. */
export async function resolveMaterialConflictKeepBoth(id: string): Promise<{ localCopy: PersonalMaterial; remote: PersonalMaterial }> {
  identifier(id);
  const copyId = `copy-${crypto.randomUUID()}`;
  return transaction(["materials", "conflicts"], "readwrite", (tx, done, fail) => {
    const conflictStore = tx.objectStore("conflicts");
    const materialStore = tx.objectStore("materials");
    const conflictRequest = conflictStore.get(id);
    conflictRequest.onsuccess = () => {
      const conflict = conflictRequest.result as MaterialConflict | undefined;
      if (!conflict) { fail(new PersonalLibraryError("此冲突已处理，请刷新材料列表。")); return; }
      const materialRequest = materialStore.get(id);
      materialRequest.onsuccess = () => {
        try {
          const existing = materialRequest.result as StoredMaterial | undefined;
          const local = validatePersonalMaterial(existing?.material ?? conflict.local);
          const remote = validatePersonalMaterial(conflict.remote);
          if (remote.id !== id) throw new PersonalLibraryError("冲突记录与素材不一致，未修改现有内容。");
          const { deletedAt: _deletedAt, ...localContent } = local;
          const now = new Date().toISOString();
          const localCopy: PersonalMaterial = { ...localContent, id: copyId, title: `${local.title.slice(0, 480)}（本机副本）`,
            revision: 1, createdAt: now, updatedAt: now };
          materialStore.add({ id: copyId, material: localCopy, dirty: true, baseRevision: 0 } satisfies StoredMaterial);
          materialStore.put({ id, material: remote, dirty: false, baseRevision: remote.revision } satisfies StoredMaterial);
          conflictStore.delete(id);
          done({ localCopy, remote });
        } catch (error) { fail(error instanceof Error ? error : new PersonalLibraryError("冲突处理未完成，原始内容已保留。")); }
      };
    };
  });
}
export async function listPendingMaterials(): Promise<PendingMaterial[]> {
  return (await all<StoredMaterial>("materials")).filter((item) => item.dirty)
    .map((item) => ({ ...item.material, baseRevision: item.baseRevision }));
}
export async function acknowledgeMaterialsSynced(records: Array<{ id: string; revision: number }>): Promise<void> {
  for (const item of records) {
    identifier(item.id);
    if (!Number.isSafeInteger(item.revision) || item.revision < 1) throw new PersonalLibraryError("同步确认版本无效。");
  }
  return transaction(["materials", "conflicts"], "readwrite", (tx, done) => {
    const store = tx.objectStore("materials");
    for (const item of records) {
      const request = store.get(item.id);
      request.onsuccess = () => {
        const existing = request.result as StoredMaterial | undefined;
        // Acknowledged uploads advance the server base even if the learner edited
        // again while the upload was in flight. Only an exact current ack clears dirty.
        if (existing && item.revision > existing.baseRevision && item.revision <= existing.material.revision) {
          const stillDirty = item.revision < existing.material.revision;
          store.put({ ...existing, dirty: stillDirty, baseRevision: item.revision });
          if (!stillDirty) tx.objectStore("conflicts").delete(item.id);
        }
      };
    }
    done(undefined);
  });
}

const credentialField = /(?:api[-_]?key|(?:access|refresh|auth|bearer)[-_]?token|password|passwd|secret|credential[s]?|authorization)$|^(?:key|token)$/i;
function credentialKey(key: string): boolean {
  return /(?:api[-_]?key|token|password|secret|credential|authorization|auth[-_:]|deepseek.*key)/i.test(key)
    || /(?:^|[-_:])key(?:$|[-_:])/i.test(key);
}
function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !credentialField.test(key)).map(([key, child]) => [key, sanitize(child)]));
  return value;
}
function legacyValue(key: string, value: unknown): string | undefined {
  if (!key.startsWith("six-sigma-study:") || credentialKey(key)) return undefined;
  const raw = string(value, "旧版学习记录", 50_000_000);
  try { return JSON.stringify(sanitize(JSON.parse(raw))); } catch { return raw; }
}
function readLegacyStorage(): Record<string, string> {
  const entries: Array<[string, string]> = [];
  const storage = globalThis.localStorage;
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key) continue;
    const raw = storage.getItem(key);
    if (raw === null) continue;
    const value = legacyValue(key, raw);
    if (value !== undefined) entries.push([key, value]);
  }
  return Object.fromEntries(entries);
}
function unique<T extends { id: string }>(items: T[]): T[] {
  if (new Set(items.map((item) => item.id)).size !== items.length) throw new PersonalLibraryError("导入内容包含重复的记录标识。");
  return items;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 100_000) throw new PersonalLibraryError("备份列表格式或数量无效。");
  return value;
}
export async function exportLearningBackup(): Promise<LearningBackup> {
  const snapshot = await transaction<{ materials: StoredMaterial[]; memories: LearningMemory[]; messages: PersonalChatMessage[]; conflicts: MaterialConflict[] }>(["materials", "memories", "messages", "conflicts"], "readonly", (tx, done) => {
    const result = { materials: [] as StoredMaterial[], memories: [] as LearningMemory[], messages: [] as PersonalChatMessage[], conflicts: [] as MaterialConflict[] };
    tx.objectStore("materials").getAll().onsuccess = (event) => { result.materials = (event.target as IDBRequest<StoredMaterial[]>).result; };
    tx.objectStore("memories").getAll().onsuccess = (event) => { result.memories = (event.target as IDBRequest<LearningMemory[]>).result; };
    tx.objectStore("messages").getAll().onsuccess = (event) => { result.messages = (event.target as IDBRequest<PersonalChatMessage[]>).result; };
    tx.objectStore("conflicts").getAll().onsuccess = (event) => { result.conflicts = (event.target as IDBRequest<MaterialConflict[]>).result; };
    done(result);
  });
  try {
    return { format: "fly-view-learning-backup", schemaVersion: 1, exportedAt: new Date().toISOString(),
      materials: snapshot.materials.map((item) => item.material), memories: snapshot.memories, messages: snapshot.messages, conflicts: snapshot.conflicts, legacyStorage: readLegacyStorage() };
  } catch (error) { throw new PersonalLibraryError("无法读取旧版学习记录，完整备份尚未生成。", { cause: error }); }
}

/** Non-destructive restore: existing differing records are reported, never overwritten. */
export async function restoreLearningBackup(input: unknown): Promise<RestoreResult> {
  const backup = record(typeof input === "string" ? JSON.parse(input) : input);
  if (backup.format !== "fly-view-learning-backup" || backup.schemaVersion !== 1) throw new PersonalLibraryError("不支持此备份格式或版本。");
  date(backup.exportedAt);
  const materials = unique(list(backup.materials).map(validatePersonalMaterial));
  const memories = unique(list(backup.memories).map((item) => validateMemory(item)));
  const messages = unique(list(backup.messages).map(validateMessage));
  const conflictRecords = unique(list(backup.conflicts ?? []).map((value): MaterialConflict => {
    const item = record(value);
    const id = identifier(item.id);
    const local = validatePersonalMaterial(item.local);
    const remote = validatePersonalMaterial(item.remote);
    if (local.id !== id || remote.id !== id) throw new PersonalLibraryError("备份中的冲突素材标识不一致。");
    return { id, local, remote, reason: choice(item.reason, ["local-changes", "same-revision"], "冲突原因") };
  }));
  const legacy = Object.entries(record(backup.legacyStorage)).flatMap(([key, raw]) => {
    const value = legacyValue(key, raw);
    return value === undefined ? [] : [[key, value] as const];
  });
  const result: RestoreResult = { materials: 0, memories: 0, messages: 0, legacyKeys: 0, conflicts: [] };
  const insertedKeys: Array<[string, string]> = [];
  try {
    // localStorage and IndexedDB cannot share a transaction. Insert only absent legacy
    // keys, then compensate these inserts if the IndexedDB transaction cannot commit.
    for (const [key, value] of legacy) {
      const current = globalThis.localStorage.getItem(key);
      if (current === null) { globalThis.localStorage.setItem(key, value); insertedKeys.push([key, value]); result.legacyKeys++; }
      else if (legacyValue(key, current) !== value) result.conflicts.push(`legacy:${key}`);
    }
    return await transaction(["materials", "memories", "messages", "conflicts"], "readwrite", (tx, done) => {
      const merge = <T extends { id: string }>(name: "materials" | "memories" | "messages", items: T[]) => {
        const store = tx.objectStore(name);
        for (const item of items) {
          const request = store.get(item.id);
          request.onsuccess = () => {
            const existing = request.result;
            if (existing) { if (!same(name === "materials" ? existing.material : existing, item)) result.conflicts.push(`${name}:${item.id}`); }
            else { store.add(name === "materials" ? { id: item.id, material: item, dirty: true, baseRevision: 0 } : item); result[name]++; }
          };
        }
      };
      merge("materials", materials); merge("memories", memories); merge("messages", messages);
      const conflictStore = tx.objectStore("conflicts");
      for (const conflict of conflictRecords) {
        const request = conflictStore.get(conflict.id);
        request.onsuccess = () => {
          if (!request.result) conflictStore.add(conflict);
          else if (!same(request.result, conflict)) result.conflicts.push(`conflicts:${conflict.id}`);
        };
      }
      done(result);
    });
  } catch (error) {
    const failures: unknown[] = [error];
    for (const [key, value] of insertedKeys) {
      try { if (globalThis.localStorage.getItem(key) === value) globalThis.localStorage.removeItem(key); }
      catch (rollbackError) { failures.push(rollbackError); }
    }
    throw new PersonalLibraryError(failures.length > 1 ? "恢复未完成，部分旧版记录无法回退，请保留备份文件。" : "恢复未完成，原有学习数据已保留。", { cause: new AggregateError(failures) });
  }
}

const categoryNames: Record<PersonalMaterial["category"], string> = { interview: "面试英语", ielts: "雅思学习", work: "工作英语", general: "个人学习" };
function normalizeTerm(value: string): string { return value.toLowerCase().replace(/’/g, "'").replace(/[^a-z0-9σ]+/g, " ").trim().replace(/\s+/g, " "); }
export function materialToBookManifest(input: PersonalMaterial) {
  const material = validatePersonalMaterial(input);
  return {
    bookId: `personal-${material.id}`, title: { en: material.title, zh: material.title },
    subtitle: { en: "Personal learning material", zh: categoryNames[material.category] },
    languagePair: ["en", "zh"] as Array<"en" | "zh">, cover: "阅", domainLabel: "素材词汇",
    contentPath: `personal:${material.id}`, pageCount: 1, chapterCount: 1, assetCount: 0,
    source: "Private material saved by the learner.",
    licenseNotice: { en: "Private learning material. Source rights remain with their respective owners.", zh: "保存在本机的个人学习素材，原始内容权利归相应权利人。" }
  };
}
export function materialToManual(input: PersonalMaterial) {
  const material = validatePersonalMaterial(input);
  const manifest = materialToBookManifest(material);
  const chapterId = `${manifest.bookId}-ch01`;
  const sectionId = `${chapterId}-s01`;
  // The input contract provides whole-text translations, not aligned paragraph pairs.
  // Keep exactly one whole-text block per language: never duplicate a full Chinese
  // translation onto multiple English paragraphs or invent sentence alignments.
  const block = (language: "en" | "zh", text: string) => text.trim()
    ? [{ id: `${sectionId}-${language}-body`, kind: "paragraph" as const, page: 1, text }]
    : [];
  const dictionary = [...new Map(material.terms.map((term) => [normalizeTerm(term.term), term])).entries()]
    .filter(([key]) => key)
    .map(([key, term]) => ({ term: term.term, translation: term.meaningZh, lookupKeys: [key],
      explanation: [`来自个人素材《${material.title}》`, term.meaningZh, term.exampleEn ? `例句：${term.exampleEn}` : ""].filter(Boolean).join("。"),
      isSixSigmaTerm: false }));
  return {
    manual: material.title, bookId: manifest.bookId, title: manifest.title, subtitle: manifest.subtitle,
    domainLabel: manifest.domainLabel, source: manifest.source, licenseNotice: manifest.licenseNotice,
    version: `personal-${material.revision}`, pageCount: 1,
    chapters: [{ id: chapterId, chapter: 1, pageStart: 1, pageEnd: 1, title: manifest.title,
      sections: [{ id: sectionId, level: 1, page: 1, title: manifest.title,
        content: { en: block("en", material.textEn), zh: block("zh", material.textZh) } }], assets: [] }],
    dictionary
  };
}

export const listMaterials = listPersonalMaterials;
export const saveMaterial = savePersonalMaterial;
export const deleteMaterial = deletePersonalMaterial;
export const listMemories = listLearningMemories;
export const saveMemory = saveLearningMemory;
export const deleteMemory = deleteLearningMemory;
export const applyRemoteRecords = applyRemoteMaterials;
