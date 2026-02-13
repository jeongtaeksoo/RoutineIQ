"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Globe, Leaf, Heart, Moon, Sun } from "lucide-react";

/* ─── Intersection Observer hook for scroll animations ─── */
function useInView(threshold = 0.15) {
    const ref = React.useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = React.useState(false);
    React.useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const obs = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) { setIsVisible(true); obs.unobserve(el); } },
            { threshold }
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, [threshold]);
    return { ref, isVisible };
}

/* ─── Animated wrapper ─── */
function FadeUp({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
    const { ref, isVisible } = useInView();
    return (
        <div
            ref={ref}
            className={className}
            style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? "translateY(0)" : "translateY(24px)",
                transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s`,
            }}
        >
            {children}
        </div>
    );
}

/* ─── i18n ─── */
type LangKey = "ko" | "en" | "ja" | "zh" | "es";

const LANG_LABELS: Record<LangKey, string> = {
    ko: "한국어",
    en: "English",
    ja: "日本語",
    zh: "中文",
    es: "Español",
};

const COPY: Record<LangKey, {
    tagline: string;
    heroTitle: string;
    heroSub: string;
    ctaStart: string;
    ctaDemo: string;
    card1Title: string;
    card1Desc: string;
    card2Title: string;
    card2Desc: string;
    card3Title: string;
    card3Desc: string;
    sectionTitle: string;
    sectionSub: string;
    feat1Title: string;
    feat1Desc: string;
    feat2Title: string;
    feat2Desc: string;
    feat3Title: string;
    feat3Desc: string;
    closingTitle: string;
    closingSub: string;
    closingCta: string;
    sponsored: string;
    adSlot: string;
    privacy: string;
}> = {
    ko: {
        tagline: "나를 위한 작은 루틴",
        heroTitle: "몰아붙이지 않아요.\n당신의 속도로, 충분합니다.",
        heroSub: "RoutineIQ는 완벽한 습관을 만드는 앱이 아닙니다.\n오늘 하루를 조용히 돌아보고, 내일을 조금 더 편안하게 준비하는 공간입니다.",
        ctaStart: "시작하기",
        ctaDemo: "먼저 둘러보기",
        card1Title: "기록은 부담 없이",
        card1Desc: "30초면 충분해요.\n템플릿을 누르면 오늘 하루가 정리됩니다.",
        card2Title: "분석은 조용하게",
        card2Desc: "AI가 패턴을 찾아주지만,\n점수를 매기지 않습니다.",
        card3Title: "내일은 자연스럽게",
        card3Desc: "무리한 계획이 아닌,\n당신에게 맞는 흐름을 제안합니다.",
        sectionTitle: "당신이 바뀌는 건\n습관이 아니라, 마음입니다",
        sectionSub: "RoutineIQ를 쓰는 사람들이 느끼는 변화",
        feat1Title: "\"오늘도 못했다\"가 줄어들었어요",
        feat1Desc: "작은 기록이 쌓이면, 생각보다 많은 일을 하고 있다는 걸 알게 됩니다.",
        feat2Title: "내 리듬이 보이기 시작했어요",
        feat2Desc: "언제 에너지가 높은지, 언제 쉬어야 하는지. 나를 더 잘 이해하게 됩니다.",
        feat3Title: "계획이 부담에서 기대로 바뀌었어요",
        feat3Desc: "AI가 무리하지 않는 내일을 함께 설계합니다. 지킬 수 있는 만큼만.",
        closingTitle: "지금, 조용히 시작해보세요",
        closingSub: "가입도 기록도 부담 없이.\n편할 때 돌아오시면 됩니다.",
        closingCta: "무료로 시작하기",
        sponsored: "스폰서",
        adSlot: "기업 광고 배너 영역",
        privacy: "개인정보는 루틴 분석에만 사용됩니다. 광고·판매 목적 사용 없음.",
    },
    en: {
        tagline: "A small routine, just for you",
        heroTitle: "No pressure.\nYour pace is enough.",
        heroSub: "RoutineIQ isn't about building perfect habits.\nIt's a quiet space to reflect on today and gently prepare for tomorrow.",
        ctaStart: "Get started",
        ctaDemo: "Explore first",
        card1Title: "Log without pressure",
        card1Desc: "30 seconds is enough.\nTap a template and your day is organized.",
        card2Title: "Analysis without judgment",
        card2Desc: "AI finds your patterns,\nbut never scores you.",
        card3Title: "Tomorrow, naturally",
        card3Desc: "Not an aggressive plan.\nA gentle flow that fits you.",
        sectionTitle: "What changes isn't the habit\n— it's how you feel",
        sectionSub: "What people experience with RoutineIQ",
        feat1Title: "\"I failed again\" happens less",
        feat1Desc: "Small records add up. You realize you've done more than you thought.",
        feat2Title: "I started seeing my own rhythm",
        feat2Desc: "When your energy peaks, when to rest. You understand yourself better.",
        feat3Title: "Planning went from dread to anticipation",
        feat3Desc: "AI designs a tomorrow that doesn't overwhelm. Just what you can keep.",
        closingTitle: "Start quietly, today",
        closingSub: "No pressure to sign up or log.\nCome back whenever it feels right.",
        closingCta: "Start for free",
        sponsored: "Sponsored",
        adSlot: "Corporate Ad Banner Slot",
        privacy: "Your data is used only for routine analysis. No ads, no selling.",
    },
    ja: {
        tagline: "自分のための小さなルーティン",
        heroTitle: "追い立てません。\nあなたのペースで、十分です。",
        heroSub: "RoutineIQは完璧な習慣を作るアプリではありません。\n今日を静かに振り返り、明日を少しだけ楽にする場所です。",
        ctaStart: "始める",
        ctaDemo: "まず見てみる",
        card1Title: "気軽に記録",
        card1Desc: "30秒で十分です。\nテンプレートを押すだけで一日が整理されます。",
        card2Title: "静かに分析",
        card2Desc: "AIがパターンを見つけますが、\n点数はつけません。",
        card3Title: "自然に明日へ",
        card3Desc: "無理な計画ではなく、\nあなたに合った流れを提案します。",
        sectionTitle: "変わるのは習慣ではなく、\n気持ちです",
        sectionSub: "RoutineIQで感じる変化",
        feat1Title: "「またできなかった」が減りました",
        feat1Desc: "小さな記録が積み重なると、思ったより多くのことをしていたと気づきます。",
        feat2Title: "自分のリズムが見え始めました",
        feat2Desc: "いつエネルギーが高いか、いつ休むべきか。自分をもっと理解できます。",
        feat3Title: "計画が負担から楽しみに変わりました",
        feat3Desc: "AIが無理のない明日を一緒に設計します。守れる分だけ。",
        closingTitle: "今日、静かに始めてみてください",
        closingSub: "登録も記録もプレッシャーなく。\n心地よい時に戻ってきてください。",
        closingCta: "無料で始める",
        sponsored: "スポンサー",
        adSlot: "企業広告バナー枠",
        privacy: "個人情報はルーティン分析のみに使用します。広告・販売目的での使用はありません。",
    },
    zh: {
        tagline: "属于你的小习惯",
        heroTitle: "不催促你。\n你的节奏，就足够了。",
        heroSub: "RoutineIQ不是打造完美习惯的应用。\n它是一个安静反思今天、温柔准备明天的空间。",
        ctaStart: "开始使用",
        ctaDemo: "先看看",
        card1Title: "轻松记录",
        card1Desc: "30秒就够了。\n点击模板，你的一天就整理好了。",
        card2Title: "安静分析",
        card2Desc: "AI会找到你的模式，\n但不会给你打分。",
        card3Title: "自然地迎接明天",
        card3Desc: "不是激进的计划，\n而是适合你的节奏。",
        sectionTitle: "改变的不是习惯，\n而是心情",
        sectionSub: "使用RoutineIQ后感受到的变化",
        feat1Title: "\"又没做到\"的想法少了",
        feat1Desc: "小小的记录累积起来，你会发现自己做的比想象中多。",
        feat2Title: "开始看到自己的节奏",
        feat2Desc: "什么时候精力最高，什么时候该休息。你会更了解自己。",
        feat3Title: "计划从压力变成了期待",
        feat3Desc: "AI帮你设计不勉强的明天。只安排你能做到的事情。",
        closingTitle: "今天，安静地开始吧",
        closingSub: "注册和记录都不必有压力。\n感觉对了再回来就好。",
        closingCta: "免费开始",
        sponsored: "赞助",
        adSlot: "企业广告位",
        privacy: "个人信息仅用于习惯分析。无广告，不出售数据。",
    },
    es: {
        tagline: "Una pequeña rutina, solo para ti",
        heroTitle: "Sin presión.\nTu ritmo es suficiente.",
        heroSub: "RoutineIQ no busca crear hábitos perfectos.\nEs un espacio tranquilo para reflexionar sobre tu día y preparar un mañana más amable.",
        ctaStart: "Comenzar",
        ctaDemo: "Explorar primero",
        card1Title: "Registra sin presión",
        card1Desc: "30 segundos bastan.\nToca una plantilla y tu día queda organizado.",
        card2Title: "Análisis sin juicio",
        card2Desc: "La IA encuentra tus patrones,\npero nunca te califica.",
        card3Title: "Mañana, naturalmente",
        card3Desc: "No un plan agresivo.\nUn flujo suave que se adapta a ti.",
        sectionTitle: "Lo que cambia no es el hábito,\nes cómo te sientes",
        sectionSub: "Lo que la gente experimenta con RoutineIQ",
        feat1Title: "\"Fallé otra vez\" ocurre menos",
        feat1Desc: "Los pequeños registros se acumulan. Te das cuenta de que has hecho más de lo que creías.",
        feat2Title: "Empecé a ver mi propio ritmo",
        feat2Desc: "Cuándo tienes más energía, cuándo descansar. Te entiendes mejor a ti mismo.",
        feat3Title: "Planificar pasó de ser temor a ilusión",
        feat3Desc: "La IA diseña un mañana que no agobia. Solo lo que puedes cumplir.",
        closingTitle: "Empieza tranquilamente, hoy",
        closingSub: "Sin presión para registrarte o escribir.\nVuelve cuando te sientas listo.",
        closingCta: "Empezar gratis",
        sponsored: "Patrocinado",
        adSlot: "Espacio de Banner Publicitario",
        privacy: "Tus datos se usan solo para analizar rutinas. Sin publicidad ni ventas.",
    },
};

/* ─── Component ─── */
export function LandingContent() {
    const [lang, setLang] = React.useState<LangKey>("ko");
    const [langOpen, setLangOpen] = React.useState(false);
    const [mounted, setMounted] = React.useState(false);
    const t = COPY[lang];
    const sponsorSlots = React.useMemo(
        () => [1, 2, 3],
        []
    );

    React.useEffect(() => {
        setMounted(true);
    }, []);

    const heroStyle: React.CSSProperties = {
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateY(0)" : "translateY(20px)",
        transition: "opacity 0.8s cubic-bezier(0.16,1,0.3,1) 0.1s, transform 0.8s cubic-bezier(0.16,1,0.3,1) 0.1s",
    };

    return (
        <main className="min-h-screen pb-32 md:pb-24" style={{ background: "linear-gradient(180deg, #fdf9f4 0%, #faf6f0 40%, #f7f3ed 100%)" }}>
            {/* ─── Nav ─── */}
            <nav className="sticky top-0 z-30 flex items-center justify-between px-6 py-4 md:px-10" style={{ background: "rgba(253,249,244,0.85)", backdropFilter: "blur(12px)" }}>
                <Link
                    href="/"
                    className="text-xl font-semibold tracking-tight"
                    style={{ fontFamily: "var(--font-serif)", color: "#4a3f35" }}
                >
                    RoutineIQ
                </Link>

                {/* Language Selector */}
                <div className="relative">
                    <button
                        onClick={() => setLangOpen(!langOpen)}
                        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-all duration-200 hover:shadow-sm"
                        style={{ border: "1px solid #e6ddd3", background: "rgba(255,255,255,0.7)", color: "#7a6e62" }}
                    >
                        <Globe className="h-3.5 w-3.5" />
                        {LANG_LABELS[lang]}
                    </button>
                    {langOpen && (
                        <div
                            className="absolute right-0 top-full z-40 mt-1.5 w-36 overflow-hidden rounded-2xl shadow-xl"
                            style={{
                                border: "1px solid #e6ddd3",
                                background: "#fffcf8",
                                animation: "dropdownIn 0.2s cubic-bezier(0.16,1,0.3,1)",
                            }}
                        >
                            {(Object.keys(LANG_LABELS) as LangKey[]).map((k) => (
                                <button
                                    key={k}
                                    onClick={() => { setLang(k); setLangOpen(false); }}
                                    className="block w-full px-4 py-2.5 text-left text-sm transition-colors duration-150"
                                    style={{
                                        color: k === lang ? "#4a3f35" : "#7a6e62",
                                        fontWeight: k === lang ? 600 : 400,
                                        background: k === lang ? "#f5efe7" : "transparent",
                                    }}
                                    onMouseEnter={e => { if (k !== lang) (e.target as HTMLElement).style.background = "#faf5ee"; }}
                                    onMouseLeave={e => { if (k !== lang) (e.target as HTMLElement).style.background = "transparent"; }}
                                >
                                    {LANG_LABELS[k]}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </nav>

            {/* Click outside to close lang dropdown */}
            {langOpen && <div className="fixed inset-0 z-20" onClick={() => setLangOpen(false)} />}

            {/* ─── Hero ─── */}
            <section className="mx-auto max-w-3xl px-6 pb-20 pt-14 text-center md:pt-24">
                <div style={heroStyle}>
                    <p
                        className="mb-8 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs"
                        style={{ border: "1px solid #e6ddd3", background: "rgba(255,255,255,0.6)", color: "#9a8e80" }}
                    >
                        <Leaf className="h-3.5 w-3.5" style={{ color: "#a3b89a" }} />
                        {t.tagline}
                    </p>
                    <h1
                        className="whitespace-pre-line text-3xl leading-snug md:text-[3.2rem] md:leading-tight"
                        style={{
                            fontFamily: "var(--font-serif)",
                            letterSpacing: "-0.025em",
                            color: "#3e3529",
                        }}
                    >
                        {t.heroTitle}
                    </h1>
                    <p
                        className="mx-auto mt-7 max-w-lg whitespace-pre-line text-[15px] leading-relaxed md:text-base"
                        style={{ color: "#8a7e70", lineHeight: 1.8 }}
                    >
                        {t.heroSub}
                    </p>
                </div>

                <div
                    className="mt-11 flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
                    style={{
                        opacity: mounted ? 1 : 0,
                        transform: mounted ? "translateY(0)" : "translateY(16px)",
                        transition: "opacity 0.7s cubic-bezier(0.16,1,0.3,1) 0.4s, transform 0.7s cubic-bezier(0.16,1,0.3,1) 0.4s",
                    }}
                >
                    <Link
                        href="/login?demo=1"
                        className="group inline-flex items-center gap-2 rounded-full px-9 py-3.5 text-sm font-medium text-white transition-all duration-300 hover:shadow-xl"
                        style={{ background: "#4a3f35", boxShadow: "0 4px 20px rgba(74,63,53,0.15)" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#3e3529"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 32px rgba(74,63,53,0.25)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#4a3f35"; (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(74,63,53,0.15)"; }}
                    >
                        {t.ctaStart}
                        <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                    </Link>
                    <Link
                        href="/login?auth=1"
                        className="inline-flex items-center gap-2 rounded-full px-9 py-3.5 text-sm transition-all duration-300 hover:shadow-md"
                        style={{ border: "1px solid #e6ddd3", background: "rgba(255,255,255,0.6)", color: "#7a6e62" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.95)"; (e.currentTarget as HTMLElement).style.borderColor = "#d4c9bc"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.6)"; (e.currentTarget as HTMLElement).style.borderColor = "#e6ddd3"; }}
                    >
                        {t.ctaDemo}
                    </Link>
                </div>
            </section>

            {/* ─── 3 Cards ─── */}
            <section className="mx-auto max-w-4xl px-6 pb-24">
                <div className="grid gap-5 md:grid-cols-3">
                    {[
                        { icon: <Sun className="h-6 w-6" style={{ color: "#c8a06a" }} />, title: t.card1Title, desc: t.card1Desc, bg: "#fdf6ec", borderColor: "#f0e4d0" },
                        { icon: <Heart className="h-6 w-6" style={{ color: "#b8909e" }} />, title: t.card2Title, desc: t.card2Desc, bg: "#faf2f4", borderColor: "#f0dde2" },
                        { icon: <Moon className="h-6 w-6" style={{ color: "#8e9eb5" }} />, title: t.card3Title, desc: t.card3Desc, bg: "#f2f4f9", borderColor: "#dde2ee" },
                    ].map((card, i) => (
                        <FadeUp key={i} delay={i * 0.12} className="h-full">
                            <div
                                className="h-full rounded-[20px] p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                                style={{
                                    background: card.bg,
                                    border: `1px solid ${card.borderColor}`,
                                }}
                            >
                                <div
                                    className="mb-5 inline-flex rounded-2xl p-3"
                                    style={{ background: "rgba(255,255,255,0.7)" }}
                                >
                                    {card.icon}
                                </div>
                                <h3 className="text-[15px] font-semibold" style={{ color: "#3e3529" }}>{card.title}</h3>
                                <p className="mt-2.5 whitespace-pre-line text-sm leading-relaxed" style={{ color: "#8a7e70" }}>{card.desc}</p>
                            </div>
                        </FadeUp>
                    ))}
                </div>
            </section>

            {/* ─── Feature Section ─── */}
            <section style={{ background: "rgba(255,252,248,0.5)", borderTop: "1px solid #ede6dc", borderBottom: "1px solid #ede6dc" }}>
                <div className="mx-auto max-w-3xl px-6 py-20 md:py-24">
                    <FadeUp>
                        <div className="mb-14 text-center">
                            <h2
                                className="whitespace-pre-line text-2xl tracking-tight md:text-[2rem]"
                                style={{ fontFamily: "var(--font-serif)", letterSpacing: "-0.02em", color: "#3e3529" }}
                            >
                                {t.sectionTitle}
                            </h2>
                            <p className="mt-4 text-sm" style={{ color: "#9a8e80" }}>{t.sectionSub}</p>
                        </div>
                    </FadeUp>

                    <div className="space-y-5">
                        {[
                            { title: t.feat1Title, desc: t.feat1Desc, emoji: "🌱" },
                            { title: t.feat2Title, desc: t.feat2Desc, emoji: "🌊" },
                            { title: t.feat3Title, desc: t.feat3Desc, emoji: "🌤" },
                        ].map((feat, i) => (
                            <FadeUp key={i} delay={i * 0.1}>
                                <div
                                    className="flex gap-5 rounded-[20px] p-6 transition-all duration-300 hover:shadow-md"
                                    style={{
                                        border: "1px solid #ede6dc",
                                        background: "#fdf9f4",
                                    }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#fffcf8"; }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#fdf9f4"; }}
                                >
                                    <span className="mt-0.5 shrink-0 text-2xl">{feat.emoji}</span>
                                    <div>
                                        <h3 className="text-sm font-semibold" style={{ color: "#3e3529" }}>{feat.title}</h3>
                                        <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "#8a7e70" }}>{feat.desc}</p>
                                    </div>
                                </div>
                            </FadeUp>
                        ))}
                    </div>
                </div>
            </section>

            {/* ─── Closing CTA ─── */}
            <section className="mx-auto max-w-3xl px-6 py-24 text-center">
                <FadeUp>
                    <h2
                        className="text-2xl tracking-tight md:text-[2rem]"
                        style={{ fontFamily: "var(--font-serif)", letterSpacing: "-0.02em", color: "#3e3529" }}
                    >
                        {t.closingTitle}
                    </h2>
                    <p
                        className="mx-auto mt-5 max-w-md whitespace-pre-line text-sm leading-relaxed"
                        style={{ color: "#8a7e70", lineHeight: 1.8 }}
                    >
                        {t.closingSub}
                    </p>
                </FadeUp>
                <FadeUp delay={0.15}>
                    <div className="mt-10">
                        <Link
                            href="/login?demo=1"
                            className="group inline-flex items-center gap-2 rounded-full px-9 py-3.5 text-sm font-medium text-white transition-all duration-300"
                            style={{ background: "#4a3f35", boxShadow: "0 4px 20px rgba(74,63,53,0.15)" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#3e3529"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 32px rgba(74,63,53,0.25)"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#4a3f35"; (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(74,63,53,0.15)"; }}
                        >
                            {t.closingCta}
                            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                        </Link>
                    </div>
                </FadeUp>
            </section>

            {/* ─── Fixed Footer ─── */}
            <footer
                className="fixed bottom-0 left-0 right-0 z-40 border-t px-4 py-3 md:px-6"
                style={{
                    borderColor: "#e9dfd2",
                    background: "rgba(253,249,244,0.94)",
                    backdropFilter: "blur(10px)",
                }}
            >
                <div className="mx-auto flex max-w-6xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                        <span
                            className="inline-flex rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-wide"
                            style={{ color: "#8d806f", background: "#f4ece1", border: "1px solid #e2d6c8" }}
                        >
                            {t.sponsored}
                        </span>
                        {sponsorSlots.map((idx) => (
                            <div
                                key={idx}
                                className="inline-flex h-7 items-center rounded-md px-3 text-[11px] font-semibold"
                                style={{
                                    color: "#6f6559",
                                    border: "1px solid #ddcfbe",
                                    background: "linear-gradient(180deg, #fffdfa 0%, #f8efe4 100%)",
                                }}
                            >
                                {t.adSlot} {idx}
                            </div>
                        ))}
                    </div>

                    <div className="text-left md:text-right">
                        <p className="text-[11px]" style={{ color: "#a89f92" }}>{t.privacy}</p>
                        <p className="mt-0.5 text-[11px]" style={{ color: "#c3b9ab" }}>© 2026 RoutineIQ</p>
                    </div>
                </div>
            </footer>

            {/* ─── Global animation keyframes ─── */}
            <style jsx global>{`
        @keyframes dropdownIn {
          from { opacity: 0; transform: translateY(-6px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
        </main>
    );
}
