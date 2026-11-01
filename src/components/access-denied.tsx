import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";

// Shown instead of a page whose module (or function) the user can't access —
// e.g. a direct URL to a section the permission matrix hides. Rendered by the
// page itself (never by a layout): every route checks its own access.
export function AccessDenied({
  title,
  moduleLabel,
  message,
}: {
  title: string;
  /** Module name for the default message ("K modulu „…“ nemáte oprávnění."). */
  moduleLabel?: string;
  /** Overrides the default message entirely. */
  message?: string;
}) {
  const text =
    message ??
    `K modulu „${moduleLabel ?? title}“ nemáte oprávnění. O přístup požádejte administrátora kanceláře (Nastavení → Oprávnění).`;

  return (
    <>
      <PageHeader title={title} />
      <Section title="Přístup odepřen" role="alert">
        <p className="text-sm leading-6 text-[#2c3a45]">{text}</p>
      </Section>
    </>
  );
}
