// ============================================================
// Plain-text broadcast over a QR-paired (WAHA) session.
//
// Separate from /api/whatsapp/broadcast rather than bolted onto it:
// that route is built around Meta templates (approval state, language,
// positional variables, per-recipient template params) and none of it
// applies here. Sharing it would mean threading a second, mostly-null
// shape through every branch.
//
// Persist-then-fan-out, like the Meta route: the row and its recipients
// land first and the HTTP call returns, so the caller isn't held open
// for the length of a deliberately slow send.
// ============================================================

import { after } from 'next/server';
import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import {
  MAX_WAHA_RECIPIENTS,
  deliverWahaBroadcast,
  type WahaBroadcastRecipient,
} from '@/lib/waha/broadcast';
import { sanitizePhoneForMeta, isValidE164 } from '@/lib/whatsapp/phone-utils';

interface Body {
  name?: string;
  message_text?: string;
  /** Contacts to send to. Resolved to phone + name server-side. */
  contact_ids?: string[];
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limit = checkRateLimit(`broadcast:${user.id}`, RATE_LIMITS.broadcast);
  if (!limit.success) return rateLimitResponse(limit);

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .maybeSingle();
  const accountId = profile?.account_id as string | undefined;
  if (!accountId) {
    return NextResponse.json({ error: 'No account found' }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const messageText = body.message_text?.trim();
  const contactIds = body.contact_ids ?? [];

  if (!messageText) {
    return NextResponse.json(
      { error: 'Escreva a mensagem que será enviada.' },
      { status: 400 }
    );
  }
  if (contactIds.length === 0) {
    return NextResponse.json(
      { error: 'Selecione ao menos um contato.' },
      { status: 400 }
    );
  }
  if (contactIds.length > MAX_WAHA_RECIPIENTS) {
    return NextResponse.json(
      {
        error: `Máximo de ${MAX_WAHA_RECIPIENTS} contatos por envio. Enviar para mais que isso de uma vez aumenta muito o risco de bloqueio do seu número pelo WhatsApp.`,
      },
      { status: 400 }
    );
  }

  // The session must be live *now* — starting a slow fan-out against a
  // dead session would just mark every recipient failed.
  const { data: waha } = await supabase
    .from('waha_config')
    .select('session_name, status')
    .eq('account_id', accountId)
    .maybeSingle();

  if (!waha) {
    return NextResponse.json(
      { error: 'WhatsApp não está conectado. Conecte lendo o QR Code em Configurações.' },
      { status: 400 }
    );
  }
  if (waha.status !== 'WORKING') {
    return NextResponse.json(
      { error: 'A conexão com o WhatsApp caiu. Reconecte em Configurações → WhatsApp.' },
      { status: 409 }
    );
  }

  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, phone, name')
    .eq('account_id', accountId)
    .in('id', contactIds);

  const usable = (contacts ?? []).filter((c) =>
    isValidE164(sanitizePhoneForMeta(c.phone))
  );
  if (usable.length === 0) {
    return NextResponse.json(
      { error: 'Nenhum contato selecionado tem um número de telefone válido.' },
      { status: 400 }
    );
  }

  const { data: broadcast, error: broadcastError } = await supabase
    .from('broadcasts')
    .insert({
      account_id: accountId,
      user_id: user.id,
      name: body.name?.trim() || 'Transmissão',
      message_text: messageText,
      status: 'sending',
      total_recipients: usable.length,
    })
    .select('id')
    .single();

  if (broadcastError || !broadcast) {
    console.error('[waha/broadcast] create failed:', broadcastError);
    return NextResponse.json(
      { error: 'Não foi possível criar a transmissão.' },
      { status: 500 }
    );
  }

  const { data: recipientRows, error: recipientsError } = await supabase
    .from('broadcast_recipients')
    .insert(
      usable.map((c) => ({
        broadcast_id: broadcast.id,
        contact_id: c.id,
        status: 'pending',
      }))
    )
    .select('id, contact_id');

  if (recipientsError || !recipientRows) {
    console.error('[waha/broadcast] recipients failed:', recipientsError);
    await supabase.from('broadcasts').update({ status: 'failed' }).eq('id', broadcast.id);
    return NextResponse.json(
      { error: 'Não foi possível preparar os destinatários.' },
      { status: 500 }
    );
  }

  const byContact = new Map(usable.map((c) => [c.id, c]));
  const recipients: WahaBroadcastRecipient[] = recipientRows.map((row) => {
    const contact = byContact.get(row.contact_id as string);
    return {
      recipientRowId: row.id as string,
      phone: sanitizePhoneForMeta(contact!.phone),
      name: contact?.name ?? null,
    };
  });

  // Fan out after responding. Deliberately paced (see deliverWahaBroadcast),
  // so this outlives the request by design.
  after(async () => {
    try {
      await deliverWahaBroadcast(supabase, {
        broadcastId: broadcast.id,
        sessionName: waha.session_name,
        messageText,
        recipients,
      });
    } catch (err) {
      console.error('[waha/broadcast] delivery failed:', err);
    }
  });

  return NextResponse.json({
    id: broadcast.id,
    total_recipients: recipients.length,
    // The caller shows this: at ~4-9s per message the wait is real and
    // worth setting expectations about up front.
    estimated_seconds: Math.round(recipients.length * 6.5),
  });
}
