import { DocumentTitle } from "@/components/document-title";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <>
      <DocumentTitle title={title} />
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        {/* min-w-0 + break-words: názvy subjektů/úkolů mohou být jedno velmi
            dlouhé slovo, které by jinak roztáhlo celou stránku do šířky. */}
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-semibold tracking-normal text-[#0e1822]">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[#566673]">
              {description}
            </p>
          ) : null}
        </div>
        {action ? (
          <div className="flex flex-wrap items-center gap-2">{action}</div>
        ) : null}
      </div>
    </>
  );
}
