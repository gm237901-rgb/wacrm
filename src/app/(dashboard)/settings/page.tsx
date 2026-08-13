'use client';

import { useTranslations } from 'next-intl';

import { LegacyMetaConfig } from '@/components/settings/legacy-meta-config';
import { WahaConnect } from '@/components/settings/waha-connect';

/**
 * Settings — the WhatsApp connection, and nothing else.
 *
 * This page used to be a ten-section rail (profile, security,
 * appearance, templates, quick replies, fields, deals, members, API
 * keys). Everything that isn't the WhatsApp connection now lives on
 * /conta, reached from the account menu: none of it disappeared, it
 * just stopped competing for attention with the one setting an
 * operator actually opens this page to change.
 *
 * No `?tab=` handling and no Suspense boundary any more — with a
 * single section there is no query string to read, which also removes
 * the CSR-bailout hazard the old comment here warned about.
 */
export default function SettingsPage() {
  const t = useTranslations('Settings');

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t('sections.whatsapp')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('whatsappDesc')}</p>
      </div>

      {/* QR pairing is the connection path. The Meta Cloud API form only
          surfaces for accounts already set up on it (see LegacyMetaConfig)
          — asking everyone else for credentials they don't have made the
          page read as broken. */}
      <div className="space-y-6">
        <WahaConnect />
        <LegacyMetaConfig />
      </div>
    </div>
  );
}
