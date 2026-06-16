export function DatabaseNotice({
  databaseReady,
  error,
}: {
  databaseReady: boolean;
  error?: string;
}) {
  if (databaseReady) {
    return null;
  }

  return (
    <div className="max-w-full overflow-hidden rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm shadow-[#072924]/5">
      Databáze není dostupná. Zkontrolujte `DATABASE_URL` a spusťte Prisma
      migraci.{" "}
      {error ? (
        <span className="break-words font-mono text-xs">{error}</span>
      ) : null}
    </div>
  );
}
