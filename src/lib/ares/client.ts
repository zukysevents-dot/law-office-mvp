/**
 * Outbound ARES REST client: a hard timeout, explicit HTTP-status handling,
 * typed-shape validation, and Czech messages.
 *
 * Returns a discriminated union instead of throwing for expected outcomes
 * (not found / transient error) so Server Actions can surface a real message —
 * a thrown error in a Server Action is stripped to a generic digest in prod.
 */

import { getAresBaseUrl } from "@/lib/ares/config";

const FETCH_TIMEOUT_MS = 15_000;

export type AresRawSubject = {
  ico?: string;
  obchodniJmeno?: string;
  sidlo?: { textovaAdresa?: string } | null;
  dic?: string | null;
  pravniForma?: string | null;
  datumZaniku?: string | null;
  seznamRegistraci?: Record<string, string> | null;
};

export type AresFetchResult =
  | { status: "ok"; data: AresRawSubject }
  | { status: "not_found"; message: string }
  | { status: "error"; message: string };

/** Fetch one economic subject by its normalized (8-digit) IČO. */
export async function fetchAresSubject(ico: string): Promise<AresFetchResult> {
  const url = `${getAresBaseUrl()}/ekonomicke-subjekty/${encodeURIComponent(ico)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      // External, frequently-changing data — never serve a stale cached body.
      cache: "no-store",
    });
  } catch (error) {
    const timedOut =
      error instanceof DOMException && error.name === "TimeoutError";
    return {
      status: "error",
      message: timedOut
        ? "Spojení s ARES vypršelo. Zkuste to prosím znovu."
        : "Spojení s ARES se nezdařilo. Zkontrolujte připojení k internetu.",
    };
  }

  if (res.status === 404) {
    return {
      status: "not_found",
      message: "Subjekt s tímto IČO nebyl v ARES nalezen.",
    };
  }
  if (res.status === 429) {
    return {
      status: "error",
      message: "ARES je dočasně přetížen, zkuste to prosím za chvíli.",
    };
  }
  if (!res.ok) {
    return { status: "error", message: `ARES vrátil chybu (${res.status}).` };
  }

  let data: AresRawSubject;
  try {
    data = (await res.json()) as AresRawSubject;
  } catch {
    return { status: "error", message: "Neplatná odpověď z ARES." };
  }

  // Shape-validate before trusting the payload.
  if (typeof data.ico !== "string" || typeof data.obchodniJmeno !== "string") {
    return { status: "error", message: "Neplatná odpověď z ARES." };
  }

  return { status: "ok", data };
}
