from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from typing import Any

import pymupdf


REPO_ROOT = Path(__file__).resolve().parents[1]
SOURCE_PDF = REPO_ROOT.parent / "sources" / "source_manual.pdf"
OUTPUT_SPEC = REPO_ROOT / "content" / "overrides" / "reviewed-table-recovery.json"
FIGURE_DIR = REPO_ROOT / "apps" / "reader" / "public" / "content" / "assets" / "figures"


def clean_rows(rows: list[list[str | None]]) -> list[list[str]]:
    return [[" ".join((cell or "").split()) for cell in row] for row in rows]


def table_rows(doc: pymupdf.Document, page_number: int, table_index: int = 0) -> list[list[str]]:
    tables = doc[page_number - 1].find_tables().tables
    if table_index >= len(tables):
        raise IndexError(f"table {table_index} not found on source PDF page {page_number}")
    return clean_rows(tables[table_index].extract())


def table_block(block_id: str, page: int, rows: list[list[str]]) -> dict[str, Any]:
    return {
        "id": block_id,
        "kind": "table",
        "page": page,
        "rows": rows,
        "text": " ".join(cell for row in rows for cell in row),
    }


def replace(chapter: str, section: str, start: str, end: str, page: int, rows: list[list[str]]) -> dict[str, Any]:
    return {
        "operation": "replaceRange",
        "chapterId": chapter,
        "sectionId": section,
        "language": "en",
        "startBlockId": start,
        "endBlockId": end,
        "blocks": [table_block(start, page, rows)],
    }


def replace_paged(
    chapter: str,
    section: str,
    start: str,
    end: str,
    pages: list[int],
    rows: list[list[str]],
) -> dict[str, Any]:
    header = rows[0]
    data = rows[1:]
    chunk_size = max(1, (len(data) + len(pages) - 1) // len(pages))
    blocks = []
    for index, page in enumerate(pages):
        chunk = data[index * chunk_size : (index + 1) * chunk_size]
        page_rows = [header, *chunk] if chunk else [header]
        block_id = start if index == 0 else f"{start}-page-{page}"
        blocks.append(table_block(block_id, page, page_rows))
    return {
        "operation": "replaceRange",
        "chapterId": chapter,
        "sectionId": section,
        "language": "en",
        "startBlockId": start,
        "endBlockId": end,
        "blocks": blocks,
    }


def crop_asset(
    doc: pymupdf.Document,
    *,
    asset_id: str,
    source_page: int,
    bbox: tuple[float, float, float, float],
    chapter: str,
    app_page: int,
) -> tuple[dict[str, Any], dict[str, Any]]:
    page = doc[source_page - 1]
    clip = pymupdf.Rect(*bbox) & page.rect
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(2.5, 2.5), clip=clip, alpha=False)
    FIGURE_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{asset_id}.png"
    pixmap.save(FIGURE_DIR / filename)
    asset = {
        "chapterId": chapter,
        "asset": {
            "id": asset_id,
            "type": "table-image",
            "path": f"assets/figures/{filename}",
            "page": app_page,
            "width": pixmap.width,
            "height": pixmap.height,
        },
    }
    block = {
        "id": asset_id,
        "kind": "image",
        "assetId": asset_id,
        "src": f"assets/figures/{filename}",
        "page": app_page,
        "width": pixmap.width,
        "height": pixmap.height,
    }
    return asset, block


