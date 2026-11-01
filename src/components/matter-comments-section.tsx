import {
  addMatterComment,
  archiveMatterComment,
  updateMatterComment,
} from "@/app/actions/matter-comments";
import {
  RichEntryCreateForm,
  RichEntryRowActions,
} from "@/components/rich-entry-forms";
import { RichText } from "@/components/rich-text";
import { Section } from "@/components/section";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/format";

export type MatterCommentRow = {
  id: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  author: { name: string } | null;
  canEdit: boolean;
};

// Sekce „Komentáře“ v detailu projektu a případu: záznamy komunikace (např.
// evidence telefonátů) — datum vzniku, autor, formátovaný obsah. Upravit
// a smazat (archivovat) může jen autor.
export function MatterCommentsSection({
  kind,
  parentId,
  comments,
}: {
  kind: "project" | "case";
  parentId: string;
  comments: MatterCommentRow[];
}) {
  return (
    <Section title="Komentáře" aria-label="Komentáře">
      <div className="grid gap-5">
        {comments.length > 0 ? (
          <div className="table-scroll">
            <table className="w-full min-w-[40rem] table-auto">
              <thead>
                <tr>
                  <th className="w-40">Datum vzniku</th>
                  <th className="w-44">Autor</th>
                  <th>Obsah sdělení</th>
                  <th className="w-48">
                    <span className="sr-only">Akce</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {comments.map((comment) => (
                  <tr key={comment.id}>
                    <td className="align-top whitespace-nowrap">
                      {formatDateTime(comment.createdAt)}
                      {comment.editedAt ? (
                        <span
                          className="block text-xs text-[#566673]"
                          title={`Upraveno ${formatDateTime(comment.editedAt)}`}
                        >
                          upraveno
                        </span>
                      ) : null}
                    </td>
                    <td className="align-top">{comment.author?.name ?? "—"}</td>
                    <td className="align-top">
                      <RichText value={comment.body} className="max-w-3xl" />
                    </td>
                    <td className="align-top">
                      {comment.canEdit ? (
                        <RichEntryRowActions
                          id={comment.id}
                          body={comment.body}
                          updateAction={updateMatterComment}
                          archiveAction={archiveMatterComment}
                          editTitle="Upravit komentář"
                          archiveMessage="Komentář zmizí ze seznamu (archivuje se a zůstane v audit logu)."
                        />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>
            {kind === "case"
              ? "K případu zatím nejsou žádné komentáře."
              : "K projektu zatím nejsou žádné komentáře."}
          </EmptyState>
        )}
        <RichEntryCreateForm
          action={addMatterComment}
          hiddenFields={{ kind, parentId }}
          label="Nový komentář"
          placeholder="Např. Dne 21. 10. 2026 voláno na KSBR s dotazem ohledně spisové značky… Spisová značka u KSBR je **…**."
          submitLabel="Přidat komentář"
        />
      </div>
    </Section>
  );
}
