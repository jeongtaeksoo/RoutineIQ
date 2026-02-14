import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          backgroundColor: "#fbf7ef",
          backgroundImage:
            "radial-gradient(1100px circle at 12% 10%, rgba(20,184,166,0.24), transparent 40%), radial-gradient(900px circle at 86% 16%, rgba(251,191,36,0.22), transparent 38%), radial-gradient(950px circle at 52% 102%, rgba(59,130,246,0.18), transparent 46%)"
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}
          >
            <div style={{ fontSize: 54, fontWeight: 800, letterSpacing: -2, color: "rgb(15,23,42)" }}>
              RutineIQ
            </div>
            <div
              style={{
                fontSize: 18,
                color: "rgba(15,23,42,0.65)",
                border: "1px solid rgba(15,23,42,0.12)",
                background: "rgba(255,255,255,0.70)",
                padding: "10px 14px",
                borderRadius: 999
              }}
            >
              AI routine optimizer
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              fontSize: 56,
              fontWeight: 700,
              letterSpacing: -2,
              color: "rgb(15,23,42)",
              lineHeight: 1.08
            }}
          >
            <div>Log your day in 1 minute.</div>
            <div>Get peak hours, focus triggers,</div>
            <div>and a smarter tomorrow schedule.</div>
          </div>

          <div style={{ fontSize: 22, color: "rgba(15,23,42,0.70)", maxWidth: 940 }}>
            RutineIQ turns daily behavior into an improvement loop: Daily Flow → AI analysis → optimized routine → smart recovery rules.
          </div>
        </div>

        <div style={{ display: "flex", gap: 16 }}>
          {[
            { title: "Peak Hours", desc: "Your best windows for deep work" },
            { title: "Break Triggers", desc: "What reliably derails you" },
            { title: "Smart Schedule", desc: "A plan you can actually follow" }
          ].map((c) => (
            <div
              key={c.title}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                borderRadius: 28,
                padding: 22,
                background: "rgba(255,255,255,0.72)",
                border: "1px solid rgba(15,23,42,0.10)"
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 700, color: "rgb(15,23,42)" }}>{c.title}</div>
              <div style={{ marginTop: 8, fontSize: 18, color: "rgba(15,23,42,0.68)" }}>{c.desc}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
