from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pdfplumber


REPO_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = REPO_ROOT.parent
DEFAULT_INPUT = Path.home() / "Desktop" / "UCOURSE-CSSBB Exam Questions 1000.pdf"
DEFAULT_OUTPUT_DIR = WORKSPACE_ROOT / "private-question-bank"
QUESTION_RE = re.compile(r"(?m)^(\d{1,4})\.\s*")
OPTION_RE = re.compile(r"^([A-H])\s+(.+)$")
ANSWER_PATTERNS = [
    re.compile(
        r"\bAnswers?\s+([A-H](?:\s*(?:,|/|&|and)\s*[A-H])*)\s+(?:is|are)\s+correct\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\bAnswer\s+([A-H])\s*,?\s+is\s+(?:the\s+)?(?:official\s+)?(?:best\s+)?(?:potentially\s+)?(?:considered\s+)?(?:correct|incorrect|choice|response)(?:\s*,?\s*(?:incorrect|choice|response))*\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\bAnswer\s+([A-H])\s+is\s+the\s+closest\s+choice\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\bThe\s+(?:best\s+|correct\s+)?answer\s+is\s+([A-H])\b",
        re.IGNORECASE,
    ),
]
REFERENCE_RE = re.compile(r"\bReference:\s*(.+)$", re.IGNORECASE | re.DOTALL)
PAGE_MARKER_RE = re.compile(r"\[\[PDF_PAGE:(\d+)\]\]")
HEADER_RE = re.compile(r"第\s*\d+\s*页\s*共\s*\d+\s*页")


@dataclass
class ParsedQuestion:
    question_id: str
    source_page: int
    stem: str
    options: list[dict[str, str]]
    correct_answer: list[str]
    explanation: str
    source_ref: str
    needs_review: bool
    review_reasons: list[str]


def clean_line(line: str) -> str:
    line = re.sub(r"\s+", " ", line).strip()
    line = line.replace("\u2013", "-").replace("\u2014", "-")
    return line


def should_skip_line(line: str) -> bool:
    if not line:
        return True
    if HEADER_RE.search(line):
        return True
    return "CSSBB Electronic Exam CD Bank(1000).doc" in line


def extract_pdf_text(input_pdf: Path) -> str:
    chunks: list[str] = []
    with pdfplumber.open(input_pdf) as pdf:
        for page_number, page in enumerate(pdf.pages, start=1):
            text = page.extract_text(x_tolerance=1, y_tolerance=3) or ""
            lines = [clean_line(line) for line in text.splitlines()]
            lines = [line for line in lines if not should_skip_line(line)]
            if not lines:
                continue
            chunks.append(f"[[PDF_PAGE:{page_number}]]")
            chunks.extend(lines)
    return "\n".join(chunks)


def normalize_answer(raw: str) -> list[str]:
    parts = re.split(r"\s*(?:,|/|&|and)\s*", raw.upper())
    return [part.strip() for part in parts if re.fullmatch(r"[A-H]", part.strip())]


def split_questions(text: str) -> list[tuple[int, str]]:
    raw_matches = list(QUESTION_RE.finditer(text))
    matches = []
    expected = 1
    for match in raw_matches:
        number = int(match.group(1))
        if number != expected:
            continue
        matches.append(match)
        expected += 1
        if expected > 1000:
            break

    items: list[tuple[int, str]] = []
    for index, match in enumerate(matches):
        number = int(match.group(1))
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        body = text[start:end].strip()
        prior_markers = PAGE_MARKER_RE.findall(text[: match.start()])
        if prior_markers:
            body = f"[[PDF_PAGE:{prior_markers[-1]}]]\n{body}"
        items.append((number, body))
    return items


def source_page_for_body(body: str) -> int:
    markers = PAGE_MARKER_RE.findall(body)
    return int(markers[0]) if markers else 0


def strip_markers(text: str) -> str:
    return PAGE_MARKER_RE.sub("", text).strip()


