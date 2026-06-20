"use client";

// Route-segment error boundary. Shows a neutral Czech notice instead of leaking
// a stack trace to clients in production.
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold text-stone-900">Něco se pokazilo</h1>
      <p className="text-sm text-stone-600">
        Při zpracování požadavku došlo k chybě. Zkuste to prosím znovu, nebo
        kontaktujte správce systému.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-[#072924] px-4 py-2 text-sm font-medium text-white"
      >
        Zkusit znovu
      </button>
    </div>
  );
}
