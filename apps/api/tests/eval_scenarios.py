from __future__ import annotations

from typing import Any


def _p_entry(
    start: str,
    end: str,
    activity: str,
    *,
    energy: int | None,
    focus: int | None,
    note: str | None,
    tags: list[str],
    confidence: str,
) -> dict[str, Any]:
    return {
        "start": start,
        "end": end,
        "activity": activity,
        "energy": energy,
        "focus": focus,
        "note": note,
        "tags": tags,
        "confidence": confidence,
    }


def _p_meta(
    *,
    mood: str | None,
    sleep_quality: int | None,
    sleep_hours: float | None,
    stress_level: int | None,
) -> dict[str, Any]:
    return {
        "mood": mood,
        "sleep_quality": sleep_quality,
        "sleep_hours": sleep_hours,
        "stress_level": stress_level,
    }


def _p_case(
    *,
    scenario_name: str,
    locale: str,
    diary_text: str,
    entries: list[dict[str, Any]],
    meta: dict[str, Any],
    ai_note: str,
    expected_entry_count: int,
    expected_has_meta: bool,
) -> dict[str, Any]:
    return {
        "scenario_name": scenario_name,
        "locale": locale,
        "diary_text": diary_text,
        "mock_response": {
            "entries": entries,
            "meta": meta,
            "ai_note": ai_note,
        },
        "expected_entry_count": expected_entry_count,
        "expected_has_meta": expected_has_meta,
    }


_PARSE_BASIC_KO = [
    _p_case(
        scenario_name="parse_ko_basic_01",
        locale="ko",
        diary_text="09시부터 집중해서 코딩했고 12시에 점심, 14시에 팀 회의 후 저녁에 운동했다.",
        entries=[
            _p_entry("09:00", "11:30", "집중 코딩", energy=4, focus=5, note="핵심 기능 구현", tags=["개발", "집중"], confidence="high"),
            _p_entry("14:00", "15:00", "팀 회의", energy=3, focus=3, note="스프린트 정리", tags=["회의"], confidence="high"),
            _p_entry("19:00", "20:00", "저녁 운동", energy=4, focus=3, note="러닝 5km", tags=["운동"], confidence="high"),
        ],
        meta=_p_meta(mood="good", sleep_quality=4, sleep_hours=7.0, stress_level=2),
        ai_note="명시된 시간을 기준으로 활동 블록을 나눴습니다.",
        expected_entry_count=3,
        expected_has_meta=True,
    ),
    _p_case(
        scenario_name="parse_ko_basic_02",
        locale="ko",
        diary_text="아침 8시 메일 정리, 10시 제안서 작성, 오후 3시 고객 미팅, 밤에는 독서했다.",
        entries=[
            _p_entry("08:00", "08:40", "메일 정리", energy=3, focus=3, note=None, tags=["운영"], confidence="high"),
            _p_entry("10:00", "12:00", "제안서 작성", energy=4, focus=4, note="초안 완성", tags=["문서"], confidence="high"),
            _p_entry("15:00", "16:00", "고객 미팅", energy=3, focus=3, note="요구사항 확인", tags=["미팅"], confidence="high"),
            _p_entry("21:00", "21:40", "독서", energy=3, focus=2, note=None, tags=["회복"], confidence="medium"),
        ],
        meta=_p_meta(mood="neutral", sleep_quality=3, sleep_hours=6.5, stress_level=3),
        ai_note="일기 문장에서 드러난 시간 표현을 우선 적용했습니다.",
        expected_entry_count=4,
        expected_has_meta=True,
    ),
    _p_case(
        scenario_name="parse_ko_basic_03",
        locale="ko",
        diary_text="07:30 출근 준비 후 09:30~11:30 분석 작업, 점심 후 13:30 발표 준비, 퇴근 전 회고를 했다.",
        entries=[
            _p_entry("07:30", "08:10", "출근 준비", energy=3, focus=2, note=None, tags=["일상"], confidence="high"),
            _p_entry("09:30", "11:30", "데이터 분석", energy=4, focus=4, note="지표 검토", tags=["분석"], confidence="high"),
            _p_entry("13:30", "15:00", "발표 준비", energy=4, focus=4, note=None, tags=["준비"], confidence="high"),
            _p_entry("17:30", "18:00", "퇴근 전 회고", energy=2, focus=3, note="내일 우선순위 정리", tags=["회고"], confidence="medium"),
        ],
        meta=_p_meta(mood="good", sleep_quality=4, sleep_hours=7.2, stress_level=2),
        ai_note="범위 시간과 단일 시간을 함께 반영해 구조화했습니다.",
        expected_entry_count=4,
        expected_has_meta=True,
    ),
    _p_case(
        scenario_name="parse_ko_basic_04",
        locale="ko",
        diary_text="오전 9시 기획안 정리, 11시 동료와 싱크, 오후 2시 개발, 6시 산책으로 마무리.",
        entries=[
            _p_entry("09:00", "10:30", "기획안 정리", energy=4, focus=4, note=None, tags=["기획"], confidence="high"),
            _p_entry("11:00", "11:40", "동료 싱크", energy=3, focus=3, note=None, tags=["협업"], confidence="high"),
            _p_entry("14:00", "17:30", "개발 작업", energy=4, focus=5, note="버그 수정", tags=["개발"], confidence="high"),
            _p_entry("18:00", "18:30", "산책", energy=3, focus=2, note=None, tags=["회복"], confidence="high"),
        ],
        meta=_p_meta(mood="good", sleep_quality=4, sleep_hours=7.4, stress_level=2),
        ai_note="활동 순서를 기준으로 시간대를 매끄럽게 정렬했습니다.",
        expected_entry_count=4,
        expected_has_meta=True,
    ),
    _p_case(
        scenario_name="parse_ko_basic_05",
        locale="ko",
        diary_text="아침 운동 후 10시 문서 작업, 오후 1시 코드 리뷰, 4시 회의, 저녁엔 가족과 시간.",
        entries=[
            _p_entry("07:00", "07:40", "아침 운동", energy=4, focus=3, note=None, tags=["운동"], confidence="medium"),
            _p_entry("10:00", "12:00", "문서 작업", energy=3, focus=4, note="정책 문서 업데이트", tags=["문서"], confidence="high"),
            _p_entry("13:00", "14:00", "코드 리뷰", energy=3, focus=4, note=None, tags=["개발"], confidence="high"),
            _p_entry("16:00", "17:00", "프로젝트 회의", energy=2, focus=3, note=None, tags=["회의"], confidence="high"),
            _p_entry("20:00", "21:00", "가족과 시간", energy=3, focus=2, note=None, tags=["휴식"], confidence="medium"),
        ],
        meta=_p_meta(mood="neutral", sleep_quality=3, sleep_hours=6.8, stress_level=3),
        ai_note="명시된 이벤트를 중심으로 활동 블록을 구성했습니다.",
        expected_entry_count=5,
        expected_has_meta=True,
    ),
]

