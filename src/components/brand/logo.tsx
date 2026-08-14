import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * The Linovexa mark — single source of truth.
 *
 * Before this file the app carried two different logos: the sidebar
 * drew a white "✕" on a blue gradient, while the favicon route drew a
 * chat bubble on a flat `#2F8FE0` that no longer existed in the
 * palette. Two marks for one product, and one of them a stale colour.
 *
 * Shape: an "L" on a rounded square whose bottom-left corner is almost
 * square while the other three are fully round. That asymmetry is the
 * whole idea — it gives the silhouette something to be recognised by at
 * 16px, where a plain rounded square with a letter in it is every other
 * SaaS icon, and it reads as the corner of a message bubble without
 * resorting to an actual balloon.
 *
 * The glyph is a stroked path rather than filled type, so it stays
 * crisp at favicon size and needs no font to render.
 */

/** Gradient stops, light → dark. Kept as hex because the favicon route
 *  renders through Satori, which can't resolve CSS custom properties.
 *  These are the sRGB equivalents of `--chart-1` and `--primary`. */
export const BRAND_GRADIENT_FROM = "#67AAED";
export const BRAND_GRADIENT_TO = "#2773C0";

/** Outline of the rounded square: three 9px corners, one 2px corner
 *  (bottom-left). Shared by the mark and the favicon route. */
export const BRAND_SQUARE_PATH =
  "M9 0H23A9 9 0 0 1 32 9V23A9 9 0 0 1 23 32H2A2 2 0 0 1 0 30V9A9 9 0 0 1 9 0Z";

/** The "L" itself, drawn as a stroke on the same 32×32 canvas. */
export const BRAND_GLYPH_PATH = "M11.5 9V21H21";

export function LogoMark({
  className,
  title,
}: {
  className?: string;
  /** Set only when the mark stands alone as a link or button label. */
  title?: string;
}) {
  // Two marks on one page (sidebar + a dialog, say) would otherwise
  // share a gradient id and the second would inherit the first's stops.
  const gradientId = useId();

  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("h-8 w-8", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={BRAND_GRADIENT_FROM} />
          <stop offset="1" stopColor={BRAND_GRADIENT_TO} />
        </linearGradient>
      </defs>
      <path d={BRAND_SQUARE_PATH} fill={`url(#${gradientId})`} />
      <path
        d={BRAND_GLYPH_PATH}
        fill="none"
        stroke="#ffffff"
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Mark + name, the form used in the sidebar and on the login screen.
 * `subtitle` renders the small uppercase line under the name.
 */
export function LogoLockup({
  subtitle,
  className,
  hideText,
}: {
  subtitle?: string;
  className?: string;
  /** Collapsed sidebar keeps the mark and drops the words. */
  hideText?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className="h-8 w-8 shrink-0" />
      <span className={cn("flex flex-col leading-none", hideText && "lg:hidden")}>
        <span className="text-sm font-semibold text-foreground">Linovexa</span>
        {subtitle ? (
          <span className="mt-0.5 text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
            {subtitle}
          </span>
        ) : null}
      </span>
    </span>
  );
}
