"use client";

import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-can";
import { GatedButton } from "@/components/ui/gated-button";
import { Button } from "@/components/ui/button";
import { EventForm } from "@/components/agenda/event-form";
import type { CalendarEvent } from "@/types";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  User,
  Briefcase,
  Loader2,
  CalendarDays,
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

const STATUS_DOT: Record<CalendarEvent["status"], string> = {
  scheduled: "bg-primary",
  completed: "bg-emerald-500",
  cancelled: "bg-muted-foreground",
};

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

  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);

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
      setMonthAnchor(start);
      setSelectedDay(start);
      setEditEvent(ev);
      setFormOpen(true);
    })();
  }, [deepLinkEventId, supabase]);

  const eventsByDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const ev of events) {
      const key = ev.starts_at.slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    }
    return map;
  }, [events]);

  const selectedKey = format(selectedDay, "yyyy-MM-dd");
  const selectedEvents = eventsByDay[selectedKey] ?? [];

  function openNewEvent() {
    setEditEvent(null);
    setFormOpen(true);
  }

  function openEditEvent(ev: CalendarEvent) {
    setEditEvent(ev);
    setFormOpen(true);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>
        <GatedButton
          canAct={canEdit}
          gateReason="criar compromissos"
          onClick={openNewEvent}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          <Plus className="size-4" />
          {t("newEventBtn")}
        </GatedButton>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Month grid */}
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground capitalize">
              {format(monthAnchor, "MMMM yyyy", { locale: ptBR })}
            </h2>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() =>
                  setMonthAnchor(
                    (m) => new Date(m.getFullYear(), m.getMonth() - 1, 1)
                  )
                }
                className="border-border text-muted-foreground hover:bg-muted"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const now = new Date();
                  setMonthAnchor(now);
                  setSelectedDay(now);
                }}
                className="border-border text-muted-foreground hover:bg-muted text-xs"
              >
                {t("today")}
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() =>
                  setMonthAnchor(
                    (m) => new Date(m.getFullYear(), m.getMonth() + 1, 1)
                  )
                }
                className="border-border text-muted-foreground hover:bg-muted"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-border">
            {weekdayLabels.map((label) => (
              <div
                key={label}
                className="px-2 py-2 text-center text-[11px] font-medium text-muted-foreground uppercase"
              >
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayEvents = eventsByDay[key] ?? [];
              const inMonth = isSameMonth(day, monthAnchor);
              const selected = isSameDay(day, selectedDay);
              return (
                <button
                  key={key}
                  onClick={() => setSelectedDay(day)}
                  className={`min-h-20 border-b border-r border-border p-1.5 text-left align-top transition-colors last:border-r-0 ${
                    inMonth ? "bg-transparent" : "bg-muted/20"
                  } ${selected ? "ring-1 ring-inset ring-primary" : "hover:bg-muted/40"}`}
                >
                  <span
                    className={`inline-flex size-5 items-center justify-center rounded-full text-xs ${
                      isToday(day)
                        ? "bg-primary text-primary-foreground font-semibold"
                        : inMonth
                        ? "text-foreground"
                        : "text-muted-foreground/50"
                    }`}
                  >
                    {format(day, "d")}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {dayEvents.slice(0, 3).map((ev) => (
                      <div
                        key={ev.id}
                        className="flex items-center gap-1 truncate text-[10px] text-muted-foreground"
                      >
                        <span
                          className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[ev.status]}`}
                        />
                        <span className="truncate">{ev.title}</span>
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">
                        {t("moreEvents", { count: dayEvents.length - 3 })}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected day list */}
        <div className="rounded-lg border border-border p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground capitalize">
            {format(selectedDay, "EEEE, d 'de' MMMM", { locale: ptBR })}
          </h3>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-primary" />
            </div>
          ) : selectedEvents.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <CalendarDays className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("noEventsDay")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {selectedEvents.map((ev) => (
                <button
                  key={ev.id}
                  onClick={() => openEditEvent(ev)}
                  className="w-full rounded-lg border border-border p-2.5 text-left hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[ev.status]}`}
                    />
                    <span className="text-sm font-medium text-foreground truncate">
                      {ev.title}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      {ev.all_day
                        ? t("allDayLabel")
                        : format(new Date(ev.starts_at), "HH:mm")}
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
          )}

          <GatedButton
            canAct={canEdit}
            gateReason="criar compromissos"
            variant="outline"
            size="sm"
            onClick={openNewEvent}
            className="w-full border-border text-muted-foreground hover:bg-muted"
          >
            <Plus className="size-3.5" />
            {t("addForDay")}
          </GatedButton>
        </div>
      </div>

      <EventForm
        open={formOpen}
        onOpenChange={setFormOpen}
        event={editEvent}
        initialDate={selectedKey}
        onSaved={fetchEvents}
      />
    </div>
  );
}
