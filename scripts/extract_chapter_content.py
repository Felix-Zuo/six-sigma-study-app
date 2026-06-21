from __future__ import annotations

import argparse
import json
import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from docx import Document
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph


DEFAULT_EN_DOCX = Path(r"C:\findjob_sixsigma_sources\manual_en_aligned.docx")
DEFAULT_ZH_DOCX = Path(r"C:\findjob_sixsigma_sources\manual_zh_aligned.docx")
DEFAULT_REPO_ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class SectionDef:
    section_id: str
    en_title: str
    zh_title: str
    page: int
    level: int


SECTION_DEFS: list[SectionDef] = [
    SectionDef("ch01-overview", "Chapter 1: What is Six Sigma?", "第一章：什么是六西格玛？", 6, 1),
    SectionDef("data-driven-processes", "Data Driven Processes and Decisions", "数据驱动的流程与决策", 6, 2),
    SectionDef("decision-without-six-sigma", "Decision Making Without Six Sigma", "没有六西格玛时的决策", 6, 3),
    SectionDef("decision-with-six-sigma", "Decision Making With Six Sigma", "使用六西格玛时的决策", 6, 3),
    SectionDef("defining-6-sigma", "Defining 6σ", "定义 6σ", 7, 2),
    SectionDef("real-world-examples", "Real World Examples", "现实案例", 7, 3),
    SectionDef("calculating-sigma-level", "Calculating Sigma Level", "计算西格玛水平", 8, 2),
    SectionDef("sigma-level-not-final", "Sigma Level Is Not a Final Indicator", "西格玛水平不是最终指标", 9, 2),
    SectionDef("common-six-sigma-principles", "Common Six Sigma Principles", "常见六西格玛原则", 10, 2),
    SectionDef("customer-focused-improvement", "Customer-Focused Improvement", "以客户为中心的改进", 10, 3),
    SectionDef("value-streams", "Value Streams", "价值流", 10, 3),
    SectionDef("continuous-process-improvement", "Continuous Process Improvement", "持续流程改进", 11, 3),
    SectionDef("variation", "Variation", "变异", 11, 3),
    SectionDef("removing-waste", "Removing Waste", "消除浪费", 11, 3),
    SectionDef("equipping-people", "Equipping People", "赋能人员", 11, 3),
    SectionDef("controlling-the-process", "Controlling the Process", "控制流程", 11, 3),
    SectionDef("challenges-of-six-sigma", "Challenges of Six Sigma", "六西格玛的挑战", 12, 2),
    SectionDef("lack-of-support", "Lack of Support", "缺乏支持", 12, 3),
    SectionDef("lack-of-resources", "Lack of Resources or Knowledge", "缺乏资源或知识", 13, 3),
    SectionDef("poor-project-execution", "Poor Project Execution", "项目执行不佳", 13, 3),
    SectionDef("data-access-issues", "Data Access Issues", "数据访问问题", 13, 3),
    SectionDef(
        "industry-concerns",
        "Concerns about Using Six Sigma in a Specific Industry",
        "对特定行业使用六西格玛的顾虑",
        13,
        3,
    ),
    SectionDef("chapter-sources", "Chapter Sources", "本章资料来源", 13, 2),
]


