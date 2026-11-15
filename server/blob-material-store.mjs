import * as blobSdk from "@vercel/blob";
import { ApiError, MAX_BODY_BYTES } from "./personal-material.mjs";

async function boundedJson(stream) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.from(chunk); size += bytes.length;
    if (size > MAX_BODY_BYTES) throw new ApiError(503, "storage_invalid", "云端记录超过读取限制。");
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createBlobObjectStore({ sdk = blobSdk, env = process.env, signal } = {}) {
  const auth = { ...(env.BLOB_STORE_ID ? { storeId: env.BLOB_STORE_ID } : {}), ...(signal ? { abortSignal: signal } : {}) };
  const readJson = async (pathname) => {
    const result = await sdk.get(pathname, { ...auth, access: "private", useCache: false });
    if (!result) return null;
    if (result.statusCode !== 200 || !result.stream || result.blob.size > MAX_BODY_BYTES) {
      throw new ApiError(503, "storage_invalid", "云端记录暂时无法读取。");
    }
    return { value: await boundedJson(result.stream), etag: result.blob.etag };
  };
  const createJson = async (pathname, value) => {
    try {
      const result = await sdk.put(pathname, JSON.stringify(value), {
        ...auth, access: "private", addRandomSuffix: false, allowOverwrite: false,
        contentType: "application/json", cacheControlMaxAge: 60
      });
      return { created: true, value, etag: result.etag };
    } catch (error) {
      // Handles both an occupied pathname and an acknowledged write whose
      // response was lost. Never infer collision from a provider error string.
      const existing = await readJson(pathname);
      if (existing) return { created: false, ...existing };
      throw error;
    }
  };
  return {
    readJson, createJson,
    async replaceJson(pathname, value, etag) {
      try {
        const result = await sdk.put(pathname, JSON.stringify(value), {
          ...auth, access: "private", addRandomSuffix: false, allowOverwrite: true, ifMatch: etag,
          contentType: "application/json", cacheControlMaxAge: 60
        });
        return { replaced: true, etag: result.etag };
      } catch (error) {
        const current = await readJson(pathname);
        if (current && current.etag !== etag) return { replaced: false, etag: current.etag };
        throw error;
      }
    },
    async listHeads(cursor) {
      const result = await sdk.list({ ...auth, prefix: "personal-heads/", limit: 1, ...(cursor ? { cursor } : {}) });
      return { paths: result.blobs.map((item) => item.pathname), cursor: result.hasMore ? result.cursor : undefined, hasMore: result.hasMore };
    }
  };
}
