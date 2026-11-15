import { useEffect, useRef, useState } from "react";
import { Cloud, Download, Link2, RefreshCw, Unplug, Upload } from "lucide-react";
import { exportNativeLearningBackup, getSavedConnection, isAndroidUpdater } from "../lib/appUpdates";
import { exportLearningBackup, listMaterialConflicts, resolveMaterialConflictKeepBoth, restoreLearningBackup, type MaterialConflict } from "../lib/personalLibrary";
import { connectPersonalLibrary, disconnectPersonalLibrary, getPersonalSyncStatus, subscribePersonalSyncStatus, syncPersonalLibrary } from "../lib/personalSync";

type CloudLibraryPanelProps = { onChanged: () => void; initialPairingCode?: string };
const errorText = (error: unknown) => error instanceof Error ? error.message : "操作未完成，请稍后重试。";

export function CloudLibraryPanel({ onChanged, initialPairingCode }: CloudLibraryPanelProps) {
  const [pairingCode, setPairingCode] = useState(initialPairingCode ?? "");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(getPersonalSyncStatus);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [conflicts, setConflicts] = useState<MaterialConflict[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const operation = useRef(false);
  useEffect(() => { if (initialPairingCode) { setPairingCode(initialPairingCode); setMessage("已收到配对码，请确认后点击“连接并同步”。"); } }, [initialPairingCode]);
  useEffect(() => {
    mounted.current = true;
    void getSavedConnection().then((value) => { if (mounted.current) setConnected(Boolean(value)); }).catch((failure) => { if (mounted.current) setError(errorText(failure)); });
    void listMaterialConflicts().then((items) => { if (mounted.current) setConflicts(items); }).catch((failure) => { if (mounted.current) setError(errorText(failure)); });
    const unsubscribe = subscribePersonalSyncStatus((next) => {
      if (!mounted.current) return;
      setStatus(next);
      if (next.phase === "not-connected") setConnected(false);
      if (["synced", "conflict"].includes(next.phase)) {
        setConnected(true);
        void listMaterialConflicts().then((items) => { if (mounted.current) setConflicts(items); }).catch((failure) => { if (mounted.current) setError(errorText(failure)); });
      }
    });
    return () => { mounted.current = false; unsubscribe(); };
  }, []);

  async function perform(work: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError(""); setMessage("");
    try { await work(); }
    catch (failure) { if (mounted.current && !(failure instanceof DOMException && failure.name === "AbortError")) setError(errorText(failure)); }
    finally { operation.current = false; if (mounted.current) setBusy(false); }
  }
  async function connect() {
    try {
      await connectPersonalLibrary(pairingCode);
      if (mounted.current) { setConnected(true); setPairingCode(""); }
      onChanged();
    } finally {
      const saved = await getSavedConnection();
      if (mounted.current) setConnected(Boolean(saved));
    }
  }
  async function backup() {
    const data = await exportLearningBackup();
    const filename = `FlyView-学习备份-${new Date().toISOString().slice(0, 10)}.json`;
    const json = JSON.stringify(data, null, 2);
    if (isAndroidUpdater()) {
      const result = await exportNativeLearningBackup({ json, fileName: filename });
      if (mounted.current) setMessage(result.saved ? "学习备份已保存到你选择的位置。" : "已取消保存备份，本机学习数据未改变。");
      return;
    }
    const file = new File([json], filename, { type: "application/json" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "飞阅学习备份" });
      if (mounted.current) setMessage("已打开备份文件的保存或分享菜单。");
    } else {
      const url = URL.createObjectURL(file);
      const link = document.createElement("a"); link.href = url; link.download = filename;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      if (mounted.current) setMessage("已生成学习备份，请将文件保存在便于找回的位置。");
    }
  }
  async function restore(file: File) {
    if (file.size > 50_000_000) throw new Error("备份文件过大，请选择飞阅导出的学习备份。");
    let data: unknown;
    try { data = JSON.parse(await file.text()); } catch { throw new Error("无法读取此文件，请选择飞阅导出的学习备份。"); }
    const restored = await restoreLearningBackup(data);
    const restoredConflicts = await listMaterialConflicts();
    if (mounted.current) setConflicts(restoredConflicts);
    onChanged();
    if (mounted.current) setMessage(`已恢复 ${restored.materials} 篇材料、${restored.memories} 条记忆、${restored.messages} 条对话及 ${restored.legacyKeys} 类学习记录。${restored.conflicts.length ? `发现 ${restored.conflicts.length} 项不同版本，已保留本机内容，没有覆盖。` : ""}请重新打开应用，让阅读进度和词本完整加载。`);
  }
  async function keepBoth(id: string) {
    const result = await resolveMaterialConflictKeepBoth(id);
    const remaining = await listMaterialConflicts();
    if (mounted.current) { setConflicts(remaining); setMessage(`已保留两份：“${result.localCopy.title}”保留本机修改，原材料采用电脑版本。点击“立即同步”可把副本保存到个人空间。`); }
    onChanged();
  }
  const locked = busy || status.phase === "syncing";
  return <section className="fv-settings-card" aria-labelledby="personal-space-heading">
    <h2 id="personal-space-heading"><Cloud size={20} aria-hidden="true" /> 个人空间</h2>
    <p>把电脑上收录的文章和表达带到手机。连接一次，之后打开应用或恢复联网时自动同步学习材料。</p>
    <p>{connected ? "已连接个人空间" : "尚未连接"}{!isAndroidUpdater() && " · 网页版连接仅保留在当前会话"}</p>
    <label htmlFor="personal-pairing-code">个人空间配对码</label>
    <input id="personal-pairing-code" type="password" value={pairingCode} onChange={(event) => setPairingCode(event.target.value)}
      placeholder="粘贴电脑提供的配对码" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={16384} disabled={locked} />
    <button className="fv-primary" disabled={locked || !pairingCode.trim()} onClick={() => void perform(connect)}><Link2 size={17} />{busy ? "连接中…" : "连接并同步"}</button>
    {connected && <div className="fv-form-row">
      <button className="fv-primary" disabled={locked} onClick={() => void perform(async () => { await syncPersonalLibrary(); onChanged(); })}><RefreshCw size={17} />{status.phase === "syncing" ? "同步中…" : "立即同步"}</button>
      <button className="fv-primary" disabled={locked} onClick={() => void perform(async () => { await disconnectPersonalLibrary(); if (mounted.current) { setConnected(false); setPairingCode(""); } })}><Unplug size={17} />断开连接</button>
    </div>}
    {status.message && <p className={["error", "conflict"].includes(status.phase) ? "fv-error" : "fv-status"} role={status.phase === "error" ? "alert" : "status"}>{status.message}</p>}
    {status.lastSyncedAt && <p>上次同步：{new Date(status.lastSyncedAt).toLocaleString("zh-CN")}</p>}
    {conflicts.length > 0 && <details><summary>查看 {conflicts.length} 项版本冲突</summary><p>本机修改与电脑版本均已保留。选择“保留两份”，会把本机内容另存为副本，让原材料继续同步电脑版本。</p>
      <ul>{conflicts.map((item) => <li key={item.id}><strong>{item.local.title}</strong>：本机版本 {item.local.revision}，电脑版本 {item.remote.revision}{item.local.deletedAt ? "（本机已删除）" : ""}{item.remote.deletedAt ? "（电脑已删除）" : ""}
        <button className="fv-primary" disabled={locked} onClick={() => void perform(() => keepBoth(item.id))}>保留两份</button></li>)}</ul>
    </details>}
    <details><summary>备份与恢复（可选）</summary><p>完整备份包含本机词本、笔记、题库、记忆和对话，不含连接凭据。此操作将文件保存到你选择的位置。</p>
      <div className="fv-form-row"><button className="fv-primary" disabled={locked} onClick={() => void perform(backup)}><Download size={17} />导出完整备份</button>
        <button className="fv-primary" disabled={locked} onClick={() => fileInput.current?.click()}><Upload size={17} />从备份恢复</button></div>
      <input ref={fileInput} type="file" accept="application/json,.json" aria-label="选择飞阅学习备份" hidden onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void perform(() => restore(file)); }} />
    </details>
    {message && <p className="fv-status" role="status">{message}</p>}
    {error && <p className="fv-error" role="alert">{error}</p>}
  </section>;
}
