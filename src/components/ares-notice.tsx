import { AlertTriangle, CheckCircle2 } from "lucide-react";

type Variant = { tone: "ok" | "warning"; title: string; detail: string };

const messages: Record<string, Variant> = {
  ok: {
    tone: "ok",
    title: "Subjekt byl ověřen v ARES.",
    detail: "Registrové údaje byly aktualizovány.",
  },
  risk: {
    tone: "warning",
    title: "Subjekt byl ověřen v ARES – pozor na rizikový stav.",
    detail: "Zkontrolujte insolvenční / likvidační stav níže.",
  },
  notFound: {
    tone: "warning",
    title: "Subjekt s tímto IČO nebyl v ARES nalezen.",
    detail: "Zkontrolujte IČO subjektu.",
  },
  invalid: {
    tone: "warning",
    title: "Neplatné IČO.",
    detail: "Subjekt nemá vyplněné platné české IČO.",
  },
  error: {
    tone: "warning",
    title: "Ověření v ARES se nezdařilo.",
    detail: "ARES je nedostupný nebo došlo k chybě. Zkuste to prosím znovu.",
  },
};

const toneStyles: Record<Variant["tone"], string> = {
  ok: "border-[#B9DCC6] bg-[#B9DCC6]/30 text-[#072924]",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
};

/** Renders the outcome of an ARES verification (via ?ares=). */
export function AresNotice({ status }: { status?: string }) {
  const message = status ? messages[status] : null;
  if (!message) {
    return null;
  }

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-4 ${toneStyles[message.tone]}`}
    >
      {message.tone === "ok" ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      ) : (
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      )}
      <div>
        <p className="font-semibold">{message.title}</p>
        <p className="text-sm">{message.detail}</p>
      </div>
    </div>
  );
}
