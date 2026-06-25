from __future__ import annotations

import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = REPO_ROOT.parent
SAMPLE_PATH = REPO_ROOT / "samples" / "question-bank" / "public-sample.questions.json"
PRIVATE_PATH = WORKSPACE_ROOT / "private-question-bank" / "ucourse-cssbb-1000.private.json"
REQUIRED_QUESTION_FIELDS = {
    "questionId",
    "examId",
    "sourceType",
    "domain",
    "chapterId",
    "page",
    "difficulty",
    "questionType",
    "stem",
    "options",
    "correctAnswer",
    "explanation",
    "tags",
    "sourceRef",
    "reviewStats",
}


def validate_bank(path: Path, expected_source_type: str | None = None) -> dict[str, int | str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schemaVersion") != "1.0.0":
        raise AssertionError(f"{path}: schemaVersion must be 1.0.0")
    if expected_source_type and data.get("sourceType") != expected_source_type:
        raise AssertionError(f"{path}: expected sourceType {expected_source_type}")
    questions = data.get("questions")
    if not isinstance(questions, list) or not questions:
        raise AssertionError(f"{path}: questions must be a non-empty list")
    ids = set()
    missing_explanations = 0
    missing_answers = 0
    for index, question in enumerate(questions):
        missing = REQUIRED_QUESTION_FIELDS - set(question)
        if missing:
            raise AssertionError(f"{path}: question {index} missing {sorted(missing)}")
        question_id = question["questionId"]
        if question_id in ids:
            raise AssertionError(f"{path}: duplicate questionId {question_id}")
        ids.add(question_id)
        if not question["correctAnswer"]:
            missing_answers += 1
        if not question["explanation"].get("en") and not question["explanation"].get("zh"):
            missing_explanations += 1
        if question["sourceType"] not in {"public-sample", "original-practice", "user-private"}:
            raise AssertionError(f"{path}: invalid sourceType {question['sourceType']}")
        if question["questionType"] not in {"single", "multiple", "true_false", "case"}:
            raise AssertionError(f"{path}: invalid questionType {question['questionType']}")
        if len(question["options"]) < 2:
            raise AssertionError(f"{path}: {question_id} has fewer than 2 options")
    return {
        "path": str(path),
        "questions": len(questions),
        "missingAnswers": missing_answers,
        "missingExplanations": missing_explanations,
    }


def main() -> None:
    results = [validate_bank(SAMPLE_PATH, "public-sample")]
    if PRIVATE_PATH.exists():
        private_result = validate_bank(PRIVATE_PATH, "user-private")
        if private_result["questions"] != 1000:
            raise AssertionError(f"private import expected 1000 questions, got {private_result['questions']}")
        results.append(private_result)
    print(json.dumps({"ok": True, "results": results}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
