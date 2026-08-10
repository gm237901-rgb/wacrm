"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { CalendarEvent, Contact, Deal, EventStatus, Profile } from "@/types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Check, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface EventFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: CalendarEvent | null;
  /** Pre-fills the contact select — used by the contact detail "Agenda" tab. */
  initialContactId?: string;
  /** Pre-fills the deal select — used by the "Agendar" shortcut on a deal. */
  initialDealId?: string;
  /** Pre-fills the date (yyyy-mm-dd) — used when a day is picked on the calendar. */
  initialDate?: string;
  onSaved: () => void;
}

function toDateInput(iso: string): string {
  return iso.slice(0, 10);
}
function toTimeInput(iso: string): string {
  return iso.slice(11, 16);
}

export function EventForm({
  open,
  onOpenChange,
  event,
  initialContactId,
  initialDealId,
  initialDate,
  onSaved,
}: EventFormProps) {
  const t = useTranslations("Agenda.form");
  const supabase = createClient();
  const { accountId, user } = useAuth();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contactId, setContactId] = useState("");
  const [dealId, setDealId] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [status, setStatus] = useState<EventStatus>("scheduled");

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    if (event) {
      setTitle(event.title);
      setDescription(event.description ?? "");
      setContactId(event.contact_id ?? "");
      setDealId(event.deal_id ?? "");
      setAssignedTo(event.assigned_to ?? "");
      setDate(toDateInput(event.starts_at));
      setStartTime(toTimeInput(event.starts_at));
      setEndTime(event.ends_at ? toTimeInput(event.ends_at) : "");
      setAllDay(event.all_day);
      setStatus(event.status);
    } else {
      setTitle("");
      setDescription("");
      setContactId(initialContactId ?? "");
      setDealId(initialDealId ?? "");
      setAssignedTo("");
      setDate(initialDate ?? new Date().toISOString().slice(0, 10));
      setStartTime("09:00");
      setEndTime("");
      setAllDay(false);
      setStatus("scheduled");
    }
  }, [open, event, initialContactId, initialDealId, initialDate]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const [c, d, p] = await Promise.all([
        supabase.from("contacts").select("*").order("name"),
        supabase.from("deals").select("*").order("title"),
        supabase.from("profiles").select("*").order("full_name"),
      ]);
      if (cancelled) return;
      setContacts((c.data ?? []) as Contact[]);
      setDeals((d.data ?? []) as Deal[]);
      setProfiles((p.data ?? []) as Profile[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, supabase]);

  async function handleSave() {
    if (!title.trim() || !date) {
      toast.error(t("toastRequired"));
      return;
    }
    if (!accountId || !user) {
      toast.error(t("toastNotLinked"));
      return;
    }
    setSaving(true);

    const startsAt = allDay
      ? `${date}T00:00:00`
      : `${date}T${startTime || "00:00"}:00`;
    const endsAt = allDay ? null : endTime ? `${date}T${endTime}:00` : null;

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      contact_id: contactId || null,
      deal_id: dealId || null,
      assigned_to: assignedTo || null,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      all_day: allDay,
      status,
    };

    if (event) {
      const { error } = await supabase
        .from("events")
        .update(payload)
        .eq("id", event.id);
      if (error) {
        toast.error(t("toastFailedSave"));
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase.from("events").insert({
        ...payload,
        user_id: user.id,
        account_id: accountId,
      });
      if (error) {
        toast.error(t("toastFailedSave"));
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    toast.success(event ? t("toastUpdated") : t("toastCreated"));
    onOpenChange(false);
    onSaved();
  }

  async function handleDelete() {
    if (!event) return;
    setDeleting(true);
    const { error } = await supabase.from("events").delete().eq("id", event.id);
    setDeleting(false);
    if (error) {
      toast.error(t("toastFailedDelete"));
      return;
    }
    toast.success(t("toastDeleted"));
    setConfirmDelete(false);
    onOpenChange(false);
    onSaved();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="bg-popover border-border text-popover-foreground sm:max-w-lg w-full p-0"
      >
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b border-border/50 p-4">
            <SheetTitle className="text-popover-foreground">
              {event ? t("editEvent") : t("newEvent")}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="grid gap-2">
              <Label className="text-muted-foreground">{t("title")}</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("titlePlaceholder")}
                className="border-border bg-muted text-foreground"
              />
            </div>

            <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-end">
              <div className="grid gap-2">
                <Label className="text-muted-foreground">{t("date")}</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="border-border bg-muted text-foreground"
                />
              </div>
              {!allDay && (
                <>
                  <div className="grid gap-2">
                    <Label className="text-muted-foreground">{t("start")}</Label>
                    <Input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="border-border bg-muted text-foreground"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-muted-foreground">{t("end")}</Label>
                    <Input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="border-border bg-muted text-foreground"
                    />
                  </div>
                </>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="h-3.5 w-3.5 accent-primary"
              />
              {t("allDay")}
            </label>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">{t("contact")}</Label>
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="">{t("noContact")}</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.phone}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">{t("deal")}</Label>
              <select
                value={dealId}
                onChange={(e) => setDealId(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="">{t("noDeal")}</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">{t("assignedTo")}</Label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary"
              >
                <option value="">{t("unassigned")}</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </option>
                ))}
              </select>
            </div>

            {event && (
              <div className="grid gap-2">
                <Label className="text-muted-foreground">{t("status")}</Label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as EventStatus)}
                  className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary"
                >
                  <option value="scheduled">{t("statusScheduled")}</option>
                  <option value="completed">{t("statusCompleted")}</option>
                  <option value="cancelled">{t("statusCancelled")}</option>
                </select>
              </div>
            )}

            <div className="grid gap-2">
              <Label className="text-muted-foreground">{t("description")}</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("descriptionPlaceholder")}
                className="min-h-20 border-border bg-muted text-foreground"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border/50 p-4">
            {event ? (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {t("deletePrompt")}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmDelete(false)}
                    className="border-border text-muted-foreground hover:bg-muted"
                  >
                    {t("cancel")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {deleting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      t("confirm")
                    )}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                  className="border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("deleteEvent")}
                </Button>
              )
            ) : (
              <span />
            )}

            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {saving ? t("saving") : t("saveChanges")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
