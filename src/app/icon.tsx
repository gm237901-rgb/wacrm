import { ImageResponse } from "next/og";

import {
  BRAND_GLYPH_PATH,
  BRAND_GRADIENT_FROM,
  BRAND_GRADIENT_TO,
  BRAND_SQUARE_PATH,
} from "@/components/brand/logo";

// The browser-tab icon, drawn from the same two paths the sidebar mark
// uses (see components/brand/logo.tsx) so the favicon can't drift from
// the in-app logo again — it previously showed a chat bubble on a flat
// #2F8FE0 while the sidebar showed an "✕" on a gradient.
//
// Rendered through Satori, which resolves neither CSS custom properties
// nor Tailwind classes, hence the imported hex constants.
//
// This route takes precedence over src/app/favicon.ico, which is the
// Next.js default and can stay on disk harmlessly (or be removed).

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        <svg width="32" height="32" viewBox="0 0 32 32">
          <defs>
            <linearGradient
              id="brand"
              x1="0"
              y1="0"
              x2="32"
              y2="32"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0" stopColor={BRAND_GRADIENT_FROM} />
              <stop offset="1" stopColor={BRAND_GRADIENT_TO} />
            </linearGradient>
          </defs>
          <path d={BRAND_SQUARE_PATH} fill="url(#brand)" />
          <path
            d={BRAND_GLYPH_PATH}
            fill="none"
            stroke="#ffffff"
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}
