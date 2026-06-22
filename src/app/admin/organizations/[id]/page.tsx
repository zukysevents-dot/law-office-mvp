import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { OrganizationAdminPanel } from "@/components/organization-admin";
import { ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { getAuthUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { getOrganizationAdminData } from "@/lib/organization";

export const dynamic = "force-dynamic";

export default async function AdminOrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const currentUser = await getAuthUser();

  const result = await safeQuery<
    Awaited<ReturnType<typeof getOrganizationAdminData>> | null
  >(null, () => getOrganizationAdminData(id));

  if (result.databaseReady && (!result.data || !result.data.organization)) {
    notFound();
  }

  const data = result.data;

  return (
    <>
      <PageHeader
        title={data?.organization?.name ?? "Kancelář"}
        description="Členové, role a registrační kódy kanceláře."
        action={
          <ButtonLink href="/admin" variant="secondary">
            Zpět na přehled
          </ButtonLink>
        }
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      {data && data.organization ? (
        <OrganizationAdminPanel
          organizationId={data.organization.id}
          seatLimit={data.organization.seatLimit}
          activeMembers={data.activeMembers}
          members={data.members}
          joinCodes={data.joinCodes}
          currentUserId={currentUser.id}
        />
      ) : null}
    </>
  );
}
