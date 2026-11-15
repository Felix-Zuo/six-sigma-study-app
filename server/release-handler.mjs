import { releaseManifest } from "./release-manifest.mjs";
import { ApiError } from "./personal-material.mjs";
import { defaultOrigin, errorResponse, jsonResponse, responseHeaders } from "./personal-http.mjs";

export function validateReleaseManifest(value, origin = defaultOrigin) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid release");
  const positive = (number) => Number.isSafeInteger(number) && number > 0;
  const url = new URL(value.apkUrl);
  if (typeof value.version !== "string" || !value.version.trim() || value.version.length > 64 || !positive(value.versionCode)
    || !positive(value.size) || value.size > 512 * 1024 * 1024 || typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(value.sha256)
    || !Array.isArray(value.notes) || value.notes.length > 30 || value.notes.some((note) => typeof note !== "string" || note.length > 1000)
    || typeof value.publishedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value.publishedAt) || !Number.isFinite(Date.parse(value.publishedAt))
    || url.origin !== origin || url.protocol !== "https:" || url.pathname !== "/api/download" || url.search || url.hash || url.username || url.password) {
    throw new Error("Invalid release");
  }
  return { version: value.version.trim(), versionCode: value.versionCode, notes: value.notes,
    apkUrl: url.href, sha256: value.sha256.toLowerCase(), size: value.size, publishedAt: value.publishedAt };
}
export function createReleaseHandler({ env = process.env, manifest = releaseManifest } = {}) {
  return async (request) => {
    let headers = new Headers();
    try {
      headers = responseHeaders(request, env);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
      if (request.method !== "GET") throw new ApiError(405, "method_not_allowed", "不支持此操作。");
      const value = env.FLY_VIEW_RELEASE_JSON ? JSON.parse(env.FLY_VIEW_RELEASE_JSON) : manifest;
      if (!value) throw new ApiError(404, "release_unavailable", "尚未发布更新版本。");
      return jsonResponse(validateReleaseManifest(value, env.FLY_VIEW_PUBLIC_ORIGIN || defaultOrigin), 200, headers);
    } catch (error) { return errorResponse(error, headers); }
  };
}
