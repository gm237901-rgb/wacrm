"use client";

// ============================================================
// The Meta Cloud API form, shown only where it's still relevant.
//
// Connecting by QR code is the path this product leads with: it asks
// nothing of the user beyond their phone. The Meta form asks for a
// phone number id, a business account id, a permanent access token and
// a webhook verify token — none of which a non-technical customer has,
// or can get without going through Meta's app review.
//
// Leaving it on screen made the settings page contradict itself: a
// "Not connected — configure your Meta API credentials" panel sitting
// under a working QR connection. So it renders only for accounts that
// already have Meta configured (who'd lose access to their own setup
// otherwise) and stays out of everyone else's way.
// ============================================================

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { WhatsAppConfig } from "@/components/settings/whatsapp-config";

export function LegacyMetaConfig() {
  const { accountId } = useAuth();
  const [hasMetaConfig, setHasMetaConfig] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    void createClient()
      .from("whatsapp_config")
      .select("id")
      .eq("account_id", accountId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setHasMetaConfig(!!data);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  if (!hasMetaConfig) return null;
  return <WhatsAppConfig />;
}
