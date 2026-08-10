"use client";

import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-can";
import { GatedButton } from "@/components/ui/gated-button";
import { EventForm } from "@/components/agenda/event-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/types";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  User,
  Briefcase,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { ptBR } from "date-fns/locale";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
} from "date-fns";

const STATUS_BG: Record<CalendarEvent["status"], string> = {
  scheduled: "bg-primary",
  completed: "bg-emerald-500",
  cancelled: "bg-muted-foreground",
};

const STATUS_LIST: CalendarEvent["status"][] = ["scheduled", "completed", "cancelled"];

const MAX_PILLS_PER_DAY = 3;

// `useSearchParams` (the `?e=<id>` deep link from notifications) requires
// a Suspense boundary or the production build bails to CSR and errors out.
export default function AgendaPage() {
  return (
    <Suspense fallback={null}>
      <AgendaPageInner />
    </Suspense>
  );
}

function AgendaPageInner() {
  const t = useTranslations("Agenda.page");
  const supabase = createClient();
  const { accountId } = useAuth();
  const canEdit = useCan("send-messages");
  const searchParams = useSearchParams();
  const deepLinkEventId = searchParams.get("e");
  const autoOpenedEventRef = useRef<string | null>(null);

  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const [statusFilter, setStatusFilter] = useState<Record<CalendarEvent["status"], boolean>>({
    scheduled: true,
    completed: true,
    cancelled: true,
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  // "+N mais" overflow — the day (yyyy-MM-dd) currently shown in the list
  // dialog, or null when closed.
  const [overflowDay, setOverflowDay] = useState<string | null>(null);

  const monthStart = startOfMonth(monthAnchor);
  const monthEnd = endOfMonth(monthAnchor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = useMemo(
    () => eachDayOfInterval({ start: gridStart, end: gridEnd }),
    [gridStart, gridEnd]
  );

  const fetchEvents = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("events")
      .select(
        "*, contact:contacts(id,name,phone), deal:deals(id,title), assignee:profiles!events_assigned_to_fkey(id,full_name,email)"
      )
      .gte("starts_at", gridStart.toISOString())
      .lte("starts_at", gridEnd.toISOString())
      .order("starts_at", { ascending: true });
    setLoading(false);
    if (error) {
      console.error("[Agenda] failed to load events:", error);
      return;
    }
    setEvents((data ?? []) as CalendarEvent[]);
  }, [supabase, accountId, gridStart, gridEnd]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEvents();
  }, [fetchEvents]);

  // `?e=<id>` deep link from a notification click — fetched independently
  // of the month grid since the event may fall outside the visible range.
  useEffect(() => {
    if (!deepLinkEventId || autoOpenedEventRef.current === deepLinkEventId) {
      return;
    }
    autoOpenedEventRef.current = deepLinkEventId;
    (async () => {
      const { data } = await supabase
        .from("events")
        .select(
          "*, contact:contacts(id,name,phone), deal:deals(id,title), assignee:profiles!events_assigned_to_fkey(id,full_name,email)"
        )
        .eq("id", deepLinkEventId)
        .maybeSingle();
      if (!data) return;
      const ev = data as CalendarEvent;
      const start = new Date(ev.starts_at);
      setMonthAnchor(startOfMonth(start));
      setSelectedDay(start);
      setEditEvent(ev);
      setFormOpen(true);
    })();
  }, [deepLinkEventId, supabase]);

  const visibleEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter(
      (ev) => statusFilter[ev.status] && (!q || ev.title.toLowerCase().includes(q))
    );
  }, [events, statusFilter, search]);

  const eventsByDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const ev of visibleEvents) {
      const key = ev.starts_at.slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    }
    return map;
  }, [visibleEvents]);

  function openNewEvent(day?: Date) {
    setEditEvent(null);
    if (day) setSelectedDay(day);
    setFormOpen(true);
  }

  function openEditEvent(ev: CalendarEvent) {
    setEditEvent(ev);
    setFormOpen(true);
  }

  function goToday() {
    const today = new Date();
    setMonthAnchor(startOfMonth(today));
    setSelectedDay(today);
  }

  function toggleStatus(status: CalendarEvent["status"]) {
    setStatusFilter((prev) => ({ ...prev, [status]: !prev[status] }));
  }

  const weekdayLabels = [
    t("weekdays.sun"),
    t("weekdays.mon"),
    t("weekdays.tue"),
    t("weekdays.wed"),
    t("weekdays.thu"),
    t("weekdays.fri"),
    t("weekdays.sat"),
  ];

  const statusLabel: Record<CalendarEvent["status"], string> = {
    scheduled: t("statusScheduled"),
    completed: t("statusCompleted"),
    cancelled: t("statusCancelled"),
  };

  const overflowEvents = overflowDay ? eventsByDay[overflowDay] ?? [] : [];

  return (
    // Full-bleed panel — same convention as Inbox/Pipelines (-m- cancels
    // the dashboard shell's padding so this owns the whole content area).
    <div className="-m-4 flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden sm:-m-6 lg:flex-row">
      {/* Sidebar: create button, mini month picker, status filters.
          Horizontal row on mobile (no room for a full sidebar below lg);
          real sidebar on lg+. */}
      <div className="flex shrink-0 flex-col gap-4 overflow-y-auto border-b border-border bg-card p-4 lg:h-full lg:w-64 lg:border-b-0 lg:border-r">
        <GatedButton
          canAct={canEdit}
          gateReason="criar compromissos"
          onClick={() => openNewEvent()}
          className="w-full rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="size-4" />
          {t("newEventBtn")}
        </GatedButton>

        {/* Mini month calendar — drives the same monthAnchor/selectedDay
            as the main grid, so the two stay in sync like a real
            calendar app instead of being two disconnected pickers. */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium capitalize text-foreground">
              {format(monthAnchor, "MMMM yyyy", { locale: ptBR })}
            </span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setMonthAnchor((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                aria-label={t("prevMonth")}
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setMonthAnchor((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                aria-label={t("nextMonth")}
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-y-1 text-center">
            {weekdayLabels.map((label) => (
              <span key={label} className="text-[10px] font-medium text-muted-foreground">
                {label.charAt(0)}
              </span>
            ))}
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const inMonth = isSameMonth(day, monthAnchor);
              const selected = isSameDay(day, selectedDay);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className="flex items-center justify-center py-0.5"
                >
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-[11px] tabular-nums",
                      isToday(day)
                        ? "bg-primary font-semibold text-primary-foreground"
                        : selected
                          ? "border border-primary text-foreground"
                          : inMonth
                            ? "text-foreground hover:bg-muted"
                            : "text-muted-foreground/40 hover:bg-muted",
                    )}
                  >
                    {format(day, "d")}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Status filters — this app's equivalent of Google Calendar's
            "My calendars" checklist, mapped to something that actually
            exists in the data model (event status) instead of inventing
            fake calendars. */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("filtersTitle")}
          </p>
          <div className="space-y-1.5">
            {STATUS_LIST.map((status) => (
              <label
                key={status}
                className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
              >
                <input
                  type="checkbox"
                  checked={statusFilter[status]}
                  onChange={() => toggleStatus(status)}
                  className="sr-only"
                />
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                    statusFilter[status]
                      ? `${STATUS_BG[status]} border-transparent`
                      : "border-muted-foreground/50",
                  )}
                >
                  {statusFilter[status] && (
                    <svg viewBox="0 0 16 16" className="size-3 text-white" fill="none">
                      <path
                        d="M3.5 8.5l3 3 6-6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                {statusLabel[status]}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Main month grid */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={goToday}
            className="rounded-full border border-border px-4 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            {t("today")}
          </button>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setMonthAnchor((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              aria-label={t("prevMonth")}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setMonthAnchor((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              aria-label={t("nextMonth")}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <h1 className="text-lg font-semibold capitalize text-foreground sm:text-xl">
            {format(monthAnchor, "MMMM 'de' yyyy", { locale: ptBR })}
          </h1>

          <div className="ml-auto flex items-center gap-2">
            {searchOpen ? (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  className="h-8 w-40 rounded-full border border-border bg-muted pl-8 pr-7 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none sm:w-56"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setSearchOpen(false);
                  }}
                  aria-label={t("clearSearch")}
                  className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label={t("searchPlaceholder")}
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Search className="h-4 w-4" />
              </button>
            )}
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-7 border-b border-border">
          {weekdayLabels.map((label) => (
            <div
              key={label}
              className="px-1 py-2 text-center text-[11px] font-medium uppercase text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid flex-1 grid-cols-7 overflow-y-auto">
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayEvents = eventsByDay[key] ?? [];
            const shown = dayEvents.slice(0, MAX_PILLS_PER_DAY);
            const overflow = dayEvents.length - shown.length;
            const inMonth = isSameMonth(day, monthAnchor);
            const selected = isSameDay(day, selectedDay);
            return (
              <button
                key={key}
                type="button"
                onClick={() => openNewEvent(day)}
                className={cn(
                  "flex min-h-24 flex-col items-start gap-0.5 border-b border-r border-border p-1.5 text-left align-top last:border-r-0 sm:min-h-28 lg:min-h-32",
                  inMonth ? "bg-transparent hover:bg-muted/40" : "bg-muted/10 hover:bg-muted/30",
                )}
              >
                <span
                  className={cn(
                    "mb-0.5 flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                    isToday(day)
                      ? "bg-primary font-semibold text-primary-foreground"
                      : selected
                        ? "border border-primary text-foreground"
                        : inMonth
                          ? "text-foreground"
                          : "text-muted-foreground/40",
                  )}
                >
                  {format(day, "d")}
                </span>
                <div className="flex w-full flex-col gap-0.5">
                  {shown.map((ev) => (
                    <span
                      key={ev.id}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditEvent(ev);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.stopPropagation();
                          openEditEvent(ev);
                        }
                      }}
                      className={cn(
                        "truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-white",
                        STATUS_BG[ev.status],
                      )}
                    >
                      {ev.all_day ? "" : format(new Date(ev.starts_at), "HH:mm") + " "}
                      {ev.title}
                    </span>
                  ))}
                  {overflow > 0 && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOverflowDay(key);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.stopPropagation();
                          setOverflowDay(key);
                        }
                      }}
                      className="truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-muted-foreground hover:bg-muted"
                    >
                      {t("moreEvents", { count: overflow })}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <EventForm
        open={formOpen}
        onOpenChange={setFormOpen}
        event={editEvent}
        initialDate={format(selectedDay, "yyyy-MM-dd")}
        onSaved={fetchEvents}
      />

      {/* "+N mais" — full list for a day whose pills didn't all fit. */}
      <Dialog open={!!overflowDay} onOpenChange={(o) => !o && setOverflowDay(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="capitalize">
              {overflowDay &&
                format(new Date(overflowDay + "T00:00:00"), "EEEE, d 'de' MMMM", { locale: ptBR })}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {overflowEvents.map((ev) => (
              <button
                key={ev.id}
                type="button"
                onClick={() => {
                  setOverflowDay(null);
                  openEditEvent(ev);
                }}
                className="w-full rounded-lg border border-border p-2.5 text-left transition-colors hover:bg-muted/40"
              >
                <div className="flex items-center gap-1.5">
                  <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_BG[ev.status])} />
                  <span className="truncate text-sm font-medium text-foreground">{ev.title}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {ev.all_day ? t("allDayLabel") : format(new Date(ev.starts_at), "HH:mm")}
                  </span>
                  {ev.contact && (
                    <span className="flex items-center gap-1 truncate">
                      <User className="size-3" />
                      {ev.contact.name || ev.contact.phone}
                    </span>
                  )}
                  {ev.deal && (
                    <span className="flex items-center gap-1 truncate">
                      <Briefcase className="size-3" />
                      {ev.deal.title}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
