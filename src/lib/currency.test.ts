import { describe, expect, it } from "vitest";
import {
  DEFAULT_CURRENCY,
  formatCompactNumber,
  formatCurrency,
  formatCurrencyShort,
} from "./currency";

/** Intl separates symbol from digits with a non-breaking space in
 *  pt-BR. Normalizing keeps the assertions readable. */
const plain = (s: string) => s.replace(/ /g, " ");

describe("formatCurrency", () => {
  it("formats in reais with pt-BR grouping and no centavos", () => {
    expect(plain(formatCurrency(1234))).toBe("R$ 1.234");
  });

  it("groups large amounts with dots, never commas", () => {
    const out = plain(formatCurrency(300_000));
    expect(out).toBe("R$ 300.000");
    expect(out).not.toContain(",");
  });

  it("pins the locale so output never follows the viewer's browser", () => {
    // The bug this guards: Intl.NumberFormat(undefined, …) resolved to
    // the viewer's locale and rendered "BRL300,000" on English systems.
    expect(plain(formatCurrency(300_000))).not.toContain("BRL");
  });

  it("coerces non-finite values to zero", () => {
    expect(plain(formatCurrency(Number.NaN))).toBe("R$ 0");
  });

  it("is the only currency the CRM stores", () => {
    expect(DEFAULT_CURRENCY).toBe("BRL");
  });
});

describe("formatCurrencyShort", () => {
  it("abbreviates millions and thousands behind the real symbol", () => {
    expect(formatCurrencyShort(2_500_000)).toBe("R$2.5M");
    expect(formatCurrencyShort(3_400)).toBe("R$3.4k");
    expect(formatCurrencyShort(900)).toBe("R$900");
  });
});

describe("formatCompactNumber", () => {
  it("abbreviates without any currency marker", () => {
    expect(formatCompactNumber(1_200_000)).toBe("1.2M");
    expect(formatCompactNumber(1_234)).toBe("1.2k");
    expect(formatCompactNumber(900)).toBe("900");
  });
});
