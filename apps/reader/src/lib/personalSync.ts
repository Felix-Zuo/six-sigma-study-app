import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { clearSavedConnection, getSavedConnection, saveSavedConnection, type SavedConnection } from "./appUpdates";
import { acknowledgeMaterialsSynced, applyRemoteMaterials, listMaterialConflicts, listPendingMaterials,
  personalLibraryChangedEvent, validatePersonalMaterial, type MaterialConflict, type PersonalMaterial } from "./personalLibrary";

export const SERVICE_URL = "https://fly-view-personal.vercel.app";
export const personalSyncStatusEvent = "fly-view-personal-sync-status";
export type PersonalSyncResult = { uploaded: number; downloaded: number; conflicts: MaterialConflict[] };
export type PersonalSyncStatus = {
  phase: "idle" | "not-connected" | "syncing" | "synced" | "conflict" | "offline" | "error";
  message: string;
  lastSyncedAt?: string;
  uploaded?: number;
  downloaded?: number;
  conflicts?: number;
};
export class PersonalSyncError extends Error {
  constructor(public readonly code: "not-connected" | "invalid-pairing" | "offline" | "timeout" | "auth" | "network" | "invalid-response" | "conflict" | "cancelled", message: string) {
    super(message); this.name = "PersonalSyncError";
  }
}
let status: PersonalSyncStatus = { phase: "idle", message: "连接后，学习材料会在打开应用和恢复联网时同步。" };
const subscribers = new Set<(value: PersonalSyncStatus) => void>();
let inFlight: Promise<PersonalSyncResult> | undefined;
let activeController: AbortController | undefined;
let connectionGeneration = 0;

function publish(value: PersonalSyncStatus): void {
  status = { ...value };
  for (const listener of subscribers) { try { listener({ ...status }); } catch { /* One UI listener must not cancel durable sync. */ } }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(personalSyncStatusEvent, { detail: { ...status } }));
}
export function getPersonalSyncStatus(): PersonalSyncStatus { return { ...status }; }
export function subscribePersonalSyncStatus(listener: (value: PersonalSyncStatus) => void): () => void {
  subscribers.add(listener); listener(getPersonalSyncStatus());
  return () => { subscribers.delete(listener); };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PersonalSyncError("invalid-response", "个人空间返回的数据格式不正确，请稍后重试。");
  return value as Record<string, unknown>;
}
function trustedConnection(value: unknown): SavedConnection {
  const item = object(value);
  if (typeof item.endpoint !== "string" || typeof item.token !== "string") throw new PersonalSyncError("invalid-pairing", "配对码不完整，请重新复制。");
  let endpoint: URL;
  try { endpoint = new URL(item.endpoint); } catch { throw new PersonalSyncError("invalid-pairing", "配对码中的空间地址无效。"); }
  if (endpoint.origin !== SERVICE_URL || !["", "/"].includes(endpoint.pathname) || endpoint.search || endpoint.hash || endpoint.username || endpoint.password) {
    throw new PersonalSyncError("invalid-pairing", "此配对码不属于飞阅个人空间，连接未建立。");
  }
  if (item.token.length < 16 || item.token.length > 4096 || /\s/.test(item.token)) throw new PersonalSyncError("invalid-pairing", "配对码无效，请重新复制。");
  return { endpoint: SERVICE_URL, token: item.token };
}
/** Parsing never saves a connection or makes a request. A link requires an explicit connect action. */
export function parsePairingCode(input: string): SavedConnection {
  try {
    let encoded = input.trim();
    if (encoded.length > 16_384) throw new Error();
    if (encoded.startsWith("flyview:")) {
      const link = new URL(encoded);
      if (link.protocol !== "flyview:" || link.hostname !== "connect" || !["", "/"].includes(link.pathname) || link.search || link.username || link.password || link.port) throw new Error();
      encoded = link.hash.slice(1);
    }
    if (!/^[A-Za-z0-9_-]+={0,2}$/.test(encoded)) throw new Error();
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
    const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    return trustedConnection(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(decoded, (character) => character.charCodeAt(0)))));
  } catch (error) {
    if (error instanceof PersonalSyncError && error.code === "invalid-pairing") throw error;
    throw new PersonalSyncError("invalid-pairing", "配对码无效，请完整复制个人空间提供的配对码。");
  }
}

