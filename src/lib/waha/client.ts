// ============================================================
// WAHA (WhatsApp HTTP API) client.
//
// The simple alternative to the Meta Cloud API: the user scans a QR
// code with WhatsApp on their phone and the session is live — no Meta
// app, no business verification, no access tokens to paste. That
// trade-off matters for non-technical customers, which is exactly who
// this product serves.
//
// Shape of the integration
//   - ONE shared WAHA server (operator-level, configured via env).
//   - ONE session per account, named from the account id, so tenants
//     never collide and never learn the server address.
//   - Inbound messages arrive on our webhook, which WAHA is told about
//     when the session starts.
//
// Everything here is a thin, typed wrapper over WAHA's REST surface.
// No Supabase, no Next.js — so it stays unit-testable and the callers
// own persistence.
// ============================================================

/** WAHA's own session lifecycle vocabulary, mirrored in `waha_config.status`. */
export type WahaSessionStatus =
  | 'STOPPED'
  | 'STARTING'
  | 'SCAN_QR_CODE'
  | 'WORKING'
  | 'FAILED';

export class WahaError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'WahaError';
    this.status = status;
  }
}

/**
 * Server address + key. Read from env at the call site (not at module
 * load) so a missing var surfaces as a clear runtime error on the one
 * request that needed it, rather than crashing the whole app at boot.
 */
export interface WahaServer {
  baseUrl: string;
  apiKey?: string;
}

/**
 * Resolve the shared WAHA server from env, or throw a caller-friendly
 * error. `WAHA_BASE_URL` is required; `WAHA_API_KEY` is optional but
 * strongly recommended (without it, anyone who can reach the server can
 * drive every tenant's session).
 */
export function resolveWahaServer(): WahaServer {
  const baseUrl = process.env.WAHA_BASE_URL?.replace(/\/+$/, '');
  if (!baseUrl) {
    throw new WahaError(
      'WAHA is not configured on this server (WAHA_BASE_URL is unset).',
      503
    );
  }
  return { baseUrl, apiKey: process.env.WAHA_API_KEY || undefined };
}

/**
 * Session name for an account. Dashes stripped because WAHA uses the
 * name in URLs and file paths; prefixed so a session is recognisable
 * on a server that might host other things.
 */
export function sessionNameFor(accountId: string): string {
  return `acc${accountId.replace(/-/g, '')}`;
}

/**
 * WhatsApp chat id for an E.164 phone. WAHA addresses individual chats
 * as `<digits>@c.us` — no plus sign, no punctuation.
 */
export function chatIdFor(phoneE164: string): string {
  return `${phoneE164.replace(/\D/g, '')}@c.us`;
}

