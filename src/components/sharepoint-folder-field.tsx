import { FolderOpen, FolderPlus } from "lucide-react";

import { provisionSharepointFolder } from "@/app/actions/sharepoint";
import { Button } from "@/components/ui/button";
import { isGraphConfigured, isSharepointUrlConfigured } from "@/lib/microsoft/config";
import type { SharepointEntityType } from "@/lib/microsoft/sharepoint";
import { cn, isSafeHttpUrl } from "@/lib/utils";

type SharepointFolderFieldProps = {
  entityType: SharepointEntityType;
  id: string;
  url: string | null;
  canEdit: boolean;
  className?: string;
};

/**
 * Displays the SharePoint folder as a clickable link and, when no folder URL is
 * set yet and SharePoint is configured, offers a button to create/derive it.
 */
export function SharepointFolderField({
  entityType,
  id,
  url,
  canEdit,
  className,
}: SharepointFolderFieldProps) {
  const configured = isSharepointUrlConfigured() || isGraphConfigured();
  const showProvision = canEdit && configured && !url;
  // Only ever render a stored value as a live link when it's an http(s) URL,
  // so a manually-entered javascript:/data: value can't execute on click.
  const safeUrl = isSafeHttpUrl(url) ? url : null;

  return (
    <div className={cn("space-y-2 md:col-span-3", className)}>
      <p className="text-xs font-semibold uppercase text-stone-500">SharePoint</p>
      {safeUrl ? (
        <a
          href={safeUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 break-all font-medium text-emerald-950 hover:underline"
        >
          <FolderOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
          Otevřít v SharePointu
        </a>
      ) : url ? (
        <p className="break-all text-stone-600">{url}</p>
      ) : (
        <p className="text-stone-600">
          {showProvision ? "Složka zatím nebyla vytvořena." : "—"}
        </p>
      )}
      {showProvision ? (
        <form action={provisionSharepointFolder}>
          <input type="hidden" name="entityType" value={entityType} />
          <input type="hidden" name="id" value={id} />
          <Button type="submit" variant="secondary">
            <FolderPlus className="h-4 w-4" aria-hidden="true" />
            Vytvořit složku v SharePointu
          </Button>
        </form>
      ) : null}
    </div>
  );
}
