"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-can";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Activity, Loader2, Mail, Phone, Plus, StickyNote, Trash2, Users } from "lucide-react";
import { GatedButton } from "@/components/ui/gated-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ActivityType = "call" | "meeting" | "note" | "email";

interface ActivityRow {
  id: string;
  type: ActivityType;
  summary: string;
  occurred_at: string;
  contact: { name: string | null; phone: string } | null;
}

interface ContactOption {
  id: string;
  name: string | null;
  phone: string;
}

const TYPE_ICON: Record<ActivityType, typeof Phone> = {
  call: Phone,
  meeting: Users,
  note: StickyNote,
  email: Mail,
};

function emptyForm() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return { type: "note" as ActivityType, summary: "", contact_id: "", occurred_at: now.toISOString().slice(0, 16) };
}

export default function ActivitiesPage() {
  const t = useTranslations("Activities.page");
  const tForm = useTranslations("Activities.form");
  const supabase = createClient();
  const { accountId } = useAuth();
  const canEdit = useCan("send-messages");

  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ActivityRow | null>(null);

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("activities")
      .select("id, type, summary, occurred_at, contact:contacts(name, phone)")
      .order("occurred_at", { ascending: false })
      .limit(100);
    if (error) {
      toast.error(t("toastFailedLoad"));
    } else {
      setActivities(
        ((data ?? []) as unknown as Array<Omit<ActivityRow, "contact"> & { contact: ActivityRow["contact"] | ActivityRow["contact"][] }>).map(
          (row) => ({ ...row, contact: Array.isArray(row.contact) ? (row.contact[0] ?? null) : row.contact }),
        ),
      );
    }
    setLoading(false);
  }, [supabase, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchActivities();
  }, [fetchActivities]);

  useEffect(() => {
    supabase
      .from("contacts")
      .select("id, name, phone")
      .order("name")
      .limit(200)
      .then(({ data }) => setContacts((data ?? []) as ContactOption[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openAddForm() {
    setForm(emptyForm());
    setFormOpen(true);
  }

  async function handleSave() {
    if (!form.summary.trim() || !accountId) return;
    setSaving(true);
    const { error } = await supabase.from("activities").insert({
      account_id: accountId,
      type: form.type,
      summary: form.summary.trim(),
      contact_id: form.contact_id || null,
      occurred_at: new Date(form.occurred_at).toISOString(),
    });

    if (error) {
      toast.error(t("toastFailedSave"));
    } else {
      toast.success(t("toastSaved"));
      setFormOpen(false);
      fetchActivities();
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from("activities").delete().eq("id", deleteTarget.id);
    if (error) {
      toast.error(t("toastFailedDelete"));
    } else {
      toast.success(t("toastDeleted"));
      fetchActivities();
    }
    setDeleteTarget(null);
  }

  const typeLabel: Record<ActivityType, string> = {
    call: t("typeCall"),
    meeting: t("typeMeeting"),
    note: t("typeNote"),
    email: t("typeEmail"),
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {activities.length > 0 ? t("subtitle", { count: activities.length }) : t("subtitleZero")}
          </p>
        </div>
        <GatedButton canAct={canEdit} gateReason={t("gateCreate")} onClick={openAddForm}>
          <Plus className="size-4" />
          {t("addBtn")}
        </GatedButton>
      </div>

      <div className="rounded-lg border border-border bg-card">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Activity className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t("noActivitiesYet")}</p>
            <p className="max-w-xs text-xs text-muted-foreground">{t("noActivitiesHint")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {activities.map((a) => {
              const Icon = TYPE_ICON[a.type];
              return (
                <li key={a.id} className="group flex items-start gap-3 px-5 py-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">{a.summary}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {typeLabel[a.type]}
                      {a.contact && ` · ${a.contact.name || a.contact.phone}`}
                      {" · "}
                      {new Date(a.occurred_at).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground opacity-0 group-hover:opacity-100"
                    onClick={() => setDeleteTarget(a)}
                    aria-label={t("deleteAction")}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">{tForm("title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{tForm("fieldType")}</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as ActivityType })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="call">{t("typeCall")}</SelectItem>
                    <SelectItem value="meeting">{t("typeMeeting")}</SelectItem>
                    <SelectItem value="note">{t("typeNote")}</SelectItem>
                    <SelectItem value="email">{t("typeEmail")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{tForm("fieldOccurredAt")}</Label>
                <Input
                  type="datetime-local"
                  value={form.occurred_at}
                  onChange={(e) => setForm({ ...form, occurred_at: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{tForm("fieldSummary")}</Label>
              <Textarea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>{tForm("fieldContact")}</Label>
              <Select
                value={form.contact_id || "none"}
                onValueChange={(v) => setForm({ ...form, contact_id: v && v !== "none" ? v : "" })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{tForm("noneOption")}</SelectItem>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name || c.phone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="border-border bg-popover">
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              {tForm("cancel")}
            </Button>
            <Button onClick={handleSave} disabled={saving || !form.summary.trim()}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {saving ? tForm("saving") : tForm("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">{t("deleteAction")}?</DialogTitle>
          </DialogHeader>
          <DialogFooter className="border-border bg-popover">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {tForm("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {t("deleteAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
