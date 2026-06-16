import type { ButtonHTMLAttributes, AnchorHTMLAttributes } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

const variants = {
  primary:
    "bg-[#072924] text-white shadow-sm hover:bg-[#031c19] focus-visible:outline-[#072924]",
  secondary:
    "border border-[#B9DCC6] bg-[#B9DCC6] text-[#072924] hover:bg-[#a8ceb7] focus-visible:outline-[#B9DCC6]",
  ghost:
    "border border-[#B9DCC6] bg-transparent text-[#072924] hover:bg-[#B9DCC6]/30 focus-visible:outline-[#B9DCC6]",
  danger:
    "bg-red-900 text-white hover:bg-red-800 focus-visible:outline-red-700",
};

type ButtonVariant = keyof typeof variants;

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function ButtonLink({
  className,
  variant = "primary",
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  variant?: ButtonVariant;
}) {
  return (
    <Link
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
