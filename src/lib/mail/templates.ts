import { escapeHtml } from "@/lib/mail/mailer";

// Pure e-mail templates (subject + plain text + escaped HTML). No secrets:
// an invitation never contains a password, only a one-time link.

export type EmailContent = { subject: string; text: string; html: string };

function paragraphsToHtml(paragraphs: string[]) {
  const body = paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 14px">${escapeHtml(paragraph).replaceAll("\n", "<br />")}</p>`,
    )
    .join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#0e1822">${body}</div>`;
}

function linkHtml(url: string) {
  const safe = escapeHtml(url);
  return `<a href="${safe}" style="color:#0b6f6f">${safe}</a>`;
}

export function buildUserInvitationEmail({
  userName,
  email,
  organizationName,
  createdByName,
  loginUrl,
  setPasswordUrl,
  ttlHours,
}: {
  userName: string;
  email: string;
  organizationName: string;
  createdByName: string;
  loginUrl: string;
  setPasswordUrl: string;
  ttlHours: number;
}): EmailContent {
  const subject = `Přístup do IURIVERSE – ${organizationName}`;
  const intro = [
    `Dobrý den, ${userName},`,
    `v kanceláři ${organizationName} vám byl založen účet v aplikaci IURIVERSE.`,
  ];
  const details = [
    `Účet založil(a): ${createdByName}`,
    `Přihlašovací e-mail: ${email}`,
    `Přihlásit se můžete zde: ${loginUrl}`,
  ];
  const setPassword = `Počáteční heslo vám předá ${createdByName}. Vlastní heslo si můžete nastavit hned tímto odkazem (platí ${ttlHours} hodin a lze ho použít jen jednou):`;
  const footer =
    "Pokud jste o účet nežádali, tento e-mail ignorujte a kontaktujte správce kanceláře.";

  const text = [
    intro.join("\n\n"),
    details.join("\n"),
    `${setPassword}\n${setPasswordUrl}`,
    footer,
  ].join("\n\n");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#0e1822">
<p style="margin:0 0 14px">${escapeHtml(intro[0])}</p>
<p style="margin:0 0 14px">${escapeHtml(intro[1])}</p>
<p style="margin:0 0 14px">Účet založil(a): ${escapeHtml(createdByName)}<br />Přihlašovací e-mail: ${escapeHtml(email)}<br />Přihlásit se můžete zde: ${linkHtml(loginUrl)}</p>
<p style="margin:0 0 14px">${escapeHtml(setPassword)}<br /><a href="${escapeHtml(setPasswordUrl)}" style="display:inline-block;margin-top:8px;padding:10px 16px;border-radius:6px;background:#0e1822;color:#ffffff;text-decoration:none">Nastavit si vlastní heslo</a></p>
<p style="margin:0 0 14px;font-size:13px;color:#566673">Pokud tlačítko nefunguje, zkopírujte do prohlížeče: ${escapeHtml(setPasswordUrl)}</p>
<p style="margin:0;font-size:13px;color:#566673">${escapeHtml(footer)}</p>
</div>`;

  return { subject, text, html };
}

export function buildMemberJoinedEmail({
  memberName,
  memberEmail,
  organizationName,
  joinCodeLabel,
  roleLabel,
  settingsUrl,
}: {
  memberName: string;
  memberEmail: string;
  organizationName: string;
  joinCodeLabel?: string | null;
  roleLabel: string;
  settingsUrl: string;
}): EmailContent {
  const subject = `Nový člen kanceláře ${organizationName}`;
  const code = joinCodeLabel?.trim() ? ` „${joinCodeLabel.trim()}“` : "";
  const paragraphs = [
    "Dobrý den,",
    `${memberName} (${memberEmail}) se právě připojil(a) ke kanceláři ${organizationName} pomocí registračního kódu${code}. Výchozí role: ${roleLabel}.`,
    `Roli a oprávnění zkontrolujete v Nastavení: ${settingsUrl}`,
  ];
  return {
    subject,
    text: paragraphs.join("\n\n"),
    html: paragraphsToHtml(paragraphs),
  };
}
