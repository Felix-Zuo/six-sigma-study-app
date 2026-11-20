import { get } from "@vercel/blob";
import { releaseInfo } from "./release-info.mjs";
import { ApiError } from "./personal-material.mjs";
import { authenticate, errorResponse, responseHeaders } from "./personal-http.mjs";

export function createDownloadHandler({ env = process.env, getBlob = get } = {}) {
  return async (request) => {
    let headers = new Headers();
    try {
      headers = responseHeaders(request, env);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
      authenticate(request, env);
      if (request.method !== "GET") throw new ApiError(405, "method_not_allowed", "不支持此操作。");
      const pathname = env.FLY_VIEW_APK_PATH || releaseInfo.pathname;
      if (!/^releases\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,160}\.apk$/.test(pathname)) throw new Error("Invalid release configuration");
      const result = await getBlob(pathname, { access: "private", ...(env.BLOB_STORE_ID ? { storeId: env.BLOB_STORE_ID } : {}), abortSignal: request.signal });
      if (!result || result.statusCode !== 200 || !result.stream) throw new ApiError(404, "download_unavailable", "安装包尚未就绪，请稍后再试。");
      headers.set("Content-Type", "application/vnd.android.package-archive");
      headers.set("Content-Disposition", `attachment; filename="${pathname.slice("releases/".length)}"`);
      headers.set("Content-Length", String(result.blob.size));
      headers.set("Accept-Ranges", "none");
      // Return the upstream stream directly. Buffering the APK would hit the
      // normal Function response limit and needlessly keep it in memory.
      return new Response(result.stream, { status: 200, headers });
    } catch (error) { return errorResponse(error, headers); }
  };
}
