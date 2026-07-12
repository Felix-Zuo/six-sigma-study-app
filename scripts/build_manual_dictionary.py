from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
from collections import defaultdict
from pathlib import Path
from typing import Any

from extract_chapter_content import CURATED_TERMS, write_json


DEFAULT_REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORKSPACE_ROOT = DEFAULT_REPO_ROOT.parent
DEFAULT_ECDICT_CSV = DEFAULT_WORKSPACE_ROOT / "sources" / "ecdict.csv"
WORD_RE = re.compile(r"[A-Za-z][A-Za-z0-9'’.-]*")
EXCHANGE_LABELS = {
    "p": "过去式",
    "d": "过去分词",
    "i": "现在分词",
    "3": "第三人称单数",
    "s": "复数",
    "r": "比较级",
    "t": "最高级",
}
POS_LABELS = {
    "n": "n. 名词",
    "v": "v. 动词",
    "vt": "vt. 及物动词",
    "vi": "vi. 不及物动词",
    "a": "adj. 形容词",
    "s": "adj. 形容词",
    "adj": "adj. 形容词",
    "r": "adv. 副词",
    "adv": "adv. 副词",
    "prep": "prep. 介词",
    "conj": "conj. 连词",
    "pron": "pron. 代词",
    "num": "num. 数词",
    "aux": "aux. 助动词",
    "int": "int. 感叹词",
}
IRREGULAR_LEMMAS = {
    "am": ["be"],
    "are": ["be"],
    "is": ["be"],
    "was": ["be"],
    "were": ["be"],
    "been": ["be"],
    "being": ["be"],
    "does": ["do"],
    "did": ["do"],
    "done": ["do"],
    "doing": ["do"],
    "has": ["have"],
    "had": ["have"],
    "having": ["have"],
    "went": ["go"],
    "gone": ["go"],
    "made": ["make"],
    "better": ["good", "well"],
    "best": ["good", "well"],
    "worse": ["bad"],
    "worst": ["bad"],
    "less": ["little"],
    "least": ["little"],
    "more": ["many", "much"],
    "most": ["many", "much"],
    "men": ["man"],
    "women": ["woman"],
    "children": ["child"],
    "people": ["person"],
    "teeth": ["tooth"],
    "feet": ["foot"],
    "criteria": ["criterion"],
    "data": ["data", "datum"],
    "analyses": ["analysis"],
    "hypotheses": ["hypothesis"],
}


def normalize_lookup_key(value: object) -> str:
    return " ".join(
        "".join(char.lower() if char.isalnum() or char == "σ" else " " for char in str(value)).split()
    )


def add_unique(items: list[str], value: str) -> None:
    normalized = normalize_lookup_key(value)
    if normalized and normalized not in items:
        items.append(normalized)


def collect_text(block: dict[str, Any]) -> str:
    if block.get("kind") == "image":
        return ""
    parts: list[str] = []
    if block.get("text"):
        parts.append(str(block["text"]))
    for row in block.get("rows", []) or []:
        parts.extend(str(cell) for cell in row)
    return " ".join(parts)


def collect_manual_forms(manual: dict[str, Any]) -> set[str]:
    forms: set[str] = set()
    for chapter in manual.get("chapters", []):
        for section in chapter.get("sections", []):
            for block in section.get("content", {}).get("en", []):
                for token in WORD_RE.findall(collect_text(block)):
                    normalized = normalize_lookup_key(token)
                    if not normalized:
                        continue
                    forms.add(normalized)
                    for part in normalized.split():
                        if part:
                            forms.add(part)
    return forms


def doubled_final_base(value: str, suffix_length: int) -> str | None:
    stem = value[:-suffix_length]
    if len(stem) >= 3 and stem[-1] == stem[-2]:
        return stem[:-1]
    return None


