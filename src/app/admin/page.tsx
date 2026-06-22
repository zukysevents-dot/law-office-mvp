import Link from "next/link";

import {
  createOrganization,
  updateOrganization,
} from "@/app/actions/organizations";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Field, SelectInput, TextInput } from "@/components/form-field";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { OrganizationStatus } from "@/generated/prisma/enums";
import { safeQuery } from "@/lib/db-safe";
import { options, organizationStatusLabels } from "@/lib/labels";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const statusTone: Record<OrganizationStatus, BadgeTone> = {
  ACTIVE: "green",
  SUSPENDED: "amber",
  ARCHIVED: "neutral",
};

async function loadOrganizations() {
  const prisma = getPrisma();
  const [organizations, counts] = await Promise.all([
    prisma.organization.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.organizationMember.groupBy({
      by: ["organizationId"],
      where: { status: "ACTIVE" },
      _count: { _all: true },
    }),
  ]);
  const activeByOrg = new Map(
    counts.map((row) => [row.organizationId, row._count._all]),
  );
  return organizations.map((org) => ({
    ...org,
    activeMembers: activeByOrg.get(org.id) ?? 0,
  }));
}

export default async function AdminOrganizationsPage() {
  const result = await safeQuery(
    [] as Awaited<ReturnType<typeof loadOrganizations>>,
    loadOrganizations,
  );

  return (
    <>
      <PageHeader
        title="Kanceláře"
        description="Provisioning advokátních kanceláří, limitů účtů a jejich stavu."
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      <Section title="Nová kancelář">
        <form action={createOrganization} className="grid gap-4 md:grid-cols-3">
          <Field label="Název kanceláře" className="md:col-span-1">
            <TextInput name="name" required />
          </Field>
          <Field label="Identifikátor (volitelné)">
            <TextInput name="slug" placeholder="napr-nova-kancelar" />
          </Field>
          <Field label="Limit účtů">
            <TextInput name="seatLimit" type="number" min="0" step="1" defaultValue="5" />
          </Field>
          <div className="md:col-span-3">
            <Button type="submit">Vytvořit kancelář</Button>
          </div>
        </form>
      </Section>

      <Section title="Přehled kanceláří">
        {result.data.length > 0 ? (
          <div className="table-scroll">
            <table className="w-max min-w-full">
              <thead>
                <tr>
                  <th>Název</th>
                  <th>Identifikátor</th>
                  <th>Obsazení</th>
                  <th>Limit / stav</th>
                  <th>Akce</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((org) => (
                  <tr key={org.id}>
                    <td className="font-medium text-stone-950">{org.name}</td>
                    <td className="font-mono text-xs">{org.slug}</td>
                    <td>
                      {org.activeMembers} / {org.seatLimit}
                    </td>
                    <td>
                      <form
                        action={updateOrganization}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <input type="hidden" name="organizationId" value={org.id} />
                        <TextInput
                          name="seatLimit"
                          type="number"
                          min="0"
                          step="1"
                          defaultValue={org.seatLimit}
                          className="h-9 w-20"
                        />
                        <SelectInput
                          name="status"
                          defaultValue={org.status}
                          className="h-9 w-36"
                        >
                          {options.organizationStatuses.map((status) => (
                            <option key={status} value={status}>
                              {organizationStatusLabels[status]}
                            </option>
                          ))}
                        </SelectInput>
                        <Button type="submit" variant="ghost" className="h-9 px-3">
                          Uložit
                        </Button>
                        <Badge tone={statusTone[org.status]}>
                          {organizationStatusLabels[org.status]}
                        </Badge>
                      </form>
                    </td>
                    <td>
                      <Link
                        href={`/admin/organizations/${org.id}`}
                        className="font-medium text-emerald-950 hover:underline"
                      >
                        Spravovat
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>Zatím nebyla vytvořena žádná kancelář.</EmptyState>
        )}
      </Section>
    </>
  );
}
