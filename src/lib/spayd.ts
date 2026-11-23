/**
 * Utility for Short Payment Descriptor (SPAYD) generation.
 * Spec: http://www.spayd.org/
 */

export interface SpaydOptions {
  iban: string;
  amount?: number | string;
  currency?: string;
  vs?: string;
  ks?: string;
  ss?: string;
  msg?: string;
}

export function generateSpaydString(options: SpaydOptions): string {
  const { iban, amount, currency, vs, ks, ss, msg } = options;

  if (!iban) return "";

  // Clean IBAN (remove spaces)
  const cleanIban = iban.replace(/\s+/g, "").toUpperCase();

  let spayd = `SPD*1.0*ACC:${cleanIban}*PT:IP`;

  if (amount) {
    const formattedAmount = Number(amount).toFixed(2);
    spayd += `*AM:${formattedAmount}`;
  }

  if (currency) {
    spayd += `*CC:${currency.toUpperCase()}`;
  }

  if (vs) {
    spayd += `*X-VS:${String(vs).slice(0, 10)}`;
  }

  if (ks) {
    spayd += `*X-KS:${String(ks).slice(0, 4)}`;
  }

  if (ss) {
    spayd += `*X-SS:${String(ss).slice(0, 10)}`;
  }

  if (msg) {
    // Message should be URL encoded or at least limited in chars
    // SPAYD spec says restricted charset, but most readers handle basic accents
    const cleanMsg = msg.substring(0, 60).replace(/\*/g, " ");
    spayd += `*MSG:${cleanMsg}`;
  }

  return spayd;
}

/**
 * Sestaví URL pro externí generátor Paylibo (obrázek nebo SPAYD řetězec).
 */
export function buildPayliboUrl(
  kind: "image" | "string",
  options: SpaydOptions & { size?: number; branding?: boolean },
): string | null {
  const { iban, amount, currency, vs, ks, msg, size, branding } = options;
  if (!iban) return null;

  const cleanIban = iban.replace(/\s+/g, "").toUpperCase();
  if (cleanIban.length < 15) return null;

  const params = new URLSearchParams({ iban: cleanIban });

  if (amount !== undefined && amount !== "") {
    params.append("amount", Number(amount).toFixed(2));
  }
  if (currency) params.append("currency", currency.toUpperCase());
  if (vs) params.append("vs", String(vs).slice(0, 10));
  if (ks) params.append("ks", String(ks).slice(0, 4));
  if (msg) params.append("message", msg.substring(0, 60));

  if (kind === "image") {
    if (size !== undefined) params.append("size", String(size));
    if (branding !== undefined) params.append("branding", String(branding));
  }

  return `http://api.paylibo.com/paylibo/generator/${kind}?${params.toString()}`;
}
