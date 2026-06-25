import Link from "next/link";

import {
  ensurePortalAccess,
  revokePortalAccess,
  revokeShare,
} from "@/app/actions/portal";
import { Field, TextInput } from "@/components/form-field";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

type Access = {
  id: string;
  email: string;
  status: "ACTIVE" | "REVOKED";
} | null;

type Share = {
  id: string;
  shareType: "DOCUMENT" | "CASE";
  document: { id: string; name: string } | null;
  case: { id: string; name: string } | null;
};

// Client portal management hub on the subject (= client) detail. Grant/revoke
// magic-link access and review/revoke the whitelist of shared records. Sharing a
// specific document/case is initiated from that record's own detail page.
export function SubjectPortalSection({
  subjectId,
  access,
  shares,
}: {
  subjectId: string;
  access: Access;
  shares: Share[];
}) {
  const active = access?.status === "ACTIVE";

  return (
    <Section title="Klientský portál">
      {active && access ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
            <Badge tone="green">Aktivní</Badge>
            <span className="text-stone-700">
              Magic-link na: <span className="font-medium">{access.email}</span>
            </span>
            <form action={revokePortalAccess}>
              <input type="hidden" name="portalAccessId" value={access.id} />
              <Button type="submit" variant="ghost">
                Zrušit přístup
              </Button>
            </form>
          </div>

          <h3 className="mb-2 text-sm font-medium text-stone-900">
            Sdílené záznamy
          </h3>
          {shares.length > 0 ? (
            <ul className="grid gap-2">
              {shares.map((share) => {
                const target = share.document ?? share.case;
                const href = share.document
                  ? `/documents/${share.document.id}`
                  : share.case
                    ? `/cases/${share.case.id}`
                    : null;
                return (
                  <li
                    key={share.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-[#d4e2dc] px-3 py-2"
                  >
                    <span className="text-sm text-stone-800">
                      <Badge tone={share.document ? "blue" : "purple"}>
                        {share.document ? "Dokument" : "Spis"}
                      </Badge>{" "}
                      {href && target ? (
                        <Link
                          href={href}
                          className="text-[#072924] underline-offset-2 hover:underline"
                        >
                          {target.name}
                        </Link>
                      ) : (
                        (target?.name ?? "—")
                      )}
                    </span>
                    <form action={revokeShare}>
                      <input type="hidden" name="shareId" value={share.id} />
                      <Button type="submit" variant="ghost" className="h-8 px-2">
                        Odebrat
                      </Button>
                    </form>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState>
              Klientovi zatím nebyly sdíleny žádné záznamy. Sdílení zahájíte na
              detailu dokumentu nebo spisu.
            </EmptyState>
          )}
        </>
      ) : (
        <>
          <p className="mb-4 text-sm text-stone-600">
            {access?.status === "REVOKED"
              ? "Přístup do portálu byl zrušen. Můžete jej znovu udělit."
              : "Klient zatím nemá přístup do klientského portálu."}
          </p>
          <form action={ensurePortalAccess} className="grid gap-4 sm:max-w-md">
            <input type="hidden" name="subjectId" value={subjectId} />
            <Field label="E-mail klienta (pro magic-link)">
              <TextInput
                name="email"
                type="email"
                defaultValue={access?.email ?? ""}
                required
              />
            </Field>
            <div>
              <Button type="submit">Udělit přístup</Button>
            </div>
          </form>
        </>
      )}
      <p className="mt-2 text-xs text-stone-400">
        Klient se přihlašuje odkazem zaslaným na e-mail a vidí pouze výslovně
        sdílené dokumenty a spisy (metadata, bez interních poznámek).
      </p>
    </Section>
  );
}
