// ============================================================
// WAHA inbound webhook.
//
// WAHA POSTs here for every event on a session we registered (see
// startSession): `message` (a contact wrote to us) and
// `session.status` (WAHA changed state on its own — paired from the
// phone, dropped, logged out).
//
// All the privileged work happens inside the `waha_ingest_webhook`
// SECURITY DEFINER function: it verifies WAHA's HMAC against the
// per-account secret (which this route never reads) and only then
// writes. That keeps an unauthenticated endpoint from needing a
// service-role key in the app's environment — a caller that can't
// produce a valid signature can do nothing, and the secret stays in
// the database.
// ============================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface IngestResult {
  ok?: boolean;
  error?: string;
  ignored?: string;
  conversation_id?: string;
}

export async function POST(request: Request) {
  // Read the body as text: the HMAC covers the exact bytes WAHA signed,
  // so re-serialising a parsed object would break verification.
  const rawBody = await request.text();

  let sessionName: string | undefined;
  try {
    sessionName = (JSON.parse(rawBody) as { session?: string }).session;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!sessionName) {
    return NextResponse.json({ error: 'Missing session' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    console.error('[waha/webhook] Supabase env is not configured');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const db = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await db.rpc('waha_ingest_webhook', {
    p_session_name: sessionName,
    p_raw_body: rawBody,
    p_signature: request.headers.get('x-webhook-hmac'),
    p_algorithm: request.headers.get('x-webhook-hmac-algorithm'),
  });

  if (error) {
    console.error('[waha/webhook] ingest failed:', error.message);
    // 500 makes WAHA retry, which is what we want for a transient DB
    // problem on a real message.
    return NextResponse.json({ error: 'Ingest failed' }, { status: 500 });
  }

  const result = (data ?? {}) as IngestResult;

  if (!result.ok) {
    // A bad signature is the interesting case: either a forged call or
    // a session whose secret drifted from what WAHA holds. Both warrant
    // a 401 so WAHA stops retrying it.
    const status = result.error === 'unknown_session' ? 404 : 401;
    return NextResponse.json({ error: result.error ?? 'Rejected' }, { status });
  }

  return NextResponse.json({ ok: true });
}