async function request(connection: SavedConnection, path: string, method: "GET" | "POST", body: unknown, signal: AbortSignal): Promise<{ status: number; data: Record<string, unknown> }> {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 20_000);
  try {
    const response = await fetch(`${connection.endpoint}${path}`, {
      method, headers: { Authorization: `Bearer ${connection.token}`, Accept: "application/json", ...(method === "POST" ? { "Content-Type": "application/json" } : {}) },
      ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
      credentials: "omit", redirect: "error", cache: "no-store", signal: controller.signal
    });
    if (response.status === 401 || response.status === 403) throw new PersonalSyncError("auth", "连接已失效，请重新配对个人空间。本机材料仍然保留。");
    if (!response.ok && response.status !== 409) throw new PersonalSyncError("network", "个人空间暂时无法连接，本机材料已保留，请稍后重试。");
    if (!response.headers.get("content-type")?.includes("application/json")) throw new PersonalSyncError("invalid-response", "个人空间尚未就绪，请稍后重试。");
    const text = await response.text();
    if (text.length > 16_000_000) throw new PersonalSyncError("invalid-response", "本次材料过多，暂未同步。请减少单批材料后重试。");
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { throw new PersonalSyncError("invalid-response", "个人空间返回了不完整的数据，请稍后重试。"); }
    return { status: response.status, data: object(parsed) };
  } catch (error) {
    if (timedOut) throw new PersonalSyncError("timeout", "同步等待超时，本机材料已保留，请稍后重试。");
    if (signal.aborted) throw new PersonalSyncError("cancelled", "本次同步已停止，本机材料仍然保留。");
    if (error instanceof PersonalSyncError) throw error;
    throw new PersonalSyncError("network", "暂时无法连接个人空间，请检查网络后重试。");
  } finally { clearTimeout(timeout); signal.removeEventListener("abort", abort); }
}

function validatePage(data: Record<string, unknown>): { materials: PersonalMaterial[]; cursor?: string; hasMore: boolean } {
  if (!Array.isArray(data.materials) || data.materials.length > 100 || typeof data.hasMore !== "boolean") throw new PersonalSyncError("invalid-response", "材料列表格式不正确，本机内容未被替换。");
  if (data.cursor !== undefined && (typeof data.cursor !== "string" || data.cursor.length > 4096)) throw new PersonalSyncError("invalid-response", "材料分页信息无效，请稍后重试。");
  if (data.hasMore && !data.cursor) throw new PersonalSyncError("invalid-response", "材料列表尚未完整返回，请稍后重试。");
  try { return { materials: data.materials.map(validatePersonalMaterial), cursor: data.cursor as string | undefined, hasMore: data.hasMore }; }
  catch (error) { if (error instanceof PersonalSyncError) throw error; throw new PersonalSyncError("invalid-response", "有材料未通过格式检查，本机内容已保留。"); }
}

