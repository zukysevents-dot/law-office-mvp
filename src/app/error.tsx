"use client";

import Link from "next/link";

// Route-segment error boundary. Shows a neutral Czech notice instead of leaking
// a stack trace to clients in production.
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold text-[#0e1822]">Něco se pokazilo</h1>
      {/* role="alert": při chybě po client navigaci se jinak čtečce neoznámí nic. */}
      <p role="alert" className="text-sm text-[#566673]">
        Při zpracování požadavku došlo k chybě. Zkuste to prosím znovu, nebo
        kontaktujte správce systému.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-10 items-center rounded-md bg-[#0e1822] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#16242f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e1822]"
        >
          Zkusit znovu
        </button>
        {/* Když „Zkusit znovu" chybu nevyřeší, musí existovat cesta ven. */}
        <Link
          href="/dashboard"
          className="inline-flex min-h-10 items-center rounded-md border border-[#17A2A2] px-4 py-2 text-sm font-medium text-[#0e1822] transition hover:bg-[#17A2A2]/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e1822]"
        >
          Zpět na dashboard
        </Link>
      </div>
    </div>
  );
}
