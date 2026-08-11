import type { SupabaseClient } from '@supabase/supabase-js'
import {
  daysAgoStart,
  DOW_SHORT_MON_FIRST,
  lastNDayKeys,
  localDayKey,
  mondayIndex,
  startOfLocalDay,
  startOfMonth,
  startOfMonthsAgo,
} from './date-utils'
import type {
  ActivityItem,
  ConversationsSeriesPoint,
  FunnelStage,
  KpiBundle,
  LeadSourceData,
  LeadSource,
  MetricsBundle,
  PipelineDonutData,
  PipelineStageSlice,
  RecentLead,
  ResponseTimeBucket,
  ResponseTimeSummary,
  RevenuePoint,
  RevenueRange,
  SalesFunnelData,
  TodayActivity,
} from './types'
import { LEAD_SOURCES } from './types'

// ------------------------------------------------------------
// All client-side aggregation. RLS scopes every query to the
// signed-in user automatically, so we never pass user_id explicitly
// here. Perf is acceptable for the current scale (low thousands of
// messages) — if a tenant's dataset outgrows this, we'd migrate the
// heavy aggregations to SQL RPCs. Noted in the PR.
// ------------------------------------------------------------

type DB = SupabaseClient

// --- 1. Metric cards ---------------------------------------------------

export async function loadMetrics(db: DB): Promise<MetricsBundle> {
  const todayStart = startOfLocalDay().toISOString()
  const yesterdayStart = daysAgoStart(1).toISOString()

  const [
    openConvCur,
    newConvToday,
    newConvYesterday,
    newContactsToday,
    newContactsYesterday,
    openDeals,
    messagesToday,
    messagesYesterday,
  ] = await Promise.all([
    db.from('conversations').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    db
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
      .gte('created_at', todayStart),
    db
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
      .gte('created_at', yesterdayStart)
      .lt('created_at', todayStart),
    db.from('contacts').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
    db
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', yesterdayStart)
      .lt('created_at', todayStart),
    db.from('deals').select('value, status').eq('status', 'open'),
    db
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('sender_type', 'agent')
      .gte('created_at', todayStart),
    db
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('sender_type', 'agent')
      .gte('created_at', yesterdayStart)
      .lt('created_at', todayStart),
  ])

  const openDealsRows = (openDeals.data ?? []) as { value: number | null }[]
  const openDealsValue = openDealsRows.reduce((sum, d) => sum + (d.value ?? 0), 0)

  return {
    activeConversations: {
      current: openConvCur.count ?? 0,
      // "vs yesterday" on a current-state count has no clean answer
      // without snapshots — we show the delta in NEW open conversations
      // today vs yesterday. That's the business-meaningful daily signal.
      previous: (newConvToday.count ?? 0) - (newConvYesterday.count ?? 0),
    },
    newContactsToday: {
      current: newContactsToday.count ?? 0,
      previous: newContactsYesterday.count ?? 0,
    },
    openDealsValue,
    openDealsCount: openDealsRows.length,
    messagesSentToday: {
      current: messagesToday.count ?? 0,
      previous: messagesYesterday.count ?? 0,
    },
  }
}

// --- 2. Conversations over time ---------------------------------------

export async function loadConversationsSeries(
  db: DB,
  rangeDays: number,
): Promise<ConversationsSeriesPoint[]> {
  const start = daysAgoStart(rangeDays - 1).toISOString()
  const { data, error } = await db
    .from('messages')
    .select('created_at, sender_type')
    .gte('created_at', start)
    .order('created_at', { ascending: true })
  if (error) throw error

  const keys = lastNDayKeys(rangeDays)
  const buckets = new Map<string, { incoming: number; outgoing: number }>()
  for (const k of keys) buckets.set(k, { incoming: 0, outgoing: 0 })

  for (const row of (data ?? []) as { created_at: string; sender_type: string }[]) {
    const key = localDayKey(row.created_at)
    const bucket = buckets.get(key)
    if (!bucket) continue
    if (row.sender_type === 'customer') bucket.incoming += 1
    else bucket.outgoing += 1 // agent + bot both count as outgoing
  }

  return keys.map((day) => ({ day, ...(buckets.get(day) ?? { incoming: 0, outgoing: 0 }) }))
}

// --- 3. Pipeline donut -------------------------------------------------

