import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only Supabase clients. The app's domain data layer is Prisma
// (DATABASE_URL); these exist for surfaces that need the Supabase API proper —
// Storage, admin/management tasks — and are the documented seam for them.
//
// These are server-only by construction: SUPABASE_SERVICE_ROLE_KEY has no
// NEXT_PUBLIC_ prefix, so Next never inlines it into the client bundle. The
// guard below fails loudly if a factory is ever called in a browser context.
//
// Browser client: intentionally NOT added. Auth is cookie-based (custom) and
// there is no client component talking to Supabase yet. When one appears, add
// NEXT_PUBLIC_SUPABASE_URL/ANON_KEY and a `client.ts` with createBrowserClient.
// ponytail: no browser client until there's a browser consumer.

function assertServer(): void {
  if (typeof window !== "undefined") {
    throw new Error("Supabase server clients must not be used in the browser.");
  }
}

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured (required for the Supabase client).`);
  }
  return value;
}

// Service-role client: full access, bypasses RLS. SERVER ONLY —
// SUPABASE_SERVICE_ROLE_KEY has no NEXT_PUBLIC_ prefix so Next never serializes
// it to the browser, and assertServer() throws if this is ever reached client
// side. Use for admin/storage operations the trusted server performs on behalf
// of the (already-authorized) request.
export function getSupabaseAdmin(): SupabaseClient {
  assertServer();
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
