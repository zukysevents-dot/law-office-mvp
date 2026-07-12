"use client";

import type { ButtonHTMLAttributes, AnchorHTMLAttributes } from "react";
import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useFormStatus } from "react-dom";

import { cn } from "@/lib/utils";

const variants = {
  primary:
    "bg-[#072924] text-white shadow-sm hover:bg-[#031c19] focus-visible:outline-[#072924]",
  secondary:
    "border border-[#B9DCC6] bg-[#B9DCC6] text-[#072924] hover:bg-[#a8ceb7] focus-visible:outline-[#072924]",
  ghost:
    "border border-[#B9DCC6] bg-transparent text-[#072924] hover:bg-[#B9DCC6]/30 focus-visible:outline-[#072924]",
  danger:
    "bg-red-900 text-white hover:bg-red-800 focus-visible:outline-red-700",
};

type ButtonVariant = keyof typeof variants;

export function Button({
  className,
  variant = "primary",
  disabled,
  type,
  showPendingIndicator = true,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  showPendingIndicator?: boolean;
}) {
  const { pending } = useFormStatus();
  const isSubmit = type === undefined || type === "submit";
  const isPending = isSubmit && pending;
  const isDisabled = disabled || isPending;

  return (
    <button
      {...props}
      type={type}
      disabled={isDisabled}
      aria-disabled={isDisabled || undefined}
      aria-busy={isPending || undefined}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        variants[variant],
        className,
      )}
    >
      {isPending && showPendingIndicator ? (
        <LoaderCircle
          className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      ) : null}
      {children}
    </button>
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