_PARSE_BASIC_EN = [
    _p_case(
        scenario_name="parse_en_basic_01",
        locale="en",
        diary_text="Started deep work at 9am, had lunch at noon, joined a meeting at 2pm, and went to the gym at 7pm.",
        entries=[
            _p_entry("09:00", "11:30", "Deep work", energy=4, focus=5, note="Feature implementation", tags=["coding", "focus"], confidence="high"),
            _p_entry("14:00", "15:00", "Team meeting", energy=3, focus=3, note=None, tags=["meeting"], confidence="high"),
            _p_entry("19:00", "20:00", "Gym", energy=4, focus=3, note="Upper-body session", tags=["fitness"], confidence="high"),
        ],
        meta=_p_meta(mood="good", sleep_quality=4, sleep_hours=7.5, stress_level=2),
        ai_note="I mapped explicit time expressions into structured blocks.",
        expected_entry_count=3,
        expected_has_meta=True,
    ),
    _p_case(
        scenario_name="parse_en_basic_02",
        locale="en",
        diary_text="Checked emails at 8, wrote a proposal at 10, customer call at 3, then read before bed.",
        entries=[
            _p_entry("08:00", "08:40", "Email triage", energy=3, focus=3, note=None, tags=["ops"], confidence="high"),
            _p_entry("10:00", "12:00", "Proposal writing", energy=4, focus=4, note="Draft completed", tags=["writing"], confidence="high"),
            _p_entry("15:00", "16:00", "Customer call", energy=3, focus=3, note=None, tags=["call"], confidence="high"),
            _p_entry("21:00", "21:40", "Reading", energy=2, focus=2, note=None, tags=["recovery"], confidence="medium"),
        ],
        meta=_p_meta(mood="neutral", sleep_quality=3, sleep_hours=6.3, stress_level=3),
        ai_note="The parser prioritized the sequence and explicit hours from your diary.",
        expected_entry_count=4,
        expected_has_meta=True,
    ),
    _p_case(
        scenario_name="parse_en_basic_03",
        locale="en",
        diary_text="7:30 commute, 9:30 to 11:30 analysis, 1:30 presentation prep, and end-of-day review.",
        entries=[
            _p_entry("07:30", "08:15", "Commute", energy=3, focus=2, note=None, tags=["life"], confidence="high"),
            _p_entry("09:30", "11:30", "Analysis work", energy=4, focus=4, note="KPI review", tags=["analysis"], confidence="high"),
            _p_entry("13:30", "15:00", "Presentation prep", energy=4, focus=4, note=None, tags=["prep"], confidence="high"),
            _p_entry("17:30", "18:00", "Daily review", energy=2, focus=3, note="Plan tomorrow", tags=["review"], confidence="medium"),
        ],
        meta=_p_meta(mood="good", sleep_quality=4, sleep_hours=7.1, stress_level=2),
        ai_note="Range-based and point-in-time expressions were normalized to HH:MM windows.",
        expected_entry_count=4,
        expected_has_meta=True,
    ),
    _p_case(
        scenario_name="parse_en_basic_04",
        locale="en",
        diary_text="Planned at 9, sync at 11, coding from 2, and a short walk at 6.",
        entries=[
            _p_entry("09:00", "10:20", "Planning", energy=4, focus=4, note=None, tags=["planning"], confidence="high"),
            _p_entry("11:00", "11:40", "Team sync", energy=3, focus=3, note=None, tags=["sync"], confidence="high"),
            _p_entry("14:00", "17:15", "Coding", energy=4, focus=5, note="Bug fixes", tags=["coding"], confidence="high"),
            _p_entry("18:00", "18:30", "Walk", energy=3, focus=2, note=None, tags=["recovery"], confidence="high"),
        ],
        meta=_p_meta(mood="good", sleep_quality=4, sleep_hours=7.0, stress_level=2),
        ai_note="I preserved your order of events and inferred reasonable durations.",
        expected_entry_count=4,
        expected_has_meta=True,
    ),
    _p_case(
        scenario_name="parse_en_basic_05",
        locale="en",
        diary_text="Morning workout, document edits at 10, code review after lunch, 4pm meeting, family time at night.",
        entries=[
            _p_entry("07:00", "07:40", "Morning workout", energy=4, focus=3, note=None, tags=["fitness"], confidence="medium"),
            _p_entry("10:00", "12:00", "Document editing", energy=3, focus=4, note=None, tags=["writing"], confidence="high"),
            _p_entry("13:00", "14:00", "Code review", energy=3, focus=4, note=None, tags=["engineering"], confidence="high"),
            _p_entry("16:00", "17:00", "Project meeting", energy=2, focus=3, note=None, tags=["meeting"], confidence="high"),
            _p_entry("20:00", "21:00", "Family time", energy=3, focus=2, note=None, tags=["life"], confidence="medium"),
        ],
        meta=_p_meta(mood="neutral", sleep_quality=3, sleep_hours=6.9, stress_level=3),
        ai_note="I converted your narrative into a practical timeline without adding external facts.",
        expected_entry_count=5,
        expected_has_meta=True,
    ),
]

_PARSE_NO_TIME = [
    _p_case(
        scenario_name="parse_notime_ko_01",
        locale="ko",
        diary_text="하루종일 보고서를 썼고 중간에 커피를 마시며 잠깐 쉬었다. 저녁에는 메일을 정리했다.",
        entries=[
            _p_entry("09:30", "12:30", "보고서 작성", energy=3, focus=4, note=None, tags=["문서"], confidence="low"),
            _p_entry("15:00", "15:20", "커피 휴식", energy=3, focus=2, note=None, tags=["회복"], confidence="low"),
            _p_entry("20:00", "20:40", "메일 정리", energy=2, focus=3, note=None, tags=["운영"], confidence="low"),
        ],
        meta=_p_meta(mood="neutral", sleep_quality=None, sleep_hours=None, stress_level=3),
        ai_note="시간이 명시되지 않아 일반적인 업무 흐름 기준으로 보수 추정했습니다.",
        expected_entry_count=3,
        expected_has_meta=True,
    ),
    _p_case(
        scenario_name="parse_notime_en_02",
        locale="en",
        diary_text="Spent most of the day writing a report, took a coffee break, and wrapped up emails at night.",
        entries=[
            _p_entry("09:30", "12:30", "Report writing", energy=3, focus=4, note=None, tags=["writing"], confidence="low"),
            _p_entry("15:00", "15:20", "Coffee break", energy=3, focus=2, note=None, tags=["recovery"], confidence="low"),
            _p_entry("20:00", "20:40", "Email wrap-up", energy=2, focus=3, note=None, tags=["ops"], confidence="low"),
        ],
        meta=_p_meta(mood="neutral", sleep_quality=None, sleep_hours=None, stress_level=3),
        ai_note="No explicit timestamps were found, so I estimated conservative windows from context.",
        expected_entry_count=3,
        expected_has_meta=True,
    ),
    _p_case(
        scenario_name="parse_notime_ko_03",
        locale="ko",
        diary_text="오전엔 계속 기획안을 다듬었고 오후엔 요청 대응만 하다가 늦게 퇴근했다.",
        entries=[
            _p_entry("09:00", "12:00", "기획안 다듬기", energy=3, focus=4, note=None, tags=["기획"], confidence="low"),
            _p_entry("13:30", "17:30", "요청 대응", energy=2, focus=3, note=None, tags=["협업"], confidence="low"),
            _p_entry("18:00", "18:30", "퇴근 준비", energy=2, focus=2, note=None, tags=["일상"], confidence="low"),
        ],
        meta=_p_meta(mood="low", sleep_quality=None, sleep_hours=None, stress_level=4),
        ai_note="시간 정보가 없어 문맥상의 순서와 강도를 기준으로 시간대를 잡았습니다.",
        expected_entry_count=3,
        expected_has_meta=True,
    ),
    _p_case(
        scenario_name="parse_notime_en_04",
        locale="en",
        diary_text="Morning planning turned into execution, then I got pulled into chats and ended the day tired.",
        entries=[
            _p_entry("09:00", "10:30", "Planning", energy=3, focus=3, note=None, tags=["planning"], confidence="low"),
            _p_entry("10:30", "13:00", "Execution", energy=3, focus=4, note=None, tags=["delivery"], confidence="low"),
            _p_entry("14:30", "17:30", "Chat-heavy coordination", energy=2, focus=2, note=None, tags=["coordination"], confidence="low"),
        ],
        meta=_p_meta(mood="low", sleep_quality=None, sleep_hours=None, stress_level=4),
        ai_note="The day lacked explicit time references, so blocks were inferred conservatively.",
        expected_entry_count=3,
        expected_has_meta=True,
    ),
    _p_case(
        scenario_name="parse_notime_ko_05",
        locale="ko",
        diary_text="계속 자료 조사만 했다가 중간에 산책하고, 밤에 다시 정리했다.",
        entries=[
            _p_entry("10:00", "13:00", "자료 조사", energy=3, focus=4, note=None, tags=["리서치"], confidence="low"),
            _p_entry("16:00", "16:25", "산책", energy=3, focus=2, note=None, tags=["회복"], confidence="low"),
            _p_entry("21:00", "22:00", "결과 정리", energy=2, focus=3, note=None, tags=["정리"], confidence="low"),
        ],
        meta=_p_meta(mood="neutral", sleep_quality=None, sleep_hours=None, stress_level=3),
        ai_note="명시된 시간이 없어서 일반적인 하루 흐름에 맞춰 구간을 추정했습니다.",
        expected_entry_count=3,
        expected_has_meta=True,
    ),
]