def lemma_candidates(form: str) -> list[str]:
    candidates: list[str] = []
    for lemma in IRREGULAR_LEMMAS.get(form, []):
        add_unique(candidates, lemma)
    if form.endswith("'s"):
        add_unique(candidates, form[:-2])
    if len(form) > 4 and form.endswith("ies"):
        add_unique(candidates, form[:-3] + "y")
    if len(form) > 5 and form.endswith("ves"):
        add_unique(candidates, form[:-3] + "f")
        add_unique(candidates, form[:-3] + "fe")
    if len(form) > 5 and form.endswith("ing"):
        add_unique(candidates, form[:-3])
        add_unique(candidates, form[:-3] + "e")
        doubled = doubled_final_base(form, 3)
        if doubled:
            add_unique(candidates, doubled)
    if len(form) > 4 and form.endswith("ied"):
        add_unique(candidates, form[:-3] + "y")
    if len(form) > 4 and form.endswith("ed"):
        add_unique(candidates, form[:-2])
        add_unique(candidates, form[:-1])
        doubled = doubled_final_base(form, 2)
        if doubled:
            add_unique(candidates, doubled)
    if len(form) > 4 and form.endswith("es"):
        add_unique(candidates, form[:-2])
        add_unique(candidates, form[:-1])
    if len(form) > 3 and form.endswith("s"):
        add_unique(candidates, form[:-1])
    add_unique(candidates, form)
    return candidates


def normalize_phonetic(value: str) -> str:
    return value.strip().replace("ә", "ə").replace("є", "ɛ").replace("'", "ˈ")


def clean_translation(value: str) -> str:
    senses: list[str] = []
    for line in value.replace("\\n", "\n").splitlines():
        text = " ".join(line.split())
        if not text or text.startswith("[网络]") or text.startswith("[例句]"):
            continue
        match = re.match(r"^((?:n|v|vt|vi|a|s|adj|r|adv|prep|conj|pron|num|aux|int)\.)\s*(.*)$", text, re.I)
        prefix = match.group(1).lower() if match else ""
        body = match.group(2) if match else text
        pieces = [piece.strip() for piece in re.split(r"[;,，；]+", body) if piece.strip()]
        if not pieces:
            continue
        if prefix:
            normalized_prefix = {"a.": "adj.", "s.": "adj.", "r.": "adv."}.get(prefix, prefix)
            pieces[0] = f"{normalized_prefix} {pieces[0]}"
        for piece in pieces:
            if piece not in senses:
                senses.append(piece)
    return "；".join(senses)[:420].rstrip("；,， ")


def clean_definition(value: str) -> str:
    lines = []
    for line in value.replace("\\n", "\n").splitlines():
        text = " ".join(line.split())
        if text:
            lines.append(text)
        if len(lines) >= 3:
            break
    return "；".join(lines)[:320].rstrip("；,， ")


def parse_exchange(exchange: str) -> dict[str, list[str]]:
    parsed: dict[str, list[str]] = defaultdict(list)
    for item in exchange.split("/"):
        if ":" not in item:
            continue
        code, values = item.split(":", 1)
        if code not in EXCHANGE_LABELS:
            continue
        for raw_value in re.split(r"[,|]", values):
            normalized = normalize_lookup_key(raw_value)
            if normalized and not normalized.isdigit() and normalized not in parsed[code]:
                parsed[code].append(normalized)
    return dict(parsed)


def derive_part_of_speech(row: dict[str, str]) -> str:
    raw = row.get("pos", "").strip()
    codes: list[str] = []
    for source in [raw, row.get("translation", ""), row.get("definition", "")]:
        for code in re.findall(r"(?:^|\\n)(n|v|vt|vi|a|s|adj|r|adv|prep|conj|pron|num|aux|int)\.", source, re.I):
            normalized = code.lower()
            if normalized not in codes:
                codes.append(normalized)
    labels = [POS_LABELS[code] for code in codes if code in POS_LABELS]
    return " / ".join(labels) or raw or "词"


def exchange_notes(exchange: dict[str, list[str]]) -> list[str]:
    notes: list[str] = []
    for code, values in exchange.items():
        shown = "、".join(values[:6])
        if shown:
            notes.append(f"{EXCHANGE_LABELS[code]}：{shown}")
    return notes


def merge_translations(primary: str, secondary: str) -> str:
    merged: list[str] = []
    for value in [primary, secondary]:
        for sense in value.split("；"):
            clean = sense.strip()
            comparable = re.sub(r"^(?:n|v|vt|vi|adj|adv|prep|conj|pron|num|aux|int)\.\s*", "", clean, flags=re.I)
            if clean and not any(
                comparable == re.sub(r"^(?:n|v|vt|vi|adj|adv|prep|conj|pron|num|aux|int)\.\s*", "", item, flags=re.I)
                for item in merged
            ):
                merged.append(clean)
    return "；".join(merged)[:420]


