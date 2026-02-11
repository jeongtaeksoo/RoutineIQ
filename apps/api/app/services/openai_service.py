from __future__ import annotations

import json
from typing import Any

import httpx

from app.core.config import settings


AI_REPORT_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "summary",
        "productivity_peaks",
        "failure_patterns",
        "tomorrow_routine",
        "if_then_rules",
        "coach_one_liner",
        "yesterday_plan_vs_actual",
    ],
    "properties": {
        "summary": {"type": "string"},
        "productivity_peaks": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["start", "end", "reason"],
                "properties": {
                    "start": {"type": "string", "pattern": "^\\d{2}:\\d{2}$"},
                    "end": {"type": "string", "pattern": "^\\d{2}:\\d{2}$"},
                    "reason": {"type": "string"},
                },
            },
        },
        "failure_patterns": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["pattern", "trigger", "fix"],
                "properties": {
                    "pattern": {"type": "string"},
                    "trigger": {"type": "string"},
                    "fix": {"type": "string"},
                },
            },
        },
        "tomorrow_routine": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["start", "end", "activity", "goal"],
                "properties": {
                    "start": {"type": "string", "pattern": "^\\d{2}:\\d{2}$"},
                    "end": {"type": "string", "pattern": "^\\d{2}:\\d{2}$"},
                    "activity": {"type": "string"},
                    "goal": {"type": "string"},
                },
            },
        },
        "if_then_rules": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["if", "then"],
                "properties": {
                    "if": {"type": "string"},
                    "then": {"type": "string"},
                },
            },
        },
        "coach_one_liner": {"type": "string"},
        "yesterday_plan_vs_actual": {
            "type": "object",
            "additionalProperties": False,
            "required": ["comparison_note", "top_deviation"],
            "properties": {
                "comparison_note": {"type": "string"},
                "top_deviation": {"type": "string"},
            },
        },
    },
}


def _extract_output_text(resp_json: dict[str, Any]) -> str:
    if isinstance(resp_json.get("output_text"), str) and resp_json["output_text"].strip():
        return resp_json["output_text"]

    output = resp_json.get("output")
    if isinstance(output, list):
        for item in output:
            content = item.get("content") if isinstance(item, dict) else None
            if not isinstance(content, list):
                continue
            for c in content:
                if not isinstance(c, dict):
                    continue
                if c.get("type") in ("output_text", "text") and isinstance(c.get("text"), str):
                    return c["text"]
    raise ValueError("OpenAI response missing output text")


def _extract_usage(resp_json: dict[str, Any]) -> dict[str, int | None]:
    usage = resp_json.get("usage")
    if not isinstance(usage, dict):
        return {"input_tokens": None, "output_tokens": None, "total_tokens": None}

    input_tokens = usage.get("input_tokens")
    output_tokens = usage.get("output_tokens")
    total_tokens = usage.get("total_tokens")
    return {
        "input_tokens": int(input_tokens) if isinstance(input_tokens, (int, float)) else None,
        "output_tokens": int(output_tokens) if isinstance(output_tokens, (int, float)) else None,
        "total_tokens": int(total_tokens) if isinstance(total_tokens, (int, float)) else None,
    }


async def call_openai_structured(
    *,
    system_prompt: str,
    user_prompt: str,
    response_schema: dict[str, Any] | None = None,
    schema_name: str = "response",
) -> tuple[dict[str, Any], dict[str, int | None]]:
    schema = response_schema or AI_REPORT_JSON_SCHEMA
    payload: dict[str, Any] = {
        "model": settings.openai_model,
        "input": [
            {
                "role": "system",
                "content": [{"type": "input_text", "text": system_prompt}],
            },
            {
                "role": "user",
                "content": [{"type": "input_text", "text": user_prompt}],
            },
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": schema_name,
                "schema": schema,
                "strict": True,
            }
        },
        "temperature": 0.2,
    }

    headers = {
        "authorization": f"Bearer {settings.openai_api_key}",
        "content-type": "application/json",
    }

    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
        resp = await client.post("https://api.openai.com/v1/responses", headers=headers, json=payload)
        resp.raise_for_status()
        resp_json = resp.json()

    text = _extract_output_text(resp_json)
    obj = json.loads(text)
    usage = _extract_usage(resp_json)
    return obj, usage
