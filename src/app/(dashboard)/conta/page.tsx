'use client';

import { useTranslations } from 'next-intl';

import { ProfileForm } from '@/components/settings/profile-form';
import { SecurityPanel } from '@/components/settings/security-panel';
import { QuickRepliesManager } from '@/components/settings/quick-replies-manager';
import { FieldsAndTagsPanel } from '@/components/settings/fields-and-tags-panel';
import { MembersTab } from '@/components/settings/members-tab';
import { ApiKeysSettings } from '@/components/settings/api-keys-settings';

/**
 * Account — everything Settings used to hold except the WhatsApp
 * connection.
 *
 * These panels are rarely opened but not optional: password changes
 * live in Security, the quick replies the inbox composer offers are
 * created in Quick replies, and the tags on every contact come from
 * Fields & tags. Deleting them to slim down Settings would have cost
 * real capability, so they moved here — off the sidebar, one click
 * from the account menu — rather than out of the product.
 *
 * Stacked rather than tabbed on purpose: six sections is short enough
 * to scroll, and a rail for six rarely-visited panels is the kind of
 * navigation furniture that made the old Settings feel heavy.
 */
export default function AccountPage() {
  const t = useTranslations('Account');

  return (
    <div className="max-w-3xl space-y-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t('title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <ProfileForm />
      <SecurityPanel />
      <QuickRepliesManager />
      <FieldsAndTagsPanel />
      <MembersTab />
      <ApiKeysSettings />
    </div>
  );
}