_PARSE_MOOD = [
    _p_case(
        scenario_name="parse_mood_ko_01",
        locale="ko",
        diary_text="오늘 너무 피곤해서 집중이 안 됐고 오후에 일찍 퇴근했다. 집에서 바로 잤다.",
        entries=[
            _p_entry("09:30", "11:30", "낮은 집중 업무", energy=2, focus=2, note="자주 멍해짐", tags=["저에너지"], confidence="medium"),
            _p_entry("15:30", "16:00", "조기 퇴근", energy=2, focus=1, note=None, tags=["회복"], confidence="high"),
            _p_entry("21:00", "22:30", "휴식 및 수면 준비", energy=1, focus=1, note=None, tags=["수면"], confidence="medium"),
        ],
        meta=_p_meta(mood="very_low", sleep_quality=2, sleep_hours=5.0, stress_level=4),
        ai_note="피로와 조기 퇴근 신호를 반영해 낮은 에너지 패턴으로 구조화했습니다.",
        expected_entry_count=3,
        expected_has_meta=True,
    ),
    _p_case(
        scenario_name="parse_mood_en_02",
        locale="en",
        diary_text="I felt drained all day, couldn't focus, left work early, and slept right after dinner.",
        entries=[
            _p_entry("09:30", "11:30", "Low-focus admin work", energy=2, focus=2, note="Frequent context loss", tags=["low_energy"], confidence="medium"),
            _p_entry("15:30", "16:00", "Early sign-off", energy=2, focus=1, note=None, tags=["recovery"], confidence="high"),
            _p_entry("20:30", "22:00", "Rest and sleep prep", energy=1, focus=1, note=None, tags=["sleep"], confidence="medium"),
        ],
        meta=_p_meta(mood="very_low", sleep_quality=2, sleep_hours=5.2, stress_level=4),
        ai_note="Your language strongly signaled fatigue, so energy and focus were inferred as low.",
        expected_entry_count=3,
        expected_has_meta=True,
    ),
    _p_case(
        scenario_name="parse_mood_ko_03",
        locale="ko",
        diary_text="기분은 괜찮았지만 잠이 부족해서 오전에는 느렸다. 점심 후에는 조금 살아났다.",
        entries=[
            _p_entry("09:00", "11:00", "느린 업무 시작", energy=2, focus=2, note=None, tags=["수면부족"], confidence="medium"),
            _p_entry("13:30", "16:00", "집중 회복 작업", energy=3, focus=4, note=None, tags=["회복"], confidence="medium"),
        ],
        meta=_p_meta(mood="neutral", sleep_quality=2, sleep_hours=4.8, stress_level=3),
        ai_note="컨디션 서술을 바탕으로 오전 저에너지/오후 회복 패턴으로 정리했습니다.",
        expected_entry_count=2,
        expected_has_meta=True,
    ),
    _p_case(
        scenario_name="parse_mood_en_04",
        locale="en",
        diary_text="Mood was stable but my stress spiked before the client review, so I needed a reset walk.",
        entries=[
            _p_entry("10:00", "12:00", "Preparation work", energy=3, focus=3, note=None, tags=["prep"], confidence="medium"),
            _p_entry("14:00", "14:20", "Reset walk", energy=3, focus=2, note=None, tags=["recovery"], confidence="high"),
            _p_entry("15:00", "16:00", "Client review", energy=3, focus=3, note=None, tags=["review"], confidence="medium"),
        ],
        meta=_p_meta(mood="neutral", sleep_quality=3, sleep_hours=6.5, stress_level=4),
        ai_note="Stress-related cues were used to infer a recovery block before review.",
        expected_entry_count=3,
        expected_has_meta=True,
    ),
    _p_case(
        scenario_name="parse_mood_ko_05",
        locale="ko",
        diary_text="하루 내내 마음이 가벼웠고 집중도 잘됐다. 저녁엔 가볍게 산책하며 마무리했다.",
        entries=[
            _p_entry("09:30", "12:00", "집중 업무", energy=4, focus=5, note=None, tags=["집중"], confidence="medium"),
            _p_entry("14:00", "17:00", "실행 업무", energy=4, focus=4, note=None, tags=["실행"], confidence="medium"),
            _p_entry("19:30", "20:00", "가벼운 산책", energy=3, focus=2, note=None, tags=["회복"], confidence="medium"),
        ],
        meta=_p_meta(mood="great", sleep_quality=4, sleep_hours=7.8, stress_level=1),
        ai_note="긍정적 감정과 높은 집중 신호를 반영했습니다.",
        expected_entry_count=3,
        expected_has_meta=True,
    ),
]

