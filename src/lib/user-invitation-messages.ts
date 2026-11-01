import {
  mailDisabledReasonLabel,
  type MailDisabledReason,
} from "@/lib/mail/mailer";

// Pure result type + Czech copy for the welcome invitation (create user /
// "Znovu poslat pozvánku"). Kept free of Prisma so it's unit-testable.

export const INVALID_INVITATION_MESSAGE =
  "Odkaz pro nastavení hesla je neplatný nebo už vypršel. Požádejte správce kanceláře o novou pozvánku.";

export type InvitationResult =
  | { status: "SENT"; expiresAt: Date }
  | { status: "DISABLED"; reason: MailDisabledReason }
  | { status: "FAILED"; error: string }
  | { status: "INACTIVE" }
  | { status: "DEDUPED" }
  | { status: "NOT_FOUND" };

export type InvitationMessage = {
  tone: "success" | "warning" | "error";
  message: string;
};

export function invitationResultMessage(
  result: InvitationResult,
  user: { name: string; email: string },
  context: "create" | "resend" = "create",
): InvitationMessage {
  const { name, email } = user;

  if (context === "create") {
    switch (result.status) {
      case "SENT":
        return {
          tone: "success",
          message: `Uživatel ${name} byl vytvořen. Na ${email} jsme poslali uvítací e-mail s odkazem pro nastavení vlastního hesla.`,
        };
      case "DISABLED":
        return {
          tone: "warning",
          message: `Uživatel ${name} byl vytvořen, ale uvítací e-mail se neodeslal: ${mailDisabledReasonLabel(result.reason)}. Předejte uživateli přihlašovací e-mail a heslo osobně.`,
        };
      case "FAILED":
        return {
          tone: "warning",
          message: `Uživatel ${name} byl vytvořen, ale uvítací e-mail se nepodařilo odeslat (chyba SMTP serveru). Předejte uživateli přihlašovací údaje osobně, nebo to zkuste později tlačítkem „Znovu poslat pozvánku“.`,
        };
      case "INACTIVE":
        return {
          tone: "warning",
          message: `Uživatel ${name} byl vytvořen jako neaktivní – pozvánka se neposílá.`,
        };
      case "DEDUPED":
      case "NOT_FOUND":
        return {
          tone: "warning",
          message: `Uživatel ${name} byl vytvořen, ale pozvánka se neodeslala. Zkuste „Znovu poslat pozvánku“.`,
        };
    }
  }

  switch (result.status) {
    case "SENT":
      return {
        tone: "success",
        message: `Pozvánku jsme znovu poslali na ${email}. Odkaz pro nastavení hesla platí 72 hodin.`,
      };
    case "DISABLED":
      return {
        tone: "warning",
        message: `Pozvánka se neodeslala: ${mailDisabledReasonLabel(result.reason)}. Předejte uživateli přihlašovací údaje osobně.`,
      };
    case "FAILED":
      return {
        tone: "warning",
        message:
          "Pozvánku se nepodařilo odeslat (chyba SMTP serveru). Zkuste to později, nebo předejte přihlašovací údaje osobně.",
      };
    case "INACTIVE":
      return {
        tone: "warning",
        message: `Uživatel ${name} je neaktivní – pozvánka se neposílá.`,
      };
    case "DEDUPED":
      return {
        tone: "warning",
        message: "Pozvánka byla právě odeslána. Zkuste to znovu za minutu.",
      };
    case "NOT_FOUND":
      return {
        tone: "error",
        message: "Uživatel nebyl v této kanceláři nalezen.",
      };
  }
}
