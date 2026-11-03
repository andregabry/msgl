import crypto from "crypto";

// Unambiguous characters for readable, reliable temporary passwords
const TEMP_CHARS_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const TEMP_CHARS_LOWER = "abcdefghijkmnpqrstuvwxyz";
const TEMP_CHARS_NUM = "23456789";
const ALL_TEMP_CHARS = TEMP_CHARS_UPPER + TEMP_CHARS_LOWER + TEMP_CHARS_NUM;

/**
 * Generates an 8-character temporary password containing uppercase,
 * lowercase, and numbers.
 */
export function generateTemporaryPassword(): string {
  // Ensure at least one uppercase, one lowercase, and one number
  const chars: string[] = [
    TEMP_CHARS_UPPER[crypto.randomInt(0, TEMP_CHARS_UPPER.length)],
    TEMP_CHARS_LOWER[crypto.randomInt(0, TEMP_CHARS_LOWER.length)],
    TEMP_CHARS_NUM[crypto.randomInt(0, TEMP_CHARS_NUM.length)],
  ];

  // Fill remaining 5 characters to total exactly 8 characters
  for (let i = 0; i < 5; i++) {
    chars.push(ALL_TEMP_CHARS[crypto.randomInt(0, ALL_TEMP_CHARS.length)]);
  }

  // Shuffle array using Fisher-Yates
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}

/**
 * Hashes a password using crypto.scrypt (OWASP recommended standard)
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

/**
 * Constant-time verification of password against stored scrypt hash
 */
export function verifyPassword(password: string, storedHash?: string | null): boolean {
  if (!storedHash || !password) return false;
  try {
    const [salt, key] = storedHash.split(":");
    if (!salt || !key) return false;
    const derivedKey = crypto.scryptSync(password, salt, 64);
    const keyBuffer = Buffer.from(key, "hex");
    if (derivedKey.length !== keyBuffer.length) return false;
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}

/**
 * Checks if a user has Gestor (MSGL system) privileges.
 * Gestor roles: ADMIN, BACKUP_OPERATOR, MIGRATION_OPERATOR, AUDITOR
 * Or systemAccess in ['MSGL', 'BOTH']
 */
export function isGestor(user: { role?: string; systemAccess?: string | null }): boolean {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  if (["BACKUP_OPERATOR", "MIGRATION_OPERATOR", "AUDITOR"].includes(user.role || "")) {
    return true;
  }
  if (user.systemAccess === "MSGL" || user.systemAccess === "BOTH") {
    return true;
  }
  return false;
}
