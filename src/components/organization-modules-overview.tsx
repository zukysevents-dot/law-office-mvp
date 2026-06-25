import { Section } from "@/components/section";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { Plan, Subscription } from "@/generated/prisma/client";
import type { ModuleStatus, SubscriptionStatus } from "@/generated/prisma/enums";
import { formatDate } from "@/lib/format";
import { moduleStatusLabels, subscriptionStatusLabels } from "@/lib/labels";
import type { OrganizationModuleView } from "@/lib/organization";

const moduleStatusTone: Record<ModuleStatus, BadgeTone> = {
  ENABLED: "green",
  TRIAL: "amber",
  DISABLED: "neutral",
};

const subscriptionStatusTone: Record<SubscriptionStatus, BadgeTone> = {
  ACTIVE: "green",
  TRIALING: "amber",
  PAST_DUE: "red",
  CANCELED: "neutral",
};

type SubscriptionWithPlan = (Subscription & { plan: Plan | null }) | null;

// Read-only view of an org's module entitlements + subscription. Shown on
// /settings/organization so office admins can see what's active; changing it is
// platform-admin only (see OrganizationModulesAdmin).
export function OrganizationModulesOverview({
  modules,
  subscription,
}: {
  modules: OrganizationModuleView[];
  subscription: SubscriptionWithPlan;
}) {
  return (
    <>
      <Section title="Moduly">
        <div className="table-scroll">
          <table className="w-max min-w-full">
            <thead>
              <tr>
                <th>Modul</th>
                <th>Popis</th>
                <th>Stav</th>
                <th>Zkušební do</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((module) => (
                <tr key={module.key}>
                  <td className="font-medium text-stone-950">{module.name}</td>
                  <td className="text-stone-600">{module.description ?? "—"}</td>
                  <td>
                    <Badge tone={moduleStatusTone[module.status]}>
                      {moduleStatusLabels[module.status]}
                    </Badge>
                  </td>
                  <td>
                    {module.status === "TRIAL"
                      ? formatDate(module.trialEndsAt)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Předplatné">
        {subscription ? (
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-medium text-stone-500">Stav</dt>
              <dd className="mt-1">
                <Badge tone={subscriptionStatusTone[subscription.status]}>
                  {subscriptionStatusLabels[subscription.status]}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-stone-500">Plán</dt>
              <dd className="mt-1 text-sm font-medium text-[#072924]">
                {subscription.plan?.name ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-stone-500">Platnost do</dt>
              <dd className="mt-1 text-sm font-medium text-[#072924]">
                {formatDate(subscription.currentPeriodEnd)}
              </dd>
            </div>
          </dl>
        ) : (
          <EmptyState>Kancelář zatím nemá aktivní předplatné.</EmptyState>
        )}
      </Section>
    </>
  );
}