_PARSE_DENSE = [
    _p_case(
        scenario_name="parse_dense_ko_01",
        locale="ko",
        diary_text="아침 운동, 출근, 메일, 스탠드업, 코딩, 점심, 고객콜, 문서화, 코드리뷰, 저녁 회고까지 숨가빴다.",
        entries=[
            _p_entry("06:30", "07:00", "아침 운동", energy=4, focus=3, note=None, tags=["운동"], confidence="high"),
            _p_entry("08:30", "09:00", "출근 및 준비", energy=3, focus=2, note=None, tags=["일상"], confidence="high"),
            _p_entry("09:00", "09:40", "메일 처리", energy=3, focus=3, note=None, tags=["운영"], confidence="high"),
            _p_entry("10:00", "10:20", "스탠드업", energy=3, focus=3, note=None, tags=["회의"], confidence="high"),
            _p_entry("10:30", "12:00", "코딩", energy=4, focus=5, note=None, tags=["개발"], confidence="high"),
            _p_entry("12:00", "13:00", "점심", energy=3, focus=2, note=None, tags=["회복"], confidence="high"),
            _p_entry("13:30", "14:00", "고객 콜", energy=3, focus=3, note=None, tags=["콜"], confidence="high"),
            _p_entry("14:30", "15:20", "문서화", energy=3, focus=4, note=None, tags=["문서"], confidence="high"),
            _p_entry("16:00", "16:40", "코드 리뷰", energy=3, focus=4, note=None, tags=["리뷰"], confidence="high"),
            _p_entry("20:30", "21:00", "저녁 회고", energy=2, focus=3, note=None, tags=["회고"], confidence="medium"),
        ],
        meta=_p_meta(mood="neutral", sleep_quality=3, sleep_hours=6.6, stress_level=4),
        ai_note="활동 밀도가 높아 세부 블록을 촘촘히 분할했습니다.",
        expected_entry_count=10,
        expected_has_meta=True,
    ),
    _p_case(
        scenario_name="parse_dense_en_02",
        locale="en",
        diary_text="Workout, commute, inbox, standup, coding, lunch, client call, docs, review, and night reflection packed my day.",
        entries=[
            _p_entry("06:30", "07:00", "Workout", energy=4, focus=3, note=None, tags=["fitness"], confidence="high"),
            _p_entry("08:30", "09:00", "Commute and setup", energy=3, focus=2, note=None, tags=["life"], confidence="high"),
            _p_entry("09:00", "09:40", "Inbox triage", energy=3, focus=3, note=None, tags=["ops"], confidence="high"),
            _p_entry("10:00", "10:20", "Standup", energy=3, focus=3, note=None, tags=["meeting"], confidence="high"),
            _p_entry("10:30", "12:00", "Coding", energy=4, focus=5, note=None, tags=["engineering"], confidence="high"),
            _p_entry("12:00", "13:00", "Lunch", energy=3, focus=2, note=None, tags=["recovery"], confidence="high"),
            _p_entry("13:30", "14:00", "Client call", energy=3, focus=3, note=None, tags=["call"], confidence="high"),
            _p_entry("14:30", "15:20", "Documentation", energy=3, focus=4, note=None, tags=["docs"], confidence="high"),
            _p_entry("16:00", "16:40", "Code review", energy=3, focus=4, note=None, tags=["review"], confidence="high"),
            _p_entry("20:30", "21:00", "Night reflection", energy=2, focus=3, note=None, tags=["reflection"], confidence="medium"),
        ],
        meta=_p_meta(mood="neutral", sleep_quality=3, sleep_hours=6.4, stress_level=4),
        ai_note="A high-density day was segmented into short, sequential blocks.",
        expected_entry_count=10,
        expected_has_meta=True,
    ),
    _p_case(
        scenario_name="parse_dense_ko_03",
        locale="ko",
        diary_text="오늘은 수업, 과제, 팀플, 아르바이트, 이동, 식사, 복습, 운동, 샤워, 취침 준비까지 전부 했다.",
        entries=[
            _p_entry("08:30", "10:00", "수업", energy=3, focus=3, note=None, tags=["학습"], confidence="high"),
            _p_entry("10:30", "12:00", "과제", energy=4, focus=4, note=None, tags=["학습"], confidence="high"),
            _p_entry("12:00", "12:40", "점심", energy=3, focus=2, note=None, tags=["회복"], confidence="high"),
            _p_entry("13:00", "14:30", "팀플", energy=3, focus=3, note=None, tags=["협업"], confidence="high"),
            _p_entry("15:00", "18:00", "아르바이트", energy=2, focus=3, note=None, tags=["일"], confidence="high"),
            _p_entry("18:00", "18:40", "이동", energy=2, focus=1, note=None, tags=["일상"], confidence="high"),
            _p_entry("19:00", "20:00", "복습", energy=3, focus=4, note=None, tags=["학습"], confidence="high"),
            _p_entry("20:10", "20:50", "운동", energy=3, focus=2, note=None, tags=["운동"], confidence="high"),
            _p_entry("21:00", "21:20", "샤워", energy=2, focus=1, note=None, tags=["회복"], confidence="high"),
            _p_entry("22:00", "22:30", "취침 준비", energy=1, focus=1, note=None, tags=["수면"], confidence="high"),
        ],
        meta=_p_meta(mood="low", sleep_quality=3, sleep_hours=6.0, stress_level=4),
        ai_note="활동이 많아도 순서와 맥락을 유지해 블록을 정리했습니다.",
        expected_entry_count=10,
        expected_has_meta=True,
    ),
    _p_case(
        scenario_name="parse_dense_en_04",
        locale="en",
        diary_text="Classes, assignment, group work, part-time shift, commute, meal, review, workout, shower, and sleep prep all happened today.",
        entries=[
            _p_entry("08:30", "10:00", "Class", energy=3, focus=3, note=None, tags=["study"], confidence="high"),
            _p_entry("10:30", "12:00", "Assignment", energy=4, focus=4, note=None, tags=["study"], confidence="high"),
            _p_entry("12:00", "12:40", "Lunch", energy=3, focus=2, note=None, tags=["recovery"], confidence="high"),
            _p_entry("13:00", "14:30", "Group work", energy=3, focus=3, note=None, tags=["collab"], confidence="high"),
            _p_entry("15:00", "18:00", "Part-time shift", energy=2, focus=3, note=None, tags=["work"], confidence="high"),
            _p_entry("18:00", "18:40", "Commute", energy=2, focus=1, note=None, tags=["life"], confidence="high"),
            _p_entry("19:00", "20:00", "Review notes", energy=3, focus=4, note=None, tags=["study"], confidence="high"),
            _p_entry("20:10", "20:50", "Workout", energy=3, focus=2, note=None, tags=["fitness"], confidence="high"),
            _p_entry("21:00", "21:20", "Shower", energy=2, focus=1, note=None, tags=["recovery"], confidence="high"),
            _p_entry("22:00", "22:30", "Sleep prep", energy=1, focus=1, note=None, tags=["sleep"], confidence="high"),
        ],
        meta=_p_meta(mood="low", sleep_quality=3, sleep_hours=6.1, stress_level=4),
        ai_note="The parser kept the dense sequence intact and avoided fabricating extra events.",
        expected_entry_count=10,
        expected_has_meta=True,
    ),
    _p_case(
        scenario_name="parse_dense_ko_05",
        locale="ko",
        diary_text="기상 후 명상, 아침 준비, 출근, 기획 회의, 개발, 점심, 테스트, 고객응대, 정리, 야간 독서까지 했다.",
        entries=[
            _p_entry("06:20", "06:35", "명상", energy=3, focus=2, note=None, tags=["회복"], confidence="high"),
            _p_entry("06:35", "07:20", "아침 준비", energy=3, focus=2, note=None, tags=["일상"], confidence="high"),
            _p_entry("08:20", "09:00", "출근", energy=3, focus=2, note=None, tags=["이동"], confidence="high"),
            _p_entry("09:10", "09:50", "기획 회의", energy=3, focus=3, note=None, tags=["회의"], confidence="high"),
            _p_entry("10:00", "12:10", "개발", energy=4, focus=5, note=None, tags=["개발"], confidence="high"),
            _p_entry("12:10", "13:00", "점심", energy=3, focus=2, note=None, tags=["회복"], confidence="high"),
            _p_entry("13:20", "15:00", "테스트", energy=3, focus=4, note=None, tags=["검증"], confidence="high"),
            _p_entry("15:10", "16:10", "고객 응대", energy=2, focus=3, note=None, tags=["응대"], confidence="high"),
            _p_entry("17:30", "18:00", "업무 정리", energy=2, focus=3, note=None, tags=["정리"], confidence="high"),
            _p_entry("21:20", "22:00", "야간 독서", energy=2, focus=2, note=None, tags=["회복"], confidence="medium"),
        ],
        meta=_p_meta(mood="neutral", sleep_quality=3, sleep_hours=6.7, stress_level=3),
        ai_note="높은 활동량을 반영해 시간 블록을 세분화했습니다.",
        expected_entry_count=10,
        expected_has_meta=True,
    ),
]