async function runSync(): Promise<PersonalSyncResult> {
  const generation = connectionGeneration;
  const controller = new AbortController();
  activeController = controller;
  let totalTimedOut = false;
  const timeout = setTimeout(() => { totalTimedOut = true; controller.abort(); }, 120_000);
  const current = () => { if (generation !== connectionGeneration || controller.signal.aborted) throw new PersonalSyncError(totalTimedOut ? "timeout" : "cancelled", totalTimedOut ? "本次同步等待超时，已完成的材料仍然保留，请重试。" : "本次同步已停止，本机材料仍然保留。"); };
  try {
    const saved = await getSavedConnection();
    if (!saved) throw new PersonalSyncError("not-connected", "尚未连接个人空间。连接后才能同步材料。");
    const connection = trustedConnection(saved);
    if (typeof navigator !== "undefined" && navigator.onLine === false) throw new PersonalSyncError("offline", "当前离线，可以继续学习，恢复联网后会重试同步。");
    current();
    publish({ phase: "syncing", message: "正在同步学习材料…", lastSyncedAt: status.lastSyncedAt });
    const result: PersonalSyncResult = { uploaded: 0, downloaded: 0, conflicts: [] };
    const pending = await listPendingMaterials();
    for (const entry of pending) {
      current();
      const { baseRevision, ...material } = entry;
      const response = await request(connection, "/api/materials", "POST", { material, baseRevision }, controller.signal);
      current();
      let remote: PersonalMaterial;
      try { remote = validatePersonalMaterial(response.data.material); } catch { throw new PersonalSyncError("invalid-response", "保存确认不完整，材料仍保留在待同步列表中。"); }
      if (remote.id !== material.id) throw new PersonalSyncError("invalid-response", "保存确认与当前材料不一致，本机版本已保留。");
      if (response.status === 409) {
        await applyRemoteMaterials([remote]);
      } else {
        if (remote.revision !== material.revision || JSON.stringify(remote) !== JSON.stringify(validatePersonalMaterial(material))) throw new PersonalSyncError("invalid-response", "云端保存结果与本机版本不一致，材料尚未标记为已同步。");
        await acknowledgeMaterialsSynced([{ id: material.id, revision: material.revision }]);
        result.uploaded++;
      }
    }
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    let hasMore = true;
    let pageNumber = 0;
    while (hasMore) {
      current();
      if (++pageNumber > 200) throw new PersonalSyncError("invalid-response", "本次材料较多，已完成部分会保留，请再次同步继续。");
      const response = await request(connection, `/api/materials${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, "GET", undefined, controller.signal);
      if (response.status !== 200) throw new PersonalSyncError("invalid-response", "材料列表暂时不可用，请稍后重试。");
      const page = validatePage(response.data);
      current();
      const applied = await applyRemoteMaterials(page.materials);
      result.downloaded += applied.applied.length;
      hasMore = page.hasMore;
      cursor = page.cursor;
      if (hasMore && cursor) {
        if (seenCursors.has(cursor)) throw new PersonalSyncError("invalid-response", "材料分页出现重复，已停止同步以保留本机内容。");
        seenCursors.add(cursor);
      }
    }
    current();
    result.conflicts = await listMaterialConflicts();
    publish({ phase: result.conflicts.length ? "conflict" : "synced", lastSyncedAt: new Date().toISOString(),
      uploaded: result.uploaded, downloaded: result.downloaded, conflicts: result.conflicts.length,
      message: result.conflicts.length ? `有 ${result.conflicts.length} 篇材料存在不同版本，已保留本机内容，请查看冲突说明。`
        : result.uploaded || result.downloaded ? `已同步：上传 ${result.uploaded} 篇，接收 ${result.downloaded} 篇。` : "学习材料已保持最新。" });
    return result;
  } catch (error) {
    if (generation === connectionGeneration) {
      const typed = totalTimedOut ? new PersonalSyncError("timeout", "本次同步等待超时，已完成的材料仍然保留，请重试。")
        : error instanceof PersonalSyncError ? error : new PersonalSyncError("network", "同步未完成，本机材料已保留。请检查存储和网络后重试。");
      publish({ phase: typed.code === "not-connected" ? "not-connected" : typed.code === "offline" ? "offline" : "error", message: typed.message, lastSyncedAt: status.lastSyncedAt });
      throw typed;
    }
    throw new PersonalSyncError("cancelled", "连接已更改，本次同步已停止。");
  } finally { clearTimeout(timeout); if (activeController === controller) activeController = undefined; }
}

export function syncPersonalLibrary(): Promise<PersonalSyncResult> {
  if (inFlight) return inFlight;
  const running = runSync();
  inFlight = running;
  void running.then(() => { if (inFlight === running) inFlight = undefined; }, () => { if (inFlight === running) inFlight = undefined; });
  return running;
}
async function cancelRunningSync(): Promise<void> {
  connectionGeneration++;
  activeController?.abort();
  if (inFlight) await inFlight.catch(() => undefined);
}
export async function connectPersonalLibrary(code: string): Promise<PersonalSyncResult> {
  const connection = parsePairingCode(code);
  const controller = new AbortController();
  // Verify credentials before replacing a working connection. No private data is uploaded here.
  const response = await request(connection, "/api/materials", "GET", undefined, controller.signal);
  if (response.status !== 200) throw new PersonalSyncError("auth", "配对未成功，请重新复制个人空间提供的配对码。");
  validatePage(response.data);
  await cancelRunningSync();
  try { await saveSavedConnection(connection); }
  catch { publish({ phase: "error", message: "连接信息未能保存，请重新连接。" }); throw new PersonalSyncError("network", "连接信息未能保存，请重新连接。"); }
  return syncPersonalLibrary();
}
export async function disconnectPersonalLibrary(): Promise<void> {
  await cancelRunningSync();
  try { await clearSavedConnection(); }
  catch { publish({ phase: "error", message: "连接信息未能清除，请重试断开连接。" }); throw new PersonalSyncError("network", "连接信息未能清除，请重试断开连接。"); }
  publish({ phase: "not-connected", message: "已断开个人空间。本机学习材料和学习记录仍然保留。" });
}

/** Mount once near the app root; a settings panel does not need to stay visible. */
export function startPersonalLibraryAutoSync(onChanged?: () => void): () => void {
  let disposed = false;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let awaitingFlight = false;
  let lastAttemptedPending = "";
  const run = () => { void syncPersonalLibrary().then((result) => { if (!disposed && (result.downloaded || result.conflicts.length)) onChanged?.(); }).catch(() => { /* Status subscribers display failure; offline use continues. */ }); };
  const localChanges = () => {
    if (disposed) return;
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = undefined;
      if (disposed) return;
      // Do not mark a newer local revision attempted while an older sync is in flight.
      if (inFlight) {
        if (!awaitingFlight) {
          awaitingFlight = true;
          const continueAfterFlight = () => { awaitingFlight = false; localChanges(); };
          void inFlight.then(continueAfterFlight, continueAfterFlight);
        }
        return;
      }
      void listPendingMaterials().then((pending) => {
        if (disposed || pending.length === 0) { lastAttemptedPending = ""; return; }
        const signature = JSON.stringify(pending.map((item) => [item.id, item.revision, item.baseRevision]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
        // Pulls and durable conflict snapshots emit the same database event. Retry
        // only a changed local revision, so unresolved conflicts cannot create a loop.
        if (signature === lastAttemptedPending) return;
        lastAttemptedPending = signature;
        run();
      }).catch(() => publish({ phase: "error", message: "暂时无法读取待同步材料，请检查本机存储后重试。" }));
    }, 1200);
  };
  const visible = () => { if (document.visibilityState === "visible") run(); };
  window.addEventListener("online", run);
  window.addEventListener(personalLibraryChangedEvent, localChanges);
  document.addEventListener("visibilitychange", visible);
  const nativeListener = Capacitor.isNativePlatform() ? CapacitorApp.addListener("appStateChange", (state) => { if (state.isActive && !disposed) run(); }).catch(() => null) : Promise.resolve(null);
  run();
  return () => {
    disposed = true; if (debounce) clearTimeout(debounce);
    window.removeEventListener("online", run); window.removeEventListener(personalLibraryChangedEvent, localChanges);
    document.removeEventListener("visibilitychange", visible);
    void nativeListener.then((listener) => listener?.remove()).catch(() => undefined);
  };
}
