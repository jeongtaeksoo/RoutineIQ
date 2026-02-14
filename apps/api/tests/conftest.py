from __future__ import annotations

import base64
import json
import os
from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

# Ensure CI can import app settings without a local .env file.
_ENV_DEFAULTS = {
    "APP_ENV": "test",
    "FRONTEND_URL": "http://localhost:3000",
    "SUPABASE_URL": "https://example.supabase.co",
    "SUPABASE_ANON_KEY": "test-anon-key",
    "SUPABASE_SERVICE_ROLE_KEY": "test-service-role-key",
    "OPENAI_API_KEY": "test-openai-key",
    "OPENAI_MODEL": "gpt-4o-mini",
    "STRIPE_SECRET_KEY": "sk_test_fake",
    "STRIPE_WEBHOOK_SECRET": "whsec_test_fake",
    "STRIPE_PRICE_ID_PRO": "price_test_pro",
    "STRIPE_SUCCESS_URL": "http://localhost:3000/app/billing?success=1",
    "STRIPE_CANCEL_URL": "http://localhost:3000/app/billing?canceled=1",
}
for _key, _value in _ENV_DEFAULTS.items():
    os.environ.setdefault(_key, _value)

import app.core.rate_limit as rate_limit
import app.routes.analyze as analyze_route
import app.routes.reflect as reflect_route
import app.routes.suggest as suggest_route
from app.core.security import AuthContext, verify_token
from app.main import app
from app.services.supabase_rest import SupabaseRest

TEST_USER_ID = "00000000-0000-4000-8000-000000000001"
TEST_EMAIL = "pytest-user@rutineiq.test"


def _base64url_json(value: dict[str, Any]) -> str:
    encoded = json.dumps(value, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return base64.urlsafe_b64encode(encoded).decode("utf-8").rstrip("=")


def build_fake_jwt(*, user_id: str = TEST_USER_ID, email: str = TEST_EMAIL) -> str:
    header = _base64url_json({"alg": "HS256", "typ": "JWT"})
    payload = _base64url_json(
        {
            "sub": user_id,
            "email": email,
            "role": "authenticated",
            "aud": "authenticated",
        }
    )
    signature = "signature-for-tests"
    return f"{header}.{payload}.{signature}"


@pytest.fixture(autouse=True)
def reset_test_state() -> None:
    app.dependency_overrides.clear()
    rate_limit._counters.clear()  # type: ignore[attr-defined]


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def fake_jwt_token() -> str:
    return build_fake_jwt()


@pytest.fixture
def auth_headers(fake_jwt_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {fake_jwt_token}"}


@pytest.fixture
def fake_auth_context(fake_jwt_token: str) -> AuthContext:
    return AuthContext(
        user_id=TEST_USER_ID,
        email=TEST_EMAIL,
        is_anonymous=False,
        locale="ko",
        access_token=fake_jwt_token,
    )


@pytest.fixture
def authenticated_client(client: TestClient, fake_auth_context: AuthContext) -> TestClient:
    async def _override_verify_token() -> AuthContext:
        return fake_auth_context

    app.dependency_overrides[verify_token] = _override_verify_token
    return client


@pytest.fixture
def supabase_mock(monkeypatch: pytest.MonkeyPatch) -> dict[str, AsyncMock]:
    mocks = {
        "select": AsyncMock(return_value=[]),
        "upsert_one": AsyncMock(return_value={}),
        "insert_one": AsyncMock(return_value={}),
        "delete": AsyncMock(return_value=None),
        "rpc": AsyncMock(return_value=[]),
    }

    async def _select(self: SupabaseRest, table: str, *, bearer_token: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        return await mocks["select"](table=table, bearer_token=bearer_token, params=params)

    async def _upsert_one(
        self: SupabaseRest,
        table: str,
        *,
        bearer_token: str,
        row: dict[str, Any],
        on_conflict: str,
    ) -> dict[str, Any]:
        return await mocks["upsert_one"](
            table=table,
            bearer_token=bearer_token,
            row=row,
            on_conflict=on_conflict,
        )

    async def _insert_one(
        self: SupabaseRest,
        table: str,
        *,
        bearer_token: str,
        row: dict[str, Any],
    ) -> dict[str, Any]:
        return await mocks["insert_one"](table=table, bearer_token=bearer_token, row=row)

    async def _delete(self: SupabaseRest, table: str, *, bearer_token: str, params: dict[str, Any]) -> None:
        await mocks["delete"](table=table, bearer_token=bearer_token, params=params)

    async def _rpc(
        self: SupabaseRest,
        fn_name: str,
        *,
        bearer_token: str,
        params: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        return await mocks["rpc"](fn_name=fn_name, bearer_token=bearer_token, params=params)

    monkeypatch.setattr(SupabaseRest, "select", _select)
    monkeypatch.setattr(SupabaseRest, "upsert_one", _upsert_one)
    monkeypatch.setattr(SupabaseRest, "insert_one", _insert_one)
    monkeypatch.setattr(SupabaseRest, "delete", _delete)
    monkeypatch.setattr(SupabaseRest, "rpc", _rpc)
    return mocks


@pytest.fixture
def openai_mock(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    ai_report = {
        "summary": "테스트 요약",
        "productivity_peaks": [{"start": "09:00", "end": "11:00", "reason": "집중도 높음"}],
        "failure_patterns": [{"pattern": "오후 집중 저하", "trigger": "점심 이후 졸림", "fix": "15분 산책"}],
        "tomorrow_routine": [{"start": "09:00", "end": "10:00", "activity": "핵심 집중 블록", "goal": "핵심 업무 1개 완료"}],
        "if_then_rules": [{"if": "졸림이 올 때", "then": "물을 마시고 5분 걷기"}],
        "coach_one_liner": "09:00 집중 블록을 먼저 시작하세요.",
        "yesterday_plan_vs_actual": {
            "comparison_note": "계획 대비 70% 수행",
            "top_deviation": "오후 일정 지연",
        },
    }
    mock = AsyncMock(
        return_value=(
            ai_report,
            {"input_tokens": 120, "output_tokens": 240, "total_tokens": 360},
        )
    )
    monkeypatch.setattr(analyze_route, "call_openai_structured", mock)
    monkeypatch.setattr(reflect_route, "call_openai_structured", mock)
    monkeypatch.setattr(suggest_route, "call_openai_structured", mock)
    return mock