CURATED_TERMS: list[dict[str, Any]] = [
    {
        "term": "Six Sigma",
        "translation": "六西格玛",
        "partOfSpeech": "term",
        "isSixSigmaTerm": True,
        "lookupKeys": ["six", "six sigma", "6σ"],
        "explanation": "一套以数据为基础的流程改进方法，也是一种统计质量目标；核心是减少变异、缺陷、返工和客户不满意。",
    },
    {
        "term": "Sigma",
        "translation": "西格玛",
        "partOfSpeech": "noun",
        "isSixSigmaTerm": True,
        "lookupKeys": ["sigma", "σ"],
        "explanation": "统计学中常用来表示标准差。六西格玛语境中，它常用于表达流程波动水平和质量表现。",
    },
    {
        "term": "sigma level",
        "translation": "西格玛水平",
        "partOfSpeech": "term",
        "isSixSigmaTerm": True,
        "lookupKeys": ["level", "sigma level", "sigma levels"],
        "explanation": "用于概括流程质量表现的等级化指标。西格玛水平越高，通常代表缺陷机会越少、流程输出越稳定。",
    },
    {
        "term": "methodology",
        "translation": "方法论",
        "partOfSpeech": "noun",
        "lookupKeys": ["methodology", "methodologies"],
        "explanation": "一套有结构、有步骤的方法体系，不是单个技巧或工具。",
    },
    {
        "term": "process",
        "translation": "流程",
        "partOfSpeech": "noun",
        "isSixSigmaTerm": True,
        "lookupKeys": ["process", "processes"],
        "explanation": "把输入转化为输出的一系列活动。六西格玛改进通常围绕流程的测量、分析、改进和控制展开。",
    },
    {
        "term": "variation",
        "translation": "变异；波动",
        "partOfSpeech": "noun",
        "isSixSigmaTerm": True,
        "lookupKeys": ["variation"],
        "explanation": "流程输出或执行方式中的差异。变异越大，缺陷、返工和客户体验不一致的风险通常越高。",
    },
    {
        "term": "defect",
        "translation": "缺陷",
        "partOfSpeech": "noun",
        "isSixSigmaTerm": True,
        "lookupKeys": ["defect", "defects"],
        "explanation": "未满足客户需求、规格要求或流程要求的输出。",
    },
    {
        "term": "opportunity",
        "translation": "出错机会；机会",
        "partOfSpeech": "noun",
        "isSixSigmaTerm": True,
        "lookupKeys": ["opportunity", "opportunities"],
        "explanation": "一次可能发生缺陷的机会。DPMO 等指标会把缺陷数放到机会数的语境里衡量。",
    },
    {
        "term": "beta testing",
        "translation": "Beta 测试",
        "partOfSpeech": "phrase",
        "lookupKeys": ["beta", "beta testing"],
        "explanation": "在较小或较受控范围内试用新想法、产品或系统，先发现问题再扩大推广。",
    },
    {
        "term": "DPMO",
        "translation": "每百万机会缺陷数",
        "partOfSpeech": "abbreviation",
        "isSixSigmaTerm": True,
        "lookupKeys": ["dpmo", "defects per million opportunities"],
        "explanation": "Defects Per Million Opportunities，指每百万次机会中的缺陷数；数值越低，流程质量越高。",
    },
    {
        "term": "DMAIC",
        "translation": "定义、测量、分析、改进、控制",
        "partOfSpeech": "abbreviation",
        "isSixSigmaTerm": True,
        "lookupKeys": ["dmaic", "define measure analyze improve control"],
        "explanation": "六西格玛改进既有流程时常用的五阶段方法：Define、Measure、Analyze、Improve、Control。",
    },
    {
        "term": "yield",
        "translation": "良率",
        "partOfSpeech": "noun",
        "isSixSigmaTerm": True,
        "lookupKeys": ["yield"],
        "explanation": "符合要求的输出比例。第 1 章使用公式：（机会数 - 缺陷数）/ 机会数 × 100。",
    },
    {
        "term": "Voice of the Customer",
        "translation": "客户之声",
        "partOfSpeech": "term",
        "isSixSigmaTerm": True,
        "lookupKeys": ["voc", "voice of the customer", "customer"],
        "explanation": "客户需求、抱怨、期望和偏好的系统化输入，用于帮助团队确定真正重要的质量要求。",
    },
    {
        "term": "value stream",
        "translation": "价值流",
        "partOfSpeech": "term",
        "isSixSigmaTerm": True,
        "lookupKeys": ["value", "value stream", "value streams"],
        "explanation": "为了产生最终结果所需的所有活动、事项、人员和信息的序列，可用于识别浪费和改进机会。",
    },
    {
        "term": "continuous process improvement",
        "translation": "持续流程改进",
        "partOfSpeech": "phrase",
        "isSixSigmaTerm": True,
        "lookupKeys": ["continuous", "continuous process improvement", "improvement"],
        "explanation": "持续寻找并优先处理流程中的改进机会，而不是把质量改进视为一次性项目。",
    },
    {
        "term": "statistical control",
        "translation": "统计受控",
        "partOfSpeech": "term",
        "isSixSigmaTerm": True,
        "lookupKeys": ["control", "statistical control"],
        "explanation": "流程波动处于可解释、可监控的状态。六西格玛改进后需要控制机制防止流程退回旧状态。",
    },
]


def normalize_space(text: str) -> str:
    return " ".join(text.replace("\u00a0", " ").split()).strip()


