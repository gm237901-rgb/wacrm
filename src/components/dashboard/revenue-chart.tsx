"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { DollarSign } from 'lucide-react'
import type { RevenuePoint } from '@/lib/dashboard/types'
import { formatCurrency, formatCurrencyShort } from '@/lib/currency'
import { EmptyState } from './empty-state'
import { Skeleton } from './skeleton'
import { cn } from '@/lib/utils'

type RangeDays = 7 | 30 | 90

interface RevenueChartProps {
  series: Record<RangeDays, RevenuePoint[] | null>
  loading: boolean
  range: RangeDays
  onRangeChange: (r: RangeDays) => void
  currency: string
}

const VB_W = 760
const VB_H = 240
const PADDING = { top: 16, right: 16, bottom: 28, left: 48 }

import { useTranslations } from 'next-intl'

export function RevenueChart({ series, loading, range, onRangeChange, currency }: RevenueChartProps) {
  const t = useTranslations('Dashboard.revenueChart')
  const data = series[range]
  const total = useMemo(() => (data ?? []).reduce((sum, p) => sum + p.value, 0), [data])

  const { maxY, niceTicks } = useMemo(() => {
    const arr = data ?? []
    const max = arr.reduce((m, p) => Math.max(m, p.value), 0)
    const ceil = niceCeil(max)
    const ticks = [0, ceil / 4, ceil / 2, (3 * ceil) / 4, ceil].map((v) => Math.round(v))
    return { maxY: ceil, niceTicks: Array.from(new Set(ticks)) }
  }, [data])

  return (
    <section className="flex h-full flex-col rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t('title')}</h2>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            {formatCurrency(total, currency)}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-muted/60 p-1">
          {[7, 30, 90].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onRangeChange(r as RangeDays)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                range === r ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t('days', { count: r })}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 p-5">
        {loading || !data ? (
          <Skeleton className="h-[240px] w-full" />
        ) : data.every((p) => p.value === 0) ? (
          <EmptyState icon={DollarSign} title={t('noRevenue')} hint={t('noRevenueHint')} />
        ) : (
          <AreaSvg data={data} maxY={maxY} ticks={niceTicks} currency={currency} t={t} />
        )}
      </div>
    </section>
  )
}

function AreaSvg({
  data,
  maxY,
  ticks,
  currency,
  t,
}: {
  data: RevenuePoint[]
  maxY: number
  ticks: number[]
  currency: string
  t: ReturnType<typeof useTranslations>
}) {
  const [hover, setHover] = useState<{ idx: number; tooltipLeftPx: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const chartW = VB_W - PADDING.left - PADDING.right
  const chartH = VB_H - PADDING.top - PADDING.bottom
  const stepX = data.length > 1 ? chartW / (data.length - 1) : 0
  const yFor = (v: number) => (maxY === 0 ? PADDING.top + chartH : PADDING.top + chartH - (v / maxY) * chartH)
  const xFor = (i: number) => PADDING.left + i * stepX

  const linePath = data.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(i)},${yFor(p.value)}`).join(' ')
  const areaPath = `${linePath} L${xFor(data.length - 1)},${PADDING.top + chartH} L${xFor(0)},${PADDING.top + chartH} Z`

  useEffect(() => {
    const svg = svgRef.current
    const wrap = wrapRef.current
    if (!svg || !wrap) return
    const onMove = (e: MouseEvent) => {
      const ctm = svg.getScreenCTM()
      if (!ctm) return
      const pt = svg.createSVGPoint()
      pt.x = e.clientX
      pt.y = e.clientY
      const local = pt.matrixTransform(ctm.inverse())
      const xVb = local.x
      if (xVb < PADDING.left - 8 || xVb > VB_W - PADDING.right + 8) {
        setHover(null)
        return
      }
      const relative = xVb - PADDING.left
      const idx = Math.max(0, Math.min(data.length - 1, Math.round(stepX === 0 ? 0 : relative / stepX)))
      const dataPointVbX = PADDING.left + idx * stepX
      const dataPointPt = svg.createSVGPoint()
      dataPointPt.x = dataPointVbX
      dataPointPt.y = 0
      const screen = dataPointPt.matrixTransform(ctm)
      const wrapRect = wrap.getBoundingClientRect()
      setHover({ idx, tooltipLeftPx: screen.x - wrapRect.left })
    }
    const onLeave = () => setHover(null)
    svg.addEventListener('mousemove', onMove)
    svg.addEventListener('mouseleave', onLeave)
    return () => {
      svg.removeEventListener('mousemove', onMove)
      svg.removeEventListener('mouseleave', onLeave)
    }
  }, [data, stepX])

  const hovered = hover !== null ? data[hover.idx] : null
  const hoverX = hover !== null ? xFor(hover.idx) : 0
  const labelStride = Math.max(1, Math.ceil(data.length / 6))

  return (
    <div ref={wrapRef} className="relative w-full">
      <svg ref={svgRef} viewBox={`0 0 ${VB_W} ${VB_H}`} className="h-[240px] w-full" role="img" aria-label={t('ariaLabel')}>
        <defs>
          <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((tick) => {
          const y = yFor(tick)
          return (
            <g key={tick}>
              <line x1={PADDING.left} x2={VB_W - PADDING.right} y1={y} y2={y} stroke="var(--border)" strokeDasharray="3 3" />
              <text x={PADDING.left - 8} y={y} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground text-[11px]">
                {formatCurrencyShort(tick, currency)}
              </text>
            </g>
          )
        })}

        {data.map((p, i) =>
          i % labelStride === 0 ? (
            <text key={p.day} x={xFor(i)} y={VB_H - 8} textAnchor="middle" className="fill-muted-foreground text-[11px]">
              {shortDayLabel(p.day)}
            </text>
          ) : null,
        )}

        <path d={areaPath} fill="url(#revenue-fill)" stroke="none" />
        <path d={linePath} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {hover !== null && (
          <g pointerEvents="none">
            <line x1={hoverX} x2={hoverX} y1={PADDING.top} y2={PADDING.top + chartH} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
            <circle cx={hoverX} cy={yFor(data[hover.idx].value)} r={3.5} fill="var(--primary)" />
          </g>
        )}
      </svg>

      {hovered && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-border bg-popover px-2.5 py-1.5 text-[11px] shadow-lg"
          style={{ left: `${hover.tooltipLeftPx}px` }}
        >
          <div className="font-medium text-popover-foreground">{longDayLabel(hovered.day)}</div>
          <div className="mt-1 font-semibold tabular-nums text-primary">{formatCurrency(hovered.value, currency)}</div>
        </div>
      )}
    </div>
  )
}

function shortDayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function longDayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function niceCeil(max: number): number {
  if (max <= 0) return 100
  const pow = Math.pow(10, Math.floor(Math.log10(max)))
  const normalised = max / pow
  let nice: number
  if (normalised <= 1) nice = 1
  else if (normalised <= 2) nice = 2
  else if (normalised <= 5) nice = 5
  else nice = 10
  return nice * pow
}
