import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export const MAX_UPDATE_BYTES = 512 * 1024 * 1024;

export type AppRelease = {
  version: string;
  versionCode: number;
  notes: string[];
  apkUrl: string;
  sha256: string;
  size: number;
  publishedAt: string;
};

export type UpdateProgress = {
  stage: "downloading" | "verifying" | "ready";
  received: number;
  total: number;
  percent: number;
};

export type NativeUpdateStatus = {
  version: string;
  versionCode: number;
  configured: boolean;
  canInstall: boolean;
  ready: boolean;
};

export type SavedConnection = { endpoint: string; token: string };

interface NativeAppUpdaterPlugin {
  getStatus(): Promise<NativeUpdateStatus>;
  getRelease(options: { url: string }): Promise<{ responseJson: string }>;
  downloadUpdate(options: AppRelease): Promise<{ versionCode: number }>;
  cancelDownload(): Promise<void>;
  installUpdate(): Promise<{ status: "permission-required" | "installer-opened" }>;
  getConnection(): Promise<{ connection: SavedConnection | null }>;
  saveConnection(options: SavedConnection): Promise<void>;
  clearConnection(): Promise<void>;
  exportBackup(options: { json: string; fileName: string }): Promise<{ saved: boolean }>;
  addListener(eventName: "updateProgress", listener: (event: UpdateProgress) => void): Promise<PluginListenerHandle>;
}

const NativeAppUpdater = registerPlugin<NativeAppUpdaterPlugin>("NativeAppUpdater");
const connectionSessionKey = "fly-view:online-connection:v1";

function validatedConnection(connection: SavedConnection): SavedConnection {
  if (!connection || typeof connection.endpoint !== "string" || typeof connection.token !== "string") throw new Error("连接信息无效，请重新配对。");
  const endpoint = connection.endpoint.trim().replace(/\/+$/, "");
  const token = connection.token.trim();
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || token.length < 16 || token.length > 4096 || /\s/.test(token)) throw new Error("连接信息无效，请重新配对。");
  return { endpoint, token };
}

export async function getSavedConnection(): Promise<SavedConnection | null> {
  const saved = isAndroidUpdater()
    ? (await NativeAppUpdater.getConnection()).connection
    : JSON.parse(window.sessionStorage.getItem(connectionSessionKey) ?? "null") as SavedConnection | null;
  return saved ? validatedConnection(saved) : null;
}

export async function saveSavedConnection(connection: SavedConnection): Promise<void> {
  const value = validatedConnection(connection);
  if (isAndroidUpdater()) await NativeAppUpdater.saveConnection(value);
  else window.sessionStorage.setItem(connectionSessionKey, JSON.stringify(value));
}

export async function clearSavedConnection(): Promise<void> {
  if (isAndroidUpdater()) await NativeAppUpdater.clearConnection();
  else window.sessionStorage.removeItem(connectionSessionKey);
}

