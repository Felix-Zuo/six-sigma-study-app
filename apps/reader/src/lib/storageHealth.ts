export const storageErrorEvent = "fly-view-storage-error";
export type StorageErrorDetail = { message: string };

/** Keep the active study session usable, but never silently claim a durable save. */
export function safePersist(write: () => void, message = "本机保存失败，当前改动尚未保存。请保留页面并备份后重试。"): boolean {
  try {
    write();
    return true;
  } catch {
    // No exception contents or saved data are included in the UI event.
    try {
      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new CustomEvent<StorageErrorDetail>(storageErrorEvent, { detail: { message } }));
      }
    } catch { /* Failure reporting must not hide the original unsuccessful result. */ }
    return false;
  }
}
