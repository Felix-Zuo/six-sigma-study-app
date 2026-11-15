import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MAX_BODY_BYTES, validateSubmission } from "../server/personal-material.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
class PublishError extends Error {}

export function parseArguments(argv) {
  const options = {};
  const allowed = new Set(["file", "config", "markdown", "title", "category", "kind", "language", "id", "base-revision"]);
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, "");
    const value = argv[index + 1];
    if (!argv[index]?.startsWith("--") || !allowed.has(key) || value === undefined || value.startsWith("--") || options[key] !== undefined) {
      throw new PublishError("发布参数无效。请使用 --config 外部连接文件，并指定 --file 素材文件 或 --markdown 文本文件。");
    }
    options[key] = value;
  }
  if (!options.config || Boolean(options.file) === Boolean(options.markdown)) throw new PublishError("请指定连接文件，以及一种素材文件。");
  return options;
}

export async function readPrivateConfig(filename) {
  const actual = await fs.realpath(filename);
  const relative = path.relative(repositoryRoot, actual);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    throw new PublishError("连接凭据必须放在项目目录之外的私人配置文件中。");
  }
  const stat = await fs.stat(actual);
  if (!stat.isFile() || stat.size > 32768) throw new PublishError("连接配置文件无效。");
  let config;
  try { config = JSON.parse((await fs.readFile(actual, "utf8")).replace(/^\uFEFF/, "")); }
  catch { throw new PublishError("连接配置文件无法解析。"); }
  if (!config || typeof config.endpoint !== "string" || typeof config.token !== "string") throw new PublishError("连接配置不完整。");
  let endpoint;
  try { endpoint = new URL(config.endpoint); } catch { throw new PublishError("连接地址无效。"); }
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash
    || config.token.length < 16 || config.token.length > 4096 || /\s/.test(config.token)) throw new PublishError("连接配置无效。");
  return { endpoint: endpoint.href.replace(/\/+$/, ""), token: config.token };
}

async function readInput(filename) {
  const stat = await fs.stat(filename);
  if (!stat.isFile() || stat.size > MAX_BODY_BYTES) throw new PublishError("素材文件过大或无法读取。");
  return (await fs.readFile(filename, "utf8")).replace(/^\uFEFF/, "");
}

async function request(config, pathname, init = {}, fetcher = fetch) {
  const response = await fetcher(`${config.endpoint}${pathname}`, {
    ...init, headers: { Authorization: `Bearer ${config.token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
    credentials: "omit", redirect: "error", signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) {
    const messages = { 401: "配对凭据无效，请重新配置。", 403: "发布请求未获准。", 409: "云端已有不同版本，原内容未覆盖，请先核对。", 413: "素材太大，请拆分发布。" };
    throw new PublishError(messages[response.status] || `发布服务暂时不可用（HTTP ${response.status}）。`);
  }
  if (!response.headers.get("content-type")?.includes("application/json")) throw new PublishError("发布服务返回格式无效。");
  const raw = await response.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES + 4096) throw new PublishError("发布服务响应过大。");
  try { return JSON.parse(raw); } catch { throw new PublishError("发布服务返回格式无效。"); }
}

export async function publishMaterial(config, submission, fetcher = fetch) {
  const normalized = validateSubmission(submission);
  const result = await request(config, "/api/materials", { method: "POST", body: JSON.stringify(normalized) }, fetcher);
  if (!result.material || result.material.id !== normalized.material.id || result.revision !== normalized.material.revision) {
    throw new PublishError("发布确认与提交内容不一致，请先核对云端记录。");
  }
  return { ok: true, id: result.material.id, revision: result.revision, idempotent: Boolean(result.idempotent) };
}

async function prepareMarkdown(options, config) {
  const content = (await readInput(options.markdown)).trim();
  if (!content) throw new PublishError("素材文件没有正文。");
  const title = options.title || content.match(/^#\s+(.+)$/m)?.[1] || path.basename(options.markdown, path.extname(options.markdown));
  const category = options.category || "general";
  const kind = options.kind || "article";
  const language = options.language || (/[\u3400-\u9fff]/.test(content) ? "zh" : "en");
  if (!["en", "zh"].includes(language)) throw new PublishError("素材语言仅支持 en 或 zh。");
  const id = options.id || `desktop-${createHash("sha256").update(JSON.stringify([title, category, kind, language, content])).digest("hex").slice(0, 24)}`;
  const response = await request(config, `/api/materials?id=${encodeURIComponent(id)}`);
  const existing = Array.isArray(response.materials) ? response.materials[0] : undefined;
  const textEn = language === "en" ? content : "";
  const textZh = language === "zh" ? content : "";
  if (existing && existing.title === title && existing.category === category && existing.kind === kind
    && existing.textEn === textEn && existing.textZh === textZh && !existing.deletedAt) {
    return { alreadyPublished: { ok: true, id: existing.id, revision: existing.revision, idempotent: true } };
  }
  const now = new Date().toISOString();
  const baseRevision = options["base-revision"] === undefined ? existing?.revision ?? 0 : Number(options["base-revision"]);
  return { submission: { baseRevision, material: {
    id, title, category, kind, textEn, textZh, terms: [], summary: "",
    createdAt: existing?.createdAt || now, updatedAt: now, revision: baseRevision + 1, source: "desktop"
  } } };
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArguments(argv);
    const config = await readPrivateConfig(options.config);
    let submission;
    if (options.markdown) {
      const prepared = await prepareMarkdown(options, config);
      if (prepared.alreadyPublished) { console.log(JSON.stringify(prepared.alreadyPublished)); return; }
      submission = prepared.submission;
    } else {
      let data;
      try { data = JSON.parse(await readInput(options.file)); } catch { throw new PublishError("素材文件无法解析。"); }
      submission = data?.material ? data : { material: data };
      if (options["base-revision"] !== undefined) submission.baseRevision = Number(options["base-revision"]);
      if (submission.baseRevision === undefined && submission.material?.revision > 1) throw new PublishError("更新已有素材时必须提供最后确认的 baseRevision。");
    }
    console.log(JSON.stringify(await publishMaterial(config, submission)));
  } catch (error) {
    // Do not print raw fetch, filesystem, or provider errors containing paths,
    // body snippets, authorization headers, or connection configuration.
    console.error(error instanceof PublishError ? error.message : "发布未完成；请检查素材格式、连接配置和网络后重试。");
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
