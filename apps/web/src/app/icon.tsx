import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#fbf7ef",
          backgroundImage:
            "radial-gradient(circle at 20% 20%, rgba(20,184,166,0.25), transparent 45%), radial-gradient(circle at 85% 25%, rgba(251,191,36,0.22), transparent 40%)"
        }}
      >
        <div
          style={{
            width: 360,
            height: 360,
            borderRadius: 96,
            background: "rgba(255,255,255,0.75)",
            border: "8px solid rgba(15,23,42,0.10)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <div
            style={{
              fontSize: 180,
              fontWeight: 800,
              letterSpacing: -6,
              color: "rgb(15,23,42)"
            }}
          >
            R
          </div>
        </div>
      </div>
    ),
    size
  );
}
