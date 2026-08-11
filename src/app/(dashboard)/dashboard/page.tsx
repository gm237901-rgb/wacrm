"use client"

import { useCallback, useEffect, useId, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { formatCurrency } from '@/lib/currency'
import { Briefcase, DollarSign, Percent, Plus, Trophy, Users } from 'lucide-react'

import {
  loadKpiRow,
  loadLeadSource,
  loadRecentLeads,
  loadRevenueSeries,
  loadSalesFunnel,
  loadTodayActivities,
} from '@/lib/dashboard/queries'
import type {
  KpiBundle,
  KpiCard,
  LeadSourceData,
  RecentLead,
  RevenuePoint,
  SalesFunnelData,
  TodayActivity,
} from '@/lib/dashboard/types'

import { MetricCard } from '@/components/dashboard/metric-card'
import { SkeletonCard } from '@/components/dashboard/skeleton'
import { SalesFunnel } from '@/components/dashboard/sales-funnel'
import { TodayActivities } from '@/components/dashboard/today-activities'
import { RevenueChart } from '@/components/dashboard/revenue-chart'
import { LeadSourceDonut } from '@/components/dashboard/lead-source-donut'
import { RecentLeads } from '@/components/dashboard/recent-leads'
import { DealForm } from '@/components/pipelines/deal-form'
import { Button } from '@/components/ui/button'
import type { PipelineStage } from '@/types'

import { useTranslations } from 'next-intl'

type RangeDays = 7 | 30 | 90

export default function DashboardPage() {
  const t = useTranslations('Dashboard.page')
  const { profile, defaultCurrency } = useAuth()

  const [kpis, setKpis] = useState<KpiBundle | null>(null)
  const [kpisLoading, setKpisLoading] = useState(true)

  const [funnel, setFunnel] = useState<SalesFunnelData | null>(null)
  const [funnelLoading, setFunnelLoading] = useState(true)

  const [today, setToday] = useState<TodayActivity[] | null>(null)
  const [todayLoading, setTodayLoading] = useState(true)

  const [range, setRange] = useState<RangeDays>(30)
  const [revenue, setRevenue] = useState<Record<RangeDays, RevenuePoint[] | null>>({
    7: null,
    30: null,
    90: null,
  })
  const [revenueLoading, setRevenueLoading] = useState(true)

  const [leadSource, setLeadSource] = useState<LeadSourceData | null>(null)
  const [leadSourceLoading, setLeadSourceLoading] = useState(true)

  const [recentLeads, setRecentLeads] = useState<RecentLead[] | null>(null)
  const [recentLeadsLoading, setRecentLeadsLoading] = useState(true)

  // Wiring for "+ Novo negócio" — same "first pipeline by created_at"
  // convention the Pipelines page uses as its default selection.
  const [dealFormOpen, setDealFormOpen] = useState(false)
  const [dealPipelineId, setDealPipelineId] = useState('')
  const [dealStages, setDealStages] = useState<PipelineStage[]>([])

  const loadAll = useCallback(() => {
    const db = createClient()

    void loadKpiRow(db)
      .then(setKpis)
      .catch((err) => console.error('[dashboard] kpis failed:', err))
      .finally(() => setKpisLoading(false))

    void loadSalesFunnel(db)
      .then(setFunnel)
      .catch((err) => console.error('[dashboard] funnel failed:', err))
      .finally(() => setFunnelLoading(false))

    void loadTodayActivities(db)
      .then(setToday)
      .catch((err) => console.error('[dashboard] today failed:', err))
      .finally(() => setTodayLoading(false))

    void loadRevenueSeries(db, 30)
      .then((s) => setRevenue((prev) => ({ ...prev, 30: s })))
      .catch((err) => console.error('[dashboard] revenue failed:', err))
      .finally(() => setRevenueLoading(false))

    void loadLeadSource(db)
      .then(setLeadSource)
      .catch((err) => console.error('[dashboard] lead source failed:', err))
      .finally(() => setLeadSourceLoading(false))

    void loadRecentLeads(db, 5)
      .then(setRecentLeads)
      .catch((err) => console.error('[dashboard] recent leads failed:', err))
      .finally(() => setRecentLeadsLoading(false))

    void db
      .from('pipelines')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .then(async ({ data }) => {
        const pid = data?.[0]?.id
        if (!pid) return
        setDealPipelineId(pid)
        const { data: stages } = await db
          .from('pipeline_stages')
          .select('*')
          .eq('pipeline_id', pid)
          .order('position')
        setDealStages(stages ?? [])
      })
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Live refresh: when a deal is created, moved, or marked won/lost
  // anywhere in the app (Pipelines board, the deal-form's own status
  // buttons, this page's own "+ Novo negócio"), the KPI row, sales
  // funnel and revenue chart should reflect it without the user having
  // to reload. instanceId scopes the channel topic to this mounted
  // instance — sharing a hardcoded topic with another concurrently
  // mounted subscriber throws (see useUnreadNotifications).
  const instanceId = useId()
  useEffect(() => {
    const db = createClient()
    const channel = db
      .channel(`dashboard-deals-${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'deals' },
        () => loadAll(),
      )
      .subscribe()
    return () => {
      db.removeChannel(channel)
    }
  }, [instanceId, loadAll])

  const handleRangeChange = useCallback(
    (r: RangeDays) => {
      setRange(r)
      if (revenue[r] !== null) return
      setRevenueLoading(true)
      const db = createClient()
      loadRevenueSeries(db, r)
        .then((s) => setRevenue((prev) => ({ ...prev, [r]: s })))
        .catch((err) => console.error('[dashboard] revenue failed:', err))
        .finally(() => setRevenueLoading(false))
    },
    [revenue],
  )

  const greetingName = profile?.full_name?.split(' ')[0] || t('fallbackName')

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('greeting', { name: greetingName })}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <Button onClick={() => setDealFormOpen(true)} disabled={!dealPipelineId} className="w-fit">
          <Plus />
          {t('newDeal')}
        </Button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {kpisLoading || !kpis ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <MetricCard
              title={t('kpiContacts')}
              value={kpis.contactsTotal.current.toLocaleString()}
              icon={Users}
              tone="blue"
              delta={countDelta(kpis.contactsTotal, t)}
            />
            <MetricCard
              title={t('kpiDeals')}
              value={kpis.openDeals.current.toLocaleString()}
              icon={Briefcase}
              tone="blue"
              delta={countDelta(kpis.openDeals, t)}
            />
            <MetricCard
              title={t('kpiRevenue')}
              value={formatCurrency(kpis.revenueThisMonth.current, defaultCurrency)}
              icon={DollarSign}
              tone="green"
              delta={countDelta(kpis.revenueThisMonth, t)}
            />
            <MetricCard
              title={t('kpiWonDeals')}
              value={kpis.wonDealsThisMonth.current.toLocaleString()}
              icon={Trophy}
              tone="orange"
              delta={countDelta(kpis.wonDealsThisMonth, t)}
            />
            <MetricCard
              title={t('kpiConversion')}
              value={`${kpis.conversionRatePct.current.toFixed(1)}%`}
              icon={Percent}
              tone="violet"
              delta={pointsDelta(kpis.conversionRatePct, t)}
            />
          </>
        )}
      </div>

      {/* Sales funnel + today's activities */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SalesFunnel data={funnel} loading={funnelLoading} currency={defaultCurrency} />
        </div>
        <TodayActivities items={today} loading={todayLoading} />
      </div>

      {/* Revenue + lead source */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="h-full lg:col-span-2">
          <RevenueChart
            series={revenue}
            loading={revenueLoading}
            range={range}
            onRangeChange={handleRangeChange}
            currency={defaultCurrency}
          />
        </div>
        <div className="h-full">
          <LeadSourceDonut data={leadSource} loading={leadSourceLoading} />
        </div>
      </div>

      {/* Recent leads */}
      <RecentLeads items={recentLeads} loading={recentLeadsLoading} />

      <DealForm
        open={dealFormOpen}
        onOpenChange={setDealFormOpen}
        pipelineId={dealPipelineId}
        stages={dealStages}
        onSaved={loadAll}
      />
    </div>
  )
}

// ------------------------------------------------------------

function countDelta(card: KpiCard, t: ReturnType<typeof useTranslations>) {
  if (card.previous === 0) {
    return card.current === 0 ? undefined : { sign: 1, label: t('newThisMonth') }
  }
  const pct = ((card.current - card.previous) / card.previous) * 100
  const sign = pct > 0 ? 1 : pct < 0 ? -1 : 0
  return { sign, label: t('deltaPct', { pct: `${pct > 0 ? '+' : ''}${pct.toFixed(1)}` }) }
}

function pointsDelta(card: KpiCard, t: ReturnType<typeof useTranslations>) {
  const diff = card.current - card.previous
  const sign = diff > 0 ? 1 : diff < 0 ? -1 : 0
  return { sign, label: t('deltaPoints', { pts: `${diff > 0 ? '+' : ''}${diff.toFixed(1)}` }) }
}