_PARSE_MINIMAL = [
    _p_case(
        scenario_name="parse_min_ko_01",
        locale="ko",
        diary_text="오늘 야근하고 바로 쉼",
        entries=[
            _p_entry("20:00", "22:00", "야근", energy=2, focus=3, note=None, tags=["업무"], confidence="low"),
            _p_entry("22:00", "22:40", "휴식", energy=2, focus=1, note=None, tags=["회복"], confidence="low"),
        ],
        meta=_p_meta(mood="low", sleep_quality=None, sleep_hours=None, stress_level=4),
        ai_note="짧은 입력이라 핵심 활동만 보수적으로 추출했습니다.",
        expected_entry_count=2,
        expected_has_meta=True,
    ),
    _p_case(
        scenario_name="parse_min_en_02",
        locale="en",
        diary_text="Worked late, then rested.",
        entries=[
            _p_entry("20:00", "22:00", "Overtime work", energy=2, focus=3, note=None, tags=["work"], confidence="low"),
            _p_entry("22:00", "22:40", "Rest", energy=2, focus=1, note=None, tags=["recovery"], confidence="low"),
        ],
        meta=_p_meta(mood="low", sleep_quality=None, sleep_hours=None, stress_level=4),
        ai_note="Input was minimal, so only high-confidence blocks were retained.",
        expected_entry_count=2,
        expected_has_meta=True,
    ),
    _p_case(
        scenario_name="parse_min_ko_03",
        locale="ko",
        diary_text="회의만 하고 끝났다",
        entries=[
            _p_entry("14:00", "15:30", "회의", energy=2, focus=2, note=None, tags=["회의"], confidence="low"),
        ],
        meta=_p_meta(mood=None, sleep_quality=None, sleep_hours=None, stress_level=None),
        ai_note="정보가 제한적이라 단일 활동으로 구조화했습니다.",
        expected_entry_count=1,
        expected_has_meta=False,
    ),
    _p_case(
        scenario_name="parse_min_en_04",
        locale="en",
        diary_text="Mostly meetings today.",
        entries=[
            _p_entry("14:00", "15:30", "Meetings", energy=2, focus=2, note=None, tags=["meeting"], confidence="low"),
        ],
        meta=_p_meta(mood=None, sleep_quality=None, sleep_hours=None, stress_level=None),
        ai_note="The diary was brief, so one conservative activity block was produced.",
        expected_entry_count=1,
        expected_has_meta=False,
    ),
    _p_case(
        scenario_name="parse_min_ko_05",
        locale="ko",
        diary_text="일찍 자고 천천히 회복함",
        entries=[
            _p_entry("22:00", "23:00", "조기 취침 준비", energy=2, focus=1, note=None, tags=["수면"], confidence="low"),
        ],
        meta=_p_meta(mood="neutral", sleep_quality=4, sleep_hours=8.0, stress_level=2),
        ai_note="짧은 문장에서도 수면 회복 신호를 우선 반영했습니다.",
        expected_entry_count=1,
        expected_has_meta=True,
    ),
]

PARSE_SCENARIOS: list[dict[str, Any]] = (
    _PARSE_BASIC_KO
    + _PARSE_BASIC_EN
    + _PARSE_NO_TIME
    + _PARSE_MOOD
    + _PARSE_DENSE
    + _PARSE_MINIMAL
)


def _a_entry(start: str, end: str, activity: str, focus: int, energy: int) -> dict[str, Any]:
    return {
        "start": start,
        "end": end,
        "activity": activity,
        "focus": focus,
        "energy": energy,
        "tags": [],
    }


def _a_report(
    *,
    locale: str,
    summary: str,
    coach_one_liner: str,
    burnout_risk: str,
    comparison_note: str,
    top_deviation: str,
) -> dict[str, Any]:
    if locale == "ko":
        productivity_peaks = [
            {"start": "09:00", "end": "10:30", "reason": "오전 집중이 가장 안정적이었습니다."}
        ]
        failure_patterns = [
            {
                "pattern": "오후 컨텍스트 스위칭",
                "trigger": "회의 직후 메시지 확인",
                "fix": "회의 후 5분 정리 후 다음 블록 시작",
            }
        ]
        tomorrow_routine = [
            {
                "start": "09:00",
                "end": "10:00",
                "activity": "핵심 집중 블록",
                "goal": "가장 중요한 결과물 1개를 먼저 완성",
            },
            {
                "start": "10:10",
                "end": "10:25",
                "activity": "회복 버퍼",
                "goal": "물 마시고 스트레칭으로 전환 피로를 줄이기",
            },
        ]
        if_then_rules = [
            {"if": "회의가 끝나면", "then": "바로 5분 회의 메모를 정리하고 다음 일을 하나만 선택"}
        ]
        micro_advice = [
            {
                "action": "10분 집중 타이머 시작",
                "when": "첫 업무 시작 직전",
                "reason": "시작 마찰을 줄이면 몰입이 빨라집니다",
                "duration_min": 10,
            }
        ]
        weekly_pattern = "최근 며칠간 오전 블록의 집중도가 오후보다 높았습니다."
    else:
        productivity_peaks = [
            {"start": "09:00", "end": "10:30", "reason": "Morning focus stayed the most stable."}
        ]
        failure_patterns = [
            {
                "pattern": "Afternoon context switching",
                "trigger": "Message checks right after meetings",
                "fix": "Take a 5-minute reset note before the next block",
            }
        ]
        tomorrow_routine = [
            {
                "start": "09:00",
                "end": "10:00",
                "activity": "Focus Window",
                "goal": "Finish one highest-impact output first",
            },
            {
                "start": "10:10",
                "end": "10:25",
                "activity": "Recovery Buffer",
                "goal": "Use water and stretching to reduce switch residue",
            },
        ]
        if_then_rules = [
            {"if": "When a meeting ends", "then": "Spend 5 minutes summarizing and pick one next task"}
        ]
        micro_advice = [
            {
                "action": "Start a 10-minute focus timer",
                "when": "right before the first work block",
                "reason": "Reducing start friction improves follow-through",
                "duration_min": 10,
            }
        ]
        weekly_pattern = "Across recent days, morning blocks outperform afternoon blocks on focus."

    return {
        "schema_version": 2,
        "summary": summary,
        "productivity_peaks": productivity_peaks,
        "failure_patterns": failure_patterns,
        "tomorrow_routine": tomorrow_routine,
        "if_then_rules": if_then_rules,
        "coach_one_liner": coach_one_liner,
        "yesterday_plan_vs_actual": {
            "comparison_note": comparison_note,
            "top_deviation": top_deviation,
        },
        "wellbeing_insight": {
            "burnout_risk": burnout_risk,
            "energy_curve_forecast": (
                "오전 상승, 오후 완만 하락 패턴입니다."
                if locale == "ko"
                else "Energy rises in the morning and tapers in the afternoon."
            ),
            "note": (
                "과부하를 막기 위해 회복 버퍼를 먼저 고정하세요."
                if locale == "ko"
                else "Lock a recovery buffer first to prevent overload."
            ),
        },
        "micro_advice": micro_advice,
        "weekly_pattern_insight": weekly_pattern,
    }


def _a_case(
    *,
    scenario_name: str,
    locale: str,
    entries: list[dict[str, Any]],
    has_yesterday_plan: bool,
    recent_days: int,
    profile: dict[str, Any],
    summary: str,
    coach: str,
    burnout_risk: str,
) -> dict[str, Any]:
    return {
        "scenario_name": scenario_name,
        "locale": locale,
        "entries": entries,
        "has_yesterday_plan": has_yesterday_plan,
        "recent_days": recent_days,
        "profile": profile,
        "mock_report": _a_report(
            locale=locale,
            summary=summary,
            coach_one_liner=coach,
            burnout_risk=burnout_risk,
            comparison_note=(
                "전일 계획 대비 오후 블록이 20분 지연되었습니다."
                if locale == "ko"
                else "Afternoon blocks slipped by about 20 minutes versus yesterday's plan."
            ),
            top_deviation=(
                "오후 시작 지연"
                if locale == "ko"
                else "Afternoon start delay"
            ),
        ),
    }


