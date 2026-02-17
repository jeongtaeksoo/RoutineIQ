#!/bin/bash

set -Eeuo pipefail

exec python3 - "$@" <<'PY'
import json
import os
import signal
import subprocess
import sys
import time
import traceback
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple

ROOT = Path("/Users/taeksoojung/Desktop/RutineIQ")
CONTEXT_FILE = Path("/Users/taeksoojung/Desktop/RUTINEIQ_CONTEXT.md")
DOCS_DIR = ROOT / "docs"
LOGS_DIR = ROOT / "logs"
STATE_FILE = DOCS_DIR / "UX_RESEARCH_STATE.json"
LOCK_FILE = Path("/tmp/rutineiq_ux_research.lock")
STOP_FLAG = Path("/tmp/rutineiq_ux_research.stop")

CYCLE_SECONDS = 1800
HEARTBEAT_SECONDS = 300
MIN_ELAPSED_SECONDS = 18000
MIN_EFFECTIVE_CYCLES = 10
MIN_CONFIRMED_CLAIMS = 8
TARGET_SOURCES_PER_CYCLE = 5
MIN_VERIFIED_PER_CYCLE = 3
MAX_SOURCE_RETRIES = 3

RUN_DATE = datetime.now().strftime("%Y-%m-%d")
RUNLOG_FILE = DOCS_DIR / f"UX_RESEARCH_RUNLOG_{RUN_DATE}.md"
MATRIX_FILE = DOCS_DIR / f"UX_EVIDENCE_MATRIX_{RUN_DATE}.md"
BACKLOG_FILE = DOCS_DIR / f"UX_ACTION_BACKLOG_{RUN_DATE}.md"

SHUTDOWN_REQUESTED = False


def ts() -> str:
    return datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S %Z")


def epoch() -> int:
    return int(time.time())


def log(message: str) -> None:
    print(f"[{ts()}] {message}", flush=True)


