import type { ComponentType, ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * The heading block every list/detail page opens with.
 *
 * Pulled out because each page had grown its own: same intent, slightly
 * different type scale, spacing and stacking behaviour. Those drifts
 * are invisible one page at a time and obvious when navigating between
 * them — the header appearing to shift as you move around is what makes
 * an app feel assembled from parts.
 *
 * `icon` mirrors the dashboard's KPI chips so a page announces itself
 * the same way its data does.
 */
export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
}: {
  title: string
  description?: string
  icon?: ComponentType<{ className?: string }>
  /** Primary action(s) for the page, right-aligned on wide screens. */
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        // Stacks under sm: a title, a sentence of description and a
        // button do not fit one row on a 375px screen without either
        // truncating the title or shrinking the tap target.
        'flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {Icon && (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
            <Icon className="size-5" />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold text-foreground">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
