export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-[#cfe0d7] bg-[#EEF5F1]/65 px-4 py-8 text-center text-sm text-[#5f756e]">
      {children}
    </div>
  );
}
