import {
  changeMemberRole,
  deactivateMember,
  revokeJoinCode,
} from "@/app/actions/organizations";
import { JoinCodeForm } from "@/components/join-code-form";
import { SelectInput } from "@/components/form-field";
import { Section } from "@/components/section";
import { StatCard } from "@/components/stat-card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type {
  OrganizationJoinCode,
  OrganizationMember,
} from "@/generated/prisma/client";
import type { OrganizationMemberStatus, UserRole } from "@/generated/prisma/enums";
import { formatDate } from "@/lib/format";
import {
  organizationMemberStatusLabels,
  orgMemberRoleOptions,
  userRoleLabels,
} from "@/lib/labels";
import { Building2, Users } from "lucide-react";

type MemberWithUser = OrganizationMember & {
  user: { id: string; name: string; email: string };
};

const memberStatusTone: Record<OrganizationMemberStatus, BadgeTone> = {
  PENDING: "amber",
  ACTIVE: "green",
  SUSPENDED: "neutral",
};

function joinCodeStatus(code: OrganizationJoinCode): {
  label: string;
  tone: BadgeTone;
  active: boolean;
} {
  if (!code.isActive || code.revokedAt) {
    return { label: "Zrušený", tone: "red", active: false };
  }
  if (code.expiresAt && code.expiresAt.getTime() < Date.now()) {
    return { label: "Expirovaný", tone: "amber", active: false };
  }
  if (code.maxUses !== null && code.usedCount >= code.maxUses) {
    return { label: "Vyčerpaný", tone: "amber", active: false };
  }
  return { label: "Aktivní", tone: "green", active: true };
}

export function OrganizationAdminPanel({
  organizationId,
  seatLimit,
  activeMembers,
  members,
  joinCodes,
  currentUserId,
}: {
  organizationId: string;
  seatLimit: number;
  activeMembers: number;
  members: MemberWithUser[];
  joinCodes: OrganizationJoinCode[];
  currentUserId: string | null;
}) {
  const freeSeats = Math.max(0, seatLimit - activeMembers);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Limit účtů" value={seatLimit} icon={Building2} />
        <StatCard label="Obsazená místa" value={activeMembers} icon={Users} />
        <StatCard
          label="Volná místa"
          value={freeSeats}
          icon={Users}
          tone={freeSeats === 0 ? "danger" : "mint"}
        />
      </div>

      <Section title="Členové kanceláře">
        {members.length > 0 ? (
          <div className="table-scroll">
            <table className="w-max min-w-full">
              <thead>
                <tr>
                  <th>Jméno</th>
                  <th>E-mail</th>
                  <th>Role</th>
                  <th>Stav</th>
                  <th>Připojen</th>
                  <th>Akce</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const isSelf = member.userId === currentUserId;
                  return (
                    <tr key={member.id}>
                      <td className="font-medium text-stone-950">
                        {member.user.name}
                      </td>
                      <td>{member.user.email}</td>
                      <td>
                        {isSelf ? (
                          userRoleLabels[member.role]
                        ) : (
                          <form
                            action={changeMemberRole}
                            className="flex items-center gap-2"
                          >
                            <input
                              type="hidden"
                              name="organizationId"
                              value={organizationId}
                            />
                            <input type="hidden" name="memberId" value={member.id} />
                            <SelectInput
                              name="role"
                              defaultValue={member.role}
                              className="h-9 w-40"
                            >
                              {orgMemberRoleOptions.map((role: UserRole) => (
                                <option key={role} value={role}>
                                  {userRoleLabels[role]}
                                </option>
                              ))}
                            </SelectInput>
                            <Button
                              type="submit"
                              variant="ghost"
                              className="h-9 px-3"
                            >
                              Uložit
                            </Button>
                          </form>
                        )}
                      </td>
                      <td>
                        <Badge tone={memberStatusTone[member.status]}>
                          {organizationMemberStatusLabels[member.status]}
                        </Badge>
                      </td>
                      <td>{formatDate(member.joinedAt)}</td>
                      <td>
                        {!isSelf && member.status === "ACTIVE" ? (
                          <form action={deactivateMember}>
                            <input
                              type="hidden"
                              name="organizationId"
                              value={organizationId}
                            />
                            <input type="hidden" name="memberId" value={member.id} />
                            <Button
                              type="submit"
                              variant="danger"
                              className="h-9 px-3"
                            >
                              Deaktivovat
                            </Button>
                          </form>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>Kancelář zatím nemá žádné členy.</EmptyState>
        )}
      </Section>

      <Section title="Registrační kódy">
        {joinCodes.length > 0 ? (
          <div className="table-scroll">
            <table className="w-max min-w-full">
              <thead>
                <tr>
                  <th>Název</th>
                  <th>Kód</th>
                  <th>Použití</th>
                  <th>Platnost do</th>
                  <th>Stav</th>
                  <th>Akce</th>
                </tr>
              </thead>
              <tbody>
                {joinCodes.map((code) => {
                  const status = joinCodeStatus(code);
                  return (
                    <tr key={code.id}>
                      <td className="font-medium text-stone-950">{code.label}</td>
                      <td className="font-mono text-xs tracking-widest text-stone-400">
                        ••••‑••••‑••••
                      </td>
                      <td>
                        {code.usedCount}
                        {code.maxUses !== null ? ` / ${code.maxUses}` : ""}
                      </td>
                      <td>{code.expiresAt ? formatDate(code.expiresAt) : "—"}</td>
                      <td>
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </td>
                      <td>
                        {status.active ? (
                          <form action={revokeJoinCode}>
                            <input
                              type="hidden"
                              name="organizationId"
                              value={organizationId}
                            />
                            <input type="hidden" name="codeId" value={code.id} />
                            <Button
                              type="submit"
                              variant="ghost"
                              className="h-9 px-3"
                            >
                              Zrušit
                            </Button>
                          </form>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>Zatím nebyl vytvořen žádný registrační kód.</EmptyState>
        )}
      </Section>

      <Section title="Nový registrační kód">
        <p className="mb-4 text-sm text-stone-600">
          Kód se zobrazí pouze jednou po vytvoření — bezpečně si jej zkopírujte a
          předejte novému členovi. V seznamu výše je z bezpečnostních důvodů
          maskovaný.
        </p>
        <JoinCodeForm organizationId={organizationId} />
      </Section>
    </>
  );
}