/** Inverse of {@link chatIdFor} — `5511999999999@c.us` → `+5511999999999`. */
export function phoneFromChatId(chatId: string): string {
  const digits = chatId.split('@')[0].replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

async function wahaFetch<T>(
  server: WahaServer,
  path: string,
  init?: RequestInit
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (server.apiKey) headers['X-Api-Key'] = server.apiKey;

  let res: Response;
  try {
    res = await fetch(`${server.baseUrl}${path}`, { ...init, headers });
  } catch (err) {
    // Network-level failure (server down, DNS, TLS) — distinct from a
    // 4xx/5xx, and the far more likely failure for a self-hosted box.
    throw new WahaError(
      `Could not reach the WhatsApp server: ${
        err instanceof Error ? err.message : String(err)
      }`,
      503
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new WahaError(
      `WAHA ${init?.method ?? 'GET'} ${path} failed (${res.status}): ${body.slice(0, 300)}`,
      res.status >= 500 ? 502 : res.status
    );
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

/**
 * True when a create failed only because the session is already there —
 * the normal path on every reconnect after the first.
 *
 * WAHA reports this as 422 ("Session '…' already exists. Use PUT to
 * update it."), not the 409 the status code alone would suggest, so
 * matching on the message is what actually holds across versions.
 */
function isAlreadyExists(err: unknown): boolean {
  if (!(err instanceof WahaError)) return false;
  return err.status === 409 || /already exists/i.test(err.message);
}

/**
 * Create-or-update the session and start it. A session that already
 * exists is a normal re-connect (user hit "connect" again after a
 * drop), so we fall through to update-then-start rather than failing.
 *
 * `webhookUrl` is registered with the session itself, so WAHA knows
 * where to deliver inbound messages for this specific tenant.
 */
export async function startSession(
  server: WahaServer,
  session: string,
  webhookUrl: string,
  webhookSecret: string
): Promise<void> {
  const config = {
    webhooks: [
      {
        url: webhookUrl,
        // 'message' = inbound from the contact. 'session.status' keeps
        // our mirrored status column honest when WAHA changes state on
        // its own (paired, dropped, logged out from the phone).
        events: ['message', 'session.status'],
        hmac: { key: webhookSecret },
      },
    ],
  };

  try {
    await wahaFetch(server, '/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ name: session, start: true, config }),
    });
    return;
  } catch (err) {
    if (!isAlreadyExists(err)) throw err;
  }

  // Session already existed — push the current config, then start it.
  // Config may have drifted (webhook URL changed with the deploy
  // domain), so update rather than blindly starting the old one.
  await wahaFetch(server, `/api/sessions/${encodeURIComponent(session)}`, {
    method: 'PUT',
    body: JSON.stringify({ name: session, config }),
  }).catch((err: unknown) => {
    // Non-fatal: an older WAHA may not support PUT, and a stale webhook
    // URL still beats refusing to connect. Log so a genuinely broken
    // update doesn't just vanish.
    console.warn('[waha] session config update failed:', err);
  });

  // A session WhatsApp has kicked out (conflict/device_removed) keeps
  // its now-useless credentials on disk. Start it as-is and the engine
  // retries a login that can only fail — "Connection Failure, do not
  // reconnect" — so it never reaches SCAN_QR_CODE and no QR is ever
  // produced, leaving the user stuck with no way out from the UI.
  //
  // Logging out first wipes that dead auth state. We do it for any
  // non-WORKING state, not just FAILED: the same stale credentials also
  // sit behind STOPPED, and reaching this function at all means the user
  // explicitly asked to connect — so there is no live session to
  // protect and nothing of value to discard.
  const current = await getSessionState(server, session).catch(() => null);
  if (current && current.status !== 'WORKING') {
    await logoutSession(server, session).catch((err: unknown) => {
      console.warn('[waha] pre-start logout failed, starting anyway:', err);
    });
  }

  await wahaFetch(server, `/api/sessions/${encodeURIComponent(session)}/start`, {
    method: 'POST',
  }).catch((err: unknown) => {
    // Starting an already-running session is a no-op, not a failure.
    // WAHA answers 422 here too, so match on the status *and* the
    // "already started" wording rather than swallowing every 422.
    if (
      err instanceof WahaError &&
      (err.status === 422 || /already (started|running)/i.test(err.message))
    ) {
      return;
    }
    throw err;
  });
}

interface WahaSessionResponse {
  name?: string;
  status?: string;
  me?: { id?: string; pushName?: string } | null;
}

export interface SessionState {
  status: WahaSessionStatus;
  /** Connected number in E.164, once paired. */
  phoneNumber: string | null;
}

const KNOWN_STATUSES: WahaSessionStatus[] = [
  'STOPPED',
  'STARTING',
  'SCAN_QR_CODE',
  'WORKING',
  'FAILED',
];

function normalizeStatus(raw: string | undefined): WahaSessionStatus {
  const upper = (raw ?? '').toUpperCase() as WahaSessionStatus;
  return KNOWN_STATUSES.includes(upper) ? upper : 'FAILED';
}

export async function getSessionState(
  server: WahaServer,
  session: string
): Promise<SessionState> {
  let raw: WahaSessionResponse;
  try {
    raw = await wahaFetch<WahaSessionResponse>(
      server,
      `/api/sessions/${encodeURIComponent(session)}`
    );
  } catch (err) {
    // A session that was never created reads as "not connected yet",
    // which is the honest state for a first-time user — not an error.
    if (err instanceof WahaError && err.status === 404) {
      return { status: 'STOPPED', phoneNumber: null };
    }
    throw err;
  }

  return {
    status: normalizeStatus(raw?.status),
    phoneNumber: raw?.me?.id ? phoneFromChatId(raw.me.id) : null,
  };
}

/**
 * Current pairing QR as a data URL, ready to drop into an <img src>.
 * Only meaningful while the session is in SCAN_QR_CODE.
 */
export async function getQrCode(
  server: WahaServer,
  session: string
): Promise<string> {
  const headers: Record<string, string> = { Accept: 'image/png' };
  if (server.apiKey) headers['X-Api-Key'] = server.apiKey;

  let res: Response;
  try {
    res = await fetch(
      `${server.baseUrl}/api/${encodeURIComponent(session)}/auth/qr?format=image`,
      { headers }
    );
  } catch (err) {
    throw new WahaError(
      `Could not reach the WhatsApp server: ${
        err instanceof Error ? err.message : String(err)
      }`,
      503
    );
  }

  if (!res.ok) {
    throw new WahaError(
      `Could not read the QR code (${res.status}). The session may already be connected.`,
      res.status >= 500 ? 502 : res.status
    );
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

/** Unpair the phone and stop the session. */
export async function logoutSession(
  server: WahaServer,
  session: string
): Promise<void> {
  await wahaFetch(server, `/api/sessions/${encodeURIComponent(session)}/logout`, {
    method: 'POST',
  }).catch((err: unknown) => {
    // Already gone is the desired end state.
    if (err instanceof WahaError && (err.status === 404 || err.status === 422)) return;
    throw err;
  });
}

export interface SendTextResult {
  /** WAHA's message id, stored in `messages.message_id`. */
  messageId: string;
}

interface WahaSendResponse {
  id?: string | { id?: string; _serialized?: string };
}

/** Send a plain text message. */
export async function sendText(
  server: WahaServer,
  session: string,
  phoneE164: string,
  text: string,
  replyToMessageId?: string
): Promise<SendTextResult> {
  const body: Record<string, unknown> = {
    session,
    chatId: chatIdFor(phoneE164),
    text,
  };
  if (replyToMessageId) body.reply_to = replyToMessageId;

  const res = await wahaFetch<WahaSendResponse>(server, '/api/sendText', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  // WAHA has returned the id as a bare string and as an object across
  // versions; normalise both rather than pinning to one release.
  const rawId = res?.id;
  const messageId =
    typeof rawId === 'string'
      ? rawId
      : rawId?._serialized || rawId?.id || '';

  return { messageId };
}
