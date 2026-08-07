"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { MessageSquarePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { normalizePhone } from "@/lib/whatsapp/phone-utils";
import { findExistingContact, isUniqueViolation } from "@/lib/contacts/dedupe";
import {
  CONVERSATION_SELECT,
  normalizeConversation,
} from "@/lib/inbox/conversations";
import type { Conversation } from "@/types";

interface NewConversationDialogProps {
  /** Called with the found-or-created conversation so the inbox can
   *  select it immediately. */
  onCreated: (conversation: Conversation) => void;
}

/**
 * "Start a conversation" entry point for a number that isn't in the
 * contact list yet — mirrors a common competitor feature. Reuses the
 * exact contact de-dup helper the manual Add Contact form and CSV
 * import already rely on (issue #212), so "same number" means the
 * same thing everywhere.
 *
 * WhatsApp policy note: a freshly-created conversation has zero
 * messages, so the composer's existing zero-message state already
 * steers the agent toward "send a template" — free-text to a contact
 * who has never messaged in isn't allowed outside the 24h window, and
 * this dialog doesn't try to work around that.
 */
export function NewConversationDialog({ onCreated }: NewConversationDialogProps) {
  const t = useTranslations("Inbox.newConversation");
  const { accountId, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setPhone("");
    setName("");
  }

  async function handleSubmit() {
    if (!accountId || !user) return;
    const digits = normalizePhone(phone);
    if (digits.length < 10) {
      toast.error(t("invalidPhoneToast"));
      return;
    }
    const fullPhone = `+${digits.startsWith("55") ? digits : `55${digits}`}`;
    setSubmitting(true);
    const supabase = createClient();
    try {
      let contact = await findExistingContact(supabase, accountId, fullPhone);

      if (!contact) {
        const { data: created, error: createErr } = await supabase
          .from("contacts")
          .insert({
            account_id: accountId,
            user_id: user.id,
            phone: fullPhone,
            name: name.trim() || null,
          })
          .select("*")
          .single();
        if (createErr) {
          // Lost a race with another insert of the same number —
          // re-resolve instead of failing (same pattern the webhook uses).
          if (isUniqueViolation(createErr)) {
            contact = await findExistingContact(supabase, accountId, fullPhone);
          }
          if (!contact) throw createErr;
        } else {
          contact = created;
        }
      }
      if (!contact) throw new Error("Could not resolve contact");

      const { data: existingConv, error: findConvErr } = await supabase
        .from("conversations")
        .select(CONVERSATION_SELECT)
        .eq("account_id", accountId)
        .eq("contact_id", contact.id)
        .maybeSingle();
      if (findConvErr) throw findConvErr;

      let conversation = existingConv;
      if (!conversation) {
        const { data: createdConv, error: createConvErr } = await supabase
          .from("conversations")
          .insert({
            account_id: accountId,
            user_id: user.id,
            contact_id: contact.id,
            status: "open",
          })
          .select(CONVERSATION_SELECT)
          .single();
        if (createConvErr) throw createConvErr;
        conversation = createdConv;
      }

      onCreated(normalizeConversation(conversation));
      toast.success(t("createdToast"));
      setOpen(false);
      reset();
    } catch (err) {
      console.error("[NewConversationDialog] error:", err);
      toast.error(t("errorToast"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        title={t("trigger")}
        aria-label={t("trigger")}
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <MessageSquarePlus className="h-4 w-4" />
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) reset();
          setOpen(next);
        }}
      >
        <DialogContent className="bg-popover border-border sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">
              {t("title")}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t("description")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-muted-foreground">{t("phoneLabel")}</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t("phonePlaceholder")}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">{t("phoneHint")}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">{t("nameLabel")}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("namePlaceholder")}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>

          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {submitting ? t("creating") : t("submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
