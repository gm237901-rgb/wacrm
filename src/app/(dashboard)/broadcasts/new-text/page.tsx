"use client";

// ============================================================
// Plain-text broadcast composer (QR / WAHA connection).
//
// The Meta wizard's first step is "pick an approved template", which
// has no meaning on a QR session — so this is a single screen: write
// the message, pick who gets it, send.
//
// The pacing warning is prominent on purpose. Sending in bulk from a
// QR-paired number is the fastest way to get it banned, and the person
// pressing this button is usually the one whose business number it is.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Search, Send, Users } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

/** Mirrors MAX_WAHA_RECIPIENTS on the server. */
const MAX_RECIPIENTS = 200;

interface Contact {
  id: string;
  name: string | null;
  phone: string;
}

export default function NewTextBroadcastPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void createClient()
      .from("contacts")
      .select("id, name, phone")
      .order("name")
      .limit(500)
      .then(({ data }) => {
        if (cancelled) return;
        setContacts((data ?? []) as Contact[]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return contacts;
    return contacts.filter(
      (c) =>
        (c.name ?? "").toLowerCase().includes(term) || c.phone.includes(term),
    );
  }, [contacts, search]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllVisible = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = visible.every((c) => next.has(c.id));
      for (const c of visible) {
        if (allSelected) next.delete(c.id);
        else next.add(c.id);
      }
      return next;
    });
  }, [visible]);

  // ~6.5s average gap per message, matching the server's throttle.
  const estimatedMinutes = Math.max(1, Math.round((selected.size * 6.5) / 60));

  async function send() {
    if (!message.trim() || selected.size === 0) return;
    setSending(true);
    try {
      const res = await fetch("/api/waha/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          message_text: message.trim(),
          contact_ids: [...selected],
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body?.error || "Não foi possível iniciar a transmissão.");
        return;
      }
      toast.success(
        `Transmissão iniciada para ${body.total_recipients} contatos. O envio é gradual e leva alguns minutos.`,
      );
      router.push(`/broadcasts/${body.id}`);
    } catch {
      toast.error("Não foi possível iniciar a transmissão.");
    } finally {
      setSending(false);
    }
  }

  const overLimit = selected.size > MAX_RECIPIENTS;
  const canSend = !!message.trim() && selected.size > 0 && !overLimit && !sending;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Nova transmissão</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Envie uma mensagem de texto para vários contatos pelo WhatsApp conectado.
        </p>
      </div>

      {/* The one thing the user most needs to know before pressing send. */}
      <div className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
        <div className="text-sm text-foreground">
          <p className="font-medium">Envie com moderação</p>
          <p className="mt-1 text-muted-foreground">
            O WhatsApp pode bloquear números que disparam muitas mensagens iguais.
            O envio é feito devagar (uma a cada 4–9 segundos) justamente para
            reduzir esse risco, e o limite é de {MAX_RECIPIENTS} contatos por
            transmissão. Prefira mensagens para quem já espera seu contato.
          </p>
        </div>
      </div>

      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="space-y-1.5">
          <Label>Nome da transmissão (opcional)</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex.: Promoção de agosto"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Mensagem</Label>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            placeholder="Olá {{nome}}, tudo bem? ..."
          />
          <p className="text-xs text-muted-foreground">
            Use <code className="rounded bg-muted px-1">{"{{nome}}"}</code> para
            inserir o nome de cada contato automaticamente.
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card">
        <header className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Destinatários</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {selected.size} selecionado{selected.size === 1 ? "" : "s"}
              {selected.size > 0 && ` · envio leva ~${estimatedMinutes} min`}
            </p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar contatos..."
              className="pl-8"
            />
          </div>
        </header>

        {overLimit && (
          <p className="border-b border-border bg-destructive/10 px-5 py-2.5 text-sm text-destructive">
            Máximo de {MAX_RECIPIENTS} contatos por transmissão. Remova{" "}
            {selected.size - MAX_RECIPIENTS} para continuar.
          </p>
        )}

        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="size-5 animate-spin text-primary" />
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Users className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {search ? "Nenhum contato encontrado" : "Nenhum contato ainda"}
              </p>
            </div>
          ) : (
            <>
              <label className="flex cursor-pointer items-center gap-3 border-b border-border px-5 py-2.5 hover:bg-muted/40">
                <Checkbox
                  checked={visible.length > 0 && visible.every((c) => selected.has(c.id))}
                  onCheckedChange={toggleAllVisible}
                />
                <span className="text-sm font-medium text-foreground">
                  Selecionar todos ({visible.length})
                </span>
              </label>
              <ul className="divide-y divide-border">
                {visible.map((c) => (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-5 py-2.5 hover:bg-muted/40">
                      <Checkbox
                        checked={selected.has(c.id)}
                        onCheckedChange={() => toggle(c.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-foreground">
                          {c.name || c.phone}
                        </span>
                        {c.name && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {c.phone}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push("/broadcasts")}>
          Cancelar
        </Button>
        <Button onClick={send} disabled={!canSend}>
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Enviar para {selected.size} contato{selected.size === 1 ? "" : "s"}
        </Button>
      </div>
    </div>
  );
}
