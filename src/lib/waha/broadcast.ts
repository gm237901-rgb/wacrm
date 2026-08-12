// ============================================================
// Plain-text broadcast delivery over WAHA.
//
// The Meta path sends an approved template per recipient and lets Meta
// handle pacing. A QR-paired session has neither: to WhatsApp it looks
// like an ordinary phone, and an ordinary phone that fires fifty
// identical messages in a second is indistinguishable from spam. That
// gets numbers banned — often permanently, taking the customer's real
// WhatsApp with it.
//
// So delivery here is deliberately slow and jittered, and the caller
// can't opt out. The throttle is the feature, not an implementation
// detail: without it this is a number-burning machine.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { resolveWahaServer, sendText, type WahaServer } from '@/lib/waha/client';

/**
 * Delay window between two sends, in milliseconds. Randomised inside
 * the range so the traffic doesn't carry a machine-perfect cadence —
 * a fixed interval is itself a spam signal.
 */
const MIN_GAP_MS = 4000;
const MAX_GAP_MS = 9000;

/** Hard ceiling per broadcast. Well under what trips WhatsApp's limits. */
export const MAX_WAHA_RECIPIENTS = 200;

export interface WahaBroadcastRecipient {
  recipientRowId: string;
  phone: string;
  /** Contact name, substituted into {{nome}} in the body. */
  name: string | null;
}

export interface WahaBroadcastPlan {
  broadcastId: string;
  sessionName: string;
  messageText: string;
  recipients: WahaBroadcastRecipient[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomGap(): number {
  return MIN_GAP_MS + Math.floor(Math.random() * (MAX_GAP_MS - MIN_GAP_MS));
}

/**
 * Substitute the supported placeholders. Deliberately tiny: `{{nome}}`
 * is the one personalisation that materially changes how a broadcast
 * reads, and every extra token is another thing that can render as
 * literal braces in a customer's chat.
 */
export function renderBroadcastBody(
  template: string,
  recipient: WahaBroadcastRecipient
): string {
  const name = recipient.name?.trim() || '';
  return template.replace(/\{\{\s*nome\s*\}\}/gi, name);
}

/**
 * Send a plain-text broadcast, one recipient at a time, pausing between
 * each. Every recipient row is stamped as it completes, so a broadcast
 * interrupted midway (deploy, timeout) leaves an accurate record of
 * what actually went out rather than a silent partial send.
 *
 * Per-recipient failures never abort the run — one bad number
 * shouldn't cost the rest of the list.
 */
export async function deliverWahaBroadcast(
  db: SupabaseClient,
  plan: WahaBroadcastPlan
): Promise<{ sent: number; failed: number }> {
  let server: WahaServer;
  try {
    server = resolveWahaServer();
  } catch (err) {
    // No server configured at all — fail the whole broadcast loudly
    // rather than marking every recipient individually failed.
    await db
      .from('broadcasts')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', plan.broadcastId);
    throw err;
  }

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < plan.recipients.length; i++) {
    const recipient = plan.recipients[i];
    const body = renderBroadcastBody(plan.messageText, recipient);

    try {
      const { messageId } = await sendText(
        server,
        plan.sessionName,
        recipient.phone,
        body
      );
      sent++;
      await db
        .from('broadcast_recipients')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          whatsapp_message_id: messageId || null,
          error_message: null,
        })
        .eq('id', recipient.recipientRowId);
    } catch (err) {
      failed++;
      await db
        .from('broadcast_recipients')
        .update({
          status: 'failed',
          error_message: err instanceof Error ? err.message : 'Unknown error',
        })
        .eq('id', recipient.recipientRowId);
    }

    // Pace every gap except the last — no reason to idle after the
    // final send before finalising the broadcast.
    if (i < plan.recipients.length - 1) {
      await sleep(randomGap());
    }
  }

  await db
    .from('broadcasts')
    .update({
      status: sent > 0 ? 'sent' : 'failed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', plan.broadcastId);

  return { sent, failed };
}
