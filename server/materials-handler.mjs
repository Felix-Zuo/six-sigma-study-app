import { createBlobObjectStore } from "./blob-material-store.mjs";
import { createPersonalRepository } from "./personal-repository.mjs";
import { ApiError } from "./personal-material.mjs";
import { authenticate, errorResponse, jsonResponse, readJsonRequest, responseHeaders } from "./personal-http.mjs";

export function createMaterialsHandler({ env = process.env, storeFactory = createBlobObjectStore } = {}) {
  return async (request) => {
    let headers = new Headers();
    try {
      headers = responseHeaders(request, env);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
      authenticate(request, env);
      if (!["GET", "POST"].includes(request.method)) throw new ApiError(405, "method_not_allowed", "不支持此操作。");
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(25000)]);
      const repository = createPersonalRepository(storeFactory({ env, signal }));
      if (request.method === "POST") return jsonResponse(await repository.put(await readJsonRequest(request)), 200, headers);
      const url = new URL(request.url);
      if (url.searchParams.has("id")) {
        const material = await repository.get(url.searchParams.get("id"));
        return jsonResponse({ materials: material ? [material] : [], hasMore: false }, 200, headers);
      }
      const cursor = url.searchParams.get("cursor") || undefined;
      const limit = url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : 10;
      return jsonResponse(await repository.list({ cursor, limit }), 200, headers);
    } catch (error) { return errorResponse(error, headers); }
  };
}
