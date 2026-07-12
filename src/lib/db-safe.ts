export type SafeQueryResult<T> = {
  data: T;
  databaseReady: boolean;
  error?: string;
};

export async function safeQuery<T>(
  fallback: T,
  query: () => Promise<T>,
): Promise<SafeQueryResult<T>> {
  try {
    return {
      data: await query(),
      databaseReady: true,
    };
  } catch (error) {
    if (!isRecoverableDatabaseError(error)) {
      throw error;
    }

    return {
      data: fallback,
      databaseReady: false,
      error: toDatabaseMessage(error),
    };
  }
}

function isRecoverableDatabaseError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";

  return (
    code.startsWith("P1") ||
    message.includes("Can't reach database server") ||
    message.includes("Environment variable not found") ||
    message.includes("DATABASE_URL is not configured") ||
    message.includes("does not exist in the current database") ||
    message.includes("Invalid `prisma.")
  );
}

function toDatabaseMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Database query failed.";

  if (message.includes("Can't reach database server")) {
    return "PostgreSQL server není dostupný na adrese z DATABASE_URL.";
  }

  if (message.includes("Environment variable not found")) {
    return "Chybí DATABASE_URL.";
  }

  if (message.includes("does not exist in the current database")) {
    return "Databázové tabulky ještě nejsou vytvořené.";
  }

  if (message.includes("Invalid `prisma.")) {
    return "Databázové schéma není připravené nebo migrace ještě neběžela.";
  }

  return "Databáze momentálně není připravená.";
}
