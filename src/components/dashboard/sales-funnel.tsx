"use client"

import Link from 'next/link'
import { GitBranch } from 'lucide-react'
import type { SalesFunnelData } from '@/lib/dashboard/types'
import { formatCurrencyShort } from '@/lib/currency'
import { EmptyState } from './empty-state'
import { Skeleton } from './skeleton'

interface SalesFunnelProps {
  data: SalesFunnelData | null
  loading: boolean
}

import { useTranslations } from 'next-intl'

export function SalesFunnel({ data, loading }: SalesFunnelProps) {
  const t = useTranslations('Dashboard.salesFunnel')
  // Scale the stage bars against the biggest stage rather than the total:
  // against the total, a healthy five-stage funnel shows five stubs.
  const maxValue = Math.max(0, ...(data?.stages ?? []).map((s) => s.totalValue))

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t('title')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('description')}</p>
        </div>
        <Link href="/pipelines" className="text-xs font-medium text-primary hover:text-primary/80">
          {t('viewAll')}
        </Link>
      </header>

      <div className="p-5">
        {loading || !data ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-52 w-full" />
            ))}
          </div>
        ) : data.stages.length === 0 ? (
          <EmptyState icon={GitBranch} title={t('noStages')} hint={t('noStagesHint')} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {data.stages.map((stage) => (
              <div key={stage.id} className="flex flex-col rounded-lg border border-border">
                <div className="flex flex-col gap-2 p-3">
                  <p className="truncate text-sm font-medium text-foreground">{stage.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('dealCount', { count: stage.dealCount })}
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-foreground">
                    {formatCurrencyShort(stage.totalValue)}
                  </p>
                  {/* Fill is the stage's share of the largest stage, so the
                      bars compare against each other at a glance instead of
                      each being a full-width strip of colour. */}
                  <div
                    className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                    role="presentation"
                  >
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{
                        width: `${maxValue > 0 ? Math.max(4, (stage.totalValue / maxValue) * 100) : 0}%`,
                        background: stage.color || 'var(--muted-foreground)',
                      }}
                    />
                  </div>
                </div>
                <div className="border-t border-border" />
                <div className="flex flex-1 flex-col gap-2 p-3">
                  {stage.topDeals.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t('emptyStage')}</p>
                  ) : (
                    stage.topDeals.map((deal) => (
                      <div
                        key={deal.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-foreground">{deal.title}</p>
                          {deal.contactName && (
                            <p className="truncate text-[11px] text-muted-foreground">{deal.contactName}</p>
                          )}
                        </div>
                        <span className="flex-shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
                          {formatCurrencyShort(deal.value)}
                        </span>
                      </div>
                    ))
                  )}
                  {stage.dealCount > stage.topDeals.length && (
                    <Link
                      href="/pipelines"
                      className="mt-auto text-[11px] font-medium text-primary hover:text-primary/80"
                    >
                      {t('seeMore')}
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