_ANALYZE_OFFICE = [
    _a_case(
        scenario_name="analyze_office_ko_01",
        locale="ko",
        entries=[
            _a_entry("09:00", "10:00", "메일 정리", 3, 3),
            _a_entry("10:00", "11:00", "팀 회의", 3, 2),
            _a_entry("11:10", "12:20", "기획 문서 작성", 4, 4),
            _a_entry("14:00", "16:00", "실행 작업", 4, 4),
        ],
        has_yesterday_plan=True,
        recent_days=6,
        profile={"age_group": "25_34", "gender": "prefer_not_to_say", "job_family": "office_worker", "work_mode": "fixed"},
        summary="회의가 많은 날에도 오전 후반과 오후 초반에 집중 창이 형성되었습니다.",
        coach="회의가 끝난 직후 5분 정리 습관을 넣으면 오후 집중이 더 오래 유지됩니다.",
        burnout_risk="medium",
    ),
    _a_case(
        scenario_name="analyze_office_en_02",
        locale="en",
        entries=[
            _a_entry("09:00", "09:40", "Inbox", 3, 3),
            _a_entry("10:00", "11:30", "Stakeholder meeting", 2, 3),
            _a_entry("13:00", "15:00", "Execution", 4, 4),
            _a_entry("15:30", "16:30", "Review", 3, 3),
        ],
        has_yesterday_plan=False,
        recent_days=5,
        profile={"age_group": "35_44", "gender": "female", "job_family": "office_worker", "work_mode": "fixed"},
        summary="Your strongest output came from a protected afternoon execution block.",
        coach="Protect one 60-minute focus window before opening chat after lunch.",
        burnout_risk="low",
    ),
    _a_case(
        scenario_name="analyze_office_ko_03",
        locale="ko",
        entries=[
            _a_entry("08:30", "09:30", "일일 계획", 3, 3),
            _a_entry("10:00", "12:00", "고객 대응", 2, 3),
            _a_entry("13:30", "15:30", "개발 협업", 4, 4),
            _a_entry("16:00", "17:30", "보고서 작성", 3, 3),
        ],
        has_yesterday_plan=True,
        recent_days=7,
        profile={"age_group": "35_44", "gender": "male", "job_family": "office_worker", "work_mode": "flex"},
        summary="고객 대응 이후 에너지가 떨어졌지만 협업 블록에서 회복이 나타났습니다.",
        coach="점심 직후 10분 회복 버퍼를 넣어 오후 첫 블록 품질을 높이세요.",
        burnout_risk="medium",
    ),
    _a_case(
        scenario_name="analyze_office_en_04",
        locale="en",
        entries=[
            _a_entry("09:00", "10:30", "Planning", 4, 4),
            _a_entry("11:00", "12:00", "Cross-team sync", 3, 3),
            _a_entry("13:30", "14:30", "Status calls", 2, 2),
            _a_entry("15:00", "17:00", "Deep execution", 4, 4),
        ],
        has_yesterday_plan=True,
        recent_days=6,
        profile={"age_group": "25_34", "gender": "male", "job_family": "office_worker", "work_mode": "fixed"},
        summary="Late-afternoon deep execution still produced your best quality output.",
        coach="Insert a 5-minute reset between status calls and deep execution.",
        burnout_risk="medium",
    ),
    _a_case(
        scenario_name="analyze_office_ko_05",
        locale="ko",
        entries=[
            _a_entry("09:00", "10:00", "주간 정렬 회의", 3, 2),
            _a_entry("10:10", "11:30", "문서 정리", 3, 3),
            _a_entry("13:00", "14:30", "핵심 실행", 4, 4),
            _a_entry("15:00", "17:00", "운영 대응", 2, 3),
        ],
        has_yesterday_plan=False,
        recent_days=4,
        profile={"age_group": "45_plus", "gender": "female", "job_family": "office_worker", "work_mode": "fixed"},
        summary="핵심 실행 블록은 안정적이지만 오후 운영 대응에서 집중 분산이 반복됩니다.",
        coach="오후 운영 대응 전에 우선순위 1개를 먼저 확정하고 시작하세요.",
        burnout_risk="medium",
    ),
]

_ANALYZE_FREELANCER = [
    _a_case(
        scenario_name="analyze_freelance_ko_01",
        locale="ko",
        entries=[
            _a_entry("10:30", "12:00", "클라이언트 작업", 4, 4),
            _a_entry("13:30", "14:00", "메시지 응답", 2, 3),
            _a_entry("16:00", "18:00", "콘텐츠 제작", 4, 4),
        ],
        has_yesterday_plan=True,
        recent_days=5,
        profile={"age_group": "25_34", "gender": "female", "job_family": "self_employed", "work_mode": "flex"},
        summary="유연한 일정에서도 오후 후반 집중 창이 반복적으로 나타났습니다.",
        coach="오전 시작 시 30분 예열 블록을 고정하면 첫 집중 구간이 빨라집니다.",
        burnout_risk="low",
    ),
    _a_case(
        scenario_name="analyze_freelance_en_02",
        locale="en",
        entries=[
            _a_entry("11:00", "12:30", "Client delivery", 4, 4),
            _a_entry("14:00", "14:40", "Admin", 2, 2),
            _a_entry("18:00", "20:00", "Creative work", 5, 4),
        ],
        has_yesterday_plan=False,
        recent_days=4,
        profile={"age_group": "35_44", "gender": "male", "job_family": "self_employed", "work_mode": "freelance"},
        summary="Your strongest creative output appears in late evening windows.",
        coach="Add one fixed midday reset so the evening creative block stays sustainable.",
        burnout_risk="medium",
    ),
    _a_case(
        scenario_name="analyze_freelance_ko_03",
        locale="ko",
        entries=[
            _a_entry("09:30", "10:00", "세금 정리", 2, 2),
            _a_entry("11:00", "12:30", "디자인 작업", 4, 4),
            _a_entry("15:30", "17:00", "수정 반영", 3, 3),
            _a_entry("21:00", "22:00", "포트폴리오 업데이트", 4, 4),
        ],
        has_yesterday_plan=True,
        recent_days=7,
        profile={"age_group": "35_44", "gender": "prefer_not_to_say", "job_family": "self_employed", "work_mode": "flex"},
        summary="행정 작업 후 몰입 전환이 느려지지만 야간 블록에서 집중이 회복됩니다.",
        coach="행정 작업 직후 5분 산책을 넣어 몰입 전환 비용을 줄이세요.",
        burnout_risk="medium",
    ),
    _a_case(
        scenario_name="analyze_freelance_en_04",
        locale="en",
        entries=[
            _a_entry("10:00", "11:30", "Proposal drafting", 4, 4),
            _a_entry("12:00", "12:30", "Calls", 2, 3),
            _a_entry("14:30", "16:30", "Build sprint", 4, 5),
        ],
        has_yesterday_plan=False,
        recent_days=3,
        profile={"age_group": "25_34", "gender": "female", "job_family": "self_employed", "work_mode": "freelance"},
        summary="You keep momentum when sprint blocks follow short call windows.",
        coach="Time-box calls to 30 minutes and transition with a written next step.",
        burnout_risk="low",
    ),
    _a_case(
        scenario_name="analyze_freelance_ko_05",
        locale="ko",
        entries=[
            _a_entry("10:30", "12:30", "강의 콘텐츠 제작", 4, 4),
            _a_entry("14:00", "15:00", "수강생 피드백", 3, 3),
            _a_entry("16:00", "18:00", "영상 편집", 4, 4),
        ],
        has_yesterday_plan=True,
        recent_days=5,
        profile={"age_group": "45_plus", "gender": "male", "job_family": "self_employed", "work_mode": "flex"},
        summary="제작-피드백-편집 루프가 반복될 때 생산성이 가장 높습니다.",
        coach="피드백 블록 후 바로 편집 45분 고정 블록을 이어 붙이세요.",
        burnout_risk="low",
    ),
]

