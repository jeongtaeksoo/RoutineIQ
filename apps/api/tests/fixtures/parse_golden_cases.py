from __future__ import annotations

from typing import Any


def _entry(
    *,
    activity: str,
    start: str | None,
    end: str | None,
    source_text: str | None,
    time_source: str | None = None,
    time_confidence: str | None = None,
    time_window: str | None = None,
    crosses_midnight: bool = False,
    confidence: str = "high",
) -> dict[str, Any]:
    return {
        "start": start,
        "end": end,
        "activity": activity,
        "energy": None,
        "focus": None,
        "note": None,
        "tags": [],
        "confidence": confidence,
        "source_text": source_text,
        "time_source": time_source,
        "time_confidence": time_confidence,
        "time_window": time_window,
        "crosses_midnight": crosses_midnight,
    }


def _meta() -> dict[str, Any]:
    return {
        "mood": None,
        "sleep_quality": None,
        "sleep_hours": None,
        "stress_level": None,
    }


PARSE_GOLDEN_CASES: list[dict[str, Any]] = [
    {
        "id": "explicit_range_ko",
        "locale": "ko",
        "diary_text": "09:00~10:30 코드 작성. 11:00 팀 회의.",
        "mock_response": {
            "entries": [
                _entry(activity="코드 작성", start="09:00", end="10:30", source_text="09:00~10:30 코드 작성", time_source="explicit", time_confidence="high"),
                _entry(activity="팀 회의", start="11:00", end="11:40", source_text="11:00 팀 회의", time_source="explicit", time_confidence="high"),
            ],
            "meta": _meta(),
            "ai_note": "명시된 시간을 기준으로 분리했습니다.",
        },
        "expected_min_entries": 2,
        "expect_all_times_null": False,
        "expect_crosses_midnight": False,
        "expected_issue_contains": [],
    },
    {
        "id": "explicit_ampm_half_ko",
        "locale": "ko",
        "diary_text": "오전 7시 반 기상 후 오전 9시 문서 정리, 오후 1시 20분 고객 통화.",
        "mock_response": {
            "entries": [
                _entry(activity="기상", start="07:30", end="08:00", source_text="오전 7시 반 기상", time_source="explicit", time_confidence="high"),
                _entry(activity="문서 정리", start="09:00", end="10:00", source_text="오전 9시 문서 정리", time_source="explicit", time_confidence="high"),
                _entry(activity="고객 통화", start="13:20", end="13:50", source_text="오후 1시 20분 고객 통화", time_source="explicit", time_confidence="high"),
            ],
            "meta": _meta(),
            "ai_note": "오전/오후와 반 표현을 정규화했습니다.",
        },
        "expected_min_entries": 3,
        "expect_all_times_null": False,
        "expect_crosses_midnight": False,
        "expected_issue_contains": [],
    },
    {
        "id": "explicit_hour_range_ko",
        "locale": "ko",
        "diary_text": "7-9시 집중 공부, 10시 휴식.",
        "mock_response": {
            "entries": [
                _entry(activity="집중 공부", start="07:00", end="09:00", source_text="7-9시 집중 공부", time_source="explicit", time_confidence="high"),
                _entry(activity="휴식", start="10:00", end="10:20", source_text="10시 휴식", time_source="explicit", time_confidence="high"),
            ],
            "meta": _meta(),
            "ai_note": "시 범위 표현을 반영했습니다.",
        },
        "expected_min_entries": 2,
        "expect_all_times_null": False,
        "expect_crosses_midnight": False,
        "expected_issue_contains": [],
    },
    {
        "id": "window_only_ko_no_hallucinated_time",
        "locale": "ko",
        "diary_text": "아침에는 메일 처리, 점심엔 회의, 저녁엔 산책.",
        "mock_response": {
            "entries": [
                _entry(activity="메일 처리", start="09:00", end="09:40", source_text="아침에는 메일 처리", time_source="window", time_confidence="low", time_window="morning"),
                _entry(activity="회의", start="12:30", end="13:00", source_text="점심엔 회의", time_source="window", time_confidence="low", time_window="lunch"),
                _entry(activity="산책", start="19:00", end="19:20", source_text="저녁엔 산책", time_source="window", time_confidence="low", time_window="evening"),
            ],
            "meta": _meta(),
            "ai_note": "문맥 기반 시간 추정입니다.",
        },
        "expected_min_entries": 3,
        "expect_all_times_null": True,
        "expect_crosses_midnight": False,
        "expected_issue_contains": ["no explicit time evidence"],
    },
    {
        "id": "window_only_en_no_hallucinated_time",
        "locale": "en",
        "diary_text": "Morning email cleanup, lunch meeting, evening walk.",
        "mock_response": {
            "entries": [
                _entry(activity="Email cleanup", start="09:00", end="09:30", source_text="Morning email cleanup", time_source="window", time_confidence="low", time_window="morning"),
                _entry(activity="Meeting", start="12:00", end="12:45", source_text="lunch meeting", time_source="window", time_confidence="low", time_window="lunch"),
                _entry(activity="Walk", start="18:30", end="19:00", source_text="evening walk", time_source="window", time_confidence="low", time_window="evening"),
            ],
            "meta": _meta(),
            "ai_note": "Context windows were used.",
        },
        "expected_min_entries": 3,
        "expect_all_times_null": True,
        "expect_crosses_midnight": False,
        "expected_issue_contains": ["no explicit time evidence"],
    },
    {
        "id": "no_time_info_ko",
        "locale": "ko",
        "diary_text": "하루종일 보고서 작성하고 중간에 잠깐 쉬었다.",
        "mock_response": {
            "entries": [
                _entry(activity="보고서 작성", start="10:00", end="12:00", source_text="보고서 작성", time_source="unknown", time_confidence="low"),
                _entry(activity="짧은 휴식", start="15:00", end="15:10", source_text="잠깐 쉬었다", time_source="unknown", time_confidence="low"),
            ],
            "meta": _meta(),
            "ai_note": "시간 정보가 부족합니다.",
        },
        "expected_min_entries": 2,
        "expect_all_times_null": True,
        "expect_crosses_midnight": False,
        "expected_issue_contains": ["no explicit time evidence"],
    },
    {
        "id": "split_multi_activity_sentence_ko",
        "locale": "ko",
        "diary_text": "09:00에 기상하고 09:30 아침 먹고 10:00 출근했다.",
        "mock_response": {
            "entries": [
                _entry(activity="기상", start="09:00", end="09:20", source_text="09:00에 기상", time_source="explicit", time_confidence="high"),
                _entry(activity="아침 식사", start="09:30", end="09:50", source_text="09:30 아침 먹고", time_source="explicit", time_confidence="high"),
                _entry(activity="출근", start="10:00", end="10:40", source_text="10:00 출근", time_source="explicit", time_confidence="high"),
            ],
            "meta": _meta(),
            "ai_note": "한 문장 내 활동을 분리했습니다.",
        },
        "expected_min_entries": 3,
        "expect_all_times_null": False,
        "expect_crosses_midnight": False,
        "expected_issue_contains": [],
    },
    {
        "id": "crosses_midnight_explicit_ko",
        "locale": "ko",
        "diary_text": "23:30~01:00 배포 모니터링 후 취침.",
        "mock_response": {
            "entries": [
                _entry(activity="배포 모니터링", start="23:30", end="01:00", source_text="23:30~01:00 배포 모니터링", time_source="explicit", time_confidence="high", crosses_midnight=True),
            ],
            "meta": _meta(),
            "ai_note": "자정 교차 구간을 유지했습니다.",
        },
        "expected_min_entries": 1,
        "expect_all_times_null": False,
        "expect_crosses_midnight": True,
        "expected_issue_contains": [],
    },
    {
        "id": "invalid_order_downgrade_ko",
        "locale": "ko",
        "diary_text": "14:00~15:00 코드 리뷰.",
        "mock_response": {
            "entries": [
                _entry(activity="코드 리뷰", start="15:00", end="14:00", source_text="14:00~15:00 코드 리뷰", time_source="explicit", time_confidence="high"),
            ],
            "meta": _meta(),
            "ai_note": "시간 순서 점검 필요.",
        },
        "expected_min_entries": 1,
        "expect_all_times_null": True,
        "expect_crosses_midnight": False,
        "expected_issue_contains": ["end must be after start"],
    },
    {
        "id": "overlap_downgrade_ko",
        "locale": "ko",
        "diary_text": "09:00~10:00 기획. 09:30~10:30 개발.",
        "mock_response": {
            "entries": [
                _entry(activity="기획", start="09:00", end="10:00", source_text="09:00~10:00 기획", time_source="explicit", time_confidence="high"),
                _entry(activity="개발", start="09:30", end="10:30", source_text="09:30~10:30 개발", time_source="explicit", time_confidence="high"),
            ],
            "meta": _meta(),
            "ai_note": "겹치는 구간이 있습니다.",
        },
        "expected_min_entries": 2,
        "expect_all_times_null": False,
        "expect_crosses_midnight": False,
        "expected_issue_contains": ["overlap"],
    },
    {
        "id": "missing_source_and_time_evidence_ko",
        "locale": "ko",
        "diary_text": "09:00~10:00 문서 작업.",
        "mock_response": {
            "entries": [
                _entry(activity="리뷰", start="08:00", end="09:00", source_text="임의 텍스트", time_source="explicit", time_confidence="high"),
            ],
            "meta": _meta(),
            "ai_note": "근거가 약합니다.",
        },
        "expected_min_entries": 1,
        "expect_all_times_null": True,
        "expect_crosses_midnight": False,
        "expected_issue_contains": ["source_text not found", "entry-level explicit evidence missing"],
    },
    {
        "id": "relative_with_anchor_ko",
        "locale": "ko",
        "diary_text": "10:00 회의 후 30분 뒤 초안 검토.",
        "mock_response": {
            "entries": [
                _entry(activity="회의", start="10:00", end="10:30", source_text="10:00 회의", time_source="explicit", time_confidence="high"),
                _entry(activity="초안 검토", start="10:30", end="11:00", source_text="30분 뒤 초안 검토", time_source="relative", time_confidence="medium"),
            ],
            "meta": _meta(),
            "ai_note": "상대 시간은 앵커 시간 기준으로 반영했습니다.",
        },
        "expected_min_entries": 2,
        "expect_all_times_null": False,
        "expect_crosses_midnight": False,
        "expected_issue_contains": [],
    },
]
