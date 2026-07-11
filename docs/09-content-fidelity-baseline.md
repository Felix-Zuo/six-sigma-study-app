# Content Fidelity Baseline

This document records the first repeatable content-fidelity baseline for the
Six Sigma manual package (`content/processed/manual.json`) and explains the
audit tool behind it. It exists so the upcoming full content re-review can
start from measured facts instead of impressions, and so progress can be
tracked chapter by chapter.

Everything the audit reports is a **heuristic candidate**. No finding in this
document or in the tool output is a confirmed translation or extraction error
until a human has compared it against the source manual.

## How to Run

```powershell
npm run qa:content-fidelity
```

Options (direct invocation):

```powershell
python scripts/qa_content_fidelity.py --max-list 30
python scripts/qa_content_fidelity.py --json qa/content-fidelity-report.json
python scripts/qa_content_fidelity.py --manual path/to/manual.json
```

The script is read-only. It never modifies content, and it only writes a file
when `--json` is passed explicitly.

## Reviewed Repair Snapshot (2026-07-11)

The initial baseline below is retained as historical evidence. The current
reviewed package has now completed the high-confidence repair pass:

| Metric | EN | ZH |
| --- | ---: | ---: |
| Total blocks | 4351 | 4643 |
| Semantic tables | 31 | 31 |
| Image blocks | 476 | 476 |

- P0 candidates: **0**
- P1 candidates: **0**
- flattened-table candidates: **0** after source-PDF review
- table-count divergence: **0**
- image-count divergence: **0**
- remaining P2 heuristic candidates: **31**, consisting of 22 number/symbol
  formatting comparisons and 9 URL/formula/product-name residue warnings

The three numeric sequences left by the heuristic were manually checked
against the source and recorded in
`content/overrides/content-fidelity-dispositions.json`: they are calculation
steps or coordinate examples, not tables.

Human-reviewed corrections are durable inputs under `content/overrides/`.
Run `npm run apply:content-overrides` after extraction. The reviewed recovery
includes semantic tables, original chart/report crops, bilingual image parity,
source-reference translation fixes, and explicit `preserveOriginal` markers
for source tables intentionally retained in English.

Mobile visual evidence is produced by:

```powershell
node scripts/qa-content-fidelity-visual-cdp.mjs
```

The script verifies both languages for representative repaired content in
Chapters 5, 16, 23, 29, and 30, checks decoded images/table structure and
horizontal containment, and saves screenshots for human review.

## Exit-Code Policy

- `0` — audit completed, even when candidate findings exist. The current
  baseline is known to contain problems; the tool's job right now is to
  measure them, not to gate on them.
- `1` — structural failure only: `manual.json` missing or unparseable, the
  chapter set is not exactly chapters 1–33 in order, or duplicate
  section/block IDs exist.

With `--strict-reviewed`, exit code `1` also means at least one P0 or P1
candidate remains. CI runs this reviewed gate and intentionally permits the
documented P2 advisory candidates.

The command is **intentionally not wired into GitHub Actions yet**. After the
chapter-by-chapter content repair is complete, a strict gate (candidate counts
must not regress) can be enabled in CI.

## What It Checks

All checks are computed from the actual data; nothing is hardcoded.

| Check | Category | How |
| --- | --- | --- |
| Chapter completeness | structural | chapters must be exactly 1–33 in order |
| Duplicate section/block IDs | structural | global ID sets across the whole book |
| Missing page anchors, broken image refs | `structure` | per-block field checks against chapter assets and files on disk |
| Per-chapter block statistics | summary | EN/ZH counts for paragraph, heading, listItem, table, image, termNote |
| EN/ZH table & image count divergence | `table-count` / `image-count` | per-chapter count comparison |
| Flattened English tables | `table-flattening` | consecutive runs of short headings, digit-dense paragraphs, and repeated column-name texts (one short non-matching block tolerated per run) |
| Number/symbol divergence | `symbols` | per-section EN/ZH comparison of number-token multisets and `%`, currency, `σ` counts |
| Untranslated / residue candidates | `translation` | ZH blocks with no CJK characters or a high Latin-letter ratio; EN blocks containing CJK |

Priorities:

- **P0** — a flattened English table run in a section where the Chinese side
  kept a semantic `table` block on the same page(s), plus hard structural
  problems (missing page anchor, broken image reference). These are the
  highest-confidence shape divergences.
- **P1** — strong candidates: table-flattening runs with repeated column
  headers or multiple numeric rows, chapter-level table/image count
  divergence, ZH blocks with no Chinese characters at all, severe symbol
  divergence.
- **P2** — weaker heuristics: moderate symbol/number divergence, partial
  English residue in ZH blocks, low-signal flattening runs.

## Baseline Snapshot (2026-07-11, manual.json version 0.2.0)

Global statistics:

| Metric | EN | ZH |
| --- | --- | --- |
| Total blocks | 4640 | 4902 |
| paragraph | 3116 | 2940 |
| heading | 513 | 676 |
| listItem | 540 | 533 |
| table | **0** | 5 |
| image | 471 | 469 |
| termNote | 0 | 279 |

