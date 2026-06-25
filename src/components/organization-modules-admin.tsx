import { setOrganizationModule } from "@/app/actions/organizations";
import { SelectInput, TextInput } from "@/components/form-field";
import { Section } from "@/components/section";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModuleStatus } from "@/generated/prisma/enums";
import { moduleKeyLabels, moduleStatusLabels } from "@/lib/labels";
import type { OrganizationModuleView } from "@/lib/organization";

const moduleStatusTone: Record<ModuleStatus, BadgeTone> = {
  ENABLED: "green",
  TRIAL: "amber",
  DISABLED: "neutral",
};

const STATUS_OPTIONS: ModuleStatus[] = [
  ModuleStatus.ENABLED,
  ModuleStatus.TRIAL,
  ModuleStatus.DISABLED,
];

// Date → yyyy-mm-dd for <input type="date">. Pinned to UTC to match how the
// action stores/parses date-only fields (see optionalDate in form.ts).
function toDateInputValue(value: Date | null): string {
  if (!value) {
    return "";
  }
  return value.toISOString().slice(0, 10);
}

// Platform-admin module CRUD for one org. Each non-core module is its own
// <form> posting to setOrganizationModule, which enforces the requiresKeys
// dependency graph and writes an audit entry. Dependency violations surface as
// thrown errors (Next.js error boundary), consistent with other FormData
// actions in the app.
export function OrganizationModulesAdmin({
  organizationId,
  modules,
}: {
  organizationId: string;
  modules: OrganizationModuleView[];
}) {
  return (
    <Section title="Moduly kanceláře">
      <p className="mb-4 text-sm text-stone-600">
        Zapínání, vypínání a zkušební režim modulů spravuje správce platformy.
        Modul se závislostí lze aktivovat až po aktivaci modulů, které vyžaduje;
        modul nelze vypnout, pokud na něm závisí jiný aktivní modul. Datum
        „Zkušební do“ se uplatní jen při volbě zkušebního režimu (výchozí 30 dní).
      </p>
      <div className="table-scroll">
        <table className="w-max min-w-full">
          <thead>
            <tr>
              <th>Modul</th>
              <th>Vyžaduje</th>
              <th>Aktuální stav</th>
              <th>Změnit</th>
            </tr>
          </thead>
          <tbody>
            {modules.map((module) => {
              const requires = module.requiresKeys
                .map((key) => moduleKeyLabels[key])
                .join(", ");
              return (
                <tr key={module.key}>
                  <td className="font-medium text-stone-950">{module.name}</td>
                  <td className="text-stone-600">{requires || "—"}</td>
                  <td>
                    <Badge tone={moduleStatusTone[module.status]}>
                      {moduleStatusLabels[module.status]}
                    </Badge>
                  </td>
                  <td>
                    {module.isCore ? (
                      <span className="text-sm text-stone-400">
                        Vždy aktivní
                      </span>
                    ) : (
                      <form
                        action={setOrganizationModule}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <input
                          type="hidden"
                          name="organizationId"
                          value={organizationId}
                        />
                        <input
                          type="hidden"
                          name="moduleKey"
                          value={module.key}
                        />
                        <SelectInput
                          name="status"
                          defaultValue={module.status}
                          aria-label="Stav modulu"
                          className="h-9 w-36"
                        >
                          {STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              {moduleStatusLabels[status]}
                            </option>
                          ))}
                        </SelectInput>
                        <TextInput
                          type="date"
                          name="trialEndsAt"
                          defaultValue={toDateInputValue(module.trialEndsAt)}
                          aria-label="Zkušební do"
                          title="Zkušební do (jen pro zkušební režim)"
                          className="h-9 w-40"
                        />
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
