import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, Check, RefreshCw } from "lucide-react";
import {
  cancelAppDownload, checkAppRelease, downloadAppUpdate, getNativeUpdateStatus,
  installAppUpdate, isAndroidUpdater, refreshWebApp,
  type AppRelease, type UpdateProgress
} from "../lib/appUpdates";
import "./UpdateCenter.css";

type UpdateCenterProps = {
  endpoint: string;
  currentVersionCode?: number;
  currentVersion?: string;
};

type Phase = "idle" | "checking" | "available" | "current" | "downloading" | "verifying" | "ready" | "installing" | "permission" | "installer" | "error";

const sizeLabel = (size: number) => `${(size / 1024 / 1024).toFixed(1)} MB`;

export function UpdateCenter({ endpoint, currentVersionCode = 901, currentVersion = "0.9.1-beta" }: UpdateCenterProps) {
  const android = isAndroidUpdater();
  const [installed, setInstalled] = useState({ version: currentVersion, versionCode: currentVersionCode });
  const [release, setRelease] = useState<AppRelease | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [downloadReady, setDownloadReady] = useState(false);
  const alive = useRef(true);
  const activeDownload = useRef(false);
  const requestId = useRef(0);

  useEffect(() => {
    alive.current = true;
    if (android) {
      void getNativeUpdateStatus().then(status => {
        if (!alive.current) return;
        setInstalled({ version: status.version, versionCode: status.versionCode });
        setDownloadReady(status.ready);
        if (status.ready) setPhase("ready");
      }).catch(() => { /* Version props remain the fallback on older native shells. */ });
    }
    return () => {
      alive.current = false;
      requestId.current++;
      if (activeDownload.current) void cancelAppDownload().catch(() => undefined);
    };
  }, [android]);

  const busy = ["checking", "downloading", "verifying", "installing"].includes(phase);

  function showError(error: unknown) {
    if (!alive.current) return;
    const text = error instanceof Error ? error.message : "操作未完成，请稍后重试。";
    setMessage(text.includes("取消") ? "下载已取消，可以随时重新下载。" : text);
    setPhase("error");
  }

  async function check() {
    const id = ++requestId.current;
    setPhase("checking"); setMessage(""); setProgress(null);
    try {
      const next = await checkAppRelease(endpoint);
      if (!alive.current || id !== requestId.current) return;
      setRelease(next);
      setPhase(next.versionCode > installed.versionCode ? "available" : "current");
    } catch (error) {
      if (id === requestId.current) showError(error);
    }
  }

  async function install() {
    setPhase("installing"); setMessage("");
    try {
      const result = await installAppUpdate();
      if (!alive.current) return;
      setPhase(result.status === "permission-required" ? "permission" : "installer");
      setMessage(result.status === "permission-required"
        ? "请在系统页面允许飞阅安装应用，返回后点击“继续安装”。"
        : "已打开系统安装页面。完成系统确认后，重新打开飞阅即可使用新版本。");
    } catch (error) {
      try { const status = await getNativeUpdateStatus(); if (alive.current) setDownloadReady(status.ready); } catch { /* Keep a retry action available. */ }
      showError(error);
    }
  }

  async function download() {
    if (!release) return;
    setPhase("downloading"); setMessage(""); setDownloadReady(false);
    activeDownload.current = true;
    try {
      await downloadAppUpdate(release, next => {
        if (!alive.current) return;
        setProgress(next);
        if (next.stage === "verifying") setPhase("verifying");
      });
      if (!alive.current) return;
      setDownloadReady(true); setPhase("ready");
      await install();
    } catch (error) { showError(error); }
    finally { activeDownload.current = false; }
  }

  async function refresh() {
    setPhase("installing"); setMessage("");
    try { await refreshWebApp(); } catch (error) { showError(error); }
  }

  const hasUpdate = Boolean(release && release.versionCode > installed.versionCode);

  return (
    <section className="update-center" aria-labelledby="update-center-heading">
      <div className="update-center__heading">
        <div>
          <h3 id="update-center-heading">软件更新</h3>
          <p>当前版本 {installed.version}</p>
        </div>
        <span className="update-center__platform">{android ? "Android" : "网页版"}</span>
      </div>

      {!endpoint.trim() && <p className="update-center__hint">连接在线服务后，可在这里检查新版本。</p>}

      {phase === "current" && <p className="update-center__success" role="status"><Check size={16} aria-hidden="true" /> 已是最新版本</p>}
      {release && hasUpdate && (
        <div className="update-center__release">
          <div className="update-center__release-title"><strong>新版本 {release.version}</strong><span>{sizeLabel(release.size)}</span></div>
          {release.notes.length > 0 && <ul>{release.notes.map((note, index) => <li key={`${index}-${note}`}>{note}</li>)}</ul>}
        </div>
      )}

      {(phase === "downloading" || phase === "verifying") && (
        <div className="update-center__download" role="status" aria-live="polite">
          <div><span>{phase === "verifying" ? "正在验证安装包…" : "正在下载安装包…"}</span><span>{progress?.percent ?? 0}%</span></div>
          <progress max={100} value={progress?.percent ?? 0} aria-label="安装包下载进度" />
          <p>下载期间请保持此页面打开。</p>
        </div>
      )}

      {message && <p className={phase === "error" ? "update-center__error" : "update-center__hint"} role={phase === "error" ? "alert" : "status"}>{message}</p>}

      <div className="update-center__actions">
        {android && downloadReady && !busy ? (
          <button className="update-center__primary" type="button" onClick={() => void install()}><ArrowDownToLine size={16} aria-hidden="true" />{phase === "installer" ? "再次打开安装页面" : "继续安装"}</button>
        ) : android && hasUpdate && !busy ? (
          <button className="update-center__primary" type="button" onClick={() => void download()}><ArrowDownToLine size={16} aria-hidden="true" />下载并安装</button>
        ) : null}
        {phase === "downloading" || phase === "verifying" ? (
          <button type="button" onClick={() => void cancelAppDownload().catch(showError)}>取消下载</button>
        ) : (
          <button type="button" onClick={() => void check()} disabled={busy || !endpoint.trim()}><RefreshCw size={16} aria-hidden="true" />{phase === "checking" ? "正在检查…" : "检查更新"}</button>
        )}
        {!android && <button className="update-center__primary" type="button" onClick={() => void refresh()} disabled={busy}>{phase === "installing" ? "正在更新…" : "刷新网页版"}</button>}
      </div>
      <p className="update-center__footnote">{android ? "安装前会验证来源与完整性，最后由你在系统页面确认安装。" : "刷新会重新加载网页。阅读进度和已保存的学习记录会保留。"}</p>
    </section>
  );
}
