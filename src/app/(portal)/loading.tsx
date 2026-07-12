export default function PortalLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef5f1] px-4">
      <div role="status" className="flex items-center gap-3 rounded-lg border border-[#d4e2dc] bg-white px-5 py-4 text-sm font-medium text-[#5f756e] shadow-sm">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#B9DCC6] border-t-[#072924] motion-reduce:animate-none" aria-hidden="true" />
        Načítání klientského portálu…
      </div>
    </main>
  );
}
