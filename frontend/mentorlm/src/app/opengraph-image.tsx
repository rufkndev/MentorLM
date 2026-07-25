/**
 * OG-картинка (1200×630 PNG) — генерируется через next/og.
 * Next автоматически подставляет её в og:image / twitter:image мету всего сайта.
 * Маскот-линза + словесная марка + tagline на тёмном брендовом фоне.
 */

import { ImageResponse } from "next/og";
import { BRAND_MARK_DATA_URI } from "@/lib/brand-mark-svg";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Mentor LM — единая AI-платформа для учёбы";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          padding: "84px 96px",
          justifyContent: "space-between",
          background:
            "radial-gradient(1100px 620px at 78% 12%, rgba(23,70,245,0.42), transparent 60%), linear-gradient(150deg, #0B1020 0%, #0A1638 55%, #071B4D 100%)",
          color: "#EEF1F7",
          fontFamily: "sans-serif",
        }}
      >
        {/* Маскот + словесная марка */}
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div
            style={{
              display: "flex",
              width: 132,
              height: 132,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              background:
                "radial-gradient(closest-side, rgba(86,217,255,0.5), rgba(23,70,245,0.16) 60%, transparent 75%)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img width={104} height={104} src={BRAND_MARK_DATA_URI} alt="" />
          </div>
          <div style={{ display: "flex", fontSize: 46, fontWeight: 700, letterSpacing: -1 }}>
            <span>Mentor</span>
            <span style={{ color: "#7FA0FF" }}>LM</span>
          </div>
        </div>

        {/* Заголовок / обещание */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              display: "flex",
              fontSize: 76,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -2,
              maxWidth: 900,
            }}
          >
            Единая AI-платформа для учёбы
          </div>
          <div style={{ display: "flex", fontSize: 32, color: "#AEB8CE", maxWidth: 860 }}>
            Чат, код и исследования — в одном рабочем пространстве.
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
