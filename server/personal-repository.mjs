import { ApiError, MAX_PAGE_BYTES, identifier, materialDigest, preserveApplicableTermCards, validatePersonalMaterial, validateSubmission } from "./personal-material.mjs";

const headPath = (id) => `personal-heads/${identifier(id)}.json`;
const claimPath = (id, base) => `personal/${identifier(id)}/claims/b${base}.json`;
const snapshotPath = (material) => `personal/${material.id}/r${material.revision}.json`;
const unavailable = () => new ApiError(503, "storage_invalid", "云端版本记录需要检查，请稍后重试。");

function validateEnvelope(value, id, expectedBase) {
  if (!value || value.schemaVersion !== 1 || value.id !== id) throw unavailable();
  const material = value.material === null ? null : validatePersonalMaterial(value.material);
  if (material && (material.id !== id || value.revision !== material.revision || materialDigest(material) !== value.digest)) throw unavailable();
  if (!material && (value.revision !== 0 || value.digest !== null)) throw unavailable();
  if (expectedBase !== undefined && (!material || value.baseRevision !== expectedBase || material.revision <= expectedBase)) throw unavailable();
  return { ...value, material };
}
function envelope(material, baseRevision) {
  return { schemaVersion: 1, id: material.id, revision: material.revision, baseRevision, digest: materialDigest(material), material };
}

export function createPersonalRepository(store) {
  async function ensureSnapshot(value) {
    const snapshot = await store.createJson(snapshotPath(value.material), value.material);
    if (materialDigest(snapshot.value) !== value.digest) throw new ApiError(409, "version_conflict", "该版本已有不同内容，原内容未覆盖。", value.material);
  }
  async function latest(id) {
    const head = await store.readJson(headPath(id));
    let value = head ? validateEnvelope(head.value, id) : { schemaVersion: 1, id, revision: 0, digest: null, material: null };
    // The immutable claim is the commit point. The CAS head is only an index;
    // a process interruption after claiming cannot hide or fork that commit.
    for (let hops = 0; hops < 64; hops++) {
      const next = await store.readJson(claimPath(id, value.revision));
      if (!next) return { value, head };
      value = validateEnvelope(next.value, id, value.revision);
      // Repair an interrupted writer before anyone can commit a successor.
      await ensureSnapshot(value);
    }
    throw new ApiError(503, "history_limit", "云端版本索引需要整理，请稍后重试。");
  }
  async function finishCommit(value, head) {
    await ensureSnapshot(value);
    if (head && head.value.revision < value.revision) {
      // A newer head wins. A failed CAS never rolls back an immutable commit.
      await store.replaceJson(headPath(value.id), value, head.etag);
    }
  }
  return {
    async get(id) { return (await latest(identifier(id))).value.material; },
    async put(input) {
      let { material, baseRevision } = validateSubmission(input);
      const id = material.id;
      const initial = { schemaVersion: 1, id, revision: 0, digest: null, material: null };
      // This empty index is written before the first commit, so every committed
      // material remains discoverable even if the writer stops immediately.
      await store.createJson(headPath(id), initial);
      const current = await latest(id);
      // Merge against the immutable acknowledged base, not the newest head.
      // This keeps a delayed 0.9 retry deterministic after later edits arrive.
      const baseSnapshot = baseRevision > 0 && current.value.revision !== baseRevision
        ? await store.readJson(snapshotPath({ id, revision: baseRevision })) : null;
      const base = current.value.revision === baseRevision ? current.value.material
        : baseSnapshot ? validatePersonalMaterial(baseSnapshot.value) : null;
      if (base && (base.id !== id || base.revision !== baseRevision)) throw unavailable();
      material = validateSubmission({ material: preserveApplicableTermCards(material, base), baseRevision }).material;
      const digest = materialDigest(material);
      if (current.value.material && current.value.digest === digest) {
        await finishCommit(current.value, current.head);
        return { material: current.value.material, revision: material.revision, idempotent: true };
      }
      const previousCommit = await store.readJson(claimPath(id, baseRevision));
      if (previousCommit) {
        const committed = validateEnvelope(previousCommit.value, id, baseRevision);
        if (committed.digest === digest) {
          // A delayed acknowledgement can be retried after a newer revision
          // has already arrived. Acknowledge the original commit without
          // moving the head backwards or overwriting its successor.
          await ensureSnapshot(committed);
          return { material: committed.material, revision: material.revision, idempotent: true };
        }
      }
      if (current.value.revision !== baseRevision) {
        throw new ApiError(409, "version_conflict", "素材已在其他设备更新，请先处理版本冲突。", current.value.material);
      }
      if (current.value.material && material.createdAt !== current.value.material.createdAt) {
        throw new ApiError(400, "invalid_material", "更新素材时不能修改最初创建时间。");
      }
      const desired = envelope(material, baseRevision);
      const claim = await store.createJson(claimPath(id, baseRevision), desired);
      const winner = validateEnvelope(claim.value, id, baseRevision);
      if (winner.digest !== digest) {
        throw new ApiError(409, "version_conflict", "另一设备已提交此版本的后续更新，原内容未覆盖。", (await latest(id)).value.material);
      }
      await finishCommit(winner, current.head);
      return { material, revision: material.revision, idempotent: !claim.created };
    },
    async list({ cursor, limit = 10 } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20 || (cursor !== undefined && (typeof cursor !== "string" || cursor.length > 4096))) {
        throw new ApiError(400, "invalid_page", "同步分页参数无效。");
      }
      const materials = [];
      let bytes = 128;
      let nextCursor = cursor;
      let hasMore = false;
      // One bounded Blob-list entry at a time lets a byte limit stop a page
      // without skipping an unreturned material or serializing private paths.
      for (let attempts = 0; attempts < limit; attempts++) {
        const pageStart = nextCursor;
        const page = await store.listHeads(nextCursor);
        hasMore = page.hasMore;
        nextCursor = page.cursor;
        const pathname = page.paths[0];
        if (pathname) {
          const match = /^personal-heads\/([a-zA-Z0-9][a-zA-Z0-9._-]{0,179})\.json$/.exec(pathname);
          if (!match) throw unavailable();
          const material = (await latest(match[1])).value.material;
          if (material) {
            const size = Buffer.byteLength(JSON.stringify(material)) + 1;
            if (bytes + size > MAX_PAGE_BYTES && materials.length) {
              nextCursor = pageStart; hasMore = true; break;
            }
            materials.push(material); bytes += size;
          }
        }
        if (!hasMore) break;
        if (!nextCursor || nextCursor === pageStart) throw unavailable();
      }
      return { materials, ...(hasMore && nextCursor ? { cursor: nextCursor } : {}), hasMore };
    }
  };
}
