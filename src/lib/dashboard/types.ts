// Shared result shapes the dashboard components consume. Centralised
// here so each component stays thin and the page-level loader wires
// them up without type gymnastics.

export interface MetricDelta {
  current: number
  previous: number
}

export interface MetricsBundle {
  activeConversations: MetricDelta
  newContactsToday: MetricDelta
  openDealsValue: number
  openDealsCount: number
  messagesSentToday: MetricDelta
}

export interface ConversationsSeriesPoint {
  day: string // YYYY-MM-DD local
  incoming: number
  outgoing: number
}

export interface PipelineStageSlice {
  id: string
  name: string
  color: string
  dealCount: number
  totalValue: number
}

export interface PipelineDonutData {
  stages: PipelineStageSlice[]
  totalValue: number
}

export interface ResponseTimeBucket {
  /** 0 = Mon … 6 = Sun (Monday-first). */
  dow: number
  /** Average first-response time in minutes. Null means no samples. */
  avgMinutes: number | null
  samples: number
}

export interface ResponseTimeSummary {
  buckets: ResponseTimeBucket[]
  thisWeekAvg: number | null
  lastWeekAvg: number | null
}

export type ActivityKind =
  | 'message'
  | 'deal'
  | 'broadcast'
  | 'automation'
  | 'contact'

export interface ActivityItem {
  id: string
  kind: ActivityKind
  /** Primary line of text rendered in the feed. Pre-formatted. */
  text: string
  /** ISO timestamp the item happened at, drives relative-time + sort. */
  at: string
  /** Optional deep-link for the whole row (not all items have a target). */
  href?: string
}

// --- KPI row (5 stat cards) --------------------------------------------

export interface KpiCard {
  current: number
  /** Same metric as of the start of the current calendar month. */
  previous: number
}

export interface KpiBundle {
  contactsTotal: KpiCard
  openDeals: KpiCard
  /** Sum of `value` on deals won this month vs won last month. */
  revenueThisMonth: KpiCard
  /** Count of deals won this month vs won last month. */
  wonDealsThisMonth: KpiCard
  /** Won / (won+lost) as a 0-100 percentage, this month vs last month. */
  conversionRatePct: KpiCard
}

/**
 * Last-14-day shape behind each KPI card, drawn as a sparkline. Real
 * series, not decoration: a card that shows "+12% this month" next to a
 * flat line would be lying about how that number got there.
 */
export interface KpiSparklines {
  contacts: number[]
  deals: number[]
  revenue: number[]
  wonDeals: number[]
}

// --- Sales funnel (Dashboard mini pipeline) -----------------------------

export interface FunnelDealCard {
  id: string
  title: string
  value: number
  contactName: string | null
  avatarUrl: string | null
}

export interface FunnelStage {
  id: string
  name: string
  color: string
  dealCount: number
  totalValue: number
  topDeals: FunnelDealCard[]
}

export interface SalesFunnelData {
  pipelineId: string | null
  stages: FunnelStage[]
}

// --- Today's activities --------------------------------------------------

export interface TodayActivity {
  id: string
  title: string
  subtitle: string | null
  /** ISO timestamp — drives the displayed time and the sort order. */
  at: string
  status: 'scheduled' | 'completed' | 'cancelled'
  href: string
}

// --- Lead source donut -----------------------------------------------------

export const LEAD_SOURCES = ['site', 'google_ads', 'indicacao', 'redes_sociais', 'outros'] as const
export type LeadSource = (typeof LEAD_SOURCES)[number]

export interface LeadSourceSlice {
  source: LeadSource
  count: number
}

export interface LeadSourceData {
  slices: LeadSourceSlice[]
  total: number
}
