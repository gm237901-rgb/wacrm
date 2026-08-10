"use client"

import Link from 'next/link'
import { UserPlus } from 'lucide-react'
import type { RecentLead } from '@/lib/dashboard/types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { EmptyState } from './empty-state'
import { Skeleton } from './skeleton'

interface RecentLeadsProps {
  items: RecentLead[] | null
  loading: boolean
}

import { useTranslations } from 'next-intl'

export function RecentLeads({ items, loading }: RecentLeadsProps) {
  const t = useTranslations('Dashboard.recentLeads')

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">{t('title')}</h2>
      </header>

      <div className="p-5">
        {loading || !items ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={UserPlus} title={t('noLeads')} hint={t('noLeadsHint')} />
        ) : (
          <ul className="space-y-3">
            {items.map((lead) => (
              <li key={lead.id} className="flex items-center gap-3">
                <Avatar className="size-9">
                  {lead.avatarUrl ? <AvatarImage src={lead.avatarUrl} alt={lead.name || ''} /> : null}
                  <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                    {(lead.name || lead.email || '?').charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{lead.name || t('unnamed')}</p>
                  {lead.email && <p className="truncate text-xs text-muted-foreground">{lead.email}</p>}
                </div>
                <span className="flex-shrink-0 text-xs text-muted-foreground tabular-nums">
                  {relativeTime(lead.createdAt, t)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="border-t border-border px-5 py-3">
        <Link href="/contacts" className="text-xs font-medium text-primary hover:text-primary/80">
          {t('viewAll')}
        </Link>
      </footer>
    </section>
  )
}

function relativeTime(iso: string, t: ReturnType<typeof useTranslations>): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffSec = Math.round((Date.now() - then) / 1000)
  if (diffSec < 60) return t('timeS', { sec: Math.max(1, diffSec) })
  if (diffSec < 3600) return t('timeM', { min: Math.floor(diffSec / 60) })
  if (diffSec < 86400) return t('timeH', { hr: Math.floor(diffSec / 3600) })
  if (diffSec < 2_592_000) return t('timeD', { day: Math.floor(diffSec / 86400) })
  return new Date(iso).toLocaleDateString()
}
