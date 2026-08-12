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

/**
 * Status checks while pairing. Cheap on the NOWEB engine (WAHA answers
 * in ~1ms, no browser involved), so this can stay snappy — it's what
 * makes the panel flip to "connected" right after the scan.
 */
const STATUS_POLL_MS = 3000;
/**
 * QR refreshes. WhatsApp rotates its pairing code roughly every 20s;
 * refreshing a little ahead of that keeps a scannable code on screen
 * without swapping the image out from under the user mid-scan.
 */
const QR_REFRESH_MS = 15000;

export function WahaConnect() {
  const t = useTranslations("Settings.waha");
  const canManage = useCan("edit-settings");

  const [state, setState] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // Kept in a ref so the poll effect can read the live status without
  // re-subscribing (and restarting the interval) on every tick.
  const statusRef = useRef<Status>("STOPPED");

  const refresh = useCallback(async (withQr = false) => {
    try {
      const res = await fetch(`/api/waha/session${withQr ? "?qr=1" : ""}`);
      const body = await res.json();
      if (!res.ok) {
        // A server without WAHA configured is an operator problem, not a
        // user error — surface it plainly instead of a dead spinner.
        setState({ connected: false, status: "FAILED", qr: null });
        statusRef.current = "FAILED";
        return body?.error ? String(body.error) : null;
      }
      const next = body as SessionState;
      // A status-only poll carries no QR. Keep the one already on
      // screen rather than blanking it between refreshes — otherwise
      // the code the user is mid-scan disappears under them.
      setState((prev) => ({
        ...next,
        qr: next.qr ?? (next.status === "SCAN_QR_CODE" ? prev?.qr ?? null : null),
      }));
      statusRef.current = next.status;
      return null;
    } catch {
      setState({ connected: false, status: "FAILED", qr: null });
      statusRef.current = "FAILED";
      return null;
    }
  }, []);

  useEffect(() => {
    refresh(true).finally(() => setLoading(false));
  }, [refresh]);

  // The QR only exists once the session reaches SCAN_QR_CODE, a moment
  // after connect — so the connect response itself usually carries none.
  // Grab it the instant the status flips instead of waiting for the slow
  // refresh tick, which left the panel looking stuck for ~20s.
  // `qrRequestedFor` stops this from re-firing (and hammering WAHA) when
  // the fetch comes back empty.
  const qrRequestedFor = useRef<string | null>(null);
  useEffect(() => {
    if (state?.status !== "SCAN_QR_CODE") {
      qrRequestedFor.current = null;
      return;
    }
    if (state.qr || qrRequestedFor.current === state.status) return;
    qrRequestedFor.current = state.status;
    void refresh(true);
  }, [state?.status, state?.qr, refresh]);

  // While the user is looking at a QR, poll so the panel flips to
  // "connected" the moment they finish scanning — without them having
  // to guess whether it worked and hit reload. Status and QR run on
  // separate clocks (see the constants above): the status tick is
  // cheap-ish and frequent, the QR refresh is slow and rare.
  useEffect(() => {
    const pairing =
      state?.status === "SCAN_QR_CODE" || state?.status === "STARTING";
    if (!pairing) return;

    const statusTimer = setInterval(() => {
      void refresh(false);
    }, STATUS_POLL_MS);
    const qrTimer = setInterval(() => {
      void refresh(true);
    }, QR_REFRESH_MS);

    return () => {
      clearInterval(statusTimer);
      clearInterval(qrTimer);
    };
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
            <Button variant="ghost" size="sm" onClick={() => void refresh(true)} disabled={busy}>
              <RefreshCw className="size-4" />
              {t("refreshQr")}
            </Button>
          </div>
        ) : status === "STARTING" || status === "SCAN_QR_CODE" ? (
          // SCAN_QR_CODE with no image yet = the code is seconds away.
          // Showing the "not connected" call-to-action here would read
          // as "nothing happened" and send the user round again.
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
