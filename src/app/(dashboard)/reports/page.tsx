"use client"

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { daysAgoStart, lastNWeekKeys, weekKeyFor } from '@/lib/dashboard/date-utils'
import { loadPipelineDonut } from '@/lib/dashboard/queries'
import type { PipelineDonutData } from '@/lib/dashboard/types'
import { BarChart } from '@/components/tremor/bar-chart'
import { PipelineDonut } from '@/components/dashboard/pipeline-donut'
import { Skeleton } from '@/components/dashboard/skeleton'
import { EmptyState } from '@/components/dashboard/empty-state'
import { BarChart3 } from 'lucide-react'

interface WeeklyBar {
  week: string
  [key: string]: string | number
}

export default function ReportsPage() {
  const t = useTranslations('Reports.page')
  const { defaultCurrency } = useAuth()

  const [wonLost, setWonLost] = useState<WeeklyBar[] | null>(null)
  const [contactsGrowth, setContactsGrowth] = useState<WeeklyBar[] | null>(null)
  const [pipeline, setPipeline] = useState<PipelineDonutData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const db = createClient()
    const weekKeys = lastNWeekKeys(13) // ~90 days
    const weekKeysShort = lastNWeekKeys(12)

    const labelFor = (key: string) => {
      const [y, m, d] = key.split('-').map(Number)
      return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    }

    Promise.all([
      db
        .from('deals')
        .select('status, updated_at')
        .in('status', ['won', 'lost'])
        .gte('updated_at', daysAgoStart(91).toISOString()),
      db.from('contacts').select('created_at').gte('created_at', daysAgoStart(83).toISOString()),
      loadPipelineDonut(db),
    ]).then(([dealsRes, contactsRes, pipelineData]) => {
      const dealRows = (dealsRes.data ?? []) as { status: string; updated_at: string }[]
      const wonByWeek = new Map<string, number>()
      const lostByWeek = new Map<string, number>()
      for (const key of weekKeys) {
        wonByWeek.set(key, 0)
        lostByWeek.set(key, 0)
      }
      for (const row of dealRows) {
        const key = weekKeyFor(row.updated_at)
        if (!wonByWeek.has(key)) continue
        if (row.status === 'won') wonByWeek.set(key, (wonByWeek.get(key) ?? 0) + 1)
        else lostByWeek.set(key, (lostByWeek.get(key) ?? 0) + 1)
      }
      setWonLost(
        weekKeys.map((key) => ({
          week: labelFor(key),
          [t('won')]: wonByWeek.get(key) ?? 0,
          [t('lost')]: lostByWeek.get(key) ?? 0,
        })),
      )

      const contactRows = (contactsRes.data ?? []) as { created_at: string }[]
      const byWeek = new Map<string, number>()
      for (const key of weekKeysShort) byWeek.set(key, 0)
      for (const row of contactRows) {
        const key = weekKeyFor(row.created_at)
        if (!byWeek.has(key)) continue
        byWeek.set(key, (byWeek.get(key) ?? 0) + 1)
      }
      setContactsGrowth(
        weekKeysShort.map((key) => ({ week: labelFor(key), [t('contactsGrowthTitle')]: byWeek.get(key) ?? 0 })),
      )

      setPipeline(pipelineData)
      setLoading(false)
    })
    // t() identity changes every render under next-intl; this effect
    // should only ever run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <section className="rounded-xl border border-border bg-card">
        <header className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">{t('wonLostTitle')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('wonLostDescription')}</p>
        </header>
        <div className="p-5">
          {loading || !wonLost ? (
            <Skeleton className="h-[280px] w-full" />
          ) : wonLost.every((w) => Number(w[t('won')]) === 0 && Number(w[t('lost')]) === 0) ? (
            <EmptyState icon={BarChart3} title={t('noData')} />
          ) : (
            <BarChart
              data={wonLost}
              index="week"
              categories={[t('won'), t('lost')]}
              colors={['emerald', 'pink']}
              showLegend
              yAxisWidth={40}
              className="h-[280px]"
            />
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card">
          <header className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-foreground">{t('contactsGrowthTitle')}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('contactsGrowthDescription')}</p>
          </header>
          <div className="p-5">
            {loading || !contactsGrowth ? (
              <Skeleton className="h-[240px] w-full" />
            ) : contactsGrowth.every((w) => Number(w[t('contactsGrowthTitle')]) === 0) ? (
              <EmptyState icon={BarChart3} title={t('noData')} />
            ) : (
              <BarChart
                data={contactsGrowth}
                index="week"
                categories={[t('contactsGrowthTitle')]}
                colors={['blue']}
                showLegend={false}
                yAxisWidth={40}
                className="h-[240px]"
              />
            )}
          </div>
        </section>

        <PipelineDonut data={pipeline} loading={loading} currency={defaultCurrency} />
      </div>
    </div>
  )
}
