import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

import { cn } from "@/lib/utils";

const controlClass =
  "h-10 w-full rounded-md border border-[#cfe0d7] bg-white px-3 text-sm shadow-sm outline-none transition placeholder:text-stone-400 focus:border-[#B9DCC6] focus:ring-2 focus:ring-[#B9DCC6]/60";

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("grid gap-1.5 text-sm font-medium text-[#072924]", className)}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function TextInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClass, className)} {...props} />;
}

export function SelectInput({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(controlClass, className)} {...props} />;
}

export function TextArea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition placeholder:text-stone-400 focus:border-emerald-950 focus:ring-2 focus:ring-emerald-950/10",
        "border-[#cfe0d7] focus:border-[#B9DCC6] focus:ring-[#B9DCC6]/60",
        className,
      )}
      {...props}
    />
  );
}
