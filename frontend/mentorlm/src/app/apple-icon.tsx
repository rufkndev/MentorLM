/**
 * Apple touch icon (180×180 PNG) — генерируется через next/og.
 * Знак-линза со свечением на тёмной брендовой подложке.
 */

import { ImageResponse } from "next/og";
import { BRAND_MARK_DATA_URI } from "@/lib/brand-mark-svg";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(145deg, #0B1020 0%, #0A1E52 60%, #071B4D 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            width: 150,
            height: 150,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "50%",
            background:
              "radial-gradient(closest-side, rgba(86,217,255,0.45), rgba(23,70,245,0.15) 60%, transparent 75%)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img width={116} height={116} src={BRAND_MARK_DATA_URI} alt="" />
        </div>
      </div>
    ),
    { ...size }
  );
}