export async function loadPipelineDonut(db: DB): Promise<PipelineDonutData> {
  const [stagesRes, dealsRes] = await Promise.all([
    db.from('pipeline_stages').select('id, name, color, pipeline_id, position').order('position'),
    db.from('deals').select('stage_id, value, status').eq('status', 'open'),
  ])

  const stages =
    (stagesRes.data ?? []) as { id: string; name: string; color: string }[]
  const deals = (dealsRes.data ?? []) as { stage_id: string; value: number | null }[]

  const byStage = new Map<string, { count: number; total: number }>()
  for (const d of deals) {
    const row = byStage.get(d.stage_id) ?? { count: 0, total: 0 }
    row.count += 1
    row.total += d.value ?? 0
    byStage.set(d.stage_id, row)
  }

  const slices: PipelineStageSlice[] = stages
    .map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color || '#64748b',
      dealCount: byStage.get(s.id)?.count ?? 0,
      totalValue: byStage.get(s.id)?.total ?? 0,
    }))
    // Hide empty stages from the ring (but we'd still show them in the
    // legend if the user wanted a full breakdown — trimming keeps the
    // visual clean for the common case).
    .filter((s) => s.totalValue > 0 || s.dealCount > 0)

  return {
    stages: slices,
    totalValue: slices.reduce((sum, s) => sum + s.totalValue, 0),
  }
}

// --- 4. Response time by day of week ----------------------------------

