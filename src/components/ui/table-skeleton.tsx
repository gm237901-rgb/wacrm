import { TableCell, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

/**
 * Placeholder rows for a loading table.
 *
 * List pages were each showing a lone centred spinner while the
 * dashboard showed skeletons — so moving between them meant the app
 * changed its mind about what "loading" looks like. Skeletons also hold
 * the table's height, which stops the page snapping into place once
 * rows arrive.
 *
 * Rendered rows are `aria-hidden` and the wrapper announces the load
 * once, rather than a screen reader reading out a dozen empty cells.
 */
export function TableSkeleton({
  rows = 5,
  columns,
  label,
}: {
  rows?: number
  columns: number
  /** Announced to assistive tech, e.g. "Carregando contatos". */
  label: string
}) {
  return (
    <>
      <TableRow className="border-0">
        <TableCell colSpan={columns} className="h-0 p-0">
          <span className="sr-only" role="status" aria-live="polite">
            {label}
          </span>
        </TableCell>
      </TableRow>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <TableRow key={rowIndex} className="border-border" aria-hidden>
          {Array.from({ length: columns }).map((__, colIndex) => (
            <TableCell key={colIndex} className="py-3.5">
              <div
                className={cn(
                  'h-4 animate-pulse rounded bg-muted',
                  // Varying widths read as content rather than as a grid
                  // of identical grey bars; the first column is widest
                  // because it carries the row's name almost everywhere.
                  colIndex === 0 ? 'w-40' : colIndex === columns - 1 ? 'w-8' : 'w-24',
                )}
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}
