import { createHash } from "node:crypto";

export const MAX_BODY_BYTES = 3_500_000;
export const MAX_PAGE_BYTES = 3_600_000;
const cardFields = ["sourceSentence", "contextMeaning", "usageTip", "exampleZh"];
export class ApiError extends Error {
  constructor(status, code, message, material) {
    super(message); this.status = status; this.code = code; this.material = material;
  }
}
export function object(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError(400, "invalid_material", "学习数据格式不正确。");
  return value;
}
function text(value, max, nonempty = false) {
  if (typeof value !== "string" || value.length > max || (nonempty && !value.trim())) {
    throw new ApiError(400, "invalid_material", "学习内容字段类型或长度无效。");
  }
  return value;
}
export function identifier(value) {
  const id = text(value, 180, true);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id)) throw new ApiError(400, "invalid_id", "素材标识无效。");
  return id;
}
function date(value) {
  const input = text(value, 50, true);
  if (!Number.isFinite(Date.parse(input))) throw new ApiError(400, "invalid_material", "记录日期无效。");
  return new Date(input).toISOString();
}
function choice(value, options) {
  if (!options.includes(value)) throw new ApiError(400, "invalid_material", "素材分类、类型或来源无效。");
  return value;
}

// Keep normalization and field limits aligned with personalLibrary.ts. Extra
// transport fields (for example baseRevision) are not persisted in the material.
export function validatePersonalMaterial(value) {
  const item = object(value);
  if (!Number.isSafeInteger(item.revision) || item.revision < 1) throw new ApiError(400, "invalid_revision", "素材版本必须为正整数。");
  if (!Array.isArray(item.terms) || item.terms.length > 2000) throw new ApiError(400, "invalid_material", "词汇列表无效。");
  const textEn = text(item.textEn, 500_000);
  const textZh = text(item.textZh, 500_000);
  if (!textEn.trim() && !textZh.trim()) throw new ApiError(400, "invalid_material", "素材必须包含中文或英文内容。");
  return {
    id: identifier(item.id), title: text(item.title, 500, true),
    category: choice(item.category, ["interview", "ielts", "work", "general"]),
    kind: choice(item.kind, ["article", "expression", "memo"]), textEn, textZh,
    terms: item.terms.map((value) => {
      const term = object(value);
      return { term: text(term.term, 200, true), meaningZh: text(term.meaningZh, 2000, true),
        ...(term.exampleEn === undefined ? {} : { exampleEn: text(term.exampleEn, 5000) }),
        ...(term.sourceSentence === undefined ? {} : { sourceSentence: text(term.sourceSentence, 5000) }),
        ...(term.contextMeaning === undefined ? {} : { contextMeaning: text(term.contextMeaning, 2000) }),
        ...(term.usageTip === undefined ? {} : { usageTip: text(term.usageTip, 5000) }),
        ...(term.exampleZh === undefined ? {} : { exampleZh: text(term.exampleZh, 5000) }) };
    }),
    summary: text(item.summary, 20_000), createdAt: date(item.createdAt), updatedAt: date(item.updatedAt),
    revision: item.revision, source: choice(item.source, ["chat", "desktop"]),
    ...(item.deletedAt === undefined ? {} : { deletedAt: date(item.deletedAt) })
  };
}
const normalizedSource = (value) => value.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim().toLowerCase();
const termIdentity = (term) => JSON.stringify([normalizedSource(term.term), term.meaningZh, term.exampleEn]);

/**
 * 0.9 projects unknown term fields away before uploading. Preserve omitted card
 * fields from its acknowledged base when that same term and source still apply.
 * Explicit empty strings are intentional clears; removed/changed terms stay removed.
 */
export function preserveApplicableTermCards(incoming, base) {
  if (!base) return incoming;
  const unchangedOrder = incoming.terms.length === base.terms.length
    && incoming.terms.every((term, index) => termIdentity(term) === termIdentity(base.terms[index]));
  const byIdentity = new Map();
  for (const term of base.terms) {
    const key = termIdentity(term);
    byIdentity.set(key, [...(byIdentity.get(key) ?? []), term]);
  }
  const source = normalizedSource(incoming.textEn);
  const oldSource = normalizedSource(base.textEn);
  return { ...incoming, terms: incoming.terms.map((term, index) => {
    const matches = byIdentity.get(termIdentity(term)) ?? [];
    const previous = unchangedOrder ? base.terms[index] : matches.length === 1 ? matches[0] : undefined;
    if (!previous) return term;
    if (term.sourceSentence !== undefined && term.sourceSentence !== previous.sourceSentence) return term;
    const anchor = previous.sourceSentence?.trim();
    // A changed or missing source sentence must not inherit context for another use.
    if (anchor ? !source.includes(normalizedSource(anchor)) || !oldSource.includes(normalizedSource(anchor)) : source !== oldSource) return term;
    const preserved = { ...term };
    for (const field of cardFields) if (term[field] === undefined && previous[field] !== undefined) preserved[field] = previous[field];
    return preserved;
  }) };
}
export function materialDigest(material) {
  return createHash("sha256").update(JSON.stringify(validatePersonalMaterial(material))).digest("hex");
}
export function validateSubmission(value) {
  const body = object(value);
  const material = validatePersonalMaterial(body.material);
  const baseRevision = body.baseRevision === undefined ? 0 : body.baseRevision;
  if (!Number.isSafeInteger(baseRevision) || baseRevision < 0 || material.revision <= baseRevision) {
    throw new ApiError(400, "invalid_revision", "新版本必须高于最后同步版本。");
  }
  if (Buffer.byteLength(JSON.stringify(material)) > MAX_BODY_BYTES - 1024) throw new ApiError(413, "too_large", "素材太大，请拆分后同步。");
  return { material, baseRevision };
}
