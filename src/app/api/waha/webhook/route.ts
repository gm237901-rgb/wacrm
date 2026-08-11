// ============================================================
// WAHA inbound webhook.
//
// WAHA POSTs here for every event on a session we registered (see
// startSession). Two events matter today:
//
//   message        → a contact wrote to us; persist it into the thread
//   session.status → WAHA changed state on its own (paired from the
//                    phone, dropped, logged out); mirror it so the UI
//                    and the send path don't act on a stale status
//
// Unauthenticated by nature, so every request is verified against the
// per-account HMAC secret we handed WAHA at session start, and the
// session name resolves the tenant. Runs on the service role because
// there is no user session behind an inbound message.
// ============================================================

import { createHmac, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { phoneFromChatId } from '@/lib/waha/client';
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation';

interface WahaWebhookBody {
  event?: string;
  session?: string;
  payload?: {
    id?: string;
    timestamp?: number;
    from?: string;
    fromMe?: boolean;
    body?: string;
    hasMedia?: boolean;
    notifyName?: string;
    status?: string;
  };
}

/**
 * Constant-time compare of the delivered signature against ours.
 * WAHA sends the digest hex-encoded in `X-Webhook-Hmac`, with the
 * algorithm named in `X-Webhook-Hmac-Algorithm` (sha512 by default).
 */
function signatureMatches(
  rawBody: string,
  secret: string,
  provided: string | null,
  algorithm: string | null
): boolean {
  if (!provided) return false;
  const algo = (algorithm || 'sha512').toLowerCase();
  if (algo !== 'sha512' && algo !== 'sha256') return false;

  const expected = createHmac(algo, secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided.trim().toLowerCase(), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  // Read the body as text first — HMAC is over the exact bytes WAHA
  // signed, so re-serialising a parsed object would break verification.
  const rawBody = await request.text();

  let body: WahaWebhookBody;
  try {
    body = JSON.parse(rawBody) as WahaWebhookBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const sessionName = body.session;
  if (!sessionName) {
    return NextResponse.json({ error: 'Missing session' }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: config } = await admin
    .from('waha_config')
    .select('account_id, webhook_secret, status')
    .eq('session_name', sessionName)
    .maybeSingle();

  if (!config) {
    // Unknown session — either a stale session on the WAHA server or a
    // forged call. Either way there's nothing to route it to.
    return NextResponse.json({ error: 'Unknown session' }, { status: 404 });
  }

  if (
    !signatureMatches(
      rawBody,
      config.webhook_secret,
      request.headers.get('x-webhook-hmac'),
      request.headers.get('x-webhook-hmac-algorithm')
    )
  ) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const accountId = config.account_id as string;

  try {
    if (body.event === 'session.status') {
      await handleSessionStatus(accountId, body.payload?.status);
      return NextResponse.json({ ok: true });
    }

    if (body.event === 'message') {
      await handleInboundMessage(accountId, body.payload ?? {});
      return NextResponse.json({ ok: true });
    }

    // Any other event type is fine to ignore — ack so WAHA doesn't retry.
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[waha/webhook] handler failed:', err);
    // 500 tells WAHA to retry, which is what we want for a transient
    // DB blip on a real message.
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }
}

const VALID_STATUSES = ['STOPPED', 'STARTING', 'SCAN_QR_CODE', 'WORKING', 'FAILED'];

async function handleSessionStatus(accountId: string, status: string | undefined) {
  const normalized = (status ?? '').toUpperCase();
  if (!VALID_STATUSES.includes(normalized)) return;

  const admin = supabaseAdmin();
  await admin
    .from('waha_config')
    .update({
      status: normalized,
      ...(normalized === 'WORKING' ? { connected_at: new Date().toISOString() } : {}),
      ...(normalized === 'STOPPED' || normalized === 'FAILED'
        ? { phone_number: null }
        : {}),
    })
    .eq('account_id', accountId);

  // Keep the outbound provider honest: a session that dropped must not
  // keep claiming sends, or every message silently fails.
  await admin
    .from('accounts')
    .update({ wa_provider: normalized === 'WORKING' ? 'waha' : 'meta' })
    .eq('id', accountId);
}

async function handleInboundMessage(
  accountId: string,
  payload: NonNullable<WahaWebhookBody['payload']>
) {
  // Our own outbound sends echo back through this same event. They're
  // already persisted by the send path, so re-inserting would duplicate
  // every agent message in the thread.
  if (payload.fromMe) return;

  const phone = phoneFromChatId(payload.from ?? '');
  if (!phone) return;

  // Groups/broadcast lists arrive with @g.us / @broadcast ids, which
  // phoneFromChatId can't turn into a real number. Out of scope for a
  // 1:1 CRM inbox — drop rather than create a junk contact.
  if (!(payload.from ?? '').endsWith('@c.us')) return;

  const admin = supabaseAdmin();

  const { conversationId } = await resolveConversationByPhone(
    admin,
    accountId,
    phone,
    payload.notifyName || null,
    // WAHA accounts have no `whatsapp_config` row; the live session we
    // just authenticated is the proof of connection.
    { skipProviderCheck: true }
  );

  // Media needs WAHA's download endpoint + our storage pipeline, which
  // this first slice doesn't wire up yet. Persist a readable placeholder
  // so the agent knows something arrived instead of seeing silence.
  const isMedia = payload.hasMedia === true;
  const contentText = isMedia
    ? payload.body || '[mídia recebida — abra o WhatsApp para visualizar]'
    : payload.body || '';

  if (!contentText) return;

  const createdAt = payload.timestamp
    ? new Date(payload.timestamp * 1000).toISOString()
    : new Date().toISOString();

  const { error: msgError } = await admin.from('messages').insert({
    conversation_id: conversationId,
    sender_type: 'customer',
    content_type: 'text',
    content_text: contentText,
    message_id: payload.id ?? null,
    status: 'delivered',
    created_at: createdAt,
  });

  if (msgError) {
    // 23505 = the same webhook delivered twice (WAHA retries on any
    // non-2xx). Already stored, so this is success, not failure.
    if (msgError.code === '23505') return;
    throw new Error(`Failed to insert inbound message: ${msgError.message}`);
  }

  await admin
    .from('conversations')
    .update({
      last_message_text: contentText,
      last_message_at: createdAt,
      updated_at: new Date().toISOString(),
      status: 'open',
    })
    .eq('id', conversationId);
}