def main() -> None:
    if not SOURCE_PDF.exists():
        raise FileNotFoundError(SOURCE_PDF)
    doc = pymupdf.open(SOURCE_PDF)
    operations: list[dict[str, Any]] = []
    assets: list[dict[str, Any]] = []

    operations.extend(
        [
            replace("ch14", "ch14-s03-graphical-analysis", "ch14-s03-graphical-analysis-en-026", "ch14-s03-graphical-analysis-en-029", 140, table_rows(doc, 167)),
            replace("ch15", "ch15-s03-cost-benefit-analysis", "ch15-s03-cost-benefit-analysis-en-015", "ch15-s03-cost-benefit-analysis-en-029", 147, table_rows(doc, 177)),
            replace("ch16", "ch16-s03-create-a-control-plan", "ch16-s03-create-a-control-plan-en-037", "ch16-s03-create-a-control-plan-en-041", 153, table_rows(doc, 183)),
            replace(
                "ch17",
                "ch17-s03-creating-an-x-bar-control-chart-without-statistical-software",
                "ch17-s03-creating-an-x-bar-control-chart-without-statistical-software-en-009",
                "ch17-s03-creating-an-x-bar-control-chart-without-statistical-software-en-012",
                171,
                [["X-Bar Data Points"], ["24.1"], ["25.2"], ["24.7"], ["28.3"], ["27.1"], ["26.4"], ["25.4"]],
            ),
            replace(
                "ch21",
                "ch21-s05-running-hypothesis-tests",
                "ch21-s05-running-hypothesis-tests-en-025",
                "ch21-s05-running-hypothesis-tests-en-028",
                256,
                [
                    ["Test and CI for One Proportion"] * 6,
                    ["Test of p = 0.2 vs p > 0.2"] * 6,
                    ["Sample", "X", "N", "Sample p", "95% Lower Bound", "P-Value"],
                    ["1", "38", "142", "0.267606", "0.207083", "0.031"],
                ],
            ),
            replace_paged(
                "ch21",
                "ch21-s05-running-hypothesis-tests",
                "ch21-s05-running-hypothesis-tests-en-069",
                "ch21-s05-running-hypothesis-tests-en-072",
                [259, 260],
                [["Number of Bedrooms"] * 4]
                + [
                    [str(value) for value in row]
                    for row in zip(
                        *[
                            [4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5],
                            [5, 5, 3, 3, 3, 3, 3, 3, 3, 3, 6, 6, 6],
                            [6, 6, 6, 6, 6, 7, 7, 5, 5, 5, 5, 4, 4],
                            [4, 4, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1, ""],
                        ]
                    )
                ],
            ),
            replace("ch23", "ch23-s03-creating-and-reading-control-charts-in-minitab", "ch23-s03-creating-and-reading-control-charts-in-minitab-en-086", "ch23-s03-creating-and-reading-control-charts-in-minitab-en-091", 288, table_rows(doc, 352)),
            replace(
                "ch26",
                "ch26-s02-the-graph-menu-option",
                "ch26-s02-the-graph-menu-option-en-005",
                "ch26-s02-the-graph-menu-option-en-007",
                325,
                [["C1", "C2"]] + table_rows(doc, 397) + table_rows(doc, 398),
            ),
            replace_paged(
                "ch26",
                "ch26-s02-the-graph-menu-option",
                "ch26-s02-the-graph-menu-option-en-186",
                "ch26-s02-the-graph-menu-option-en-202",
                [339, 340],
                table_rows(doc, 416) + table_rows(doc, 417),
            ),
            replace_paged("ch29", "ch29-s03-best-guess-trial-and-error-versus-factorial-experiments", "ch29-s03-best-guess-trial-and-error-versus-factorial-experiments-en-019", "ch29-s03-best-guess-trial-and-error-versus-factorial-experiments-en-036", [394, 395, 396], table_rows(doc, 481)),
            replace("ch29", "ch29-s04-next-steps", "ch29-s04-next-steps-en-054", "ch29-s04-next-steps-en-091", 408, table_rows(doc, 495)),
            replace_paged(
                "ch30",
                "ch30-s02-the-importance-of-understanding-interactions",
                "ch30-s02-the-importance-of-understanding-interactions-en-011",
                "ch30-s02-the-importance-of-understanding-interactions-en-020",
                [409, 410],
                table_rows(doc, 502) + table_rows(doc, 503, 0),
            ),
            replace("ch30", "ch30-s02-the-importance-of-understanding-interactions", "ch30-s02-the-importance-of-understanding-interactions-en-024", "ch30-s02-the-importance-of-understanding-interactions-en-029", 411, table_rows(doc, 503, 1)),
            replace("ch30", "ch30-s02-the-importance-of-understanding-interactions", "ch30-s02-the-importance-of-understanding-interactions-en-085", "ch30-s02-the-importance-of-understanding-interactions-en-098", 416, table_rows(doc, 512)),
        ]
    )

    operations.extend(
        [
            replace("ch12", "ch12-s04-define-toolset", "ch12-s04-define-toolset-en-029", "ch12-s04-define-toolset-en-035", 115, table_rows(doc, 138)),
            replace("ch16", "ch16-s03-create-a-control-plan", "ch16-s03-create-a-control-plan-en-023", "ch16-s03-create-a-control-plan-en-028", 152, table_rows(doc, 182)),
            replace("ch23", "ch23-s03-creating-and-reading-control-charts-in-minitab", "ch23-s03-creating-and-reading-control-charts-in-minitab-en-077", "ch23-s03-creating-and-reading-control-charts-in-minitab-en-079", 287, table_rows(doc, 351)),
            replace("ch23", "ch23-s03-creating-and-reading-control-charts-in-minitab", "ch23-s03-creating-and-reading-control-charts-in-minitab-en-130", "ch23-s03-creating-and-reading-control-charts-in-minitab-en-133", 292, table_rows(doc, 358)),
            replace("ch28", "ch28-content", "ch28-content-en-028", "ch28-content-en-032", 376, table_rows(doc, 458)),
        ]
    )

    yarn_operation = replace(
        "ch23",
        "ch23-s03-creating-and-reading-control-charts-in-minitab",
        "ch23-s03-creating-and-reading-control-charts-in-minitab-en-110",
        "ch23-s03-creating-and-reading-control-charts-in-minitab-en-112",
        290,
        table_rows(doc, 355),
    )
    yarn_operation["blocks"].append(
        {
            "id": "ch23-s03-creating-and-reading-control-charts-in-minitab-en-110-explanation",
            "kind": "paragraph",
            "page": 290,
            "text": "Because all the sample sizes are the same and the team is concerned with the number of defects, it chooses to create a c-chart in Minitab.",
        }
    )
    operations.append(yarn_operation)

    xbar_operation = next(
        item
        for item in operations
        if item["startBlockId"] == "ch17-s03-creating-an-x-bar-control-chart-without-statistical-software-en-009"
    )
    xbar_rows = [["X-Bar Data Points"]] + [[value] for value in [
        "24.1", "25.2", "24.7", "28.3", "27.1", "26.4", "25.4",
        "21.4", "24.5", "23.5", "27.5", "29.5", "24.5", "26.8",
    ]]
    xbar_operation["blocks"] = [table_block(xbar_operation["startBlockId"], 171, xbar_rows)]

    def mirror_table(en_start: str, zh_start: str, zh_end: str, zh_pages: list[int]) -> None:
        source = next(item for item in operations if item["startBlockId"] == en_start)
        mirrored_blocks = deepcopy(source["blocks"])
        obsolete_block_ids: list[str] = []
        if len(zh_pages) == 1 and len(mirrored_blocks) > 1:
            obsolete_block_ids = [f"{zh_start}-page-{block['page']}" for block in mirrored_blocks[1:]]
            combined_rows = deepcopy(mirrored_blocks[0]["rows"])
            header = combined_rows[0]
            for block in mirrored_blocks[1:]:
                extra_rows = block["rows"]
                combined_rows.extend(extra_rows[1:] if extra_rows and extra_rows[0] == header else extra_rows)
            mirrored_blocks = [table_block(zh_start, zh_pages[0], combined_rows)]
        else:
            if len(mirrored_blocks) != len(zh_pages):
                raise ValueError(f"zh page mapping does not match table blocks: {en_start} {zh_pages}")
            for index, (block, page) in enumerate(zip(mirrored_blocks, zh_pages)):
                block["id"] = zh_start if index == 0 else f"{zh_start}-page-{page}"
                block["page"] = page
        for block in mirrored_blocks:
            block["preserveOriginal"] = True
        operations.append(
            {
                "operation": "replaceRange",
                "chapterId": source["chapterId"],
                "sectionId": source["sectionId"],
                "language": "zh",
                "startBlockId": zh_start,
                "endBlockId": zh_end,
                "blocks": mirrored_blocks,
                "obsoleteBlockIds": obsolete_block_ids,
            }
        )

    for en_start, zh_start, zh_end, zh_pages in [
        ("ch14-s03-graphical-analysis-en-026", "ch14-s03-graphical-analysis-zh-035", "ch14-s03-graphical-analysis-zh-038", [141]),
        ("ch15-s03-cost-benefit-analysis-en-015", "ch15-s03-cost-benefit-analysis-zh-015", "ch15-s03-cost-benefit-analysis-zh-020", [147]),
        ("ch16-s03-create-a-control-plan-en-037", "ch16-s03-create-a-control-plan-zh-037", "ch16-s03-create-a-control-plan-zh-046", [153]),
        ("ch17-s03-creating-an-x-bar-control-chart-without-statistical-software-en-009", "ch17-s03-creating-an-x-bar-control-chart-without-statistical-software-zh-011", "ch17-s03-creating-an-x-bar-control-chart-without-statistical-software-zh-013", [171]),
        ("ch21-s05-running-hypothesis-tests-en-025", "ch21-s05-running-hypothesis-tests-zh-028", "ch21-s05-running-hypothesis-tests-zh-031", [256]),
        ("ch21-s05-running-hypothesis-tests-en-069", "ch21-s05-running-hypothesis-tests-zh-072", "ch21-s05-running-hypothesis-tests-zh-075", [259, 260]),
        ("ch23-s03-creating-and-reading-control-charts-in-minitab-en-086", "ch23-s03-creating-and-reading-control-charts-in-minitab-zh-087", "ch23-s03-creating-and-reading-control-charts-in-minitab-zh-092", [288]),
        ("ch26-s02-the-graph-menu-option-en-005", "ch26-s02-the-graph-menu-option-zh-005", "ch26-s02-the-graph-menu-option-zh-006", [325]),
        ("ch26-s02-the-graph-menu-option-en-186", "ch26-s02-the-graph-menu-option-zh-190", "ch26-s02-the-graph-menu-option-zh-209", [339, 340]),
        ("ch29-s03-best-guess-trial-and-error-versus-factorial-experiments-en-019", "ch29-s03-best-guess-trial-and-error-versus-factorial-experiments-zh-022", "ch29-s03-best-guess-trial-and-error-versus-factorial-experiments-zh-039", [394, 395, 396]),
        ("ch29-s04-next-steps-en-054", "ch29-s04-next-steps-zh-061", "ch29-s04-next-steps-zh-098", [408]),
        ("ch30-s02-the-importance-of-understanding-interactions-en-011", "ch30-s02-the-importance-of-understanding-interactions-zh-014", "ch30-s02-the-importance-of-understanding-interactions-zh-023", [410, 410]),
        ("ch30-s02-the-importance-of-understanding-interactions-en-024", "ch30-s02-the-importance-of-understanding-interactions-zh-027", "ch30-s02-the-importance-of-understanding-interactions-zh-032", [411]),
        ("ch30-s02-the-importance-of-understanding-interactions-en-085", "ch30-s02-the-importance-of-understanding-interactions-zh-088", "ch30-s02-the-importance-of-understanding-interactions-zh-101", [416]),
        ("ch12-s04-define-toolset-en-029", "ch12-s04-define-toolset-zh-032", "ch12-s04-define-toolset-zh-037", [115]),
        ("ch16-s03-create-a-control-plan-en-023", "ch16-s03-create-a-control-plan-zh-025", "ch16-s03-create-a-control-plan-zh-036", [152]),
        ("ch23-s03-creating-and-reading-control-charts-in-minitab-en-077", "ch23-s03-creating-and-reading-control-charts-in-minitab-zh-078", "ch23-s03-creating-and-reading-control-charts-in-minitab-zh-080", [287]),
        ("ch23-s03-creating-and-reading-control-charts-in-minitab-en-130", "ch23-s03-creating-and-reading-control-charts-in-minitab-zh-132", "ch23-s03-creating-and-reading-control-charts-in-minitab-zh-135", [292]),
        ("ch28-content-en-028", "ch28-content-zh-034", "ch28-content-zh-038", [376]),
    ]:
        mirror_table(en_start, zh_start, zh_end, zh_pages)

    yarn_zh_blocks = [deepcopy(yarn_operation["blocks"][0])]
    yarn_zh_blocks[0]["id"] = "ch23-s03-creating-and-reading-control-charts-in-minitab-zh-112"
    yarn_zh_blocks[0]["preserveOriginal"] = True
    yarn_zh_blocks.append(
        {
            "id": "ch23-s03-creating-and-reading-control-charts-in-minitab-zh-112-explanation",
            "kind": "paragraph",
            "page": 290,
            "text": "由于所有样本量都相同，并且团队关注缺陷数量，因此选择在 Minitab 中创建 c 控制图。",
        }
    )
    operations.append(
        {
            "operation": "replaceRange",
            "chapterId": "ch23",
            "sectionId": "ch23-s03-creating-and-reading-control-charts-in-minitab",
            "language": "zh",
            "startBlockId": "ch23-s03-creating-and-reading-control-charts-in-minitab-zh-112",
            "endBlockId": "ch23-s03-creating-and-reading-control-charts-in-minitab-zh-114",
            "blocks": yarn_zh_blocks,
        }
    )

    formula_asset, formula_block = crop_asset(
        doc,
        asset_id="source-formula-sigma-level-ch16",
        source_page=187,
        bbox=(64, 18, 370, 150),
        chapter="ch16",
        app_page=155,
    )
    assets.append(formula_asset)
    operations.append(
        {
            "operation": "replaceRange",
            "chapterId": "ch16",
            "sectionId": "ch16-s05-spc-charts",
            "language": "en",
            "startBlockId": "ch16-s05-spc-charts-en-033",
            "endBlockId": "ch16-s05-spc-charts-en-034",
            "blocks": [formula_block],
        }
    )
    zh_formula_block = deepcopy(formula_block)
    zh_formula_block["id"] = "ch16-s05-spc-charts-zh-source-formula"
    operations.append(
        {
            "operation": "replaceRange",
            "chapterId": "ch16",
            "sectionId": "ch16-s05-spc-charts",
            "language": "zh",
            "startBlockId": "ch16-s05-spc-charts-zh-038",
            "endBlockId": "ch16-s05-spc-charts-zh-039",
            "blocks": [zh_formula_block],
        }
    )

    chart_asset, chart_block = crop_asset(
        doc,
        asset_id="source-chart-fitted-line-ch27",
        source_page=444,
        bbox=(90, 65, 510, 355),
        chapter="ch27",
        app_page=362,
    )
    assets.append(chart_asset)
    operations.append(
        {
            "operation": "replaceRange",
            "chapterId": "ch27",
            "sectionId": "ch27-s02-basic-statistics",
            "language": "en",
            "startBlockId": "ch27-s02-basic-statistics-en-024",
            "endBlockId": "ch27-s02-basic-statistics-en-034",
            "blocks": [chart_block],
        }
    )
    zh_chart_block = deepcopy(chart_block)
    zh_chart_block["id"] = "ch27-s02-basic-statistics-zh-source-fitted-line"
    operations.append(
        {
            "operation": "replaceRange",
            "chapterId": "ch27",
            "sectionId": "ch27-s02-basic-statistics",
            "language": "zh",
            "startBlockId": "ch27-s02-basic-statistics-zh-026",
            "endBlockId": "ch27-s02-basic-statistics-zh-036",
            "blocks": [zh_chart_block],
        }
    )

    pareto_rows = [
        ["Reasons for Denying Medical Claims"] * 2,
        ["Reason", "Count"],
        ["Duplicate claim", "18,012"],
        ["Timely filing", "13,245"],
        ["No beneficiary found", "10,215"],
        ["Claim lacks information", "4,548"],
        ["Service not covered", "2,154"],
        ["Medical necessity", "1,423"],
        ["Date of service issue", "526"],
    ]
    pareto_asset, pareto_image = crop_asset(
        doc,
        asset_id="source-chart-pareto-ch05",
        source_page=53,
        bbox=(55, 360, 560, 590),
        chapter="ch05",
        app_page=42,
    )
    assets.append(pareto_asset)
    pareto_table = table_block("ch05-s03-the-pareto-principle-en-007", 42, pareto_rows)
    operations.append(
        {
            "operation": "replaceRange",
            "chapterId": "ch05",
            "sectionId": "ch05-s03-the-pareto-principle",
            "language": "en",
            "startBlockId": "ch05-s03-the-pareto-principle-en-007",
            "endBlockId": "ch05-s03-the-pareto-principle-en-022",
            "blocks": [pareto_table, pareto_image],
        }
    )
    zh_pareto_table = deepcopy(pareto_table)
    zh_pareto_table["id"] = "ch05-s03-the-pareto-principle-zh-009"
    zh_pareto_table["preserveOriginal"] = True
    zh_pareto_image = deepcopy(pareto_image)
    zh_pareto_image["id"] = "source-chart-pareto-ch05-zh"
    operations.append(
        {
            "operation": "replaceRange",
            "chapterId": "ch05",
            "sectionId": "ch05-s03-the-pareto-principle",
            "language": "zh",
            "startBlockId": "ch05-s03-the-pareto-principle-zh-009",
            "endBlockId": "ch05-s03-the-pareto-principle-zh-024",
            "blocks": [zh_pareto_table, zh_pareto_image],
        }
    )

    for language, ranges in {
        "en": [
            ("ch26-s02-the-graph-menu-option-en-213", "ch26-s02-the-graph-menu-option-en-233", 342),
            ("ch26-s02-the-graph-menu-option-en-255", "ch26-s02-the-graph-menu-option-en-275", 345),
        ],
        "zh": [
            ("ch26-s02-the-graph-menu-option-zh-219", "ch26-s02-the-graph-menu-option-zh-239", 342),
            ("ch26-s02-the-graph-menu-option-zh-261", "ch26-s02-the-graph-menu-option-zh-281", 345),
        ],
    }.items():
        for start, end, page in ranges:
            operations.append(
                {
                    "operation": "replaceRange",
                    "chapterId": "ch26",
                    "sectionId": "ch26-s02-the-graph-menu-option",
                    "language": language,
                    "startBlockId": start,
                    "endBlockId": end,
                    "blocks": [
                        {
                            "id": start,
                            "kind": "paragraph",
                            "page": page,
                            "text": (
                                "The plotted values and axis labels are preserved in the chart above."
                                if language == "en"
                                else "绘制值与坐标轴标签已完整保留在上方图表中。"
                            ),
                        }
                    ],
                }
            )

    report_specs = [
        (
            "source-report-modeling-summary-ch29",
            491,
            (50, 50, 560, 425),
            "ch29-s04-next-steps-en-004",
            "ch29-s04-next-steps-en-032",
            "ch29-s04-next-steps-zh-011",
            "ch29-s04-next-steps-zh-039",
        ),
        (
            "source-report-prediction-ch29",
            498,
            (55, 55, 560, 430),
            "ch29-s04-next-steps-en-107",
            "ch29-s04-next-steps-en-121",
            "ch29-s04-next-steps-zh-114",
            "ch29-s04-next-steps-zh-128",
        ),
    ]
    for asset_id, source_page, bbox, en_start, en_end, zh_start, zh_end in report_specs:
        report_asset, report_image = crop_asset(
            doc,
            asset_id=asset_id,
            source_page=source_page,
            bbox=bbox,
            chapter="ch29",
            app_page=408,
        )
        assets.append(report_asset)
        operations.append(
            {
                "operation": "replaceRange",
                "chapterId": "ch29",
                "sectionId": "ch29-s04-next-steps",
                "language": "en",
                "startBlockId": en_start,
                "endBlockId": en_end,
                "blocks": [report_image],
            }
        )
        zh_report_image = deepcopy(report_image)
        zh_report_image["id"] = f"{asset_id}-zh"
        operations.append(
            {
                "operation": "replaceRange",
                "chapterId": "ch29",
                "sectionId": "ch29-s04-next-steps",
                "language": "zh",
                "startBlockId": zh_start,
                "endBlockId": zh_end,
                "blocks": [zh_report_image],
            }
        )

    OUTPUT_SPEC.write_text(
        json.dumps(
            {
                "schemaVersion": "1.0.0",
                "reviewedAgainst": "sources/source_manual.pdf",
                "assets": assets,
                "operations": operations,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"ok": True, "operations": len(operations), "assets": len(assets)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