_ANALYZE_STUDENT = [
    _a_case(
        scenario_name="analyze_student_ko_01",
        locale="ko",
        entries=[
            _a_entry("09:00", "10:30", "수업", 3, 3),
            _a_entry("11:00", "12:30", "도서관 과제", 4, 4),
            _a_entry("14:00", "15:30", "팀 프로젝트", 3, 3),
            _a_entry("20:00", "21:00", "복습", 4, 4),
        ],
        has_yesterday_plan=True,
        recent_days=6,
        profile={"age_group": "18_24", "gender": "female", "job_family": "student", "work_mode": "fixed"},
        summary="수업 사이 짧은 과제 블록이 있을 때 저녁 복습 효율도 올라갑니다.",
        coach="수업 직후 25분 과제 착수 블록을 먼저 넣어 미루는 비용을 줄이세요.",
        burnout_risk="medium",
    ),
    _a_case(
        scenario_name="analyze_student_en_02",
        locale="en",
        entries=[
            _a_entry("08:30", "10:00", "Lecture", 3, 3),
            _a_entry("10:30", "12:00", "Library study", 4, 4),
            _a_entry("13:30", "15:00", "Lab", 3, 3),
            _a_entry("19:30", "20:30", "Assignment", 4, 4),
        ],
        has_yesterday_plan=False,
        recent_days=5,
        profile={"age_group": "18_24", "gender": "male", "job_family": "student", "work_mode": "fixed"},
        summary="Your best focus appears in short windows right after lectures.",
        coach="Use a 5-minute setup ritual before each library block.",
        burnout_risk="low",
    ),
    _a_case(
        scenario_name="analyze_student_ko_03",
        locale="ko",
        entries=[
            _a_entry("10:00", "11:30", "온라인 강의", 3, 3),
            _a_entry("12:00", "13:00", "점심", 2, 2),
            _a_entry("14:00", "16:00", "과제 작성", 4, 4),
            _a_entry("17:00", "18:00", "동아리 활동", 3, 3),
        ],
        has_yesterday_plan=True,
        recent_days=7,
        profile={"age_group": "18_24", "gender": "prefer_not_to_say", "job_family": "student", "work_mode": "flex"},
        summary="식사 후 집중이 떨어지지만 14시 이후 과제 블록에서 회복이 분명합니다.",
        coach="점심 직후 10분 걷기로 오후 첫 과제 블록 품질을 높이세요.",
        burnout_risk="medium",
    ),
    _a_case(
        scenario_name="analyze_student_en_04",
        locale="en",
        entries=[
            _a_entry("09:00", "10:00", "Class", 3, 3),
            _a_entry("11:00", "12:30", "Problem set", 4, 4),
            _a_entry("14:00", "15:30", "Group meeting", 3, 3),
            _a_entry("21:00", "22:00", "Review notes", 4, 3),
        ],
        has_yesterday_plan=True,
        recent_days=6,
        profile={"age_group": "18_24", "gender": "female", "job_family": "student", "work_mode": "fixed"},
        summary="Problem-set blocks remain your most reliable high-focus windows.",
        coach="Start the first problem set before opening group chat.",
        burnout_risk="low",
    ),
    _a_case(
        scenario_name="analyze_student_ko_05",
        locale="ko",
        entries=[
            _a_entry("08:00", "09:30", "수업", 3, 3),
            _a_entry("10:00", "11:30", "실험", 4, 4),
            _a_entry("13:00", "14:30", "리포트 작성", 4, 4),
            _a_entry("16:00", "17:00", "피드백 반영", 3, 3),
        ],
        has_yesterday_plan=False,
        recent_days=4,
        profile={"age_group": "18_24", "gender": "male", "job_family": "student", "work_mode": "fixed"},
        summary="실험 후 즉시 리포트로 연결될 때 집중 손실이 적습니다.",
        coach="실험 종료 후 15분 내 리포트 착수 블록을 시작하세요.",
        burnout_risk="low",
    ),
]

_ANALYZE_BURNOUT = [
    _a_case(
        scenario_name="analyze_burnout_ko_01",
        locale="ko",
        entries=[
            _a_entry("08:30", "12:30", "연속 업무", 2, 2),
            _a_entry("13:00", "18:30", "회의와 대응", 2, 2),
            _a_entry("20:00", "22:30", "야근", 1, 2),
        ],
        has_yesterday_plan=True,
        recent_days=7,
        profile={"age_group": "35_44", "gender": "female", "job_family": "office_worker", "work_mode": "fixed"},
        summary="긴 근무 시간 대비 에너지와 집중이 지속적으로 낮아 과부하 위험이 큽니다.",
        coach="내일은 오전 한 블록만 고강도로 두고 나머지는 회복 버퍼를 먼저 배치하세요.",
        burnout_risk="high",
    ),
    _a_case(
        scenario_name="analyze_burnout_en_02",
        locale="en",
        entries=[
            _a_entry("08:00", "12:00", "Back-to-back tasks", 2, 2),
            _a_entry("12:30", "18:30", "Calls and firefighting", 2, 2),
            _a_entry("19:30", "22:00", "Overtime", 1, 2),
        ],
        has_yesterday_plan=False,
        recent_days=6,
        profile={"age_group": "35_44", "gender": "male", "job_family": "professional", "work_mode": "fixed"},
        summary="Low energy persisted across long hours, indicating elevated burnout risk.",
        coach="Cap tomorrow to one major focus block and schedule two recovery buffers.",
        burnout_risk="high",
    ),
    _a_case(
        scenario_name="analyze_burnout_ko_03",
        locale="ko",
        entries=[
            _a_entry("09:00", "11:00", "고객 응대", 2, 2),
            _a_entry("11:10", "13:00", "이슈 처리", 2, 2),
            _a_entry("14:00", "18:00", "긴급 대응", 2, 1),
            _a_entry("19:30", "21:00", "추가 정리", 1, 2),
        ],
        has_yesterday_plan=True,
        recent_days=7,
        profile={"age_group": "45_plus", "gender": "male", "job_family": "office_worker", "work_mode": "shift"},
        summary="긴급 대응이 이어지며 집중 회복 구간 없이 소진 패턴이 누적되었습니다.",
        coach="긴급 대응 사이 10분 회복 버퍼를 강제해 피로 누적을 끊으세요.",
        burnout_risk="high",
    ),
    _a_case(
        scenario_name="analyze_burnout_en_04",
        locale="en",
        entries=[
            _a_entry("09:00", "11:30", "Support queue", 2, 2),
            _a_entry("12:00", "15:00", "Incident handling", 1, 2),
            _a_entry("15:30", "19:00", "Escalations", 2, 2),
        ],
        has_yesterday_plan=True,
        recent_days=5,
        profile={"age_group": "25_34", "gender": "female", "job_family": "office_worker", "work_mode": "shift"},
        summary="Sustained incident work without buffers reduced both focus and energy stability.",
        coach="Insert a mandatory 10-minute reset every 90 minutes tomorrow.",
        burnout_risk="high",
    ),
    _a_case(
        scenario_name="analyze_burnout_ko_05",
        locale="ko",
        entries=[
            _a_entry("08:00", "10:30", "행정 처리", 2, 2),
            _a_entry("11:00", "14:00", "연속 회의", 2, 2),
            _a_entry("15:00", "19:30", "마감 작업", 2, 2),
        ],
        has_yesterday_plan=False,
        recent_days=6,
        profile={"age_group": "35_44", "gender": "prefer_not_to_say", "job_family": "professional", "work_mode": "fixed"},
        summary="장시간 고정 업무가 이어지며 회복 신호 없이 피로도가 상승했습니다.",
        coach="마감 작업 전에 15분 회복 버퍼를 먼저 확보하고 시작하세요.",
        burnout_risk="high",
    ),
]