def load_ecdict_rows(path: Path) -> dict[str, dict[str, str]]:
    rows: dict[str, dict[str, str]] = {}
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            key = normalize_lookup_key(row.get("word", ""))
            if not key or key in rows or not clean_translation(row.get("translation", "")):
                continue
            rows[key] = row
    return rows


def curated_entries() -> list[dict[str, Any]]:
    return [dict(entry) for entry in CURATED_TERMS]


def used_lookup_keys(entries: list[dict[str, Any]]) -> set[str]:
    used: set[str] = set()
    for entry in entries:
        used.add(normalize_lookup_key(entry["term"]))
        for key in entry.get("lookupKeys", []):
            used.add(normalize_lookup_key(key))
    return {key for key in used if key}


def ecdict_entry(row: dict[str, str], forms: set[str], used_keys: set[str]) -> dict[str, Any] | None:
    term = normalize_lookup_key(row.get("word", ""))
    if not term or term in used_keys:
        return None
    translation = clean_translation(row.get("translation", ""))
    if not translation:
        return None

    lookup_keys: list[str] = []
    add_unique(lookup_keys, term)
    for form in sorted(forms):
        add_unique(lookup_keys, form)

    exchange = parse_exchange(row.get("exchange", ""))
    for values in exchange.values():
        for value in values:
            if value in forms or value not in used_keys:
                add_unique(lookup_keys, value)

    lookup_keys = [key for key in lookup_keys if key not in used_keys or key == term]
    if not lookup_keys:
        return None

    phonetic = normalize_phonetic(row.get("phonetic", ""))
    form_notes = exchange_notes(exchange)
    definition = clean_definition(row.get("definition", ""))
    part_of_speech = derive_part_of_speech(row)
    entry: dict[str, Any] = {
        "term": row.get("word", "").strip() or term,
        "translation": translation,
        "partOfSpeech": part_of_speech,
        "lookupKeys": lookup_keys,
        "wordRoot": term,
        "wordForms": form_notes,
        "englishDefinition": definition,
        "explanation": "本地离线学习词典条目；多义词请结合下方的当前语境义理解。",
        "source": "ECDICT",
    }
    if phonetic:
        entry["phonetic"] = phonetic
    return entry


def collect_question_forms(path: Path) -> set[str]:
    if not path.exists():
        return set()
    payload = json.loads(path.read_text(encoding="utf-8"))
    forms: set[str] = set()
    for question in payload.get("questions", []):
        texts = [question.get("stem", {}).get("en", ""), question.get("explanation", {}).get("en", "")]
        texts.extend(option.get("en", "") for option in question.get("options", []))
        for text in texts:
            for token in WORD_RE.findall(str(text)):
                normalized = normalize_lookup_key(token)
                if normalized:
                    forms.add(normalized)
    return forms


def collect_public_question_ts_forms(path: Path) -> set[str]:
    if not path.exists():
        return set()
    forms: set[str] = set()
    source = path.read_text(encoding="utf-8")
    for match in re.finditer(r'\ben:\s*"((?:[^"\\]|\\.)*)"', source):
        try:
            text = json.loads(f'"{match.group(1)}"')
        except json.JSONDecodeError:
            continue
        for token in WORD_RE.findall(text):
            normalized = normalize_lookup_key(token)
            if normalized:
                forms.add(normalized)
    return forms


def enrich_curated_entries(entries: list[dict[str, Any]], rows: dict[str, dict[str, str]]) -> None:
    for entry in entries:
        term = normalize_lookup_key(entry["term"])
        row = rows.get(term)
        entry.setdefault("wordRoot", term)
        entry.setdefault("wordForms", [])
        entry.setdefault("englishDefinition", "")
        if not row:
            continue
        general_translation = clean_translation(row.get("translation", ""))
        if general_translation:
            entry["translation"] = merge_translations(str(entry["translation"]), general_translation)
        phonetic = normalize_phonetic(row.get("phonetic", ""))
        if phonetic:
            entry.setdefault("phonetic", phonetic)
        entry["wordForms"] = exchange_notes(parse_exchange(row.get("exchange", "")))
        entry["englishDefinition"] = clean_definition(row.get("definition", ""))
        if not entry.get("partOfSpeech") or entry.get("partOfSpeech") in {"word", "term"}:
            entry["partOfSpeech"] = derive_part_of_speech(row)