export async function exportNativeLearningBackup(options: { json: string; fileName: string }): Promise<{ saved: boolean }> {
  if (!isAndroidUpdater()) throw new Error("此保存方式仅适用于 Android，请使用浏览器的文件导出。");
  if (!options || typeof options.json !== "string" || !options.json.length || options.json.length > 20 * 1024 * 1024 || new TextEncoder().encode(options.json).byteLength > 20 * 1024 * 1024) {
    throw new Error("备份内容为空或超过 20 MB，请先减少资料数量。");
  }
  if (typeof options.fileName !== "string" || !options.fileName.trim() || options.fileName.length > 180 || /[\\/:*?"<>|\x00-\x1f\x7f]/.test(options.fileName) || !options.fileName.toLowerCase().endsWith(".json")) {
    throw new Error("备份文件名无效，请重新导出。");
  }
  return NativeAppUpdater.exportBackup(options);
}

export function isAndroidUpdater(): boolean {
  return Capacitor.getPlatform() === "android";
}

export function releaseEndpoint(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    throw new Error("请先设置有效的在线服务地址。");
  }
  const localDevelopment = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !localDevelopment) || url.username || url.password || url.search || url.hash) {
    throw new Error("更新服务需要使用安全的 HTTPS 地址。");
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/api/release`;
  return url.href;
}

export function validateReleaseManifest(value: unknown, baseUrl: string): AppRelease {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("更新信息格式不正确。");
  const item = value as Record<string, unknown>;
  const integer = (number: unknown) => typeof number === "number" && Number.isSafeInteger(number) && number > 0;
  if (typeof item.version !== "string" || !item.version.trim() || item.version.length > 64 || !integer(item.versionCode)) {
    throw new Error("更新版本信息不完整。");
  }
  if (!integer(item.size) || (item.size as number) > MAX_UPDATE_BYTES || typeof item.sha256 !== "string" || !/^[a-f\d]{64}$/i.test(item.sha256)) {
    throw new Error("安装包校验信息不完整，暂不能下载。");
  }
  if (!Array.isArray(item.notes) || item.notes.length > 30 || item.notes.some(note => typeof note !== "string" || note.length > 1000)) {
    throw new Error("更新说明格式不正确。");
  }
  if (typeof item.publishedAt !== "string" || item.publishedAt.length > 40 || !/^\d{4}-\d{2}-\d{2}T/.test(item.publishedAt) || !Number.isFinite(Date.parse(item.publishedAt))) {
    throw new Error("更新发布时间无效。");
  }
  let apkUrl: URL;
  try {
    if (typeof item.apkUrl !== "string") throw new Error();
    apkUrl = new URL(item.apkUrl);
  } catch {
    throw new Error("安装包地址无效。");
  }
  const origin = new URL(releaseEndpoint(baseUrl)).origin;
  if (apkUrl.protocol !== "https:" || apkUrl.origin !== origin || apkUrl.username || apkUrl.password || apkUrl.search || apkUrl.hash) {
    throw new Error("安装包必须来自已配置的安全更新服务。");
  }
  return {
    version: item.version.trim(), versionCode: item.versionCode as number,
    notes: item.notes.map(note => (note as string).trim()).filter(Boolean),
    apkUrl: apkUrl.href, sha256: item.sha256.toLowerCase(), size: item.size as number,
    publishedAt: item.publishedAt
  };
}

export async function checkAppRelease(baseUrl: string): Promise<AppRelease> {
  const url = releaseEndpoint(baseUrl);
  let value: unknown;
  if (isAndroidUpdater()) {
    const result = await NativeAppUpdater.getRelease({ url });
    value = JSON.parse(result.responseJson);
  } else {
    const saved = await getSavedConnection();
    const sameEndpoint = saved && releaseEndpoint(saved.endpoint) === url;
    const headers: Record<string, string> = sameEndpoint ? { Authorization: `Bearer ${saved.token}` } : {};
    const response = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(20000), credentials: "omit", redirect: "error" });
    if (!response.ok) throw new Error(response.status === 404 ? "更新服务尚未发布版本，请稍后再试。" : "暂时无法获取更新，请检查网络后重试。");
    if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("更新服务返回了无效内容。");
    const text = await response.text();
    if (text.length > 131072) throw new Error("更新信息超过允许大小。");
    value = JSON.parse(text);
  }
  return validateReleaseManifest(value, baseUrl);
}

export const getNativeUpdateStatus = () => NativeAppUpdater.getStatus();
export const cancelAppDownload = () => NativeAppUpdater.cancelDownload();
export const installAppUpdate = () => NativeAppUpdater.installUpdate();

export async function downloadAppUpdate(release: AppRelease, onProgress: (progress: UpdateProgress) => void): Promise<void> {
  const listener = await NativeAppUpdater.addListener("updateProgress", onProgress);
  try {
    await NativeAppUpdater.downloadUpdate(release);
  } finally {
    await listener.remove();
  }
}

export async function refreshWebApp(): Promise<void> {
  if (Capacitor.isNativePlatform()) throw new Error("请通过安装包更新 Android 应用。");
  const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
  if (registration) {
    await registration.update();
    if (registration.installing) {
      const worker = registration.installing;
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => finish(new Error("网页更新尚未完成，请稍后再试。")), 20000);
        const changed = () => {
          if (worker.state === "activated") finish();
          else if (worker.state === "redundant") finish(new Error("网页更新失败，请检查网络后重试。"));
        };
        function finish(error?: Error) {
          window.clearTimeout(timeout);
          worker.removeEventListener("statechange", changed);
          if (error) reject(error); else resolve();
        }
        worker.addEventListener("statechange", changed);
        changed();
      });
    }
  }
  window.location.reload();
}
