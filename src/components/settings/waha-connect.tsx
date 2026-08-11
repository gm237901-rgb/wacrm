"use client";

// ============================================================
// "Connect WhatsApp" — the QR-code pairing panel.
//
// The whole point of this surface is that a non-technical user can
// finish it alone: press a button, scan a code with their phone, done.
// No credentials, no Meta dashboard, no vocabulary they don't have.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2, LogOut, RefreshCw, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useCan } from "@/hooks/use-can";

type Status = "STOPPED" | "STARTING" | "SCAN_QR_CODE" | "WORKING" | "FAILED";

interface SessionState {
  connected: boolean;
  status: Status;
  phoneNumber?: string | null;
  qr?: string | null;
}

/** How often to re-check while a QR is on screen waiting to be scanned. */
const PAIRING_POLL_MS = 3000;

export function WahaConnect() {
  const t = useTranslations("Settings.waha");
  const canManage = useCan("edit-settings");

  const [state, setState] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // Kept in a ref so the poll effect can read the live status without
  // re-subscribing (and restarting the interval) on every tick.
  const statusRef = useRef<Status>("STOPPED");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/waha/session");
      const body = await res.json();
      if (!res.ok) {
        // A server without WAHA configured is an operator problem, not a
        // user error — surface it plainly instead of a dead spinner.
        setState({ connected: false, status: "FAILED", qr: null });
        statusRef.current = "FAILED";
        return body?.error ? String(body.error) : null;
      }
      setState(body as SessionState);
      statusRef.current = (body as SessionState).status;
      return null;
    } catch {
      setState({ connected: false, status: "FAILED", qr: null });
      statusRef.current = "FAILED";
      return null;
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  // While the user is looking at a QR, poll so the panel flips to
  // "connected" the moment they finish scanning — without them having
  // to guess whether it worked and hit reload.
  useEffect(() => {
    if (state?.status !== "SCAN_QR_CODE" && state?.status !== "STARTING") return;
    const id = setInterval(() => {
      void refresh();
    }, PAIRING_POLL_MS);
    return () => clearInterval(id);
  }, [state?.status, refresh]);

  async function connect() {
    setBusy(true);
    try {
      const res = await fetch("/api/waha/session", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body?.error || t("toastConnectFailed"));
        return;
      }
      setState(body as SessionState);
      statusRef.current = (body as SessionState).status;
    } catch {
      toast.error(t("toastConnectFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      const res = await fetch("/api/waha/session", { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body?.error || t("toastDisconnectFailed"));
        return;
      }
      setState(body as SessionState);
      statusRef.current = "STOPPED";
      toast.success(t("toastDisconnected"));
    } catch {
      toast.error(t("toastDisconnectFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("loading")}
        </div>
      </section>
    );
  }

  const status = state?.status ?? "STOPPED";
  const connected = status === "WORKING";

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{t("title")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("description")}</p>
        </div>
        <span
          className={
            connected
              ? "flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-500"
              : "flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
          }
        >
          {connected ? <CheckCircle2 className="size-3.5" /> : <Smartphone className="size-3.5" />}
          {connected ? t("statusConnected") : t("statusDisconnected")}
        </span>
      </header>

      <div className="p-5">
        {connected ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-foreground">{t("connectedAs")}</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
                {state?.phoneNumber || t("unknownNumber")}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={disconnect}
              disabled={busy || !canManage}
              title={canManage ? undefined : t("adminOnly")}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
              {t("disconnect")}
            </Button>
          </div>
        ) : state?.qr ? (
          <div className="flex flex-col items-center gap-4">
            {/* Plain <img> would trip the lint rule; Image with a data
                URL needs `unoptimized` since there's nothing to fetch. */}
            <Image
              src={state.qr}
              alt={t("qrAlt")}
              width={264}
              height={264}
              unoptimized
              className="rounded-lg bg-white p-3"
            />
            <ol className="max-w-sm space-y-1.5 text-sm text-muted-foreground">
              <li>{t("step1")}</li>
              <li>{t("step2")}</li>
              <li>{t("step3")}</li>
            </ol>
            <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={busy}>
              <RefreshCw className="size-4" />
              {t("refreshQr")}
            </Button>
          </div>
        ) : status === "STARTING" ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="size-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{t("preparing")}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Smartphone className="size-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{t("notConnectedTitle")}</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                {t("notConnectedHint")}
              </p>
            </div>
            <Button
              onClick={connect}
              disabled={busy || !canManage}
              title={canManage ? undefined : t("adminOnly")}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Smartphone className="size-4" />}
              {t("connect")}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