def parse_reference(text: str) -> tuple[str, str]:
    match = REFERENCE_RE.search(text)
    if not match:
        return "", text.strip()
    source_ref = clean_line(match.group(1))
    without_reference = text[: match.start()].strip()
    return source_ref, without_reference


def parse_answer(text: str) -> tuple[list[str], str, str]:
    matches = []
    for pattern in ANSWER_PATTERNS:
        matches.extend(pattern.finditer(text))
    if not matches:
        return [], text.strip(), ""
    match = max(matches, key=lambda item: item.start())
    answers = normalize_answer(match.group(1))
    return answers, text[: match.start()].strip(), text[match.end():].strip()


def parse_stem_options_explanation(text_before_answer: str) -> tuple[str, list[dict[str, str]], str, list[str]]:
    lines = [clean_line(line) for line in text_before_answer.splitlines() if clean_line(line)]
    option_candidates = [
        (index, match.group(1).upper(), match.group(2).strip())
        for index, line in enumerate(lines)
        if (match := OPTION_RE.match(line))
    ]
    first_option_index: int | None = None
    for candidate_index, (line_index, label, _text) in enumerate(option_candidates):
        next_label = option_candidates[candidate_index + 1][1] if candidate_index + 1 < len(option_candidates) else ""
        if label == "A" and next_label == "B":
            first_option_index = line_index
            break

    if first_option_index is None:
        return " ".join(lines).strip(), [], "", ["options-not-detected"]

    stem_lines: list[str] = lines[:first_option_index]
    options: list[dict[str, str]] = []
    explanation_lines: list[str] = []
    current: dict[str, str] | None = None
    in_explanation = False
    reasons: list[str] = []

    for line in lines[first_option_index:]:
        option_match = OPTION_RE.match(line)
        if option_match and not in_explanation:
            current = {"id": option_match.group(1).upper(), "en": option_match.group(2).strip(), "zh": ""}
            options.append(current)
            continue

        if current and current["id"] in {"D", "E", "F", "G", "H"}:
            in_explanation = True

        if in_explanation:
            explanation_lines.append(line)
        elif current:
            current["en"] = f"{current['en']} {line}".strip()

    if len(options) < 2:
        reasons.append("options-not-detected")

    stem = " ".join(stem_lines).strip()
    explanation = " ".join(explanation_lines).strip()
    return stem, options, explanation, reasons


def domain_from_reference(source_ref: str) -> tuple[str, str]:
    match = re.search(r"Section\s+([IVXLCDM]+)", source_ref, re.IGNORECASE)
    if not match:
        return "Unmapped", "unmapped"
    section = match.group(1).upper()
    section_to_domain = {
        "II": "Define",
        "III": "Define",
        "IV": "Measure",
        "V": "Measure",
        "VI": "Analyze",
        "VII": "Analyze",
        "VIII": "Improve",
        "IX": "Control",
        "X": "Control",
        "XI": "Statistics",
        "XII": "Capability",
        "XIII": "Reliability",
        "XIV": "Design for Six Sigma",
        "XV": "Lean"
    }
    return section_to_domain.get(section, f"Section {section}"), f"section-{section.lower()}"


def parse_question(number: int, body: str) -> ParsedQuestion:
    source_page = source_page_for_body(body)
    body = strip_markers(body)
    source_ref, without_reference = parse_reference(body)
    correct_answer, before_answer, after_answer = parse_answer(without_reference)
    stem, options, explanation, reasons = parse_stem_options_explanation(before_answer)
    if after_answer:
        explanation = " ".join(part for part in [explanation, clean_line(after_answer)] if part).strip()

    if not stem:
        reasons.append("stem-not-detected")
    if not correct_answer:
        reasons.append("answer-not-detected")
    if not explanation:
        reasons.append("explanation-not-detected")
    return ParsedQuestion(
        question_id=f"ucourse-cssbb-{number:04d}",
        source_page=source_page,
        stem=stem,
        options=options,
        correct_answer=correct_answer,
        explanation=explanation,
        source_ref=source_ref or f"UCOURSE CSSBB private PDF page {source_page}",
        needs_review=bool(reasons),
        review_reasons=reasons,
    )


