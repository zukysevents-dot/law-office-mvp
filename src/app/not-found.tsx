import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef5f1] px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-[#d4e2dc] bg-white p-8 text-center shadow-lg shadow-[#072924]/10">
        <p className="text-sm font-semibold uppercase tracking-wider text-[#5f756e]">
          Chyba 404
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-[#072924]">
          Tuto stránku jsme nenašli
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#5f756e]">
          Odkaz mohl být změněn nebo záznam už není dostupný.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex min-h-10 items-center justify-center rounded-md bg-[#072924] px-4 text-sm font-medium text-white transition hover:bg-[#031c19] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#072924]"
        >
          Zpět na dashboard
        </Link>
      </div>
    </main>
  );
}
