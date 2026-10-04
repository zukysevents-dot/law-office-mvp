export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-[#dce4e8] bg-[#F4F7F8]/65 px-4 py-8 text-center text-sm text-[#566673]">
      {children}
    </div>
  );
}
