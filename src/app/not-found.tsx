import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f7f8] px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-[#dce4e8] bg-white p-8 text-center shadow-lg shadow-[#0e1822]/10">
        <p className="text-sm font-semibold uppercase tracking-wider text-[#566673]">
          Chyba 404
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-[#0e1822]">
          Tuto stránku jsme nenašli
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#566673]">
          Odkaz mohl být změněn nebo záznam už není dostupný.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex min-h-10 items-center justify-center rounded-md bg-[#0e1822] px-4 text-sm font-medium text-white transition hover:bg-[#16242f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e1822]"
        >
          Zpět na dashboard
        </Link>
      </div>
    </main>
  );
}
