export function DatabaseNotice({
  databaseReady,
}: {
  databaseReady: boolean;
  error?: string;
}) {
  if (databaseReady) {
    return null;
  }

  return (
    <div
      role="alert"
      className="max-w-full overflow-hidden rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm shadow-[#072924]/5"
    >
      Data se teď nepodařilo načíst. Zkuste stránku za chvíli obnovit. Pokud
      problém přetrvá, obraťte se na správce aplikace.
    </div>
  );
}