def normalize_title(text: str) -> str:
    text = normalize_space(text).lower()
    text = text.replace("-", " ").replace("–", " ").replace("—", " ")
    text = text.replace("σ", "sigma")
    return re.sub(r"[^a-z0-9\u4e00-\u9fff]+", " ", text).strip()


def block_id(section_id: str, lang: str, index: int) -> str:
    return f"{section_id}-{lang}-{index:03d}"


def iter_doc_items(doc: Document) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for child in doc.element.body.iterchildren():
        if isinstance(child, CT_P):
            paragraph = Paragraph(child, doc)
            text = normalize_space(paragraph.text)
            if not text:
                continue
            style = paragraph.style.name if paragraph.style else "Normal"
            items.append({"kind": "paragraph", "style": style, "text": text})
        elif isinstance(child, CT_Tbl):
            table = Table(child, doc)
            rows = [
                [normalize_space(cell.text) for cell in row.cells]
                for row in table.rows
            ]
            rows = [row for row in rows if any(cell for cell in row)]
            if not rows:
                continue
            flat = " ".join(cell for row in rows for cell in row)
            kind = "termNote" if flat.startswith("术语说明") else "table"
            items.append({"kind": kind, "style": "Table", "rows": rows, "text": flat})
    return items


def split_english_special_item(item: dict[str, Any]) -> list[dict[str, Any]]:
    text = item.get("text", "")
    if item["kind"] != "paragraph":
        return [item]
    if text == "Defining 6σ":
        return [{"kind": "heading", "style": "Heading 2", "text": text}]
    prefix = "Value Streams The value stream "
    if text.startswith(prefix):
        paragraph = "The value stream " + text[len(prefix):]
        return [
            {"kind": "heading", "style": "Heading 2", "text": "Value Streams"},
            {"kind": "paragraph", "style": "Normal", "text": paragraph},
        ]
    return [item]


def normalize_heading_item(item: dict[str, Any], lang: str) -> list[dict[str, Any]]:
    items = split_english_special_item(item) if lang == "en" else [item]
    normalized: list[dict[str, Any]] = []
    for candidate in items:
        style = candidate.get("style", "")
        if candidate["kind"] == "paragraph" and style.startswith("Heading"):
            level = 1 if "1" in style else 2 if "2" in style else 3
            candidate = {**candidate, "kind": "heading", "level": level}
        elif candidate["kind"] == "heading":
            level = 1 if "1" in candidate.get("style", "") else 2
            candidate = {**candidate, "level": level}
        normalized.append(candidate)
    return normalized


def chapter_slice(items: list[dict[str, Any]], lang: str) -> list[dict[str, Any]]:
    if lang == "en":
        start_pattern = "Chapter 1: What is Six Sigma?"
        end_pattern = "Chapter 2:"
    else:
        start_pattern = "第一章：什么是六西格玛？"
        end_pattern = "第二章"

    start = None
    end = None
    for index, item in enumerate(items):
        text = item.get("text", "")
        if start is None and start_pattern in text:
            start = index
            continue
        if start is not None and text.startswith(end_pattern):
            end = index
            break
    if start is None or end is None:
        raise RuntimeError(f"Unable to find chapter boundaries for {lang}: start={start}, end={end}")
    sliced: list[dict[str, Any]] = []
    for item in items[start:end]:
        sliced.extend(normalize_heading_item(item, lang))
    return sliced


def build_sections(items: list[dict[str, Any]], lang: str) -> dict[str, list[dict[str, Any]]]:
    title_to_def = {
        normalize_title(section.en_title if lang == "en" else section.zh_title): section
        for section in SECTION_DEFS
    }
    sections: dict[str, list[dict[str, Any]]] = {section.section_id: [] for section in SECTION_DEFS}
    current = SECTION_DEFS[0].section_id
    sources: list[dict[str, Any]] = []

    for item in items:
        text = item.get("text", "")
        normalized = normalize_title(text)
        if item["kind"] == "heading" and normalized in title_to_def:
            current = title_to_def[normalized].section_id
            continue
        if lang == "zh" and item["kind"] == "heading" and normalized == normalize_title("本章资料来源"):
            current = "chapter-sources"
            continue
        if lang == "en" and "http" in text:
            sources.append(item)
            if current != "chapter-sources":
                continue
        sections[current].append(item)

    if lang == "en" and sources:
        sections["chapter-sources"].extend(sources)

    return sections


