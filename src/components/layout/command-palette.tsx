"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Loader2, Search, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useTranslations } from "next-intl";

interface SearchResult {
  id: string;
  kind: "contact" | "deal";
  title: string;
  subtitle: string | null;
  href: string;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const t = useTranslations("Header.search");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on open — legitimate prop-driven sync, not derived state.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    // Focus after the dialog's open animation mounts the input.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(async () => {
      const db = createClient();
      const like = `%${query.trim()}%`;
      const [contactsRes, dealsRes] = await Promise.all([
        db.from("contacts").select("id, name, phone, company").ilike("name", like).limit(6),
        db.from("deals").select("id, title").ilike("title", like).limit(6),
      ]);
      if (cancelled) return;
      const contactResults: SearchResult[] = (
        (contactsRes.data ?? []) as Array<{
          id: string;
          name: string | null;
          phone: string;
          company: string | null;
        }>
      ).map((c) => ({
        id: c.id,
        kind: "contact",
        title: c.name || c.phone,
        subtitle: c.company,
        href: `/contacts?id=${c.id}`,
      }));
      const dealResults: SearchResult[] = (
        (dealsRes.data ?? []) as Array<{ id: string; title: string }>
      ).map((d) => ({
        id: d.id,
        kind: "deal",
        title: d.title,
        subtitle: null,
        href: `/pipelines?deal=${d.id}`,
      }));
      setResults([...contactResults, ...dealResults]);
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, open]);

  const goTo = useCallback(
    (href: string) => {
      onOpenChange(false);
      router.push(href);
    },
    [onOpenChange, router],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[20%] max-w-[calc(100%-2rem)] translate-y-0 gap-0 p-0 sm:max-w-lg"
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("placeholder")}
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {query.trim().length < 2 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t("hint")}</p>
          ) : results.length === 0 && !loading ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t("noResults")}</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {results.map((r) => (
                <li key={`${r.kind}-${r.id}`}>
                  <button
                    type="button"
                    onClick={() => goTo(r.href)}
                    className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      {r.kind === "contact" ? (
                        <Users className="h-3.5 w-3.5" />
                      ) : (
                        <Briefcase className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">{r.title}</span>
                      {r.subtitle && (
                        <span className="block truncate text-xs text-muted-foreground">{r.subtitle}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
