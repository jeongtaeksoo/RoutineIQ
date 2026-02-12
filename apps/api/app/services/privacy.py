from __future__ import annotations

import re
from typing import Any


_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b")
_PHONE_RE = re.compile(r"(?<!\d)(?:\+?\d{1,3}[-.\s]?)?(?:\d{2,4}[-.\s]?\d{3,4}[-.\s]?\d{4})(?!\d)")
_KR_RRN_RE = re.compile(r"\b\d{6}-?[1-4]\d{6}\b")
_LONG_DIGIT_RE = re.compile(r"\b\d{12,19}\b")
_BANK_ACCOUNT_RE = re.compile(r"\b\d{2,6}-\d{2,6}-\d{2,8}\b")

_BEARER_RE = re.compile(r"(?i)\bBearer\s+[A-Za-z0-9\-._~+/]+=*")
_JWT_RE = re.compile(r"\b[A-Za-z0-9\-_]{20,}\.[A-Za-z0-9\-_]{20,}\.[A-Za-z0-9\-_]{20,}\b")
_OPENAI_KEY_RE = re.compile(r"\bsk-(?:proj-|live-|test-)?[A-Za-z0-9]{16,}\b")
_STRIPE_SECRET_RE = re.compile(r"\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b")
_STRIPE_WEBHOOK_RE = re.compile(r"\bwhsec_[A-Za-z0-9]{16,}\b")
_GOOGLE_API_KEY_RE = re.compile(r"\bAIza[0-9A-Za-z\-_]{35}\b")


def mask_pii_text(text: str) -> str:
    if not text:
        return text
    out = text
    out = _EMAIL_RE.sub("[REDACTED_EMAIL]", out)
    out = _PHONE_RE.sub("[REDACTED_PHONE]", out)
    out = _KR_RRN_RE.sub("[REDACTED_RRN]", out)
    out = _BANK_ACCOUNT_RE.sub("[REDACTED_ACCOUNT]", out)
    out = _LONG_DIGIT_RE.sub("[REDACTED_NUMBER]", out)
    return out


def redact_secrets_text(text: str) -> str:
    if not text:
        return text
    out = text
    out = _BEARER_RE.sub("Bearer [REDACTED_TOKEN]", out)
    out = _JWT_RE.sub("[REDACTED_JWT]", out)
    out = _OPENAI_KEY_RE.sub("[REDACTED_OPENAI_KEY]", out)
    out = _STRIPE_SECRET_RE.sub("[REDACTED_STRIPE_SECRET]", out)
    out = _STRIPE_WEBHOOK_RE.sub("[REDACTED_STRIPE_WEBHOOK_SECRET]", out)
    out = _GOOGLE_API_KEY_RE.sub("[REDACTED_GOOGLE_API_KEY]", out)
    return out


def sanitize_for_llm(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, str):
        return mask_pii_text(value)
    if isinstance(value, list):
        return [sanitize_for_llm(v) for v in value]
    if isinstance(value, dict):
        return {str(k): sanitize_for_llm(v) for k, v in value.items()}
    return value


def sanitize_for_log(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, str):
        return redact_secrets_text(mask_pii_text(value))[:1200]
    if isinstance(value, list):
        return [sanitize_for_log(v) for v in value]
    if isinstance(value, dict):
        return {str(k)[:128]: sanitize_for_log(v) for k, v in value.items()}
    if isinstance(value, (int, float, bool)):
        return value
    return str(value)[:1200]

