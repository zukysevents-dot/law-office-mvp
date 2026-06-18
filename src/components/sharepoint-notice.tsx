import { AlertTriangle } from "lucide-react";

const messages: Record<string, { title: string; detail: string }> = {
  failed: {
    title: "Složku se nepodařilo založit.",
    detail:
      "Zkontrolujte nastavení Microsoft 365 / SharePointu (SHAREPOINT_SITE_URL nebo MICROSOFT_*).",
  },
  graphFailed: {
    title: "Vytvoření složky přes Microsoft Graph selhalo.",
    detail:
      "Uložili jsme odkaz podle konvence; složku může být potřeba vytvořit v SharePointu ručně.",
  },
};

/** Renders a warning when SharePoint folder provisioning reported a problem (via ?sharepoint=). */
export function SharepointNotice({ status }: { status?: string }) {
  const message = status ? messages[status] : null;
  if (!message) {
    return null;
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">{message.title}</p>
        <p className="text-sm">{message.detail}</p>
      </div>
    </div>
  );
}
