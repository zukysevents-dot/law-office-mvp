import { getSmtpTransporter } from "@/lib/notifications/notification-service";

// Sends the magic-link e-mail via the shared SMTP transporter. Returns false
// (without throwing) when e-mail isn't configured, so the login flow can stay
// generic and not leak whether delivery happened.
export async function sendPortalLinkEmail(
  to: string,
  url: string,
): Promise<boolean> {
  const transporter = getSmtpTransporter();
  if (!transporter) {
    return false;
  }

  const text = [
    "Dobrý den,",
    "",
    "pro přihlášení do klientského portálu otevřete tento odkaz (platí 15 minut a lze jej použít jen jednou):",
    url,
    "",
    "Pokud jste o přihlášení nežádali, tento e-mail ignorujte.",
  ].join("\n");

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject: "Přihlášení do klientského portálu",
      text,
    });
    return true;
  } catch {
    // Delivery failure is operational, not a security signal — stay quiet.
    return false;
  }
}

export function portalLinkUrl(token: string): string {
  const baseUrl = process.env.APP_BASE_URL?.trim() || "http://127.0.0.1:3001";
  return `${baseUrl.replace(/\/$/, "")}/portal/verify?token=${encodeURIComponent(token)}`;
}
