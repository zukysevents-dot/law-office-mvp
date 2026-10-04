import { getSmtpTransporter } from "@/lib/notifications/notification-service";

export function isEmailVerificationDeliveryAvailable(): boolean {
  return getSmtpTransporter() !== null;
}

export async function sendEmailVerification(
  to: string,
  url: string,
): Promise<boolean> {
  const transporter = getSmtpTransporter();
  if (!transporter) return false;

  const text = [
    "Dobrý den,",
    "",
    "potvrďte svou e-mailovou adresu a dokončete registraci do IURIVERSE:",
    url,
    "",
    "Odkaz platí 24 hodin. Pokud jste o registraci nežádali, tento e-mail ignorujte; žádný účet zatím nevznikl.",
  ].join("\n");

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject: "Potvrzení e-mailu pro IURIVERSE",
      text,
    });
    return true;
  } catch (error) {
    console.error("e-mail verification delivery failed", error);
    return false;
  }
}

// Existing addresses take the same SMTP path as new registrations, reducing a
// large network-timing oracle. The mailbox owner gets a useful security notice;
// the anonymous caller still receives the identical generic response.
export async function sendExistingRegistrationNotice(
  to: string,
): Promise<boolean> {
  const transporter = getSmtpTransporter();
  if (!transporter) return false;

  const text = [
    "Dobrý den,",
    "",
    "někdo se pokusil zaregistrovat do IURIVERSE s touto e-mailovou adresou.",
    "Účet s adresou už existuje, proto jsme žádnou změnu neprovedli.",
    "",
    "Pokud jste to nebyli vy, můžete tento e-mail ignorovat.",
  ].join("\n");

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject: "Pokus o registraci do IURIVERSE",
      text,
    });
    return true;
  } catch (error) {
    console.error("existing registration notice delivery failed", error);
    return false;
  }
}
