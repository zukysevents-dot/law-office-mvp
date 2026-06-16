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
    return {
      data: fallback,
      databaseReady: false,
      error: toDatabaseMessage(error),
    };
  }
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

  return message.split("\n")[0]?.slice(0, 220) ?? "Database query failed.";
}
