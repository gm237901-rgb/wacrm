// ============================================================
// WAHA session lifecycle — the whole "connect WhatsApp" flow.
//
//   GET    → current state (+ QR while pairing)
//   POST   → create/start the session so a QR appears
//   DELETE → unpair and stop
//
// The tenant never sees or supplies the WAHA server address: it's
// operator env config. A tenant only ever owns their session.
// ============================================================

import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  WahaError,
  getQrCode,
  getSessionState,
  logoutSession,
  resolveWahaServer,
  sessionNameFor,
  startSession,
} from '@/lib/waha/client';

/** Resolve the caller's account + role. Null account = not set up. */
async function resolveAccount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<{ accountId: string; role: string } | null> {
  const { data } = await supabase
    .from('profiles')
    .select('account_id, account_role')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data?.account_id) return null;
  return { accountId: data.account_id as string, role: data.account_role as string };
}

function canManage(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

function errorResponse(err: unknown) {
  if (err instanceof WahaError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error('[waha/session]', err);
  return NextResponse.json(
    { error: 'Unexpected error talking to the WhatsApp server.' },
    { status: 500 }
  );
}

/**
 * Public base URL for webhook callbacks. Prefers the explicit
 * NEXT_PUBLIC_SITE_URL; falls back to the request's own origin so a
 * fresh deploy works before anyone remembers to set the var.
 */
function publicBaseUrl(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '');
  if (configured) return configured;
  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  // Fetching the QR drives the Puppeteer page, and so does reading
  // session status (WAHA takes ~3s per status call). Polling both every
  // few seconds keeps Chromium permanently busy and destabilises the
  // pairing the user is trying to complete. So the QR is opt-in: the
  // client asks for it on a much slower cadence than the status.
  const wantsQr = new URL(request.url).searchParams.get('qr') === '1';
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const account = await resolveAccount(supabase, user.id);
  if (!account) return NextResponse.json({ connected: false, status: 'STOPPED' });

  const { data: config } = await supabase
    .from('waha_config')
    .select('session_name, status, phone_number, connected_at')
    .eq('account_id', account.accountId)
    .maybeSingle();

  if (!config) {
    return NextResponse.json({ connected: false, status: 'STOPPED', qr: null });
  }

  try {
    const server = resolveWahaServer();
    const state = await getSessionState(server, config.session_name);

    // Mirror WAHA's truth back into our row so the rest of the app
    // (send path, settings badge) doesn't need a live call.
    if (state.status !== config.status || state.phoneNumber !== config.phone_number) {
      await supabase
        .from('waha_config')
        .update({
          status: state.status,
          phone_number: state.phoneNumber,
          connected_at:
            state.status === 'WORKING' && !config.connected_at
              ? new Date().toISOString()
              : config.connected_at,
        })
        .eq('account_id', account.accountId);

      // First successful pairing flips the account to WAHA so outbound
      // sends stop going to Meta.
      if (state.status === 'WORKING') {
        await supabase
          .from('accounts')
          .update({ wa_provider: 'waha' })
          .eq('id', account.accountId);
      }
    }

    // Only fetch a QR while one is actually expected — asking outside
    // SCAN_QR_CODE just 404s/422s and muddies the logs.
    let qr: string | null = null;
    if (wantsQr && state.status === 'SCAN_QR_CODE') {
      qr = await getQrCode(server, config.session_name).catch(() => null);
    }

    return NextResponse.json({
      connected: state.status === 'WORKING',
      status: state.status,
      phoneNumber: state.phoneNumber,
      qr,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const account = await resolveAccount(supabase, user.id);
  if (!account) {
    return NextResponse.json({ error: 'No account found' }, { status: 400 });
  }
  if (!canManage(account.role)) {
    return NextResponse.json(
      { error: 'Only admins can connect WhatsApp.' },
      { status: 403 }
    );
  }

  try {
    const server = resolveWahaServer();
    const sessionName = sessionNameFor(account.accountId);

    // Reuse the stored secret so an existing WAHA session's registered
    // HMAC key keeps matching; only mint one on first connect.
    const { data: existing } = await supabase
      .from('waha_config')
      .select('webhook_secret')
      .eq('account_id', account.accountId)
      .maybeSingle();

    const webhookSecret = existing?.webhook_secret ?? randomBytes(32).toString('hex');

    await supabase.from('waha_config').upsert(
      {
        account_id: account.accountId,
        session_name: sessionName,
        webhook_secret: webhookSecret,
        status: 'STARTING',
      },
      { onConflict: 'account_id' }
    );

    const webhookUrl = `${publicBaseUrl(request)}/api/waha/webhook`;
    await startSession(server, sessionName, webhookUrl, webhookSecret);

    const state = await getSessionState(server, sessionName);
    await supabase
      .from('waha_config')
      .update({ status: state.status, phone_number: state.phoneNumber })
      .eq('account_id', account.accountId);

    let qr: string | null = null;
    if (state.status === 'SCAN_QR_CODE') {
      qr = await getQrCode(server, sessionName).catch(() => null);
    }

    return NextResponse.json({
      connected: state.status === 'WORKING',
      status: state.status,
      phoneNumber: state.phoneNumber,
      qr,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const account = await resolveAccount(supabase, user.id);
  if (!account) {
    return NextResponse.json({ error: 'No account found' }, { status: 400 });
  }
  if (!canManage(account.role)) {
    return NextResponse.json(
      { error: 'Only admins can disconnect WhatsApp.' },
      { status: 403 }
    );
  }

  const { data: config } = await supabase
    .from('waha_config')
    .select('session_name')
    .eq('account_id', account.accountId)
    .maybeSingle();

  if (config) {
    try {
      await logoutSession(resolveWahaServer(), config.session_name);
    } catch (err) {
      // Log, but still clear our side — a server that's unreachable
      // shouldn't trap the user in a "connected" state they can't exit.
      console.warn('[waha/session] logout failed, clearing locally anyway:', err);
    }
    await supabase
      .from('waha_config')
      .update({ status: 'STOPPED', phone_number: null, connected_at: null })
      .eq('account_id', account.accountId);
  }

  // Hand outbound sends back to Meta (the default) so a disconnected
  // WAHA session can't silently swallow every message.
  await supabase
    .from('accounts')
    .update({ wa_provider: 'meta' })
    .eq('id', account.accountId);

  return NextResponse.json({ connected: false, status: 'STOPPED', qr: null });
}