_ANALYZE_RECOVERY = [
    _a_case(
        scenario_name="analyze_recovery_ko_01",
        locale="ko",
        entries=[
            _a_entry("09:00", "10:30", "집중 업무", 4, 4),
            _a_entry("10:30", "10:45", "산책", 3, 2),
            _a_entry("11:00", "12:00", "실행 업무", 4, 4),
            _a_entry("15:00", "15:20", "스트레칭", 3, 2),
        ],
        has_yesterday_plan=True,
        recent_days=5,
        profile={"age_group": "25_34", "gender": "female", "job_family": "office_worker", "work_mode": "flex"},
        summary="집중-회복 리듬이 잘 유지되어 오후에도 집중 하락이 적었습니다.",
        coach="내일도 집중 블록 사이 10~15분 회복 버퍼를 유지하세요.",
        burnout_risk="low",
    ),
    _a_case(
        scenario_name="analyze_recovery_en_02",
        locale="en",
        entries=[
            _a_entry("09:00", "10:30", "Deep work", 4, 4),
            _a_entry("10:30", "10:45", "Walk", 3, 2),
            _a_entry("11:00", "12:00", "Execution", 4, 4),
            _a_entry("15:00", "15:20", "Stretch", 3, 2),
        ],
        has_yesterday_plan=False,
        recent_days=4,
        profile={"age_group": "35_44", "gender": "male", "job_family": "professional", "work_mode": "flex"},
        summary="Your focus quality stayed high because recovery buffers were consistently used.",
        coach="Keep the same focus-buffer rhythm tomorrow to preserve energy.",
        burnout_risk="low",
    ),
    _a_case(
        scenario_name="analyze_recovery_ko_03",
        locale="ko",
        entries=[
            _a_entry("10:00", "11:00", "문서 작성", 4, 4),
            _a_entry("11:00", "11:15", "호흡 정리", 3, 2),
            _a_entry("13:00", "14:30", "기획 실행", 4, 4),
            _a_entry("17:30", "18:00", "가벼운 운동", 3, 2),
        ],
        has_yesterday_plan=True,
        recent_days=6,
        profile={"age_group": "45_plus", "gender": "female", "job_family": "other", "work_mode": "flex"},
        summary="짧은 회복 구간이 집중 블록의 지속 시간을 안정적으로 지켜줍니다.",
        coach="호흡 정리 블록을 고정 일정으로 등록해 자동화하세요.",
        burnout_risk="low",
    ),
    _a_case(
        scenario_name="analyze_recovery_en_04",
        locale="en",
        entries=[
            _a_entry("08:30", "09:30", "Priority setup", 4, 4),
            _a_entry("09:30", "09:45", "Recovery walk", 3, 2),
            _a_entry("10:00", "11:30", "Build block", 4, 4),
            _a_entry("14:30", "14:45", "Micro break", 3, 2),
        ],
        has_yesterday_plan=True,
        recent_days=7,
        profile={"age_group": "25_34", "gender": "female", "job_family": "creator", "work_mode": "flex"},
        summary="Structured micro-breaks helped you return quickly after each intense block.",
        coach="Keep one recovery cue card visible before every focus window.",
        burnout_risk="low",
    ),
    _a_case(
        scenario_name="analyze_recovery_ko_05",
        locale="ko",
        entries=[
            _a_entry("09:30", "10:30", "핵심 작업", 4, 4),
            _a_entry("10:30", "10:50", "차분한 휴식", 3, 2),
            _a_entry("11:00", "12:30", "후속 실행", 4, 4),
            _a_entry("16:00", "16:20", "산책", 3, 2),
        ],
        has_yesterday_plan=False,
        recent_days=5,
        profile={"age_group": "35_44", "gender": "male", "job_family": "office_worker", "work_mode": "fixed"},
        summary="회복 구간을 먼저 확보해 둔 날은 집중 하락 폭이 작았습니다.",
        coach="오후 블록 전 산책 15분을 일정에 고정해 보세요.",
        burnout_risk="low",
    ),
]

_ANALYZE_SPARSE = [
    _a_case(
        scenario_name="analyze_sparse_ko_01",
        locale="ko",
        entries=[],
        has_yesterday_plan=False,
        recent_days=1,
        profile={"age_group": "25_34", "gender": "male", "job_family": "office_worker", "work_mode": "fixed"},
        summary="오늘 기록이 매우 적어 패턴 신뢰도는 낮지만 기본 루틴 앵커는 제안할 수 있습니다.",
        coach="내일은 최소 2개 블록만 기록해도 분석 정확도가 빠르게 올라갑니다.",
        burnout_risk="medium",
    ),
    _a_case(
        scenario_name="analyze_sparse_en_02",
        locale="en",
        entries=[_a_entry("10:00", "10:30", "Quick admin", 2, 2)],
        has_yesterday_plan=False,
        recent_days=1,
        profile={"age_group": "35_44", "gender": "female", "job_family": "professional", "work_mode": "fixed"},
        summary="Data is sparse, so recommendations focus on lightweight anchors for tomorrow.",
        coach="Log at least one morning and one afternoon block tomorrow.",
        burnout_risk="medium",
    ),
    _a_case(
        scenario_name="analyze_sparse_ko_03",
        locale="ko",
        entries=[_a_entry("15:00", "15:40", "짧은 회의", 2, 2)],
        has_yesterday_plan=True,
        recent_days=2,
        profile={"age_group": "18_24", "gender": "prefer_not_to_say", "job_family": "student", "work_mode": "flex"},
        summary="활동 수가 적어도 고정 시간 앵커를 잡으면 다음날 루틴이 안정됩니다.",
        coach="내일 오전 한 블록과 오후 한 블록만 먼저 고정해 보세요.",
        burnout_risk="medium",
    ),
    _a_case(
        scenario_name="analyze_sparse_en_04",
        locale="en",
        entries=[],
        has_yesterday_plan=True,
        recent_days=2,
        profile={"age_group": "45_plus", "gender": "male", "job_family": "other", "work_mode": "other"},
        summary="With near-empty logs, the model can only propose baseline routine anchors.",
        coach="Capture two concrete blocks tomorrow to unlock stronger personalization.",
        burnout_risk="medium",
    ),
    _a_case(
        scenario_name="analyze_sparse_ko_05",
        locale="ko",
        entries=[_a_entry("21:00", "21:30", "하루 정리", 3, 2)],
        has_yesterday_plan=False,
        recent_days=1,
        profile={"age_group": "25_34", "gender": "female", "job_family": "creator", "work_mode": "flex"},
        summary="기록이 1개뿐이라 세부 패턴은 부족하지만 내일 시작 블록은 설계 가능합니다.",
        coach="내일 첫 활동 시작 시간을 기록하면 루틴 정확도가 크게 개선됩니다.",
        burnout_risk="medium",
    ),
]

ANALYZE_SCENARIOS: list[dict[str, Any]] = (
    _ANALYZE_OFFICE
    + _ANALYZE_FREELANCER
    + _ANALYZE_STUDENT
    + _ANALYZE_BURNOUT
    + _ANALYZE_RECOVERY
    + _ANALYZE_SPARSE
)

assert len(PARSE_SCENARIOS) == 30
assert len(ANALYZE_SCENARIOS) == 30
