"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { CtaLink } from "@/components/landing/landing-primitives";
import { IuriverseLogo } from "@/components/landing/iuriverse-logo";

const navLinks = [
  { href: "#produkt", label: "Produkt" },
  { href: "#funkce", label: "Funkce" },
  { href: "#postup", label: "Postup" },
  { href: "#duvera", label: "Důvěra" },
];

export function MarketingHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }
  }, [open]);

  // At the very top the header floats over the dark cinematic hero (light text);
  // once scrolled it becomes a solid light bar (dark text). Opening the mobile
  // menu always needs a solid backing.
  const solid = scrolled || open;
  const darkTone = !scrolled;

  return (
    <header
      aria-label="Hlavní navigace"
      className={cn(
        "sticky top-0 z-50 border-b transition-colors duration-300",
        // At the top the header is opaque deep so it blends seamlessly into the
        // cinematic hero (the body bg behind it is the app's light tone, so a
        // transparent header would otherwise flash light). Once scrolled it
        // becomes a light glass bar over the lower light sections.
        !solid && "border-transparent bg-[var(--iv-deep)]",
        solid && darkTone && "border-white/10 bg-[var(--iv-deep)]/95 backdrop-blur-md",
        solid && !darkTone && "border-[var(--iv-line)] bg-[var(--iv-bg)]/85 backdrop-blur-md",
      )}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-10 focus:rounded-md focus:bg-[var(--iv-teal-bright)] focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-[var(--iv-deep)]"
      >
        Přeskočit na obsah
      </a>

      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className={cn(
            "flex items-center rounded-md outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
            // Outline colour follows the header tone so it always clears 3:1
            // (SC 1.4.11): teal-bright on the dark hero bar, teal-ink on the
            // light scrolled bar — a single teal would fall to ~2.9:1 on light.
            darkTone
              ? "focus-visible:outline-[var(--iv-teal-bright)]"
              : "focus-visible:outline-[var(--iv-teal-ink)]",
          )}
          aria-label="IURIVERSE — domů"
        >
          <IuriverseLogo tone={darkTone ? "light" : "dark"} />
        </Link>

        <nav aria-label="Sekce stránky" className="hidden items-center gap-8 lg:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-sm text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4",
                darkTone
                  ? "text-white/75 hover:text-white focus-visible:outline-[var(--iv-teal-bright)]"
                  : "text-[var(--iv-ink)]/75 hover:text-[var(--iv-ink)] focus-visible:outline-[var(--iv-teal-ink)]",
              )}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <CtaLink href="/login" variant="solid">
            Spustit systém
          </CtaLink>
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Zavřít menu" : "Otevřít menu"}
          className={cn(
            "inline-flex h-10 w-10 items-center justify-center rounded-md border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 lg:hidden",
            darkTone
              ? "border-white/25 text-white hover:bg-white/10 focus-visible:outline-[var(--iv-teal-bright)]"
              : "border-[var(--iv-line)] bg-white text-[var(--iv-ink)] hover:bg-[var(--iv-bg)] focus-visible:outline-[var(--iv-teal-ink)]",
          )}
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
          "overflow-hidden border-t transition-[max-height] duration-300 ease-out lg:hidden",
          darkTone
            ? "border-white/10 bg-[var(--iv-deep)]"
            : "border-[var(--iv-line)] bg-[var(--iv-bg)]",
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
              className={cn(
                "rounded-md px-3 py-2.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                darkTone
                  ? "text-white/85 hover:bg-white/10 focus-visible:outline-[var(--iv-teal-bright)]"
                  : "text-[var(--iv-ink)] hover:bg-white focus-visible:outline-[var(--iv-teal-ink)]",
              )}
            >
              {link.label}
            </a>
          ))}
          <CtaLink href="/login" variant="solid" className="mt-2 w-full">
            Spustit systém
          </CtaLink>
        </nav>
      </div>
    </header>
  );
}
