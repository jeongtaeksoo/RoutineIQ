from __future__ import annotations

from contextlib import asynccontextmanager
from urllib.parse import urlparse

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration

from app.core.config import settings
from app.routes.admin import router as admin_router
from app.routes.analyze import router as analyze_router
from app.routes.logs import router as logs_router
from app.routes.insights import router as insights_router
from app.routes.preferences import router as preferences_router
from app.routes.parse import router as parse_router
from app.routes.reports import router as reports_router
from app.routes.suggest import router as suggest_router
from app.routes.reflect import router as reflect_router
from app.routes.stripe_routes import router as stripe_router
from app.routes.trends import router as trends_router
from app.services.error_log import log_system_error
from app.services.supabase_auth import get_current_user
from app.services.supabase_rest import SupabaseRestError, close_http


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await close_http()


app = FastAPI(title="RutineIQ API", version="0.1.0", lifespan=lifespan)


def _init_sentry() -> None:
    if not settings.sentry_dsn:
        return
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        integrations=[FastApiIntegration()],
        traces_sample_rate=max(0.0, min(settings.sentry_traces_sample_rate, 1.0)),
        send_default_pii=False,
        environment=settings.app_env,
    )


_init_sentry()


def _origin(url: str) -> str:
    # Be forgiving: FRONTEND_URL may include a trailing slash or a path.
    # CORS compares against the request's Origin (scheme+host+port).
    p = urlparse(url)
    if p.scheme and p.netloc:
        return f"{p.scheme}://{p.netloc}"
    return url.rstrip("/")


def _is_local_origin(origin: str) -> bool:
    try:
        p = urlparse(origin)
    except Exception:
        return False
    return (p.hostname or "").lower() in {"localhost", "127.0.0.1"}


_ALLOWED_ORIGINS = sorted(
    {
        _origin(str(settings.frontend_url)),
        # Production domains for this deployment.
        "https://rutineiq.com",
        "https://www.rutineiq.com",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3100",
        "http://127.0.0.1:3100",
    }
)

# Fail fast for unsafe prod CORS config.
if (settings.app_env or "").strip().lower() in {"production", "prod"}:
    frontend_origin = _origin(str(settings.frontend_url))
    if _is_local_origin(frontend_origin):
        raise RuntimeError(
            "Unsafe FRONTEND_URL for production. "
            "Set FRONTEND_URL to a public origin (not localhost)."
        )

app.add_middleware(
    CORSMiddleware,
    # Always allow local dev, plus the configured FRONTEND_URL origin.
    allow_origins=_ALLOWED_ORIGINS,
    # Allow Vercel preview deployments (e.g. *.vercel.app) in addition to explicit origins.
    allow_origin_regex=r"^https://.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_server_error_responses(request: Request, call_next):
    response = await call_next(request)
    if response.status_code >= 500:
        await log_system_error(
            route=str(request.url.path),
            message=f"Server response status {response.status_code}",
            user_id=await _try_get_user_id_from_request(request),
            meta={
                "status_code": response.status_code,
                "method": request.method,
                "path": str(request.url.path),
            },
        )
    return response


@app.get("/health")
async def health() -> dict:
    return {"ok": True}


async def _try_get_user_id_from_request(request: Request) -> str | None:
    auth = request.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        return None
    token = auth.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        user = await get_current_user(access_token=token, use_cache=True)
        uid = user.get("id")
        return uid if isinstance(uid, str) and uid.strip() else None
    except Exception:
        return None


@app.exception_handler(SupabaseRestError)
async def supabase_rest_error_handler(request: Request, exc: SupabaseRestError):
    # Make DB failures visible and debuggable in dev, without leaking secrets.
    msg = str(exc) or "Supabase request failed"
    is_rls_recursion = (
        exc.code == "42P17" or "infinite recursion detected in policy" in msg.lower()
    )
    is_rls_write_violation = (
        exc.code == "42501" and "row-level security policy" in msg.lower()
    )

    detail: dict[str, str | None]
    if is_rls_recursion:
        detail = {
            "message": "Supabase RLS 정책 문제로 데이터 요청이 실패했습니다.",
            "hint": "Supabase SQL Editor에서 supabase/patches/2026-02-10_fix_rls_policy_recursion.sql 을 실행한 뒤 다시 시도하세요.",
            "code": exc.code or "42P17",
        }
        status_code = 503
    elif is_rls_write_violation:
        # Common causes: missing RLS write policy or invalid/expired service role key.
        detail = {
            "message": "Supabase 쓰기 권한(RLS) 문제로 저장에 실패했습니다.",
            "hint": "Supabase SQL Editor에서 supabase/patches/2026-02-12_rls_write_fallback_policies.sql 실행 후 다시 시도하세요. 배포 환경의 SUPABASE_SERVICE_ROLE_KEY도 최신값인지 확인하세요.",
            "code": exc.code or "42501",
        }
        status_code = 503
    else:
        detail = {
            "message": "Supabase 데이터 요청이 실패했습니다.",
            "hint": exc.hint,
            "code": exc.code,
        }
        # Propagate 4xx; normalize 5xx to 502.
        status_code = exc.status_code if 400 <= exc.status_code < 500 else 502

    await log_system_error(
        route=str(request.url.path),
        message="Supabase request failed",
        user_id=await _try_get_user_id_from_request(request),
        err=exc,
        meta={
            "status_code": exc.status_code,
            "code": exc.code,
            "path": str(request.url.path),
        },
    )
    return JSONResponse(status_code=status_code, content={"detail": detail})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Best-effort: never block the response on logging.
    await log_system_error(
        route=str(request.url.path),
        message="Unhandled server error",
        user_id=await _try_get_user_id_from_request(request),
        err=exc,
        meta={"method": request.method},
    )
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


app.include_router(logs_router, prefix="/api")
app.include_router(parse_router, prefix="/api")
app.include_router(analyze_router, prefix="/api")
app.include_router(reports_router, prefix="/api")
app.include_router(suggest_router, prefix="/api")
app.include_router(reflect_router, prefix="/api")
app.include_router(stripe_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(preferences_router, prefix="/api")
app.include_router(trends_router, prefix="/api")
app.include_router(insights_router, prefix="/api")
