import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// scrypt from the stdlib — no bcrypt/argon2 dependency. Stored as
// `scrypt$<saltHex>$<hashHex>`. Node-only (server actions / seed), not edge.
const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  const [scheme, salt, hash] = (stored ?? "").split("$");

  // Always run scrypt (constant time) — pro chybějící/neplatný hash i pro
  // neexistujícího uživatele. Bez toho by rychlé odmítnutí prozradilo, které
  // e-maily/hesla existují (timing oracle, bug #13).
  if (scheme !== "scrypt" || !salt || !hash) {
    await scryptAsync(password, "invalid", KEY_LENGTH);
    return false;
  }

  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}
