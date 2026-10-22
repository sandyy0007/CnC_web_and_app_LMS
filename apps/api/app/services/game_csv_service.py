"""CSV Validation and Ingestion Service for Game Question Sets."""
from __future__ import annotations

import csv
import io
from typing import Any
from app.db.postgres import get_pg_connection

VALID_COLUMNS = {
    "question", "option_a", "option_b", "option_c", "option_d",
    "answer", "tag", "eedi_parameter", "weight"
}

DIFFICULTY_MAP = {
    "BEGINNER": "BEGINNER",
    "LOW": "BEGINNER",
    "EASY": "BEGINNER",
    "INTERMEDIATE": "INTERMEDIATE",
    "MEDIUM": "INTERMEDIATE",
    "MID": "INTERMEDIATE",
    "ADVANCED": "ADVANCED",
    "HIGH": "ADVANCED",
    "HARD": "ADVANCED",
}

ANSWER_MAP = {
    "A": 0, "B": 1, "C": 2, "D": 3,
    "0": 0, "1": 1, "2": 2, "3": 3,
    0: 0, 1: 1, 2: 2, 3: 3
}


class GameCSVService:
    @staticmethod
    async def get_valid_eedi_parameters() -> set[str]:
        """Fetch all recognized evaluation parameter codes from the database."""
        async with get_pg_connection() as conn:
            rows = await conn.fetch("SELECT code FROM evaluation_parameters")
            return {r["code"] for r in rows}

    @classmethod
    async def validate_csv(cls, file_content: str | bytes) -> dict[str, Any]:
        """
        Server-side validation for question CSV upload.
        Returns:
            {
                "is_valid": bool,
                "total_rows": int,
                "valid_count": int,
                "invalid_count": int,
                "errors": list[{"row": int, "column": str, "message": str}],
                "valid_rows": list[dict],
                "preview": list[dict]
            }
        """
        if isinstance(file_content, bytes):
            # Detect utf-8 or latin-1
            try:
                text = file_content.decode("utf-8-sig")
            except UnicodeDecodeError:
                text = file_content.decode("latin-1")
        else:
            text = file_content

        valid_params = await cls.get_valid_eedi_parameters()

        reader = csv.DictReader(io.StringIO(text.strip()))
        if not reader.fieldnames:
            return {
                "is_valid": False,
                "total_rows": 0,
                "valid_count": 0,
                "invalid_count": 0,
                "errors": [{"row": 0, "column": "headers", "message": "CSV file is empty or missing headers."}],
                "valid_rows": [],
                "preview": []
            }

        # Normalize field names (lowercase, strip whitespace)
        normalized_headers = {name.strip().lower(): name for name in reader.fieldnames if name}
        missing_required = VALID_COLUMNS - set(normalized_headers.keys())
        if missing_required:
            return {
                "is_valid": False,
                "total_rows": 0,
                "valid_count": 0,
                "invalid_count": 0,
                "errors": [{
                    "row": 1,
                    "column": "headers",
                    "message": f"Missing required columns: {', '.join(sorted(missing_required))}"
                }],
                "valid_rows": [],
                "preview": []
            }

        errors: list[dict[str, Any]] = []
        valid_rows: list[dict[str, Any]] = []

        for row_idx, raw_row in enumerate(reader, start=2):
            # Normalize row keys
            row = {k.strip().lower(): (v.strip() if v else "") for k, v in raw_row.items() if k}

            row_has_error = False

            # Question
            question = row.get("question", "")
            if not question:
                errors.append({"row": row_idx, "column": "question", "message": "Question text cannot be blank."})
                row_has_error = True

            # Options
            opt_a = row.get("option_a", "")
            opt_b = row.get("option_b", "")
            opt_c = row.get("option_c", "")
            opt_d = row.get("option_d", "")

            if not (opt_a and opt_b and opt_c and opt_d):
                errors.append({
                    "row": row_idx,
                    "column": "options",
                    "message": "All four options (option_a, option_b, option_c, option_d) must be populated."
                })
                row_has_error = True

            # Answer
            raw_ans = row.get("answer", "").upper()
            if raw_ans not in ANSWER_MAP:
                errors.append({
                    "row": row_idx,
                    "column": "answer",
                    "message": f"Invalid answer '{raw_ans}'. Must be A, B, C, D or 0, 1, 2, 3."
                })
                row_has_error = True
            answer_idx = ANSWER_MAP.get(raw_ans, 0)

            # EEDI parameter
            eedi_param = row.get("eedi_parameter", "").upper()
            if eedi_param not in valid_params:
                errors.append({
                    "row": row_idx,
                    "column": "eedi_parameter",
                    "message": f"Unknown EEDI parameter '{eedi_param}'. Supported catalogue includes: COM01-COM08, BEH01-BEH10, CNF01-CNF04, INT01-INT04."
                })
                row_has_error = True

            # Weight
            raw_weight = row.get("weight", "1.0")
            try:
                weight = float(raw_weight)
                if weight <= 0:
                    raise ValueError()
            except ValueError:
                errors.append({
                    "row": row_idx,
                    "column": "weight",
                    "message": f"Weight must be a positive number. Found '{raw_weight}'."
                })
                row_has_error = True
                weight = 1.0

            # Difficulty (optional, defaults to INTERMEDIATE)
            raw_diff = row.get("difficulty", "INTERMEDIATE").upper()
            diff = DIFFICULTY_MAP.get(raw_diff, "INTERMEDIATE")

            if not row_has_error:
                valid_rows.append({
                    "question": question,
                    "option_a": opt_a,
                    "option_b": opt_b,
                    "option_c": opt_c,
                    "option_d": opt_d,
                    "answer_index": answer_idx,
                    "tag": row.get("tag") or "General",
                    "eedi_parameter": eedi_param,
                    "weight": weight,
                    "difficulty": diff,
                    "explanation": row.get("explanation") or f"Correct answer is option {raw_ans}.",
                    "scenario": row.get("scenario") or None,
                    "passage": row.get("passage") or None,
                    "lock_type": row.get("lock_type") or None,
                })

        total_rows = len(valid_rows) + len(errors)
        is_valid = len(errors) == 0 and len(valid_rows) > 0

        return {
            "is_valid": is_valid,
            "total_rows": total_rows,
            "valid_count": len(valid_rows),
            "invalid_count": len(errors),
            "errors": errors,
            "valid_rows": valid_rows,
            "preview": valid_rows[:5]
        }
