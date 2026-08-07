"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Copy, ExternalLink, Link2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { normalizePhone } from "@/lib/whatsapp/phone-utils";

/**
 * Standalone wa.me link generator — no Cloud API call involved, so it
 * works for any number (in or out of the contact list) and needs no
 * WhatsApp Business configuration. Mirrors a common competitor feature:
 * paste a number + optional message, get a shareable
 * https://wa.me/<number>?text=<message> link that opens the sender's
 * own WhatsApp (app or web) with the message pre-filled.
 */
export function WhatsAppLinkDialog() {
  const t = useTranslations("WhatsAppLink");
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState<string | null>(null);

  function reset() {
    setPhone("");
    setMessage("");
    setLink(null);
  }

  function handleGenerate() {
    // Digits only; if the caller didn't include a country code, assume
    // Brazil (55) since this build targets the Brazilian market.
    const digits = normalizePhone(phone);
    if (digits.length < 10) {
      toast.error(t("invalidPhoneToast"));
      return;
    }
    const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
    const query = message.trim()
      ? `?text=${encodeURIComponent(message.trim())}`
      : "";
    setLink(`https://wa.me/${withCountry}${query}`);
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success(t("copiedToast"));
    } catch {
      toast.error(t("copyFailedToast"));
    }
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="border-border text-muted-foreground hover:bg-muted"
      >
        <Link2 className="size-4" />
        {t("trigger")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) reset();
          setOpen(next);
        }}
      >
      <DialogContent className="bg-popover border-border sm:max-w-md">
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
              onChange={(e) => {
                setPhone(e.target.value);
                setLink(null);
              }}
              placeholder={t("phonePlaceholder")}
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
            />
            <p className="text-xs text-muted-foreground">{t("phoneHint")}</p>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">
              {t("messageLabel")}
            </Label>
            <Textarea
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                setLink(null);
              }}
              placeholder={t("messagePlaceholder")}
              className="min-h-24 bg-muted border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {link && (
            <div className="space-y-2">
              <Label className="text-muted-foreground">{t("linkLabel")}</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={link}
                  onFocus={(e) => e.currentTarget.select()}
                  className="bg-muted border-border text-foreground font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={copyLink}
                  className="shrink-0 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <Copy className="size-4" />
                </Button>
              </div>
              <a
                href={link}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80"
              >
                <ExternalLink className="size-3.5" />
                {t("openBtn")}
              </a>
            </div>
          )}
        </div>

        <DialogFooter className="bg-popover border-border">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            className="border-border text-muted-foreground hover:bg-muted"
          >
            {t("closeBtn")}
          </Button>
          <Button
            onClick={handleGenerate}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {t("generateBtn")}
          </Button>
        </DialogFooter>
      </DialogContent>
      </Dialog>
    </>
  );
}
