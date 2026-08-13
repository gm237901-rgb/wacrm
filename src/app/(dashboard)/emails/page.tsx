"use client";

import { formatDateTime } from "@/lib/datetime";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-can";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { ArrowDownLeft, ArrowUpRight, Loader2, Mail, Plus, Trash2 } from "lucide-react";
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

type Direction = "inbound" | "outbound";

interface EmailRow {
  id: string;
  subject: string;
  body: string | null;
  direction: Direction;
  occurred_at: string;
  contact: { name: string | null; phone: string } | null;
}

interface ContactOption {
  id: string;
  name: string | null;
  phone: string;
}

function emptyForm() {
  return { direction: "outbound" as Direction, subject: "", body: "", contact_id: "" };
}

export default function EmailsPage() {
  const t = useTranslations("Emails.page");
  const tForm = useTranslations("Emails.form");
  const supabase = createClient();
  const { accountId, profile } = useAuth();
  const canEdit = useCan("send-messages");

  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EmailRow | null>(null);

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("emails")
      .select("id, subject, body, direction, occurred_at, contact:contacts(name, phone)")
      .order("occurred_at", { ascending: false })
      .limit(100);
    if (error) {
      toast.error(t("toastFailedLoad"));
    } else {
      setEmails(
        ((data ?? []) as unknown as Array<Omit<EmailRow, "contact"> & { contact: EmailRow["contact"] | EmailRow["contact"][] }>).map(
          (row) => ({ ...row, contact: Array.isArray(row.contact) ? (row.contact[0] ?? null) : row.contact }),
        ),
      );
    }
    setLoading(false);
  }, [supabase, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEmails();
  }, [fetchEmails]);

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
    if (!form.subject.trim() || !accountId) return;
    setSaving(true);
    const { error } = await supabase.from("emails").insert({
      account_id: accountId,
      direction: form.direction,
      subject: form.subject.trim(),
      body: form.body.trim() || null,
      contact_id: form.contact_id || null,
      logged_by: profile?.id ?? null,
    });

    if (error) {
      toast.error(t("toastFailedSave"));
    } else {
      toast.success(t("toastSaved"));
      setFormOpen(false);
      fetchEmails();
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from("emails").delete().eq("id", deleteTarget.id);
    if (error) {
      toast.error(t("toastFailedDelete"));
    } else {
      toast.success(t("toastDeleted"));
      fetchEmails();
    }
    setDeleteTarget(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {emails.length > 0 ? t("subtitle", { count: emails.length }) : t("subtitleZero")}
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
        ) : emails.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Mail className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t("noEmailsYet")}</p>
            <p className="max-w-sm text-xs text-muted-foreground">{t("noEmailsHint")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {emails.map((e) => {
              const Icon = e.direction === "inbound" ? ArrowDownLeft : ArrowUpRight;
              return (
                <li key={e.id} className="group flex items-start gap-3 px-5 py-3">
                  <span
                    className={
                      e.direction === "inbound"
                        ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-blue-400"
                        : "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                    }
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{e.subject}</p>
                    {e.body && <p className="mt-0.5 truncate text-xs text-muted-foreground">{e.body}</p>}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {e.direction === "inbound" ? t("directionInbound") : t("directionOutbound")}
                      {e.contact && ` · ${e.contact.name || e.contact.phone}`}
                      {" · "}
                      {formatDateTime(e.occurred_at)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground opacity-0 group-hover:opacity-100"
                    onClick={() => setDeleteTarget(e)}
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
            <div className="space-y-1.5">
              <Label>{tForm("fieldDirection")}</Label>
              <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v as Direction })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="outbound">{t("directionOutbound")}</SelectItem>
                  <SelectItem value="inbound">{t("directionInbound")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{tForm("fieldSubject")}</Label>
              <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{tForm("fieldBody")}</Label>
              <Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={4} />
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
            <Button onClick={handleSave} disabled={saving || !form.subject.trim()}>
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
