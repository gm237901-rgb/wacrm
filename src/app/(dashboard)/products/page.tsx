"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-can";
import { formatCurrency } from "@/lib/currency";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  Loader2,
  MoreHorizontal,
  Package,
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

interface Product {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  currency: string;
  description: string | null;
  active: boolean;
  created_at: string;
}

function emptyForm(currency: string) {
  return { name: "", sku: "", price: "0", currency, description: "", active: true };
}

export default function ProductsPage() {
  const t = useTranslations("Products.page");
  const tForm = useTranslations("Products.form");
  const supabase = createClient();
  const { accountId, defaultCurrency } = useAuth();
  const canEdit = useCan("send-messages");

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm(defaultCurrency));
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    let query = supabase.from("products").select("*").order("created_at", { ascending: false }).limit(200);
    const term = search.trim();
    if (term) query = query.ilike("name", `%${term}%`);
    const { data, error } = await query;
    if (error) {
      toast.error(t("toastFailedLoad"));
    } else {
      setProducts((data ?? []) as Product[]);
    }
    setLoading(false);
  }, [supabase, search, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProducts();
  }, [fetchProducts]);

  function openAddForm() {
    setEditing(null);
    setForm(emptyForm(defaultCurrency));
    setFormOpen(true);
  }

  function openEditForm(product: Product) {
    setEditing(product);
    setForm({
      name: product.name,
      sku: product.sku ?? "",
      price: String(product.price),
      currency: product.currency,
      description: product.description ?? "",
      active: product.active,
    });
    setFormOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !accountId) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      price: Number(form.price) || 0,
      currency: form.currency,
      description: form.description.trim() || null,
      active: form.active,
    };

    const { error } = editing
      ? await supabase.from("products").update(payload).eq("id", editing.id)
      : await supabase.from("products").insert({ ...payload, account_id: accountId });

    if (error) {
      toast.error(t("toastFailedSave"));
    } else {
      toast.success(t("toastSaved"));
      setFormOpen(false);
      fetchProducts();
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("products").delete().eq("id", deleteTarget.id);
    if (error) {
      toast.error(t("toastFailedDelete"));
    } else {
      toast.success(t("toastDeleted"));
      fetchProducts();
    }
    setDeleting(false);
    setDeleteTarget(null);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={products.length > 0 ? t("subtitle", { count: products.length }) : t("subtitleZero")}
        icon={Package}
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
              <TableHead className="hidden text-muted-foreground sm:table-cell">{t("columnSku")}</TableHead>
              <TableHead className="text-muted-foreground">{t("columnPrice")}</TableHead>
              <TableHead className="hidden text-muted-foreground md:table-cell">{t("columnStatus")}</TableHead>
              <TableHead className="w-12 text-muted-foreground" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableSkeleton columns={5} label={t("loading")} />
            ) : products.length === 0 ? (
              <TableRow className="border-border">
                <TableCell colSpan={5} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Package className="size-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {search ? t("noProductsMatch") : t("noProductsYet")}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              products.map((p) => (
                <TableRow key={p.id} className="border-border hover:bg-muted/50">
                  <TableCell className="font-medium text-foreground">{p.name}</TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                    {p.sku || "-"}
                  </TableCell>
                  <TableCell className="text-sm text-foreground tabular-nums">
                    {formatCurrency(p.price, p.currency)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span
                      className={
                        p.active
                          ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500"
                          : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                      }
                    >
                      {p.active ? t("statusActive") : t("statusInactive")}
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
                          onClick={() => openEditForm(p)}
                          className="text-popover-foreground focus:bg-muted focus:text-foreground"
                        >
                          <Pencil className="size-4" />
                          {t("editAction")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-border" />
                        <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(p)}>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{tForm("fieldSku")}</Label>
                <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>{tForm("fieldPrice")}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{tForm("fieldDescription")}</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
              />
            </div>
            <label className="flex items-center gap-2.5">
              <Checkbox
                checked={form.active}
                onCheckedChange={(checked) => setForm({ ...form, active: checked === true })}
              />
              <span className="text-sm text-foreground">{tForm("fieldActive")}</span>
            </label>
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
