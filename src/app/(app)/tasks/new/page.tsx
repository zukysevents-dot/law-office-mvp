import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { TaskCreateForm } from "@/components/task-create-form";
import { ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { pragueTodayIso } from "@/lib/deadlines";
import { moduleAccessDenial } from "@/lib/module-access.server";
import {
  andWhere,
  taskVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { firstParam, type SearchParamValue } from "@/lib/search-params";
import {
  buildTaskDuplicatePrefill,
  type TaskDuplicatePrefill,
} from "@/lib/tasks/duplicate";
import {
  emptyTaskFormOptions,
  loadTaskFormOptions,
  type TaskFormOptions,
} from "@/lib/tasks/task-form-options.server";
import {
  taskAssigneeUserIds,
  taskSupervisorUserIds,
} from "@/lib/tasks/task-people";

export const dynamic = "force-dynamic";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

type NewTaskProps = {
  searchParams: Promise<Record<string, SearchParamValue>>;
};

type NewTaskData = {
  options: TaskFormOptions;
  currentUserId: string;
  /** undefined = bez ?duplicate, null = zdroj nenalezen / bez přístupu. */
  source: { id: string; title: string; prefill: TaskDuplicatePrefill } | null | undefined;
};

// „Nový úkol“ / „Duplikovat úkol“ (?duplicate=<id>, „uložit jako“): formulář
// předvyplněný ze zdrojového úkolu. Uložením vznikne NOVÝ úkol (createTask);
// komentáře, historie a výkazy práce se nekopírují.
export default async function NewTaskPage({ searchParams }: NewTaskProps) {
  const accessUser = await getCurrentUser();
  const accessDenied = await moduleAccessDenial(accessUser, "module.tasks");
  if (accessDenied) {
    return <AccessDenied title="Úkoly" message={accessDenied} />;
  }

  const params = await searchParams;
  const rawDuplicate = firstParam(params, "duplicate");
  const duplicateId = rawDuplicate && ID_PATTERN.test(rawDuplicate) ? rawDuplicate : "";
  const wantsDuplicate = Boolean(rawDuplicate);
  const defaultProjectId = firstParam(params, "projectId");
  const defaultCaseId = firstParam(params, "caseId");

  const result = await safeQuery<NewTaskData>(
    { options: emptyTaskFormOptions, currentUserId: "", source: undefined },
    async () => {
      const prisma = getPrisma();
      const currentUser = await getCurrentUser();
      const [options, sourceTask] = await Promise.all([
        loadTaskFormOptions(prisma, currentUser),
        duplicateId
          ? prisma.task.findFirst({
              where: andWhere({ id: duplicateId }, taskVisibilityWhere(currentUser)),
              select: {
                id: true,
                title: true,
                priority: true,
                deadlineType: true,
                deadline: true,
                shortDescription: true,
                detailedDescription: true,
                sharepointUrl: true,
                projectId: true,
                caseId: true,
                responsibleUserId: true,
                assignedToId: true,
                project: { select: { mainSubjectId: true } },
                case: {
                  select: {
                    projectId: true,
                    project: { select: { mainSubjectId: true } },
                  },
                },
                assignees: {
                  orderBy: { assignedAt: "asc" },
                  select: { userId: true, role: true },
                },
              },
            })
          : null,
      ]);

      let source: NewTaskData["source"] = undefined;
      if (wantsDuplicate) {
        source = sourceTask
          ? {
              id: sourceTask.id,
              title: sourceTask.title,
              prefill: buildTaskDuplicatePrefill(
                {
                  title: sourceTask.title,
                  priority: sourceTask.priority,
                  deadlineType: sourceTask.deadlineType,
                  deadline: sourceTask.deadline,
                  shortDescription: sourceTask.shortDescription,
                  detailedDescription: sourceTask.detailedDescription,
                  sharepointUrl: sourceTask.sharepointUrl,
                  projectId: sourceTask.projectId,
                  caseId: sourceTask.caseId,
                  caseProjectId: sourceTask.case?.projectId ?? null,
                  subjectId:
                    sourceTask.case?.project.mainSubjectId ??
                    sourceTask.project?.mainSubjectId ??
                    null,
                  assigneeIds: taskAssigneeUserIds(sourceTask),
                  supervisorIds: taskSupervisorUserIds(sourceTask),
                  responsibleUserId: sourceTask.responsibleUserId,
                },
                {
                  projectIds: new Set(options.projects.map((item) => item.id)),
                  caseIds: new Set(options.cases.map((item) => item.id)),
                  subjectIds: new Set(options.subjects.map((item) => item.id)),
                  userIds: new Set(options.users.map((item) => item.id)),
                },
                pragueTodayIso(),
              ),
            }
          : null;
      }

      return { options, currentUserId: currentUser.id, source };
    },
  );

  const { options, currentUserId, source } = result.data;
  const isDuplicate = Boolean(source);
  const notes: string[] = [];
  if (source?.prefill.matterDropped) {
    notes.push("Projekt nebo případ původního úkolu už není dostupný, vyberte ho znovu.");
  }
  if (source?.prefill.peopleDropped) {
    notes.push("Některé osoby původního úkolu už nejsou aktivními členy kanceláře a byly vynechány.");
  }

  return (
    <>
      <PageHeader
        title={isDuplicate ? "Duplikovat úkol" : "Nový úkol"}
        description={
          source
            ? `Kopie úkolu „${source.title}“. Upravte řešitele, dohled a poznámky a uložte jako nový úkol. Komentáře, historie a výkazy práce se nekopírují.`
            : "Založení nového úkolu."
        }
        action={
          <ButtonLink
            href={source ? `/tasks/${source.id}` : "/tasks"}
            variant="secondary"
          >
            {source ? "Zpět na úkol" : "Zpět na úkoly"}
          </ButtonLink>
        }
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />
      {wantsDuplicate && result.databaseReady && source === null ? (
        <p
          role="alert"
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          Úkol k duplikaci nebyl nalezen nebo k němu nemáte přístup.
        </p>
      ) : null}
      {notes.length > 0 ? (
        <div className="grid gap-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      ) : null}
      <Section title={isDuplicate ? "Kopie úkolu" : "Nový úkol"}>
        <TaskCreateForm
          options={options}
          currentUserId={currentUserId}
          prefill={source?.prefill}
          sourceTaskId={source?.id}
          defaultProjectId={defaultProjectId}
          defaultCaseId={defaultCaseId}
          submitLabel={isDuplicate ? "Vytvořit kopii úkolu" : "Vytvořit úkol"}
          cancelHref={source ? `/tasks/${source.id}` : "/tasks"}
        />
      </Section>
    </>
  );
}