def release_generic_aliases(entries: list[dict[str, Any]], rows: dict[str, dict[str, str]]) -> None:
    for entry in entries:
        own_term = normalize_lookup_key(entry["term"])
        entry["lookupKeys"] = [
            key
            for key in entry.get("lookupKeys", [])
            if normalize_lookup_key(key) == own_term or normalize_lookup_key(key) not in rows
        ]
        if own_term not in {normalize_lookup_key(key) for key in entry["lookupKeys"]}:
            entry["lookupKeys"].insert(0, own_term)


def build_dictionary(manual: dict[str, Any], ecdict_csv: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    manual_forms = collect_manual_forms(manual)
    public_question_path = DEFAULT_REPO_ROOT / "samples" / "question-bank" / "public-sample.questions.json"
    manual_forms.update(collect_question_forms(public_question_path))
    public_question_ts_path = DEFAULT_REPO_ROOT / "apps" / "reader" / "src" / "data" / "publicQuestionBank.ts"
    manual_forms.update(collect_public_question_ts_forms(public_question_ts_path))
    rows = load_ecdict_rows(ecdict_csv)
    selected_forms: dict[str, set[str]] = defaultdict(set)

    for form in sorted(manual_forms):
        for candidate in lemma_candidates(form):
            if candidate in rows:
                selected_forms[candidate].add(form)
                break

    entries = curated_entries()
    enrich_curated_entries(entries, rows)
    release_generic_aliases(entries, rows)
    used = used_lookup_keys(entries)
    added = 0
    skipped_for_duplicates = 0
    for word in sorted(selected_forms):
        entry = ecdict_entry(rows[word], selected_forms[word], used)
        if not entry:
            skipped_for_duplicates += 1
            continue
        entry_keys = {normalize_lookup_key(entry["term"]), *(normalize_lookup_key(key) for key in entry["lookupKeys"])}
        used.update(key for key in entry_keys if key)
        entries.append(entry)
        added += 1

    covered_forms = {
        form
        for form in manual_forms
        if any(candidate in selected_forms for candidate in lemma_candidates(form)) or form in used
    }
    single_forms = {form for form in manual_forms if " " not in form and not form.isdigit()}
    covered_single_forms = covered_forms & single_forms
    stats = {
        "manualForms": len(manual_forms),
        "coveredManualForms": len(covered_forms),
        "uncoveredManualForms": len(manual_forms - covered_forms),
        "singleWordForms": len(single_forms),
        "coveredSingleWordForms": len(covered_single_forms),
        "uncoveredSingleWordForms": len(single_forms - covered_single_forms),
        "curatedEntries": len(CURATED_TERMS),
        "ecdictEntries": added,
        "totalEntries": len(entries),
        "skippedDuplicateRows": skipped_for_duplicates,
        "uncoveredSample": sorted(manual_forms - covered_forms)[:80],
    }
    return entries, stats


def write_dictionary_outputs(repo_root: Path, dictionary: list[dict[str, Any]]) -> None:
    processed_dir = repo_root / "content" / "processed"
    dictionary_path = processed_dir / "dictionary" / "six-sigma-terms.json"
    manual_path = processed_dir / "manual.json"
    public_manual_path = repo_root / "apps" / "reader" / "public" / "content" / "manual.json"
    generated_path = repo_root / "apps" / "reader" / "src" / "generated" / "six-sigma-terms.json"

    manual = json.loads(manual_path.read_text(encoding="utf-8"))
    manual["dictionary"] = dictionary
    write_json(dictionary_path, dictionary)
    write_json(manual_path, manual)
    shutil.copyfile(manual_path, public_manual_path)
    shutil.copyfile(dictionary_path, generated_path)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the manual-scoped offline English-Chinese dictionary.")
    parser.add_argument("--repo-root", type=Path, default=DEFAULT_REPO_ROOT)
    parser.add_argument("--ecdict-csv", type=Path, default=DEFAULT_ECDICT_CSV)
    args = parser.parse_args()

    manual_path = args.repo_root / "content" / "processed" / "manual.json"
    if not manual_path.exists():
        raise SystemExit(f"manual JSON not found: {manual_path}")
    if not args.ecdict_csv.exists():
        raise SystemExit(f"ECDICT CSV not found: {args.ecdict_csv}")

    manual = json.loads(manual_path.read_text(encoding="utf-8"))
    dictionary, stats = build_dictionary(manual, args.ecdict_csv)
    write_dictionary_outputs(args.repo_root, dictionary)
    print(json.dumps(stats, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
