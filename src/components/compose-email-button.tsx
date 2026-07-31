import { Mail } from "lucide-react";

import { cn } from "@/lib/utils";

type ComposeEmailButtonProps = {
  email: string;
  subject?: string;
  className?: string;
};

/**
 * Opens the user's default mail client (Outlook) with a new message to `email`.
 * Plain `<a href="mailto:">` — no server involvement.
 */
export function ComposeEmailButton({ email, subject, className }: ComposeEmailButtonProps) {
  // Encode the address too — an unencoded email could break the link or inject
  // extra mailto headers (e.g. "?cc=", "&bcc=") if it contains URL-significant chars.
  const address = encodeURIComponent(email);
  const href = subject
    ? `mailto:${address}?subject=${encodeURIComponent(subject)}`
    : `mailto:${address}`;

  return (
    <a
      href={href}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#17A2A2] bg-[#17A2A2] px-4 text-sm font-medium text-[#0e1822] transition hover:bg-[#2dc6c2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17A2A2]",
        className,
      )}
    >
      <Mail className="h-4 w-4" aria-hidden="true" />
      Napsat e-mail
    </a>
  );
}
