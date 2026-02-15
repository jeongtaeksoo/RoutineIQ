from __future__ import annotations

import re
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

import app.routes.parse as parse_route
from app.core.security import AuthContext, verify_token
from app.main import app
from tests.eval_scenarios import PARSE_SCENARIOS

_HHMM_RE = re.compile(r"^\d{2}:\d{2}$")
_HANGUL_RE = re.compile(r"[가-힣]")
_EN_RE = re.compile(r"[A-Za-z]")
_MOOD_ENUM = {"very_low", "low", "neutral", "good", "great", None}
_CONFIDENCE_ENUM = {"high", "medium", "low"}


@pytest.mark.parametrize(
    "scenario",
    PARSE_SCENARIOS,
    ids=[scenario["scenario_name"] for scenario in PARSE_SCENARIOS],
)
def test_parse_diary_eval_scenarios(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    scenario: dict,
) -> None:
    locale = scenario["locale"]
    token = f"parse-eval-token-{scenario['scenario_name']}"

    async def _override_verify_token() -> AuthContext:
        return AuthContext(
            user_id="00000000-0000-4000-8000-000000000001",
            email="pytest-user@rutineiq.test",
            is_anonymous=False,
            locale=locale,
            access_token=token,
        )

    app.dependency_overrides[verify_token] = _override_verify_token

    mock_openai = AsyncMock(
        return_value=(
            scenario["mock_response"],
            {"input_tokens": 120, "output_tokens": 220, "total_tokens": 340},
        )
    )
    monkeypatch.setattr(parse_route, "call_openai_structured", mock_openai)

    response = client.post(
        "/api/parse-diary",
        json={
            "date": "2026-02-15",
            "diary_text": scenario["diary_text"],
        },
    )

    assert response.status_code == 200
    body = response.json()

    entries = body["entries"]
    assert isinstance(entries, list)
    assert abs(len(entries) - scenario["expected_entry_count"]) <= 1

    for entry in entries:
        assert "start" in entry
        assert "end" in entry
        assert "activity" in entry
        assert "tags" in entry
        assert "confidence" in entry

        assert isinstance(entry["start"], str) and _HHMM_RE.fullmatch(entry["start"])
        assert isinstance(entry["end"], str) and _HHMM_RE.fullmatch(entry["end"])
        assert isinstance(entry["activity"], str) and entry["activity"].strip()
        assert isinstance(entry["tags"], list)
        assert entry["confidence"] in _CONFIDENCE_ENUM

        for key in ("energy", "focus"):
            value = entry.get(key)
            assert value is None or (isinstance(value, int) and 1 <= value <= 5)

    meta = body["meta"]
    mood = meta.get("mood")
    assert mood in _MOOD_ENUM

    has_meta_signal = any(
        (
            meta.get("mood") is not None,
            meta.get("sleep_quality") is not None,
            meta.get("sleep_hours") is not None,
            meta.get("stress_level") is not None,
        )
    )
    assert has_meta_signal is scenario["expected_has_meta"]

    ai_note = body.get("ai_note")
    assert isinstance(ai_note, str) and ai_note.strip()

    activity_text = " ".join(str(entry["activity"]) for entry in entries)
    if locale == "ko":
        assert _HANGUL_RE.search(activity_text)
        assert _HANGUL_RE.search(ai_note)
    else:
        joined = f"{activity_text} {ai_note}"
        assert _EN_RE.search(joined)
        assert not _HANGUL_RE.search(joined)

    assert mock_openai.await_count == 1