def question_to_schema(item: ParsedQuestion) -> dict[str, Any]:
    domain, chapter_id = domain_from_reference(item.source_ref)
    question_type = "multiple" if len(item.correct_answer) > 1 else "single"
    return {
        "questionId": item.question_id,
        "examId": "ucourse-cssbb-1000",
        "sourceType": "user-private",
        "domain": domain,
        "chapterId": chapter_id,
        "page": item.source_page,
        "difficulty": "medium",
        "questionType": question_type,
        "stem": {"en": item.stem, "zh": ""},
        "options": item.options,
        "correctAnswer": item.correct_answer,
        "explanation": {"en": item.explanation or "待补充精讲", "zh": ""},
        "tags": [domain, chapter_id, "ucourse-private"],
        "sourceRef": item.source_ref,
        "reviewStats": {
            "seenCount": 0,
            "correctCount": 0,
            "wrongCount": 0,
            "unknownCount": 0,
        },
        "needsReview": item.needs_review,
    }


def write_report(path: Path, input_pdf: Path, output_json: Path, parsed: list[ParsedQuestion]) -> None:
    needs_review = [item for item in parsed if item.needs_review]
    missing_explanations = [item.question_id for item in parsed if "explanation-not-detected" in item.review_reasons]
    missing_answers = [item.question_id for item in parsed if "answer-not-detected" in item.review_reasons]
    option_issues = [item.question_id for item in parsed if "options-not-detected" in item.review_reasons]
    lines = [
        "# UCOURSE CSSBB Private Import Report",
        "",
        f"- Input PDF: `{input_pdf}`",
        f"- Output JSON: `{output_json}`",
        f"- Imported at: `{datetime.now(timezone.utc).isoformat()}`",
        f"- Parsed questions: {len(parsed)}",
        f"- Questions marked `needsReview`: {len(needs_review)}",
        f"- Missing answers: {len(missing_answers)}",
        f"- Missing explanations: {len(missing_explanations)}",
        f"- Option parsing issues: {len(option_issues)}",
        "",
        "## Review Queues",
        "",
        f"- Missing answers: {', '.join(missing_answers[:80]) if missing_answers else 'none'}",
        f"- Missing explanations: {', '.join(missing_explanations[:80]) if missing_explanations else 'none'}",
        f"- Option parsing issues: {', '.join(option_issues[:80]) if option_issues else 'none'}",
        "",
        "The generated JSON is private local study data. Do not commit it to the public repository.",
    ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Import the local UCOURSE CSSBB PDF into a private question-bank JSON.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    args = parser.parse_args()

    input_pdf = args.input
    if not input_pdf.exists():
        raise SystemExit(f"input PDF not found: {input_pdf}")

    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    output_json = output_dir / "ucourse-cssbb-1000.private.json"
    report_path = output_dir / "IMPORT_REPORT.md"

    text = extract_pdf_text(input_pdf)
    parsed = [parse_question(number, body) for number, body in split_questions(text)]
    questions = [question_to_schema(item) for item in parsed]
    payload = {
        "schemaVersion": "1.0.0",
        "bankId": "ucourse-cssbb-1000-private",
        "title": {
            "en": "UCOURSE CSSBB Exam Questions 1000",
            "zh": ""
        },
        "sourceType": "user-private",
        "importedAt": datetime.now(timezone.utc).isoformat(),
        "questions": questions,
    }

    output_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    write_report(report_path, input_pdf, output_json, parsed)

    needs_review = sum(1 for item in parsed if item.needs_review)
    print(json.dumps({
        "ok": True,
        "questions": len(questions),
        "needsReview": needs_review,
        "output": str(output_json),
        "report": str(report_path)
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
