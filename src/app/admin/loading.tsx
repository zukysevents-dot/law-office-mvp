export default function AdminLoading() {
  return (
    <div role="status" className="flex min-h-[16rem] items-center justify-center gap-3 text-sm font-medium text-[#566673]">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#17A2A2] border-t-[#0e1822] motion-reduce:animate-none" aria-hidden="true" />
      Načítání správy platformy…
    </div>
  );
}
