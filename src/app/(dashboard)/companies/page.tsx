"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-can";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  Building2,
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

interface Company {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
}

const EMPTY_FORM = { name: "", industry: "", website: "", phone: "", notes: "" };

export default function CompaniesPage() {
  const t = useTranslations("Companies.page");
  const tForm = useTranslations("Companies.form");
  const supabase = createClient();
  const { accountId } = useAuth();
  const canEdit = useCan("send-messages");

  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    let query = supabase.from("companies").select("*").order("created_at", { ascending: false }).limit(200);
    const term = search.trim();
    if (term) query = query.ilike("name", `%${term}%`);
    const { data, error } = await query;
    if (error) {
      toast.error(t("toastFailedLoad"));
    } else {
      setCompanies((data ?? []) as Company[]);
    }
    setLoading(false);
  }, [supabase, search, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCompanies();
  }, [fetchCompanies]);

  function openAddForm() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEditForm(company: Company) {
    setEditing(company);
    setForm({
      name: company.name,
      industry: company.industry ?? "",
      website: company.website ?? "",
      phone: company.phone ?? "",
      notes: company.notes ?? "",
    });
    setFormOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !accountId) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      industry: form.industry.trim() || null,
      website: form.website.trim() || null,
      phone: form.phone.trim() || null,
      notes: form.notes.trim() || null,
    };

    const { error } = editing
      ? await supabase.from("companies").update(payload).eq("id", editing.id)
      : await supabase.from("companies").insert({ ...payload, account_id: accountId });

    if (error) {
      toast.error(t("toastFailedSave"));
    } else {
      toast.success(t("toastSaved"));
      setFormOpen(false);
      fetchCompanies();
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("companies").delete().eq("id", deleteTarget.id);
    if (error) {
      toast.error(t("toastFailedDelete"));
    } else {
      toast.success(t("toastDeleted"));
      fetchCompanies();
    }
    setDeleting(false);
    setDeleteTarget(null);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={
          companies.length > 0 ? t("subtitle", { count: companies.length }) : t("subtitleZero")
        }
        icon={Building2}
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
              <TableHead className="text-muted-foreground">{t("columnName")}</TableHead>
              <TableHead className="hidden text-muted-foreground sm:table-cell">{t("columnIndustry")}</TableHead>
              <TableHead className="hidden text-muted-foreground md:table-cell">{t("columnPhone")}</TableHead>
              <TableHead className="hidden text-muted-foreground lg:table-cell">{t("columnWebsite")}</TableHead>
              <TableHead className="w-12 text-muted-foreground" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableSkeleton columns={5} label={t("loading")} />
            ) : companies.length === 0 ? (
              <TableRow className="border-border">
                <TableCell colSpan={5} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Building2 className="size-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {search ? t("noCompaniesMatch") : t("noCompaniesYet")}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              companies.map((c) => (
                <TableRow key={c.id} className="border-border hover:bg-muted/50">
                  <TableCell className="font-medium text-foreground">{c.name}</TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                    {c.industry || "-"}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                    {c.phone || "-"}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {c.website || "-"}
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
                          onClick={() => openEditForm(c)}
                          className="text-popover-foreground focus:bg-muted focus:text-foreground"
                        >
                          <Pencil className="size-4" />
                          {t("editAction")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-border" />
                        <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(c)}>
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
              <Label>{tForm("fieldName")}</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{tForm("fieldIndustry")}</Label>
              <Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{tForm("fieldWebsite")}</Label>
              <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{tForm("fieldPhone")}</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{tForm("fieldNotes")}</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
            </div>
          </div>
          <DialogFooter className="border-border bg-popover">
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              {tForm("cancel")}
            </Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
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
              {t("deleteDesc", { name: deleteTarget?.name ?? "" })}
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
