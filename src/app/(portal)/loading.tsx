export default function PortalLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f7f8] px-4">
      <div role="status" className="flex items-center gap-3 rounded-lg border border-[#dce4e8] bg-white px-5 py-4 text-sm font-medium text-[#566673] shadow-sm">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#17A2A2] border-t-[#0e1822] motion-reduce:animate-none" aria-hidden="true" />
        Načítání klientského portálu…
      </div>
    </main>
  );
}