def save_json_atomic(path: Path, payload: Dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def load_json(path: Path, default: Dict) -> Dict:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def signal_handler(signum, _frame):
    global SHUTDOWN_REQUESTED
    SHUTDOWN_REQUESTED = True
    log(f"signal received: {signum}; graceful shutdown requested")


def pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def acquire_lock() -> None:
    LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
    if LOCK_FILE.exists():
        try:
            existing_pid = int(LOCK_FILE.read_text(encoding="utf-8").strip())
        except Exception:
            existing_pid = 0
        if existing_pid > 0 and pid_alive(existing_pid):
            log(f"lock active by pid={existing_pid}; exiting without duplicate run")
            sys.exit(0)
        log("stale lock detected; removing stale lock")
        LOCK_FILE.unlink(missing_ok=True)
    LOCK_FILE.write_text(str(os.getpid()), encoding="utf-8")
    log(f"lock acquired: {LOCK_FILE}")


def release_lock() -> None:
    try:
        if LOCK_FILE.exists():
            raw = LOCK_FILE.read_text(encoding="utf-8").strip()
            if raw == str(os.getpid()):
                LOCK_FILE.unlink(missing_ok=True)
                log("lock released")
    except Exception as exc:
        log(f"failed to release lock safely: {exc}")


def verify_url(url: str) -> Tuple[bool, str]:
    last_error = "unknown_error"
    for attempt in range(1, MAX_SOURCE_RETRIES + 1):
        try:
            proc = subprocess.run(
                [
                    "curl",
                    "-L",
                    "-s",
                    "-o",
                    "/dev/null",
                    "-w",
                    "%{http_code}",
                    "--max-time",
                    "12",
                    "--retry",
                    "0",
                    "-A",
                    "RutineIQ-UX-Research-Runner/1.0 (+https://rutineiq.local)",
                    url,
                ],
                check=False,
                capture_output=True,
                text=True,
                timeout=20,
            )
            raw = (proc.stdout or "").strip()
            code = int(raw[-3:]) if len(raw) >= 3 and raw[-3:].isdigit() else 0
            if 200 <= code < 400:
                return True, f"http_{code}"
            last_error = f"http_{code or 0}"
        except subprocess.TimeoutExpired:
            last_error = "curl_timeout"
        except Exception as exc:
            last_error = exc.__class__.__name__
        if attempt < MAX_SOURCE_RETRIES:
            time.sleep(2 ** attempt)
    return False, last_error


SOURCE_CATALOG: List[Dict] = [
    {
        "id": "UX-S01",
        "url": "https://kostat.go.kr/boardDownload.es?bid=11761&list_no=438242&seq=1",
        "org_doc": "통계청/2024년 사회조사 결과",
        "pub_date": "2025-04-09",
        "evidence": "한국 성인 스트레스 인지율이 높아 일상기반 UX의 실행 마찰 최소화가 중요함.",
        "topic": "KR context",
    },
    {
        "id": "UX-S02",
        "url": "https://www.mhlw.go.jp/stf/newpage_59039.html",
        "org_doc": "일본 후생노동성/令和6年度 과로사 등 보상현황",
        "pub_date": "2025-06-25",
        "evidence": "일본 노동·정신건강 부담이 높아 보수적 카피와 회복 UX 필요성이 큼.",
        "topic": "JP context",
    },
    {
        "id": "UX-S03",
        "url": "https://datareportal.com/reports/digital-2025-south-korea",
        "org_doc": "DataReportal/Digital 2025 South Korea",
        "pub_date": "2025-03-03",
        "evidence": "한국의 모바일·인터넷 보급률이 높아 모바일 우선 UX 설계 타당성이 높음.",
        "topic": "mobile-first",
    },
    {
        "id": "UX-S04",
        "url": "https://datareportal.com/reports/digital-2025-japan",
        "org_doc": "DataReportal/Digital 2025 Japan",
        "pub_date": "2025-02-25",
        "evidence": "일본 디지털 사용 기반이 높아 저마찰 입력 UX가 성과에 직접 영향.",
        "topic": "mobile-first",
    },
    {
        "id": "UX-S05",
        "url": "https://datareportal.com/reports/digital-2025-united-states-of-america",
        "org_doc": "DataReportal/Digital 2025 United States",
        "pub_date": "2025-02-25",
        "evidence": "미국에서도 모바일·디지털 기반 사용이 높아 빠른 기록 플로우 최적화가 필수.",
        "topic": "mobile-first",
    },
    {
        "id": "UX-S06",
        "url": "https://www.cdc.gov/mental-health/about-data/conditions-care.html",
        "org_doc": "CDC/Anxiety, Depression, and Mental Health Care Data",
        "pub_date": "2026-01-28",
        "evidence": "정신건강 부담이 높은 사용자군에서 부담을 낮추는 간결 UX가 필요.",
        "topic": "US context",
    },
    {
        "id": "UX-S07",
        "url": "https://www.gallup.com/workplace/697904/state-of-the-global-workplace-global-data.aspx",
        "org_doc": "Gallup/State of the Global Workplace 2025",
        "pub_date": "2025-11-20",
        "evidence": "직장 스트레스가 높아 일상 루틴 UX의 회복·재진입 설계 중요성이 강화됨.",
        "topic": "retention",
    },
    {
        "id": "UX-S08",
        "url": "https://sensortower.com/blog/2025-state-of-mobile-consumers-usd150-billion-spent-on-mobile-highlights",
        "org_doc": "Sensor Tower/State of Mobile 2025",
        "pub_date": "2025-01-01",
        "evidence": "모바일 소비가 지속 확대되어 앱 내 입력마찰 개선의 사업성 근거를 제공.",
        "topic": "mobile-first",
    },
    {
        "id": "UX-S09",
        "url": "https://www.pewresearch.org/global/2025/10/15/how-people-around-the-world-view-ai/",
        "org_doc": "Pew Research Center/How People Around the World View AI",
        "pub_date": "2025-10-15",
        "evidence": "국가별 AI 기대/우려 분포가 달라 단일 카피 전략의 리스크를 시사.",
        "topic": "locale",
    },
    {
        "id": "UX-S10",
        "url": "https://www.pewresearch.org/global/2025/10/15/concern-and-excitement-about-ai/",
        "org_doc": "Pew Research Center/Concern and excitement about AI",
        "pub_date": "2025-10-15",
        "evidence": "다수 국가에서 우려가 기대보다 높아 보수적 설명 UX가 필요함.",
        "topic": "locale",
    },
    {
        "id": "UX-S11",
        "url": "https://www.pewresearch.org/global/2025/10/15/trust-in-own-country-to-regulate-use-of-ai/",
        "org_doc": "Pew Research Center/Trust in own country to regulate use of AI",
        "pub_date": "2025-10-15",
        "evidence": "규제 신뢰의 국가별 차이가 커 신뢰 문구 강도 현지화 필요.",
        "topic": "locale",
    },
    {
        "id": "UX-S12",
        "url": "https://www.pewresearch.org/global/2025/10/15/ai-awareness-around-the-world/",
        "org_doc": "Pew Research Center/AI awareness around the world",
        "pub_date": "2025-10-15",
        "evidence": "AI 인지도 격차가 커 국가별 설명 깊이(짧게/자세히) 분기 필요.",
        "topic": "locale",
    },
    {
        "id": "UX-S13",
        "url": "https://www.pewresearch.org/global/2025/10/15/trust-in-the-eu-u-s-and-china-to-regulate-use-of-ai/",
        "org_doc": "Pew Research Center/Trust in the EU, U.S. and China to regulate use of AI",
        "pub_date": "2025-10-15",
        "evidence": "권역별 신뢰주체 선호 차이로 신뢰 근거 노출 프레임 분화가 필요.",
        "topic": "locale",
    },
    {
        "id": "UX-S14",
        "url": "https://news.gallup.com/poll/694688/trust-businesses-improves-slightly.aspx",
        "org_doc": "Gallup/Trust in Businesses' Use of AI Improves Slightly",
        "pub_date": "2025-09-10",
        "evidence": "미국 내 AI 신뢰는 개선 중이나 불신이 여전히 높아 신뢰 UX 필수.",
        "topic": "trust",
    },
    {
        "id": "UX-S15",
        "url": "https://kpmg.com/xx/en/media/press-releases/2025/04/trust-of-ai-remains-a-critical-challenge.html",
        "org_doc": "KPMG + University of Melbourne/Trust, attitudes and use of AI: Global study 2025",
        "pub_date": "2025-04-28",
        "evidence": "47개국 조사에서 신뢰/규제 인식 격차가 커 설명가능성 UX 필요.",
        "topic": "trust",
    },
    {
        "id": "UX-S16",
        "url": "https://www.nist.gov/itl/ai-risk-management-framework",
        "org_doc": "NIST/AI Risk Management Framework",
        "pub_date": "2025-05-05",
        "evidence": "Trustworthiness 기반 관리가 강조되어 제품 UI에도 신뢰정보 표기가 요구됨.",
        "topic": "trust",
    },
    {
        "id": "UX-S17",
        "url": "https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence",
        "org_doc": "NIST/AI RMF: Generative AI Profile",
        "pub_date": "2024-07-26",
        "evidence": "생성형 AI 사용에서 투명성·리스크 커뮤니케이션이 필수 요구로 제시됨.",
        "topic": "trust",
    },
    {
        "id": "UX-S18",
        "url": "https://csrc.nist.gov/pubs/ai/100/2/e2025/final",
        "org_doc": "NIST/NIST AI 100-2e2025 Reducing Risks Posed by Synthetic Content",
        "pub_date": "2025-03-24",
        "evidence": "합성콘텐츠 리스크 저감 프레임은 불확실성·출처표시 UX 요구를 강화함.",
        "topic": "trust",
    },
    {
        "id": "UX-S19",
        "url": "https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng",
        "org_doc": "European Union/AI Act (Regulation (EU) 2024/1689)",
        "pub_date": "2024-07-12",
        "evidence": "상호작용형 AI의 정보 제공과 투명성 의무는 신뢰도 표시 UX의 제도 근거.",
        "topic": "trust",
    },
    {
        "id": "UX-S20",
        "url": "https://www.whitehouse.gov/wp-content/uploads/2025/02/M-25-21-Accelerating-Federal-Use-of-AI-through-Innovation-Governance-and-Public-Trust.pdf",
        "org_doc": "U.S. OMB/M-25-21 Accelerating Federal Use of AI through Innovation, Governance, and Public Trust",
        "pub_date": "2025-04-03",
        "evidence": "공공신뢰·투명성·고위험 사용 통제가 명시되어 보수적 문구 정책을 지지.",
        "topic": "trust",
    },
    {
        "id": "UX-S21",
        "url": "https://oecd.ai/en/wonk/g7-haip-report-insights-for-ai-governance-and-risk-management",
        "org_doc": "OECD.AI/G7 AI transparency reporting: Ten insights for AI governance and risk management",
        "pub_date": "2025-09-25",
        "evidence": "투명성 보고가 신뢰/책임성 핵심임을 제시해 UI 신뢰라인 도입 근거 제공.",
        "topic": "trust",
    },
    {
        "id": "UX-S22",
        "url": "https://www.gov.uk/government/publications/g7-ministerial-declaration-montreal-canada-8-to-9-december-2025/g7-industry-digital-and-technology-ministerial-statement-on-the-sme-ai-adoption-blueprint",
        "org_doc": "UK Government/G7 IDT Ministerial Statement on the SME AI Adoption Blueprint",
        "pub_date": "2025-12-10",
        "evidence": "신뢰가능 AI 채택과 맥락별 지원 필요성이 제시되어 국가별 UX 변형 근거 제공.",
        "topic": "locale",
    },
    {
        "id": "UX-S23",
        "url": "https://www.itl.nist.gov/div898/handbook/prc/section2/prc242.htm",
        "org_doc": "NIST/Engineering Statistics Handbook - sample sizes for testing proportions",
        "pub_date": "2024-04-16",
        "evidence": "표본 크기와 신뢰구간 폭 관계를 명시해 코호트 카드 표본 정책 설계 근거 제공.",
        "topic": "cohort",
    },
    {
        "id": "UX-S24",
        "url": "https://pubmed.ncbi.nlm.nih.gov/39316431/",
        "org_doc": "PubMed/J Med Internet Res (engagement review)",
        "pub_date": "2024-09-24",
        "evidence": "참여도 하락이 빈번하며 높은 참여가 더 좋은 결과와 연동됨.",
        "topic": "onboarding",
    },
    {
        "id": "UX-S25",
        "url": "https://pubmed.ncbi.nlm.nih.gov/40829125/",
        "org_doc": "PubMed/JMIR mHealth and uHealth (obesity app BCT meta-analysis)",
        "pub_date": "2025-08-19",
        "evidence": "goal/action planning, self-monitoring, feedback 요소의 중요성을 제시.",
        "topic": "onboarding",
    },
    {
        "id": "UX-S26",
        "url": "https://pubmed.ncbi.nlm.nih.gov/38717433/",
        "org_doc": "PubMed/JMIR mHealth and uHealth (cross-cutting BCT review)",
        "pub_date": "2024-05-01",
        "evidence": "prompts/cues, goal setting, feedback이 행동 개선과 관련됨.",
        "topic": "onboarding",
    },
    {
        "id": "UX-S27",
        "url": "https://pubmed.ncbi.nlm.nih.gov/39088817/",
        "org_doc": "PubMed/JMIR Mental Health (digital intervention BCT meta-analysis)",
        "pub_date": "2024-08-01",
        "evidence": "행동변화 개입에서 self-monitoring/feedback/action planning 조합 효과 보고.",
        "topic": "retention",
    },
    {
        "id": "UX-S28",
        "url": "https://pubmed.ncbi.nlm.nih.gov/38875292/",
        "org_doc": "PubMed/PLOS Medicine (SMS chatbot RCT)",
        "pub_date": "2024-06-01",
        "evidence": "단기 개선 후 장기 감쇠가 나타나 재참여 루프 UX 필요성을 시사.",
        "topic": "retention",
    },
    {
        "id": "UX-S29",
        "url": "https://pubmed.ncbi.nlm.nih.gov/39827503/",
        "org_doc": "PubMed/Clinical Nutrition (digital dietary intervention systematic review)",
        "pub_date": "2025-02-01",
        "evidence": "goal setting/feedback/prompts/self-monitoring이 참여·순응도 향상과 연관.",
        "topic": "onboarding",
    },
    {
        "id": "UX-S30",
        "url": "https://pubmed.ncbi.nlm.nih.gov/41066921/",
        "org_doc": "PubMed/Int J Med Inform (AI visual communication RCT)",
        "pub_date": "2026-01-01",
        "evidence": "AI 시각설명+평이문구가 이해도·만족도·추적순응도를 개선.",
        "topic": "reports",
    },
    {
        "id": "UX-S31",
        "url": "https://pubmed.ncbi.nlm.nih.gov/41401634/",
        "org_doc": "PubMed/European Journal of Cancer (transparent source attribution RCT)",
        "pub_date": "2026-01-17",
        "evidence": "출처 인라인 제공이 신뢰·검증가능성 평가를 유의하게 개선.",
        "topic": "daily-flow",
    },
    {
        "id": "UX-S32",
        "url": "https://pubmed.ncbi.nlm.nih.gov/41385782/",
        "org_doc": "PubMed/JMIR (stakeholder criteria for trust in AI tools)",
        "pub_date": "2025-12-12",
        "evidence": "설명가능성·검증가능성·현장검증이 신뢰 형성 핵심 기준으로 제시됨.",
        "topic": "daily-flow",
    },
    {
        "id": "UX-S33",
        "url": "https://pubmed.ncbi.nlm.nih.gov/41469544/",
        "org_doc": "PubMed/BMC Medical Research Methodology (XAI framework)",
        "pub_date": "2025-12-31",
        "evidence": "faithfulness/plausibility 균형이 신뢰와 이해도를 좌우함.",
        "topic": "daily-flow",
    },
    {
        "id": "UX-S34",
        "url": "https://pubmed.ncbi.nlm.nih.gov/41586201/",
        "org_doc": "PubMed/Frontiers in Digital Health (AI-supported decision simulation)",
        "pub_date": "2025-01-01",
        "evidence": "confidence 신호 기반 신뢰조정이 과신/과소신뢰를 줄임.",
        "topic": "daily-flow",
    },
    {
        "id": "UX-S35",
        "url": "https://pubmed.ncbi.nlm.nih.gov/40832034/",
        "org_doc": "PubMed/Frontiers in Public Health (fitness app social comparison)",
        "pub_date": "2025-01-01",
        "evidence": "사회비교는 동기와 역효과를 동시에 유발해 저표본 랭크 노출 주의 필요.",
        "topic": "cohort",
    },
    {
        "id": "UX-S36",
        "url": "https://pubmed.ncbi.nlm.nih.gov/40451568/",
        "org_doc": "PubMed/International Journal for Parasitology (sample size and precision)",
        "pub_date": "2025-11-01",
        "evidence": "표본이 작을수록 추정 불확실성이 커져 해석 보호장치 필요.",
        "topic": "cohort",
    },
    {
        "id": "UX-S37",
        "url": "https://pubmed.ncbi.nlm.nih.gov/41413663/",
        "org_doc": "PubMed/Lab Anim (variability and sample-size implications)",
        "pub_date": "2026-01-01",
        "evidence": "변동성은 표본/효과크기 해석을 왜곡할 수 있어 동적 임계값 실험이 필요.",
        "topic": "cohort",
    },
    {
        "id": "UX-S38",
        "url": "https://www.jmir.org/2025/1/e59946/",
        "org_doc": "JMIR/Effect of AI Helpfulness and Uncertainty on Cognitive Interactions with Pharmacists (RCT)",
        "pub_date": "2025-01-31",
        "evidence": "불확실성 표시는 투명성에 기여하나 인지부하를 증가시킬 수 있음.",
        "topic": "cohort",
    },
    {
        "id": "UX-S39",
        "url": "https://pubmed.ncbi.nlm.nih.gov/41328457/",
        "org_doc": "PubMed/JMIR (digital PA + gamification RCT)",
        "pub_date": "2025-11-28",
        "evidence": "디지털 개입이 성과를 높이지만 개인 반응 이질성이 커 액션 중심 개인화가 필요.",
        "topic": "reports",
    },
    {
        "id": "UX-S40",
        "url": "https://pubmed.ncbi.nlm.nih.gov/40093696/",
        "org_doc": "PubMed/Digital Health (m-health BCT meta-analysis/meta-regression)",
        "pub_date": "2025-01-01",
        "evidence": "feedback/monitoring/social support 조합이 더 좋은 결과와 연관.",
        "topic": "reports",
    },
    {
        "id": "UX-S41",
        "url": "https://pubmed.ncbi.nlm.nih.gov/39437388/",
        "org_doc": "PubMed/J Med Internet Res (mHealth hypertension meta-analysis)",
        "pub_date": "2024-10-22",
        "evidence": "self-monitoring/feedback BCT가 유의미한 개선과 연결됨.",
        "topic": "retention",
    },
    {
        "id": "UX-S42",
        "url": "https://pubmed.ncbi.nlm.nih.gov/40160265/",
        "org_doc": "PubMed/Journal of Cross-Cultural Psychology (cultural variation toward social chatbots)",
        "pub_date": "2025-04-01",
        "evidence": "동아시아와 미국 간 AI 상호작용 태도 차이가 관찰됨.",
        "topic": "locale",
    },
    {
        "id": "UX-S43",
        "url": "https://link.springer.com/article/10.1007/s00146-024-01982-4/fulltext.html",
        "org_doc": "Springer AI & Society/AI attitudes and diversity awareness (JP/US/DE/KR)",
        "pub_date": "2024-06-10",
        "evidence": "JP/US/KR 간 법·사회효익 인식 차이가 보고됨.",
        "topic": "locale",
    },
    {
        "id": "UX-S44",
        "url": "https://link.springer.com/article/10.1007/s43681-025-00822-5/fulltext.html",
        "org_doc": "Springer AI and Ethics/RRI pathways survey from Japan and South Korea",
        "pub_date": "2025-08-25",
        "evidence": "일본-한국 간 AI 환경영향 인식 격차가 관찰됨.",
        "topic": "locale",
    },
    {
        "id": "UX-S45",
        "url": "https://link.springer.com/article/10.1007/s00146-021-01323-9/fulltext.html",
        "org_doc": "Springer AI & Society/Artificial intelligence ELSI score: Japan vs US",
        "pub_date": "2022-01-22",
        "evidence": "일본-미국의 AI 윤리 태도 분화가 확인됨.",
        "topic": "locale",
    },
    {
        "id": "UX-S46",
        "url": "https://link.springer.com/article/10.1007/s43681-022-00207-y/fulltext.html",
        "org_doc": "Springer AI and Ethics/Segmentation of ELSI related to AI in Japan, US, Germany",
        "pub_date": "2022-09-01",
        "evidence": "시나리오별 우려 분화가 커 지역별 카피 최적화 필요.",
        "topic": "locale",
    },
    {
        "id": "UX-S47",
        "url": "https://pubmed.ncbi.nlm.nih.gov/40710811/",
        "org_doc": "PubMed/J Intell (systematic review of GenAI user attitudes)",
        "pub_date": "2025-06-27",
        "evidence": "문화·인지·감정 요인이 GenAI 태도 형성 핵심 변수임.",
        "topic": "locale",
    },
    {
        "id": "UX-S48",
        "url": "https://pubmed.ncbi.nlm.nih.gov/41464011/",
        "org_doc": "PubMed/Behav Sci (GAAIS-J validation)",
        "pub_date": "2025-12-03",
        "evidence": "일본 표본 기반 AI 태도 측정 신뢰도 검증으로 locale 분기 필요성 보강.",
        "topic": "locale",
    },
    {
        "id": "UX-S49",
        "url": "https://pubmed.ncbi.nlm.nih.gov/41385778/",
        "org_doc": "PubMed/JMIR Form Res (AI integration barriers)",
        "pub_date": "2025-12-12",
        "evidence": "설명가능성 부족과 일반화 한계가 채택/신뢰 저해 요인으로 보고됨.",
        "topic": "retention",
    },
    {
        "id": "UX-S50",
        "url": "https://pubmed.ncbi.nlm.nih.gov/41228284/",
        "org_doc": "PubMed/Cancers (radiologists' perspectives on AI integration)",
        "pub_date": "2025-10-30",
        "evidence": "로컬 검증과 역할 명확화가 신뢰 형성 조건으로 제시됨.",
        "topic": "retention",
    },
    {
        "id": "UX-S51",
        "url": "https://pubmed.ncbi.nlm.nih.gov/40828800/",
        "org_doc": "PubMed/PLOS Digital Health (personalizing mobile health apps)",
        "pub_date": "2025-08-01",
        "evidence": "프로필 기반 개인화 선호가 뚜렷해 초기 온보딩을 경량화하고 점진 수집 필요.",
        "topic": "onboarding",
    },
    {
        "id": "UX-S52",
        "url": "https://pubmed.ncbi.nlm.nih.gov/41639137/",
        "org_doc": "PubMed/Scientific Reports (human reliance on AI in decision making)",
        "pub_date": "2026-02-05",
        "evidence": "AI 의존/신뢰 조정은 사용자 행동에 직접 영향해 신뢰표시 UX가 중요함.",
        "topic": "retention",
    },
    {
        "id": "UX-S53",
        "url": "https://pubmed.ncbi.nlm.nih.gov/41417472/",
        "org_doc": "PubMed/JMIR Human Factors (clinician trust in AI model)",
        "pub_date": "2025-12-19",
        "evidence": "설명과 맥락 정보 제공이 신뢰 형성 핵심 요인으로 제시됨.",
        "topic": "daily-flow",
    },
    {
        "id": "UX-S54",
        "url": "https://www.nature.com/articles/s41599-024-04044-8",
        "org_doc": "Humanities and Social Sciences Communications/Trust in AI: progress, challenges, and future directions",
        "pub_date": "2024-11-18",
        "evidence": "신뢰/불신이 채택 속도를 조절해 UX 신뢰장치 필요성을 강화함.",
        "topic": "retention",
    },
    {
        "id": "UX-S55",
        "url": "https://bidenwhitehouse.archives.gov/ostp/ai-bill-of-rights/",
        "org_doc": "White House OSTP/Blueprint for an AI Bill of Rights",
        "pub_date": "2022-10-04",
        "evidence": "자동화 시스템의 Notice and Explanation 원칙은 신뢰 카피 설계 기준 제공.",
        "topic": "trust",
    },
    {
        "id": "UX-S56",
        "url": "https://bidenwhitehouse.archives.gov/ostp/ai-bill-of-rights/notice-and-explanation/",
        "org_doc": "White House OSTP/Notice and Explanation",
        "pub_date": "2022-10-04",
        "evidence": "목적/영향/리스크 설명을 명확히 제공해야 함을 구체화.",
        "topic": "trust",
    },
]

CATALOG_BY_ID = {row["id"]: row for row in SOURCE_CATALOG}

CLAIMS = [
    {
        "id": "UX-C01",
        "statement": "Onboarding 3-minute completion improves when first-session input is minimal and progressively profiled.",
        "support_ids": ["UX-S24", "UX-S25", "UX-S26", "UX-S29", "UX-S30", "UX-S51"],
    },
    {
        "id": "UX-C02",
        "statement": "Daily flow trust improves with editable AI outputs, source visibility, retry/undo paths, and confidence cues.",
        "support_ids": ["UX-S31", "UX-S32", "UX-S33", "UX-S34", "UX-S38", "UX-S53"],
    },
    {
        "id": "UX-C03",
        "statement": "Reports/insights should prioritize concise action cues over dense metric dumps to improve comprehension and follow-through.",
        "support_ids": ["UX-S30", "UX-S39", "UX-S40", "UX-S41", "UX-S24", "UX-S51"],
    },
    {
        "id": "UX-C04",
        "statement": "Cohort cards require sample-size gating and preview-safe presentation to prevent over-interpretation.",
        "support_ids": ["UX-S23", "UX-S35", "UX-S36", "UX-S37", "UX-S38", "UX-S16"],
    },
    {
        "id": "UX-C05",
        "statement": "KR/JP/US usage context supports mobile-first, low-friction logging flows with quick input and reduced typing burden.",
        "support_ids": ["UX-S03", "UX-S04", "UX-S05", "UX-S08", "UX-S24", "UX-S29"],
    },
    {
        "id": "UX-C06",
        "statement": "AI trust UX should explicitly communicate uncertainty, data sufficiency, and conservative guidance boundaries.",
        "support_ids": ["UX-S17", "UX-S18", "UX-S19", "UX-S20", "UX-S21", "UX-S55", "UX-S56", "UX-S14", "UX-S15"],
    },
    {
        "id": "UX-C07",
        "statement": "KR/JP/US copy tone and explanation depth should be localized; one-size AI copy increases misunderstanding risk.",
        "support_ids": ["UX-S09", "UX-S10", "UX-S11", "UX-S12", "UX-S13", "UX-S43", "UX-S44", "UX-S45", "UX-S46", "UX-S47", "UX-S48"],
    },
    {
        "id": "UX-C08",
        "statement": "Retention improves when UI foregrounds self-monitoring + feedback + action planning and includes re-engagement loops.",
        "support_ids": ["UX-S24", "UX-S27", "UX-S28", "UX-S39", "UX-S40", "UX-S41", "UX-S49", "UX-S50", "UX-S52", "UX-S54"],
    },
]

CLAIM_LOOKUP = {c["id"]: c for c in CLAIMS}

BACKLOG_ITEMS = [
    {
        "type": "Add",
        "item": "3-minute progressive onboarding (step-wise profile collection)",
        "problem": "Early friction from long first-session forms",
        "kpi": "Onboarding completion, D1 activation",
        "claim_id": "UX-C01",
        "rice": 9.2,
    },
    {
        "type": "Modify",
        "item": "Diary->structured output with inline edit + one-tap retry",
        "problem": "Users need immediate correction path when AI parse is off",
        "kpi": "Diary completion, correction success rate",
        "claim_id": "UX-C02",
        "rice": 8.8,
    },
    {
        "type": "Add",
        "item": "\"Why this insight\" expandable rationale on each insight card",
        "problem": "Opaque insight origin lowers trust and actionability",
        "kpi": "Insight click-through, trust score",
        "claim_id": "UX-C02",
        "rice": 8.2,
    },
    {
        "type": "Modify",
        "item": "Report first fold: 3 key metrics + next 1 action",
        "problem": "Information density overwhelms users",
        "kpi": "Report dwell quality, next-day action rate",
        "claim_id": "UX-C03",
        "rice": 8.9,
    },
    {
        "type": "Modify",
        "item": "Cohort card confidence line (n/window/compare basis) fixed placement",
        "problem": "Sample context is missed and rank is over-interpreted",
        "kpi": "Misread rate, trust, return rate",
        "claim_id": "UX-C04",
        "rice": 9.0,
    },
    {
        "type": "Delete",
        "item": "Preview-state absolute rank exposure",
        "problem": "Low-sample rank causes overconfidence and churn",
        "kpi": "Complaint rate, card bounce",
        "claim_id": "UX-C04",
        "rice": 7.4,
    },
    {
        "type": "Modify",
        "item": "Mobile quick-entry chips + one-thumb nav priority",
        "problem": "Typing burden slows daily logging",
        "kpi": "Daily log completion, time-to-log",
        "claim_id": "UX-C05",
        "rice": 8.5,
    },
    {
        "type": "Add",
        "item": "AI trust badge with conservative language policy",
        "problem": "Users over-trust or under-trust without reliability framing",
        "kpi": "Trust score, advice-follow rate",
        "claim_id": "UX-C06",
        "rice": 8.7,
    },
    {
        "type": "Modify",
        "item": "Locale-specific copy templates for KR/JP/US (tone + detail depth)",
        "problem": "Uniform wording underperforms across markets",
        "kpi": "Card CTR, completion, conversion",
        "claim_id": "UX-C07",
        "rice": 8.1,
    },
    {
        "type": "Add",
        "item": "Re-engagement loop (missed-day recovery card + one-tap restart)",
        "problem": "Behavior gains decay without guided re-entry",
        "kpi": "D7/D30 retention, streak recovery",
        "claim_id": "UX-C08",
        "rice": 8.6,
    },
]


def compute_claim_status(source_records: List[Dict]) -> Dict[str, Dict]:
    verified_ids = {row["id"] for row in source_records if row.get("verified", False)}
    result = {}
    for claim in CLAIMS:
        found = [sid for sid in claim["support_ids"] if sid in verified_ids]
        status = "Confirmed" if len(found) >= 5 else "Hypothesis"
        result[claim["id"]] = {
            "status": status,
            "support_count": len(found),
            "support_ids_found": found,
            "required": 5,
            "statement": claim["statement"],
        }
    return result


def render_evidence_matrix(state: Dict, claim_status: Dict[str, Dict]) -> None:
    lines: List[str] = []
    lines.append(f"# UX Evidence Matrix ({state['run_date']})")
    lines.append("")
    lines.append("- Project: RutineIQ UI/UX Research (KR/JP/US)")
    lines.append(f"- Check date: {state['run_date']}")
    lines.append("- Confirmed rule: claim confirmed only when >=5 independent sources are collected.")
    lines.append("- Source chain policy: no re-citation chains, original source priority.")
    lines.append("")
    lines.append("## Claim Status")
    lines.append("")
    lines.append("| Claim ID | Status | Support Count | Required | Supporting Source IDs | Claim |")
    lines.append("|---|---|---:|---:|---|---|")
    for claim in CLAIMS:
        cid = claim["id"]
        row = claim_status[cid]
        support_ids = ",".join(row["support_ids_found"]) if row["support_ids_found"] else "-"
        lines.append(
            f"| {cid} | {row['status']} | {row['support_count']} | {row['required']} | {support_ids} | {row['statement']} |"
        )
    lines.append("")
    lines.append("## Evidence Registry")
    lines.append("")
    lines.append("Format: `URL | 기관/문서 | 발행일 | 확인일(YYYY-MM-DD) | 핵심근거 1줄`")
    lines.append("")

    ordered = sorted(state["source_records"], key=lambda x: (x["cycle"], x["id"]))
    for src in ordered:
        check_date = src.get("check_date", state["run_date"])
        verification_tag = "verified" if src.get("verified") else f"unverified:{src.get('verify_note', 'n/a')}"
        lines.append(
            f"- {src['id']}: {src['url']} | {src['org_doc']} | {src['pub_date']} | {check_date} | {src['evidence']} [{verification_tag}]"
        )
    lines.append("")
    lines.append("## Counter-Evidence / Open Risks")
    lines.append("")
    lines.append("- UX-C04 risk: uncertainty disclosures can increase cognitive load if overexposed (UX-S38).")
    lines.append("- UX-C07 risk: locale guidance is still indirect unless in-product KR/JP/US A/B results are collected.")
    lines.append("- UX-C05 risk: mobile-first is validated, but exact navigation pattern still requires product telemetry.")
    lines.append("")
    MATRIX_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")


def render_action_backlog(state: Dict, claim_status: Dict[str, Dict]) -> None:
    lines: List[str] = []
    lines.append(f"# UX Action Backlog ({state['run_date']})")
    lines.append("")
    lines.append("- Scope: RutineIQ UI/UX improvements for KR/JP/US")
    lines.append("- Ordering: RICE descending")
    lines.append("")
    lines.append("| Type | Item | Problem | KPI | Evidence Claim | Claim Status | RICE |")
    lines.append("|---|---|---|---|---|---|---:|")
    for item in sorted(BACKLOG_ITEMS, key=lambda x: x["rice"], reverse=True):
        claim_row = claim_status[item["claim_id"]]
        lines.append(
            f"| {item['type']} | {item['item']} | {item['problem']} | {item['kpi']} | {item['claim_id']} | {claim_row['status']} ({claim_row['support_count']}/5) | {item['rice']:.1f} |"
        )
    lines.append("")
    lines.append("## Immediate Top 10")
    lines.append("")
    top_items = sorted(BACKLOG_ITEMS, key=lambda x: x["rice"], reverse=True)[:10]
    for idx, item in enumerate(top_items, start=1):
        lines.append(f"{idx}. {item['item']} ({item['type']}, {item['claim_id']})")
    lines.append("")
    lines.append("## Rollback Triggers")
    lines.append("")
    lines.append("- Onboarding completion drops >=10%: rollback to previous first-session flow.")
    lines.append("- Insight click-through drops >=8% after density changes: restore prior card density.")
    lines.append("- Cohort-card misread complaints increase >=15%: hide rank in medium confidence too.")
    lines.append("- Locale branch maintenance delay >7 days: temporary fallback to neutral global copy.")
    lines.append("")
    BACKLOG_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")


def ensure_file_headers(state: Dict) -> None:
    if not RUNLOG_FILE.exists():
        lines = [
            f"# UX Research Runlog ({state['run_date']})",
            "",
            f"- Runner start: {state['started_at']}",
            "- Target: 5 hours (18000 sec) + >=10 effective 30-min cycles + >=8 confirmed claims",
            f"- Context file (H0): `{CONTEXT_FILE}`",
            "",
            "## Cycle Log",
            "",
            "| Cycle | Start | End | Elapsed | New Verified Sources | Confirmed/Contradicted/Unknown updates | Add/Modify/Delete updates | Improvement vs prev cycle |",
            "|---:|---|---|---:|---|---|---|---|",
        ]
        RUNLOG_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")


def append_runlog_cycle(
    state: Dict,
    cycle_no: int,
    cycle_start: int,
    cycle_end: int,
    selected_sources: List[Dict],
    failed_sources: List[Dict],
    claim_status: Dict[str, Dict],
    prev_claim_status: Dict[str, str],
) -> None:
    start_s = datetime.fromtimestamp(cycle_start).astimezone().strftime("%Y-%m-%d %H:%M:%S %Z")
    end_s = datetime.fromtimestamp(cycle_end).astimezone().strftime("%Y-%m-%d %H:%M:%S %Z")
    elapsed = cycle_end - state["start_epoch"]
    elapsed_min = elapsed / 60.0

    now_status = {cid: row["status"] for cid, row in claim_status.items()}
    newly_confirmed = [cid for cid, status in now_status.items() if status == "Confirmed" and prev_claim_status.get(cid) != "Confirmed"]
    contradicted = [cid for cid, status in now_status.items() if status != "Confirmed" and prev_claim_status.get(cid) == "Confirmed"]
    unknown = [cid for cid, status in now_status.items() if status == "Hypothesis"]

    status_delta = (
        f"Confirmed:+{len(newly_confirmed)} ({','.join(newly_confirmed) if newly_confirmed else '-'}) / "
        f"Contradicted:+{len(contradicted)} ({','.join(contradicted) if contradicted else '-'}) / "
        f"Unknown:{len(unknown)}"
    )
    source_ids = ",".join([src["id"] for src in selected_sources]) if selected_sources else "-"

    add_count = sum(1 for row in BACKLOG_ITEMS if row["type"] == "Add")
    mod_count = sum(1 for row in BACKLOG_ITEMS if row["type"] == "Modify")
    del_count = sum(1 for row in BACKLOG_ITEMS if row["type"] == "Delete")

    if cycle_no == 1:
        improvement = "Baseline initialized from H0 and first verified evidence set."
    elif selected_sources:
        focus_topics = sorted(set(src["topic"] for src in selected_sources))
        improvement = f"Added verified evidence for {', '.join(focus_topics[:3])}."
    else:
        improvement = "No new verified links; cycle used for conflict review and claim recalculation."

    row = (
        f"| {cycle_no} | {start_s} | {end_s} | {elapsed_min:.2f} min | {source_ids} | "
        f"{status_delta} | Add:{add_count} / Modify:{mod_count} / Delete:{del_count} | {improvement} |"
    )
    with RUNLOG_FILE.open("a", encoding="utf-8") as fp:
        fp.write(row + "\n")
        fp.write("\n")
        fp.write(f"### Cycle {cycle_no} Detail\n")
        fp.write(f"- Source verification success: {len(selected_sources)}\n")
        fp.write(f"- Source verification failures: {len(failed_sources)}\n")
        if failed_sources:
            for failed in failed_sources:
                fp.write(f"- Failed source: {failed['id']} ({failed['verify_note']})\n")
        fp.write("- Evidence quality rubric: verified links are used for claim counting.\n")
        fp.write("- Update type: Evidence Matrix + Action Backlog + State heartbeat updated.\n")
        fp.write("\n")


def append_runlog_completion(state: Dict, claim_status: Dict[str, Dict]) -> None:
    confirmed = sum(1 for v in claim_status.values() if v["status"] == "Confirmed")
    hypothesis = sum(1 for v in claim_status.values() if v["status"] == "Hypothesis")
    elapsed = state["elapsed_seconds"]
    with RUNLOG_FILE.open("a", encoding="utf-8") as fp:
        fp.write("## Completion Summary\n\n")
        fp.write(f"- Completed at: {state['last_update']}\n")
        fp.write(f"- Total elapsed: {elapsed} sec ({elapsed / 60:.2f} min)\n")
        fp.write(f"- Effective cycles: {state['effective_cycles']}\n")
        fp.write(f"- Confirmed claims: {confirmed}\n")
        fp.write(f"- Hypothesis claims: {hypothesis}\n")
        fp.write("- Stop condition check: elapsed>=18000, cycles>=10, confirmed>=8\n")
        fp.write("\n")


def load_or_init_state() -> Dict:
    default = {
        "status": "running",
        "run_date": RUN_DATE,
        "started_at": ts(),
        "start_epoch": epoch(),
        "last_update": ts(),
        "elapsed_seconds": 0,
        "effective_cycles": 0,
        "current_cycle": 0,
        "confirmed_claims": 0,
        "hypothesis_claims": len(CLAIMS),
        "used_source_ids": [],
        "failed_source_ids": [],
        "source_records": [],
        "last_claim_status": {},
        "runner_pid": os.getpid(),
        "hard_blocker_count": 0,
        "cycle_window_start_epoch": None,
        "cycle_logic_done_cycle": 0,
        "cycle_selected_source_ids": [],
        "cycle_failed_sources": [],
    }
    state = load_json(STATE_FILE, default)
    # If state was from earlier date and completed, start clean for today.
    if state.get("run_date") != RUN_DATE and state.get("status") == "completed":
        state = default
    # If state exists but malformed, normalize key set.
    for key, value in default.items():
        state.setdefault(key, value)
    if not isinstance(state.get("cycle_logic_done_cycle"), int):
        state["cycle_logic_done_cycle"] = 0
    if not isinstance(state.get("cycle_selected_source_ids"), list):
        state["cycle_selected_source_ids"] = []
    if not isinstance(state.get("cycle_failed_sources"), list):
        state["cycle_failed_sources"] = []
    if state.get("cycle_window_start_epoch") is not None and not isinstance(state.get("cycle_window_start_epoch"), int):
        state["cycle_window_start_epoch"] = None
    state["runner_pid"] = os.getpid()
    return state


def update_state(state: Dict, note: str = "") -> None:
    state["last_update"] = ts()
    state["elapsed_seconds"] = epoch() - state["start_epoch"]
    if note:
        state["last_note"] = note
    save_json_atomic(STATE_FILE, state)


def pick_cycle_sources(state: Dict, cycle_no: int) -> Tuple[List[Dict], List[Dict]]:
    used = set(state.get("used_source_ids", []))
    failed_ids = set(state.get("failed_source_ids", []))
    selected: List[Dict] = []
    failed: List[Dict] = []

    for src in SOURCE_CATALOG:
        sid = src["id"]
        if sid in used or sid in failed_ids:
            continue
        update_state(state, note=f"cycle_{cycle_no}_collecting_{sid}")
        ok, note = verify_url(src["url"])
        record = dict(src)
        record["check_date"] = datetime.now().strftime("%Y-%m-%d")
        record["verify_note"] = note
        record["verified"] = bool(ok)
        if ok:
            selected.append(record)
            used.add(sid)
        else:
            failed.append(record)
            failed_ids.add(sid)
        if len(selected) >= TARGET_SOURCES_PER_CYCLE:
            break

    # Recover path: if verification count is too low, include unverified alternates so cycle can continue.
    if len(selected) < MIN_VERIFIED_PER_CYCLE:
        for src in SOURCE_CATALOG:
            sid = src["id"]
            if sid in used:
                continue
            update_state(state, note=f"cycle_{cycle_no}_recovery_fallback_{sid}")
            record = dict(src)
            record["check_date"] = datetime.now().strftime("%Y-%m-%d")
            record["verify_note"] = "recovery_unverified_fallback"
            record["verified"] = False
            selected.append(record)
            used.add(sid)
            if len(selected) >= MIN_VERIFIED_PER_CYCLE:
                break

    state["used_source_ids"] = sorted(list(used))
    state["failed_source_ids"] = sorted(list(failed_ids))
    return selected, failed


def merge_source_records(state: Dict, cycle_no: int, rows: List[Dict]) -> None:
    existing_ids = {row["id"] for row in state["source_records"]}
    for row in rows:
        if row["id"] in existing_ids:
            continue
        payload = dict(row)
        payload["cycle"] = cycle_no
        state["source_records"].append(payload)


def sleep_with_heartbeat(state: Dict, cycle_start_epoch: int) -> None:
    target_end = cycle_start_epoch + CYCLE_SECONDS
    while True:
        if SHUTDOWN_REQUESTED or STOP_FLAG.exists():
            return
        now = epoch()
        if now >= target_end:
            return
        update_state(state, note="heartbeat")
        remaining = target_end - now
        time.sleep(min(HEARTBEAT_SECONDS, remaining))


def stop_conditions_met(state: Dict, claim_status: Dict[str, Dict]) -> bool:
    confirmed = sum(1 for row in claim_status.values() if row["status"] == "Confirmed")
    elapsed_ok = state["elapsed_seconds"] >= MIN_ELAPSED_SECONDS
    cycles_ok = state["effective_cycles"] >= MIN_EFFECTIVE_CYCLES
    claims_ok = confirmed >= MIN_CONFIRMED_CLAIMS
    return elapsed_ok and cycles_ok and claims_ok


def main() -> int:
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    LOGS_DIR.mkdir(parents=True, exist_ok=True)

    if not CONTEXT_FILE.exists():
        log(f"hard-blocker: missing context file: {CONTEXT_FILE}")
        return 2
    _ = CONTEXT_FILE.read_text(encoding="utf-8")
    log("context file read as H0 baseline")

    acquire_lock()
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    state = load_or_init_state()
    # If already completed, exit cleanly.
    if state.get("status") == "completed":
        update_state(state, note="already_completed")
        release_lock()
        return 0
    state["status"] = "running"

    ensure_file_headers(state)
    update_state(state, note="runner_started_or_resumed")
    log("runner started/resumed")

    unrecoverable_errors = 0

    try:
        while True:
            if STOP_FLAG.exists():
                state["status"] = "stopped"
                update_state(state, note="stopped_by_signal_or_flag")
                log("stop requested; runner exiting gracefully")
                return 0
            if SHUTDOWN_REQUESTED:
                update_state(state, note="signal_interrupted_waiting_restart")
                log("signal interruption without stop flag; exiting for watchdog restart")
                return 0

            prev_claim_map = dict(state.get("last_claim_status", {}))
            cycle_no = int(state.get("effective_cycles", 0)) + 1
            state["current_cycle"] = cycle_no
            if not state.get("cycle_window_start_epoch"):
                state["cycle_window_start_epoch"] = epoch()
                state["cycle_logic_done_cycle"] = 0
                state["cycle_selected_source_ids"] = []
                state["cycle_failed_sources"] = []
                update_state(state, note=f"cycle_{cycle_no}_start")
                log(f"cycle {cycle_no} started")
            cycle_start = int(state.get("cycle_window_start_epoch") or epoch())
            logic_done = int(state.get("cycle_logic_done_cycle", 0)) == cycle_no

            selected_sources: List[Dict] = []
            failed_sources: List[Dict] = []
            claim_status: Dict[str, Dict] = compute_claim_status(state["source_records"])

            try:
                if not logic_done:
                    selected_sources, failed_sources = pick_cycle_sources(state, cycle_no)
                    merge_source_records(state, cycle_no, selected_sources)
                    claim_status = compute_claim_status(state["source_records"])

                    state["last_claim_status"] = {cid: row["status"] for cid, row in claim_status.items()}
                    state["confirmed_claims"] = sum(1 for row in claim_status.values() if row["status"] == "Confirmed")
                    state["hypothesis_claims"] = sum(1 for row in claim_status.values() if row["status"] == "Hypothesis")

                    render_evidence_matrix(state, claim_status)
                    render_action_backlog(state, claim_status)
                    state["cycle_logic_done_cycle"] = cycle_no
                    state["cycle_selected_source_ids"] = [src["id"] for src in selected_sources]
                    state["cycle_failed_sources"] = [
                        {
                            "id": src.get("id"),
                            "verify_note": src.get("verify_note", ""),
                            "topic": src.get("topic", ""),
                        }
                        for src in failed_sources
                    ]
                    update_state(state, note=f"cycle_{cycle_no}_completed_logic")
                else:
                    update_state(state, note=f"cycle_{cycle_no}_logic_already_done_resume")
                unrecoverable_errors = 0
            except Exception as exc:
                unrecoverable_errors += 1
                state["hard_blocker_count"] = int(state.get("hard_blocker_count", 0)) + 1
                update_state(state, note=f"cycle_{cycle_no}_recoverable_error_{exc.__class__.__name__}")
                log(f"cycle {cycle_no} recoverable error: {exc}")
                log(traceback.format_exc())
                if unrecoverable_errors >= 3:
                    state["status"] = "hard_blocker"
                    update_state(state, note="unrecoverable_after_3_errors")
                    log("hard-blocker: unrecoverable failures reached threshold")
                    return 2

            sleep_with_heartbeat(state, cycle_start)
            if STOP_FLAG.exists():
                state["status"] = "stopped"
                update_state(state, note="stopped_during_cycle_window")
                log("stop requested during cycle window; runner exiting")
                return 0
            if SHUTDOWN_REQUESTED:
                update_state(state, note=f"cycle_{cycle_no}_signal_interrupted")
                log("signal interruption during cycle window; exiting for watchdog restart")
                return 0

            cycle_end_target = cycle_start + CYCLE_SECONDS
            now_epoch = epoch()
            if now_epoch < cycle_end_target:
                update_state(state, note=f"cycle_{cycle_no}_await_window_close")
                continue

            if int(state.get("cycle_logic_done_cycle", 0)) != cycle_no:
                # Logic never completed in this window; restart same cycle window from now.
                state["cycle_window_start_epoch"] = epoch()
                state["cycle_logic_done_cycle"] = 0
                state["cycle_selected_source_ids"] = []
                state["cycle_failed_sources"] = []
                update_state(state, note=f"cycle_{cycle_no}_window_closed_not_counted")
                log(f"cycle {cycle_no} window closed without logic completion; restarting cycle window")
                continue

            selected_ids = set(state.get("cycle_selected_source_ids", []))
            selected_sources = [
                row
                for row in state.get("source_records", [])
                if row.get("cycle") == cycle_no and (not selected_ids or row.get("id") in selected_ids)
            ]
            failed_sources = state.get("cycle_failed_sources", [])
            claim_status = compute_claim_status(state["source_records"])

            append_runlog_cycle(
                state=state,
                cycle_no=cycle_no,
                cycle_start=cycle_start,
                cycle_end=cycle_end_target,
                selected_sources=selected_sources,
                failed_sources=failed_sources,
                claim_status=claim_status,
                prev_claim_status=prev_claim_map,
            )
            state["effective_cycles"] = cycle_no
            state["cycle_window_start_epoch"] = None
            state["cycle_logic_done_cycle"] = 0
            state["cycle_selected_source_ids"] = []
            state["cycle_failed_sources"] = []
            update_state(state, note=f"cycle_{cycle_no}_window_closed_counted")

            claim_status = compute_claim_status(state["source_records"])
            state["confirmed_claims"] = sum(1 for row in claim_status.values() if row["status"] == "Confirmed")
            state["hypothesis_claims"] = sum(1 for row in claim_status.values() if row["status"] == "Hypothesis")
            update_state(state, note=f"cycle_{cycle_no}_post_window_recalc")
            log(
                f"cycle {cycle_no} ended: elapsed={state['elapsed_seconds']}s, cycles={state['effective_cycles']}, "
                f"confirmed={state['confirmed_claims']}"
            )

            if stop_conditions_met(state, claim_status):
                state["status"] = "completed"
                update_state(state, note="stop_conditions_met")
                append_runlog_completion(state, claim_status)
                log("all stop conditions met; run completed")
                return 0

    finally:
        release_lock()


if __name__ == "__main__":
    sys.exit(main())
PY
