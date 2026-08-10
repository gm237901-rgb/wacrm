"use client"

import Link from 'next/link'
import { CalendarClock, CheckCircle2, Clock, XCircle } from 'lucide-react'
import type { ComponentType } from 'react'
import type { TodayActivity } from '@/lib/dashboard/types'
import { cn } from '@/lib/utils'
import { EmptyState } from './empty-state'
import { Skeleton } from './skeleton'

interface TodayActivitiesProps {
  items: TodayActivity[] | null
  loading: boolean
}

interface StatusTheme {
  icon: ComponentType<{ className?: string }>
  badge: string
}

const STATUS_THEME: Record<TodayActivity['status'], StatusTheme> = {
  scheduled: { icon: Clock, badge: 'bg-blue-500/10 text-blue-400' },
  completed: { icon: CheckCircle2, badge: 'bg-emerald-500/10 text-emerald-400' },
  cancelled: { icon: XCircle, badge: 'bg-muted text-muted-foreground' },
}

import { useTranslations } from 'next-intl'

export function TodayActivities({ items, loading }: TodayActivitiesProps) {
  const t = useTranslations('Dashboard.todayActivities')

  return (
    <section className="flex h-full flex-col rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">
          {t('title')}
          {items && items.length > 0 && (
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {items.length}
            </span>
          )}
        </h2>
      </header>

      <div className="flex-1 p-5">
        {loading || !items ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={CalendarClock} title={t('noActivities')} hint={t('noActivitiesHint')} />
        ) : (
          <ul className="space-y-1">
            {items.map((item) => {
              const theme = STATUS_THEME[item.status]
              const Icon = theme.icon
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-3 rounded-lg px-1 py-2 transition-colors hover:bg-muted/50"
                  >
                    <span
                      className={cn(
                        'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full',
                        theme.badge,
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
                      {item.subtitle && (
                        <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>
                      )}
                    </span>
                    <span className="flex-shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                      {formatTime(item.at)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <footer className="border-t border-border px-5 py-3">
        <Link href="/agenda" className="text-xs font-medium text-primary hover:text-primary/80">
          {t('viewAll')}
        </Link>
      </footer>
    </section>
  )
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}
