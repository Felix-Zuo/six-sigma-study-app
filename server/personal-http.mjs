import { createHash, timingSafeEqual } from "node:crypto";
import { ApiError, MAX_BODY_BYTES } from "./personal-material.mjs";

export const defaultOrigin = "https://fly-view-personal.vercel.app";
export function responseHeaders(request, env = process.env) {
  const headers = new Headers({
    "Cache-Control": "private, no-store, max-age=0", "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Vary": "Origin"
  });
  const origin = request.headers.get("origin");
  if (origin) {
    const allowed = new Set([defaultOrigin, "capacitor://localhost", ...(env.FLY_VIEW_ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean)]);
    const local = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/.test(origin);
    if (!allowed.has(origin) && !local) throw new ApiError(403, "origin_denied", "此页面未获准连接同步服务。");
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Disposition");
  }
  return headers;
}
export function authenticate(request, env = process.env) {
  const expected = env.FLY_VIEW_SYNC_TOKEN;
  if (typeof expected !== "string" || expected.length < 16 || expected.length > 4096 || /\s/.test(expected)) {
    throw new ApiError(503, "not_configured", "个人同步服务尚未完成配置。");
  }
  const value = request.headers.get("authorization") || "";
  const match = /^Bearer ([^\s,]{16,4096})$/i.exec(value);
  const digest = (text) => createHash("sha256").update(text).digest();
  if (!match || !timingSafeEqual(digest(match[1]), digest(expected))) {
    throw new ApiError(401, "unauthorized", "连接凭据无效，请重新配对。");
  }
}
export function jsonResponse(value, status = 200, headers = new Headers()) {
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(value), { status, headers });
}
export function errorResponse(error, headers = new Headers()) {
  const known = error instanceof ApiError;
  const status = known ? error.status : 503;
  // Never echo provider exceptions, request headers, URLs, or credentials.
  headers.set("Cache-Control", "private, no-store");
  if (status === 401) headers.set("WWW-Authenticate", "Bearer");
  return jsonResponse({ error: { code: known ? error.code : "service_unavailable", message: known ? error.message : "服务暂时不可用，请稍后重试。" },
    ...(known && error.material ? { material: error.material } : {}) }, status, headers);
}
export async function readJsonRequest(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "")) {
    throw new ApiError(415, "json_required", "请以 JSON 格式发送学习素材。");
  }
  const advertised = Number(request.headers.get("content-length"));
  if (Number.isFinite(advertised) && advertised > MAX_BODY_BYTES) throw new ApiError(413, "too_large", "素材太大，请拆分后同步。");
  const chunks = []; let size = 0;
  if (request.body) {
    const reader = request.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new ApiError(413, "too_large", "素材太大，请拆分后同步。"); }
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new ApiError(400, "invalid_json", "素材数据无法解析。"); }
}
