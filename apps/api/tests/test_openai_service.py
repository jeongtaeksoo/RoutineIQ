from __future__ import annotations

import json

import httpx
import pytest
import respx

from app.services.openai_service import call_openai_structured


@pytest.mark.asyncio
@respx.mock
async def test_openai_service_parses_valid_response() -> None:
    route = respx.post("https://api.openai.com/v1/responses").mock(
        return_value=httpx.Response(
            200,
            json={
                "output_text": json.dumps(
                    {
                        "summary": "ok",
                        "productivity_peaks": [],
                        "failure_patterns": [],
                        "tomorrow_routine": [],
                        "if_then_rules": [],
                        "coach_one_liner": "go",
                        "yesterday_plan_vs_actual": {
                            "comparison_note": "n/a",
                            "top_deviation": "n/a",
                        },
                    }
                ),
                "usage": {
                    "input_tokens": 10,
                    "output_tokens": 20,
                    "total_tokens": 30,
                },
            },
        )
    )

    obj, usage = await call_openai_structured(
        system_prompt="system", user_prompt="user"
    )

    assert route.called
    assert obj["summary"] == "ok"
    assert usage["total_tokens"] == 30


@pytest.mark.asyncio
@respx.mock
async def test_openai_service_raises_on_invalid_json_output() -> None:
    respx.post("https://api.openai.com/v1/responses").mock(
        return_value=httpx.Response(
            200,
            json={"output_text": "{invalid json", "usage": {}},
        )
    )

    with pytest.raises(json.JSONDecodeError):
        await call_openai_structured(system_prompt="system", user_prompt="user")


@pytest.mark.asyncio
@respx.mock
async def test_openai_service_retries_then_succeeds() -> None:
    route = respx.post("https://api.openai.com/v1/responses").mock(
        side_effect=[
            httpx.Response(500, json={"error": "temporary"}),
            httpx.Response(
                200,
                json={
                    "output_text": json.dumps(
                        {
                            "summary": "retry-ok",
                            "productivity_peaks": [],
                            "failure_patterns": [],
                            "tomorrow_routine": [],
                            "if_then_rules": [],
                            "coach_one_liner": "go",
                            "yesterday_plan_vs_actual": {
                                "comparison_note": "n/a",
                                "top_deviation": "n/a",
                            },
                        }
                    ),
                    "usage": {"input_tokens": 1, "output_tokens": 2, "total_tokens": 3},
                },
            ),
        ]
    )

    obj, usage = await call_openai_structured(
        system_prompt="system", user_prompt="user"
    )

    assert route.call_count == 2
    assert obj["summary"] == "retry-ok"
    assert usage["total_tokens"] == 3