33 chapters, 174 sections, pages 6–449. The single most important structural
fact in this baseline: **the English stream contains zero semantic `table`
blocks** — every English table in the book is currently either an image or a
flattened heading/paragraph sequence.

Candidate findings: **74 total — P0 = 3, P1 = 28, P2 = 43.**

| Category | Count |
| --- | --- |
| table-flattening | 37 |
| symbols | 23 |
| translation | 12 |
| table-count | 1 |
| image-count | 1 |
| structure | 0 |

### P0 candidates (all in Chapter 1)

1. `real-world-examples` blocks `en-006..en-013`, page 7 — the
   "Cost of Amazon Order Errors, 5σ/6σ" tables flattened into
   paragraph/heading fragments with repeated column names
   ("Total Orders", "Errors Average Cost per Error Total Cost of Errors"),
   while the Chinese side keeps semantic `table` blocks on the same page.
2. `real-world-examples` blocks `en-016..en-027`, page 7 — the sigma-level
   cost table ("Sigma Level / Defects per Million Opportunities / …")
   flattened into 12 blocks.
3. `calculating-sigma-level` blocks `en-008..en-014`, page 8 — the
   "Yield % / DPMO / Sigma Level" table flattened into 7 blocks.

### Other notable P1 candidates

- Chapter 1: table blocks EN=0 vs ZH=5; image blocks EN=2 vs ZH=0 (the
  hand-built Chinese Chapter 1 replaced images/tables differently from the
  English stream).
- Chapters 14–17, 21, 23, 26–27, 29–30: flattened-table runs with numeric
  rows and repeated headers (cost-benefit tables, control plans, X-bar data
  sets, hypothesis-test tables, etc.).
- Chapter 1 `chapter-sources`, Chapter 8, Chapter 21: ZH blocks with no
  Chinese characters (mostly source-citation URLs and formula lines — likely
  acceptable, but must be dispositioned explicitly).
- Chapter 1 `real-world-examples`: σ symbol count EN=2 vs ZH=8.

### Per-chapter candidate counts (P0/P1/P2)

| Chapter | Candidates | Chapter | Candidates | Chapter | Candidates |
| --- | --- | --- | --- | --- | --- |
| ch01 | 3/7/0 | ch12 | 0/0/1 | ch23 | 0/1/3 |
| ch02 | 0/0/2 | ch13 | 0/0/1 | ch24 | 0/0/0 |
| ch03 | 0/0/1 | ch14 | 0/1/1 | ch25 | 0/0/0 |
| ch04 | 0/0/1 | ch15 | 0/1/2 | ch26 | 0/2/3 |
| ch05 | 0/0/2 | ch16 | 0/2/1 | ch27 | 0/1/0 |
| ch06 | 0/0/1 | ch17 | 0/1/0 | ch28 | 0/0/1 |
| ch07 | 0/0/0 | ch18 | 0/0/4 | ch29 | 0/4/7 |
| ch08 | 0/1/1 | ch19 | 0/0/2 | ch30 | 0/3/1 |
| ch09 | 0/0/1 | ch20 | 0/0/1 | ch31 | 0/0/0 |
| ch10 | 0/0/1 | ch21 | 0/4/2 | ch32 | 0/0/1 |
| ch11 | 0/0/0 | ch22 | 0/0/2 | ch33 | 0/0/0 |

## Suggested Repair Order

Severity score = 10·P0 + 3·P1 + 1·P2 per chapter:

1. **ch01** (51) — all three P0 flattened tables, table/image divergence, σ divergence
2. **ch29** (19) — design-of-experiments numeric tables and symbol divergence
3. **ch21** (14) — hypothesis-test tables and formula-line residue
4. **ch30** (10)
5. **ch26** (9)
6. **ch16** (7)
7. **ch23** (6)
8. **ch15** (5)
9. **ch08**, **ch14** (4 each)

Then the remaining chapters in descending score order: ch18, ch17, ch27,
ch02, ch05, ch19, ch22, ch03, ch04, ch06, ch09, ch10, ch12, ch13, ch20,
ch28, ch32. Chapters with score 0 (ch07, ch11, ch24, ch25, ch31, ch33)
still need the human review pass, just with no machine-flagged candidates.

## Human Review Requirements

Each candidate must be dispositioned by a person against the source manual:

- **table-flattening** — decide whether to rebuild as a semantic `table`
  block, keep as an image, or accept the current text form. The extraction
  pipeline note in `docs/03-content-pipeline.md` ("English table recovery
  needs special handling") is the upstream cause.
- **symbols** — Chinese translations legitimately reformat numbers
  (e.g. "51.4 million" vs "5,140 万", "$" vs "美元"), so a divergence is not
  automatically an error; check meaning, not formatting.
- **translation** — citation URLs and formula lines flagged as "no Chinese
  characters" may be intentionally untranslated; record the decision.
- **image-count / table-count** — confirm which representation is correct on
  each side before regenerating content.

## Relationship to Existing Gates

`npm run lint:content` (structural validity) and
`npm run qa:source-coverage` (source alignment) remain the hard gates. This
audit adds the fidelity dimension neither of them measures: whether the two
language streams represent the same content in the same shape. After content
repair, re-run `npm run qa:content-fidelity` and update this snapshot so the
baseline always reflects the committed data.
