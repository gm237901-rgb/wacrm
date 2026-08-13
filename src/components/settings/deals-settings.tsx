"use client";

import { Coins } from "lucide-react";

import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { SettingsPanelHead } from "./settings-panel-head";

/**
 * Deals settings — currency.
 *
 * The CRM is real-only, so there is nothing to pick here. The panel
 * stays as a statement of fact rather than disappearing: an account
 * that sees "R$" everywhere should be able to find out why, and the
 * settings rail already links here.
 */
export function DealsSettings() {
  const t = useTranslations("Settings.deals");

  return (
    <section className="max-w-2xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead title={t("title")} description={t("description")} />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Coins className="size-4 text-primary" />
            {t("defaultCurrency")}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {t("currencyNote")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-medium text-foreground">
            {t("currencyName")}
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
