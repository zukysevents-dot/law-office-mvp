"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/landing/landing-primitives";

const navLinks = [
  { href: "#produkt", label: "Produkt" },
  { href: "#funkce", label: "Funkce" },
  { href: "#postup", label: "Postup" },
  { href: "#duvera", label: "Důvěra" },
];

export function MarketingHeader() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }
  }, [open]);

  return (
    <header
      aria-label="Hlavní navigace"
      className="sticky top-0 z-50 border-b border-[#d4e2dc]/70 bg-[#eef5f1]/80 backdrop-blur-md"
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-10 focus:rounded-md focus:bg-[#072924] focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Přeskočit na obsah
      </a>

      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex items-center rounded-md outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#072924]"
          aria-label="syndikat.legal — domů"
        >
          <Wordmark className="text-xl" />
        </Link>

        <nav
          aria-label="Sekce stránky"
          className="hidden items-center gap-8 lg:flex"
        >
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-[#072924]/80 transition hover:text-[#072924]"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <ButtonLink href="/dashboard" variant="primary">
            Spustit systém
          </ButtonLink>
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Zavřít menu" : "Otevřít menu"}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[#d4e2dc] bg-white text-[#072924] transition hover:bg-[#eef5f1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#072924] lg:hidden"
        >
          {open ? (
            <X className="h-5 w-5" aria-hidden />
          ) : (
            <Menu className="h-5 w-5" aria-hidden />
          )}
        </button>
      </div>

      <div
        id="mobile-menu"
        className={cn(
          "overflow-hidden border-t border-[#d4e2dc]/70 bg-[#eef5f1] transition-[max-height] duration-300 ease-out lg:hidden",
          open ? "max-h-80" : "max-h-0 border-t-0",
        )}
      >
        <nav
          aria-label="Sekce stránky (mobil)"
          className="mx-auto flex w-full max-w-7xl flex-col gap-1 px-4 py-3 sm:px-6"
        >
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2.5 text-sm font-medium text-[#072924] transition hover:bg-[#B9DCC6]/25"
            >
              {link.label}
            </a>
          ))}
          <ButtonLink
            href="/dashboard"
            variant="primary"
            className="mt-2 w-full"
          >
            Spustit systém
          </ButtonLink>
        </nav>
      </div>
    </header>
  );
}
