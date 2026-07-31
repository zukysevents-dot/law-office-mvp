import { cn } from "@/lib/utils";

export function Section({
  title,
  children,
  className,
  ...props
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-lg border border-[#dce4e8] bg-white p-5 shadow-sm shadow-[#0e1822]/5",
        className,
      )}
      {...props}
    >
      {title ? (
        <h2 className="mb-4 text-base font-semibold text-[#0e1822]">
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}
