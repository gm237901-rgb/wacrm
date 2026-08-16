import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import type { ComponentType } from 'react'
import { cn } from '@/lib/utils'

export type MetricTone = 'blue' | 'green' | 'orange' | 'violet'

/**
 * Per-tone icon chip and sparkline stroke. The chip is a filled circle
 * rather than a tinted square: at this size the solid shape is what
 * makes the row of cards scannable — five muted squares read as one
 * grey block.
 */
const TONE: Record<MetricTone, { chip: string; stroke: string; fill: string }> = {
  blue: {
    chip: 'bg-blue-500/15 text-blue-400 ring-blue-500/25',
    stroke: '#60a5fa',
    fill: 'rgba(96,165,250,0.18)',
  },
  green: {
    chip: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/25',
    stroke: '#34d399',
    fill: 'rgba(52,211,153,0.18)',
  },
  orange: {
    chip: 'bg-amber-500/15 text-amber-400 ring-amber-500/25',
    stroke: '#fbbf24',
    fill: 'rgba(251,191,36,0.18)',
  },
  violet: {
    chip: 'bg-primary/15 text-primary ring-primary/25',
    stroke: 'var(--primary)',
    fill: 'color-mix(in oklch, var(--primary) 18%, transparent)',
  },
}

interface MetricCardProps {
  title: string
  /** Pre-formatted value for display (e.g. "42" or "R$ 1.250"). */
  value: string
  icon: ComponentType<{ className?: string }>
  /** Colored icon chip + sparkline colour. Defaults to the neutral look. */
  tone?: MetricTone
  /**
   * Delta-mode secondary row: arrow + delta text. Omit when the metric
   * doesn't have a sensible comparison.
   */
  delta?: {
    /** Positive / negative / zero drives arrow + color. */
    sign: number
    /** Pre-formatted delta, e.g. "+12,5% este mês". */
    label: string
  }
  /** Used instead of `delta` when the metric has a static subtitle. */
  subtitle?: string
  /** Daily values behind the number. Omitted or flat → no sparkline. */
  spark?: number[]
}

export function MetricCard({
  title,
  value,
  icon: Icon,
  tone,
  delta,
  subtitle,
  spark,
}: MetricCardProps) {
  const palette = tone ? TONE[tone] : null

  return (
    <div className="glow-card rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-full ring-1',
            palette?.chip ?? 'bg-muted text-muted-foreground ring-border',
          )}
        >
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-1 text-2xl leading-none font-bold tabular-nums text-foreground">
            {value}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {delta ? (
            <DeltaRow sign={delta.sign} label={delta.label} />
          ) : subtitle ? (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {spark && palette ? (
          <Sparkline values={spark} stroke={palette.stroke} fill={palette.fill} />
        ) : null}
      </div>
    </div>
  )
}

/**
 * Minimal trend line. Fixed viewBox scaled by CSS, so it stays crisp
 * without measuring the container. A flat series renders nothing rather
 * than a misleading straight line pinned to the baseline.
 */
function Sparkline({
  values,
  stroke,
  fill,
}: {
  values: number[]
  stroke: string
  fill: string
}) {
  if (values.length < 2) return null

  const max = Math.max(...values)
  const min = Math.min(...values)
  if (max === min) return null

  const w = 72
  const h = 28
  const stepX = w / (values.length - 1)
  const yFor = (v: number) => h - ((v - min) / (max - min)) * (h - 2) - 1

  const line = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(1)},${yFor(v).toFixed(1)}`)
    .join(' ')
  const area = `${line} L${w},${h} L0,${h} Z`

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-7 w-18 shrink-0"
      aria-hidden
      preserveAspectRatio="none"
    >
      <path d={area} fill={fill} stroke="none" />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

function DeltaRow({ sign, label }: { sign: number; label: string }) {
  const tone =
    sign > 0
      ? 'text-emerald-400'
      : sign < 0
      ? 'text-red-400'
      : 'text-muted-foreground'
  const Arrow = sign > 0 ? ArrowUp : sign < 0 ? ArrowDown : Minus
  return (
    <div className={cn('flex items-center gap-1 text-xs font-medium', tone)}>
      <Arrow className="size-3.5" aria-hidden />
      <span className="truncate tabular-nums">{label}</span>
    </div>
  )
}