export async function loadResponseTime(db: DB): Promise<ResponseTimeSummary> {
  // Pull the last 14 days of messages in one shot, then walk per
  // conversation to find each "first inbound" → "first subsequent
  // outbound" pair. 14 days gives us both "this week" + "last week"
  // with enough overlap if the user opens the dashboard late on a
  // Monday.
  const fourteenDaysAgo = daysAgoStart(13).toISOString()
  const { data, error } = await db
    .from('messages')
    .select('conversation_id, sender_type, created_at')
    .gte('created_at', fourteenDaysAgo)
    .order('conversation_id', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error

  const rows = (data ?? []) as {
    conversation_id: string
    sender_type: string
    created_at: string
  }[]

  // Group per conversation, pair unreplied customer messages with the
  // next outbound message from the agent/bot. A single customer message
  // can only count once (avoids inflating averages if the customer
  // double-messages while the agent takes time to reply).
  interface Sample {
    customerAt: Date
    responseAt: Date
  }
  const samples: Sample[] = []

  let currentConv = ''
  let pendingCustomer: Date | null = null
  for (const row of rows) {
    if (row.conversation_id !== currentConv) {
      currentConv = row.conversation_id
      pendingCustomer = null
    }
    const ts = new Date(row.created_at)
    if (row.sender_type === 'customer') {
      if (!pendingCustomer) pendingCustomer = ts
    } else if (pendingCustomer) {
      samples.push({ customerAt: pendingCustomer, responseAt: ts })
      pendingCustomer = null
    }
  }

  const now = new Date()
  const thisWeekStart = daysAgoStart(mondayIndex(now))
  const lastWeekStart = daysAgoStart(mondayIndex(now) + 7)

  // Per-day-of-week buckets, averaged over both weeks' worth of data
  // so each bar has more samples to stand on. If a day has no samples
  // its avgMinutes stays null and the chart renders the bar muted.
  const byDow = new Map<number, number[]>()
  for (let i = 0; i < 7; i++) byDow.set(i, [])
  const thisWeekMins: number[] = []
  const lastWeekMins: number[] = []

  for (const s of samples) {
    const diffMin = (s.responseAt.getTime() - s.customerAt.getTime()) / 60_000
    if (diffMin < 0) continue
    const dow = mondayIndex(s.customerAt)
    byDow.get(dow)!.push(diffMin)
    if (s.customerAt >= thisWeekStart) {
      thisWeekMins.push(diffMin)
    } else if (s.customerAt >= lastWeekStart && s.customerAt < thisWeekStart) {
      lastWeekMins.push(diffMin)
    }
  }

  const avg = (arr: number[]) =>
    arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length

  const buckets: ResponseTimeBucket[] = Array.from({ length: 7 }, (_, dow) => {
    const samples = byDow.get(dow) ?? []
    return {
      dow,
      avgMinutes: avg(samples),
      samples: samples.length,
    }
  })

  // Silence unused-label warnings — keep the arrays explicitly named
  // for readability above.
  void DOW_SHORT_MON_FIRST

  return {
    buckets,
    thisWeekAvg: avg(thisWeekMins),
    lastWeekAvg: avg(lastWeekMins),
  }
}

// --- 5. Activity feed --------------------------------------------------

export async function loadActivity(db: DB, limit = 20): Promise<ActivityItem[]> {
  // Pull ~10 from each source (plenty of headroom after merge-sort),
  // then interleave by timestamp. The individual per-table limits
  // keep the payload small; the final limit is enforced after sort.
  const [msgs, contacts, deals, broadcasts, autoLogs] = await Promise.all([
    db
      .from('messages')
      .select('id, content_text, sender_type, created_at, conversation_id, conversations(contact_id, contacts(name, phone))')
      .eq('sender_type', 'customer')
      .order('created_at', { ascending: false })
      .limit(10),
    db
      .from('contacts')
      .select('id, name, phone, created_at')
      .order('created_at', { ascending: false })
      .limit(10),
    db
      .from('deals')
      .select('id, title, updated_at, stage:pipeline_stages(name)')
      .order('updated_at', { ascending: false })
      .limit(10),
    db
      .from('broadcasts')
      .select('id, name, status, total_recipients, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
    db
      .from('automation_logs')
      .select('id, trigger_event, status, created_at, automation:automations(name), contact:contacts(name, phone)')
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const items: ActivityItem[] = []

  // PostgREST returns nested selections as arrays by default, even when
  // the foreign key is 1:1. We normalise by taking [0] on each level.
  for (const m of (msgs.data ?? []) as unknown as Array<{
    id: string
    content_text: string | null
    created_at: string
    conversation_id: string
    conversations:
      | { contact_id: string | null; contacts: { name: string | null; phone: string }[] | { name: string | null; phone: string } | null }[]
      | { contact_id: string | null; contacts: { name: string | null; phone: string }[] | { name: string | null; phone: string } | null }
      | null
  }>) {
    const conv = Array.isArray(m.conversations) ? m.conversations[0] : m.conversations
    const contact = Array.isArray(conv?.contacts) ? conv?.contacts[0] : conv?.contacts
    const who = contact?.name || contact?.phone || 'Unknown'
    items.push({
      id: `msg-${m.id}`,
      kind: 'message',
      text: `New message from ${who}`,
      at: m.created_at,
      href: `/inbox?c=${m.conversation_id}`,
    })
  }

  for (const c of (contacts.data ?? []) as Array<{ id: string; name: string | null; phone: string; created_at: string }>) {
    items.push({
      id: `contact-${c.id}`,
      kind: 'contact',
      text: `New contact: ${c.name || c.phone}`,
      at: c.created_at,
      href: '/contacts',
    })
  }

  for (const d of (deals.data ?? []) as unknown as Array<{
    id: string
    title: string
    updated_at: string
    stage: { name: string }[] | { name: string } | null
  }>) {
    const stage = Array.isArray(d.stage) ? d.stage[0] : d.stage
    items.push({
      id: `deal-${d.id}`,
      kind: 'deal',
      text: stage?.name
        ? `Deal "${d.title}" in ${stage.name}`
        : `Deal "${d.title}" updated`,
      at: d.updated_at,
      href: '/pipelines',
    })
  }

  for (const b of (broadcasts.data ?? []) as Array<{
    id: string
    name: string
    status: string
    total_recipients: number
    created_at: string
  }>) {
    const label =
      b.status === 'sent'
        ? `sent to ${b.total_recipients} contacts`
        : `${b.status} (${b.total_recipients} recipients)`
    items.push({
      id: `broadcast-${b.id}`,
      kind: 'broadcast',
      text: `Broadcast "${b.name}" ${label}`,
      at: b.created_at,
      href: '/broadcasts',
    })
  }

  for (const l of (autoLogs.data ?? []) as unknown as Array<{
    id: string
    trigger_event: string
    status: string
    created_at: string
    automation: { name: string }[] | { name: string } | null
    contact: { name: string | null; phone: string }[] | { name: string | null; phone: string } | null
  }>) {
    const automation = Array.isArray(l.automation) ? l.automation[0] : l.automation
    const contact = Array.isArray(l.contact) ? l.contact[0] : l.contact
    const who = contact?.name || contact?.phone || 'a contact'
    const autoName = automation?.name || 'Automation'
    items.push({
      id: `auto-${l.id}`,
      kind: 'automation',
      text: `Automation "${autoName}" ${l.status === 'failed' ? 'failed for' : 'triggered for'} ${who}`,
      at: l.created_at,
    })
  }

  return items
    .sort((a, b) => (a.at > b.at ? -1 : a.at < b.at ? 1 : 0))
    .slice(0, limit)
}

// --- 6. KPI row (5 stat cards) ------------------------------------------

export async function loadKpiRow(db: DB): Promise<KpiBundle> {
  const thisMonthStart = startOfMonth().toISOString()
  const lastMonthStart = startOfMonthsAgo(1).toISOString()

  const [
    contactsNow,
    contactsAtMonthStart,
    openDealsNow,
    openDealsAtMonthStart,
    wonThisMonth,
    wonLastMonth,
    closedThisMonth,
    closedLastMonth,
  ] = await Promise.all([
    db.from('contacts').select('id', { count: 'exact', head: true }),
    db.from('contacts').select('id', { count: 'exact', head: true }).lt('created_at', thisMonthStart),
    db.from('deals').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    db
      .from('deals')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
      .lt('created_at', thisMonthStart),
    db.from('deals').select('value').eq('status', 'won').gte('updated_at', thisMonthStart),
    db
      .from('deals')
      .select('value')
      .eq('status', 'won')
      .gte('updated_at', lastMonthStart)
      .lt('updated_at', thisMonthStart),
    db.from('deals').select('status').in('status', ['won', 'lost']).gte('updated_at', thisMonthStart),
    db
      .from('deals')
      .select('status')
      .in('status', ['won', 'lost'])
      .gte('updated_at', lastMonthStart)
      .lt('updated_at', thisMonthStart),
  ])

  const wonThisMonthRows = (wonThisMonth.data ?? []) as { value: number | null }[]
  const wonLastMonthRows = (wonLastMonth.data ?? []) as { value: number | null }[]
  const revenueThisMonth = wonThisMonthRows.reduce((sum, d) => sum + (d.value ?? 0), 0)
  const revenueLastMonth = wonLastMonthRows.reduce((sum, d) => sum + (d.value ?? 0), 0)

  const conversionRate = (rows: { status: string }[]) => {
    if (rows.length === 0) return 0
    const won = rows.filter((r) => r.status === 'won').length
    return (won / rows.length) * 100
  }

  return {
    contactsTotal: { current: contactsNow.count ?? 0, previous: contactsAtMonthStart.count ?? 0 },
    openDeals: { current: openDealsNow.count ?? 0, previous: openDealsAtMonthStart.count ?? 0 },
    revenueThisMonth: { current: revenueThisMonth, previous: revenueLastMonth },
    wonDealsThisMonth: { current: wonThisMonthRows.length, previous: wonLastMonthRows.length },
    conversionRatePct: {
      current: conversionRate((closedThisMonth.data ?? []) as { status: string }[]),
      previous: conversionRate((closedLastMonth.data ?? []) as { status: string }[]),
    },
  }
}

// --- 7. Sales funnel (Dashboard mini pipeline) --------------------------

export async function loadSalesFunnel(db: DB): Promise<SalesFunnelData> {
  // Same "first pipeline by created_at" convention the Pipelines page
  // uses as its default selection (src/app/(dashboard)/pipelines/page.tsx).
  const { data: pipelineRows } = await db
    .from('pipelines')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
  const pipelineId = pipelineRows?.[0]?.id ?? null
  if (!pipelineId) return { pipelineId: null, stages: [] }

  const [stagesRes, dealsRes] = await Promise.all([
    db
      .from('pipeline_stages')
      .select('id, name, color')
      .eq('pipeline_id', pipelineId)
      .order('position'),
    db
      .from('deals')
      .select('id, title, value, stage_id, contact:contacts(name, avatar_url)')
      .eq('pipeline_id', pipelineId)
      .eq('status', 'open')
      .order('updated_at', { ascending: false }),
  ])

  const stages = (stagesRes.data ?? []) as { id: string; name: string; color: string }[]
  const deals = (dealsRes.data ?? []) as unknown as Array<{
    id: string
    title: string
    value: number | null
    stage_id: string
    contact:
      | { name: string | null; avatar_url: string | null }[]
      | { name: string | null; avatar_url: string | null }
      | null
  }>

  const byStage = new Map<string, typeof deals>()
  for (const d of deals) {
    const list = byStage.get(d.stage_id) ?? []
    list.push(d)
    byStage.set(d.stage_id, list)
  }

  const funnelStages: FunnelStage[] = stages.map((s) => {
    const stageDeals = byStage.get(s.id) ?? []
    return {
      id: s.id,
      name: s.name,
      color: s.color || '#64748b',
      dealCount: stageDeals.length,
      totalValue: stageDeals.reduce((sum, d) => sum + (d.value ?? 0), 0),
      topDeals: stageDeals.slice(0, 3).map((d) => {
        const contact = Array.isArray(d.contact) ? d.contact[0] : d.contact
        return {
          id: d.id,
          title: d.title,
          value: d.value ?? 0,
          contactName: contact?.name ?? null,
          avatarUrl: contact?.avatar_url ?? null,
        }
      }),
    }
  })

  return { pipelineId, stages: funnelStages }
}

// --- 8. Today's activities -----------------------------------------------

export async function loadTodayActivities(db: DB): Promise<TodayActivity[]> {
  const dayStart = startOfLocalDay()
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)

  const { data, error } = await db
    .from('events')
    .select('id, title, starts_at, status, contact:contacts(name, company), deal:deals(title)')
    .gte('starts_at', dayStart.toISOString())
    .lt('starts_at', dayEnd.toISOString())
    .order('starts_at', { ascending: true })
  if (error) throw error

  return (
    (data ?? []) as unknown as Array<{
      id: string
      title: string
      starts_at: string
      status: 'scheduled' | 'completed' | 'cancelled'
      contact: { name: string | null; company: string | null }[] | { name: string | null; company: string | null } | null
      deal: { title: string }[] | { title: string } | null
    }>
  ).map((e) => {
    const contact = Array.isArray(e.contact) ? e.contact[0] : e.contact
    const deal = Array.isArray(e.deal) ? e.deal[0] : e.deal
    return {
      id: e.id,
      title: e.title,
      subtitle: contact?.name || contact?.company || deal?.title || null,
      at: e.starts_at,
      status: e.status,
      href: `/agenda?e=${e.id}`,
    }
  })
}

// --- 9. Revenue over time --------------------------------------------------

export async function loadRevenueSeries(
  db: DB,
  range: RevenueRange,
): Promise<RevenuePoint[]> {
  let rangeDays: number
  if (range === 'all') {
    // Span from the first won deal to today. Without a won deal there's
    // nothing to chart at all — return empty so the caller renders its
    // empty state rather than a flat zero line over an arbitrary window.
    const { data: earliest } = await db
      .from('deals')
      .select('updated_at')
      .eq('status', 'won')
      .order('updated_at', { ascending: true })
      .limit(1)
    const firstWonAt = (earliest as { updated_at: string }[] | null)?.[0]?.updated_at
    if (!firstWonAt) return []
    const spanDays =
      Math.ceil(
        (startOfLocalDay().getTime() - startOfLocalDay(new Date(firstWonAt)).getTime()) /
          86_400_000,
      ) + 1
    // Floor at a week so a company whose first sale was yesterday still
    // gets a readable axis instead of a two-point chart.
    rangeDays = Math.max(7, spanDays)
  } else {
    rangeDays = range
  }

  const start = daysAgoStart(rangeDays - 1).toISOString()
  // deals has no dedicated "won_at" column — updated_at is the best
  // available proxy for when the "Marcar como ganho" action landed.
  const { data, error } = await db
    .from('deals')
    .select('value, updated_at')
    .eq('status', 'won')
    .gte('updated_at', start)
    .order('updated_at', { ascending: true })
  if (error) throw error

  const keys = lastNDayKeys(rangeDays)
  const buckets = new Map<string, number>()
  for (const k of keys) buckets.set(k, 0)

  for (const row of (data ?? []) as { value: number | null; updated_at: string }[]) {
    const key = localDayKey(row.updated_at)
    if (!buckets.has(key)) continue
    buckets.set(key, (buckets.get(key) ?? 0) + (row.value ?? 0))
  }

  return keys.map((day) => ({ day, value: buckets.get(day) ?? 0 }))
}

// --- 10. Lead source donut --------------------------------------------------

export async function loadLeadSource(db: DB): Promise<LeadSourceData> {
  const { data, error } = await db.from('contacts').select('source')
  if (error) throw error

  const counts = new Map<LeadSource, number>()
  for (const s of LEAD_SOURCES) counts.set(s, 0)
  let total = 0
  const known = new Set<string>(LEAD_SOURCES)
  for (const row of (data ?? []) as { source: string | null }[]) {
    total += 1
    const key = (known.has(row.source ?? '') ? row.source : 'outros') as LeadSource
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return {
    slices: LEAD_SOURCES.map((source) => ({ source, count: counts.get(source) ?? 0 })).filter(
      (s) => s.count > 0,
    ),
    total,
  }
}

// --- 11. Recent leads --------------------------------------------------------

export async function loadRecentLeads(db: DB, limit = 5): Promise<RecentLead[]> {
  const { data, error } = await db
    .from('contacts')
    .select('id, name, email, avatar_url, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error

  return (
    (data ?? []) as Array<{
      id: string
      name: string | null
      email: string | null
      avatar_url: string | null
      created_at: string
    }>
  ).map((c) => ({
    id: c.id,
    name: c.name ?? '',
    email: c.email,
    avatarUrl: c.avatar_url,
    createdAt: c.created_at,
  }))
}
