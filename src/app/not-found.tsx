import Link from "next/link";

// Localized 404 shown for unknown routes (and notFound()) instead of the
// default English Next.js page.
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-4xl font-semibold text-stone-900">404</h1>
      <p className="text-sm text-stone-600">
        Požadovaná stránka nebyla nalezena nebo k ní nemáte přístup.
      </p>
      <Link
        href="/dashboard"
        className="rounded-md bg-[#072924] px-4 py-2 text-sm font-medium text-white"
      >
        Zpět na dashboard
      </Link>
    </div>
  );
}
