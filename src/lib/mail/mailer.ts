import nodemailer, { type Transporter } from "nodemailer";

// Single source of truth for outgoing e-mail (SMTP via nodemailer): the
// notification outbox, invoice e-mails, the client portal and the user
// invitations all go through this transport.

type Env = Record<string, string | undefined>;

export type MailDisabledReason =
  | "EMAIL_NOTIFICATIONS_DISABLED"
  | "SMTP_HOST_NOT_CONFIGURED"
  | "SMTP_FROM_NOT_CONFIGURED";

export type MailConfigStatus =
  | { enabled: true }
  | { enabled: false; reason: MailDisabledReason };

export type SendMailResult =
  | { status: "SENT" }
  | { status: "DISABLED"; reason: MailDisabledReason }
  | { status: "FAILED"; error: string };

// A dead or slow SMTP host must not freeze a server action (e.g. "Vytvořit
// uživatele" sends the invitation synchronously) — cap every phase.
export const SMTP_TIMEOUTS = {
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
} as const;

export function envFlag(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

export function envNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return value !== undefined && value.trim() !== "" && Number.isFinite(parsed)
    ? parsed
    : fallback;
}

/** Pure: is outgoing e-mail configured, and if not, why. */
export function mailConfigStatus(env: Env = process.env): MailConfigStatus {
  if (!envFlag(env.EMAIL_NOTIFICATIONS_ENABLED)) {
    return { enabled: false, reason: "EMAIL_NOTIFICATIONS_DISABLED" };
  }
  if (!env.SMTP_HOST?.trim()) {
    return { enabled: false, reason: "SMTP_HOST_NOT_CONFIGURED" };
  }
  if (!env.SMTP_FROM?.trim()) {
    return { enabled: false, reason: "SMTP_FROM_NOT_CONFIGURED" };
  }
  return { enabled: true };
}

export const mailDisabledReasonLabels: Record<MailDisabledReason, string> = {
  EMAIL_NOTIFICATIONS_DISABLED:
    "odesílání e-mailů je na serveru vypnuté (EMAIL_NOTIFICATIONS_ENABLED)",
  SMTP_HOST_NOT_CONFIGURED: "chybí adresa SMTP serveru (SMTP_HOST)",
  SMTP_FROM_NOT_CONFIGURED: "chybí adresa odesílatele (SMTP_FROM)",
};

export function mailDisabledReasonLabel(reason: MailDisabledReason): string {
  return mailDisabledReasonLabels[reason];
}

/** Absolute link into the app (APP_BASE_URL, falls back to the dev server). */
export function appUrl(path: string, env: Env = process.env) {
  const baseUrl = env.APP_BASE_URL?.trim() || "http://127.0.0.1:3001";
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl.replace(/\/+$/, "")}${suffix}`;
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Plain text → minimal escaped HTML (line breaks kept). */
export function emailHtml(body: string) {
  return escapeHtml(body).replaceAll("\n", "<br />");
}

export function truncateMailError(error: unknown, max = 200) {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > max ? `${message.slice(0, max)}…` : message;
}

let smtpTransporter: Transporter | null = null;

export function getSmtpTransporter(): Transporter | null {
  if (!mailConfigStatus().enabled) {
    return null;
  }

  if (!smtpTransporter) {
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASSWORD?.trim();

    smtpTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST?.trim(),
      port: envNumber(process.env.SMTP_PORT, 587),
      secure: envFlag(process.env.SMTP_SECURE),
      auth: user && pass ? { user, pass } : undefined,
      ...SMTP_TIMEOUTS,
    });
  }

  return smtpTransporter;
}

type MailTransport = Pick<Transporter, "sendMail">;

/**
 * Sends one e-mail. Never throws: returns SENT, DISABLED (+ reason, SMTP not
 * configured) or FAILED (+ truncated error). `transport` is injectable for
 * tests; by default the shared SMTP transporter is used.
 */
export async function sendMail(
  message: { to: string; subject: string; text: string; html?: string },
  options: { env?: Env; transport?: MailTransport | null } = {},
): Promise<SendMailResult> {
  const env = options.env ?? process.env;
  const config = mailConfigStatus(env);
  if (!config.enabled) {
    return { status: "DISABLED", reason: config.reason };
  }

  const transport =
    options.transport !== undefined ? options.transport : getSmtpTransporter();
  if (!transport) {
    return { status: "DISABLED", reason: "EMAIL_NOTIFICATIONS_DISABLED" };
  }

  try {
    await transport.sendMail({
      from: env.SMTP_FROM?.trim(),
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html ?? emailHtml(message.text),
    });
    return { status: "SENT" };
  } catch (error) {
    return { status: "FAILED", error: truncateMailError(error) };
  }
}
