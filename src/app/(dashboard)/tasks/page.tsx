"use client";

import { formatDate } from "@/lib/datetime";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-can";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  CheckSquare,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { GatedButton } from "@/components/ui/gated-button";
import { PageHeader } from "@/components/layout/page-header";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Priority = "low" | "medium" | "high";
type Status = "pending" | "done";

interface Task {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: Priority;
  status: Status;
  contact_id: string | null;
  contact: { name: string | null; phone: string } | null;
}

interface ContactOption {
  id: string;
  name: string | null;
  phone: string;
}

const EMPTY_FORM = { title: "", description: "", due_date: "", priority: "medium" as Priority, contact_id: "" };

const PRIORITY_DOT: Record<Priority, string> = {
  low: "bg-slate-400",
  medium: "bg-amber-400",
  high: "bg-rose-500",
};

export default function TasksPage() {
  const t = useTranslations("Tasks.page");
  const tForm = useTranslations("Tasks.form");
  const supabase = createClient();
  const { accountId } = useAuth();
  const canEdit = useCan("send-messages");

  const [tasks, setTasks] = useState<Task[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("tasks")
      .select("*, contact:contacts(name, phone)")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(200);
    const term = search.trim();
    if (term) query = query.ilike("title", `%${term}%`);
    const { data, error } = await query;
    if (error) {
      toast.error(t("toastFailedLoad"));
    } else {
      setTasks(
        ((data ?? []) as unknown as Array<Omit<Task, "contact"> & { contact: Task["contact"] | Task["contact"][] }>).map(
          (row) => ({ ...row, contact: Array.isArray(row.contact) ? (row.contact[0] ?? null) : row.contact }),
        ),
      );
    }
    setLoading(false);
  }, [supabase, search, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTasks();
  }, [fetchTasks]);

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
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEditForm(task: Task) {
    setEditing(task);
    setForm({
      title: task.title,
      description: task.description ?? "",
      due_date: task.due_date ?? "",
      priority: task.priority,
      contact_id: task.contact_id ?? "",
    });
    setFormOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim() || !accountId) return;
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      due_date: form.due_date || null,
      priority: form.priority,
      contact_id: form.contact_id || null,
    };

    const { error } = editing
      ? await supabase.from("tasks").update(payload).eq("id", editing.id)
      : await supabase.from("tasks").insert({ ...payload, account_id: accountId, status: "pending" });

    if (error) {
      toast.error(t("toastFailedSave"));
    } else {
      toast.success(t("toastSaved"));
      setFormOpen(false);
      fetchTasks();
    }
    setSaving(false);
  }

  async function toggleStatus(task: Task) {
    const nextStatus: Status = task.status === "pending" ? "done" : "pending";
    const { error } = await supabase.from("tasks").update({ status: nextStatus }).eq("id", task.id);
    if (error) {
      toast.error(t("toastFailedUpdate"));
    } else {
      setTasks((prev) => prev.map((tk) => (tk.id === task.id ? { ...tk, status: nextStatus } : tk)));
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("tasks").delete().eq("id", deleteTarget.id);
    if (error) {
      toast.error(t("toastFailedDelete"));
    } else {
      toast.success(t("toastDeleted"));
      fetchTasks();
    }
    setDeleting(false);
    setDeleteTarget(null);
  }

  const priorityLabel: Record<Priority, string> = {
    low: t("priorityLow"),
    medium: t("priorityMedium"),
    high: t("priorityHigh"),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={tasks.length > 0 ? t("subtitle", { count: tasks.length }) : t("subtitleZero")}
        icon={CheckSquare}
        actions={
          <GatedButton canAct={canEdit} gateReason={t("gateCreate")} onClick={openAddForm}>
          <Plus className="size-4" />
          {t("addBtn")}
        </GatedButton>
        }
      />

      <div className="relative max-w-sm">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="border-border bg-card pl-8 text-foreground placeholder:text-muted-foreground"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="w-10" />
              <TableHead className="text-muted-foreground">{t("columnTitle")}</TableHead>
              <TableHead className="hidden text-muted-foreground sm:table-cell">{t("columnDueDate")}</TableHead>
              <TableHead className="hidden text-muted-foreground md:table-cell">{t("columnPriority")}</TableHead>
              <TableHead className="w-12 text-muted-foreground" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableSkeleton columns={5} label={t("loading")} />
            ) : tasks.length === 0 ? (
              <TableRow className="border-border">
                <TableCell colSpan={5} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <CheckSquare className="size-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {search ? t("noTasksMatch") : t("noTasksYet")}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              tasks.map((task) => (
                <TableRow key={task.id} className="border-border hover:bg-muted/50">
                  <TableCell>
                    <Checkbox
                      checked={task.status === "done"}
                      onCheckedChange={() => toggleStatus(task)}
                      aria-label={task.status === "pending" ? t("markDone") : t("markPending")}
                    />
                  </TableCell>
                  <TableCell>
                    <p
                      className={
                        task.status === "done"
                          ? "font-medium text-muted-foreground line-through"
                          : "font-medium text-foreground"
                      }
                    >
                      {task.title}
                    </p>
                    {task.contact && (
                      <p className="text-xs text-muted-foreground">{task.contact.name || task.contact.phone}</p>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                    {task.due_date
                      ? formatDate(task.due_date + "T00:00:00")
                      : t("noDueDate")}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      <span className={`size-2 rounded-full ${PRIORITY_DOT[task.priority]}`} />
                      {priorityLabel[task.priority]}
                    </span>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="icon-sm" className="text-muted-foreground" />}
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="border-border bg-popover">
                        <DropdownMenuItem
                          onClick={() => openEditForm(task)}
                          className="text-popover-foreground focus:bg-muted focus:text-foreground"
                        >
                          <Pencil className="size-4" />
                          {t("editAction")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-border" />
                        <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(task)}>
                          <Trash2 className="size-4" />
                          {t("deleteAction")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">
              {editing ? tForm("titleEdit") : tForm("titleNew")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{tForm("fieldTitle")}</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{tForm("fieldDescription")}</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{tForm("fieldDueDate")}</Label>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{tForm("fieldPriority")}</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => setForm({ ...form, priority: v as Priority })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t("priorityLow")}</SelectItem>
                    <SelectItem value="medium">{t("priorityMedium")}</SelectItem>
                    <SelectItem value="high">{t("priorityHigh")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
            <Button onClick={handleSave} disabled={saving || !form.title.trim()}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {saving ? tForm("saving") : tForm("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">{t("deleteTitle")}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t("deleteDesc", { name: deleteTarget?.title ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-border bg-popover">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="size-4 animate-spin" />}
              {t("deleteBtn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