def serialize_block(item: dict[str, Any], section_id: str, lang: str, index: int) -> dict[str, Any]:
    kind = item["kind"]
    if kind == "paragraph":
        kind = "listItem" if item.get("style") == "List Bullet" else "paragraph"
    result: dict[str, Any] = {
        "id": block_id(section_id, lang, index),
        "kind": kind,
    }
    if "rows" in item:
        result["rows"] = item["rows"]
        result["text"] = item.get("text", "")
    else:
        result["text"] = item.get("text", "")
    return result


def build_lesson(en_docx: Path, zh_docx: Path) -> dict[str, Any]:
    en_items = chapter_slice(iter_doc_items(Document(str(en_docx))), "en")
    zh_items = chapter_slice(iter_doc_items(Document(str(zh_docx))), "zh")
    en_sections = build_sections(en_items, "en")
    zh_sections = build_sections(zh_items, "zh")

    sections: list[dict[str, Any]] = []
    for section in SECTION_DEFS:
        en_blocks = [
            serialize_block(item, section.section_id, "en", index)
            for index, item in enumerate(en_sections[section.section_id], start=1)
        ]
        zh_blocks = [
            serialize_block(item, section.section_id, "zh", index)
            for index, item in enumerate(zh_sections[section.section_id], start=1)
        ]
        sections.append(
            {
                "id": section.section_id,
                "level": section.level,
                "page": section.page,
                "title": {"en": section.en_title, "zh": section.zh_title},
                "content": {"en": en_blocks, "zh": zh_blocks},
            }
        )

    return {
        "id": "ch01",
        "chapter": 1,
        "pageStart": 6,
        "pageEnd": 13,
        "title": {
            "en": "Chapter 1: What is Six Sigma?",
            "zh": "第一章：什么是六西格玛？",
        },
        "source": {
            "enDocx": str(en_docx),
            "zhDocx": str(zh_docx),
            "extraction": "python-docx body-order extraction; section-aligned bilingual content",
        },
        "sections": sections,
    }


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract Chapter 1 bilingual content from aligned DOCX manuals.")
    parser.add_argument("--en-docx", type=Path, default=DEFAULT_EN_DOCX)
    parser.add_argument("--zh-docx", type=Path, default=DEFAULT_ZH_DOCX)
    parser.add_argument("--repo-root", type=Path, default=DEFAULT_REPO_ROOT)
    args = parser.parse_args()

    if not args.en_docx.exists() or not args.zh_docx.exists():
        raise SystemExit(
            "Aligned DOCX files were not found. Copy them to C:\\findjob_sixsigma_sources "
            "or pass --en-docx and --zh-docx."
        )

    lesson = build_lesson(args.en_docx, args.zh_docx)
    terms = CURATED_TERMS
    manifest = {
        "manual": "CSSC Six Sigma Black Belt Training Manual",
        "version": "0.1.0",
        "chapters": [
            {
                "id": "ch01",
                "chapter": 1,
                "title": lesson["title"],
                "pageStart": lesson["pageStart"],
                "pageEnd": lesson["pageEnd"],
                "path": "chapters/ch01.json",
            }
        ],
        "dictionary": "dictionary/six-sigma-terms.json",
    }

    processed_dir = args.repo_root / "content" / "processed"
    write_json(processed_dir / "chapters" / "ch01.json", lesson)
    write_json(processed_dir / "dictionary" / "six-sigma-terms.json", terms)
    write_json(processed_dir / "manifest.json", manifest)

    generated_dir = args.repo_root / "apps" / "reader" / "src" / "generated"
    generated_dir.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(processed_dir / "chapters" / "ch01.json", generated_dir / "ch01.json")
    shutil.copyfile(processed_dir / "dictionary" / "six-sigma-terms.json", generated_dir / "six-sigma-terms.json")

    section_count = len(lesson["sections"])
    en_blocks = sum(len(section["content"]["en"]) for section in lesson["sections"])
    zh_blocks = sum(len(section["content"]["zh"]) for section in lesson["sections"])
    print(f"ok: extracted {section_count} sections, {en_blocks} English blocks, {zh_blocks} Chinese blocks")


if __name__ == "__main__":
    main()
