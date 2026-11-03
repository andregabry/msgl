import { prisma } from "../src/lib/prisma";
import { generateTemporaryPassword, hashPassword, verifyPassword, isGestor } from "../src/lib/auth/password";

async function runTests() {
  console.log("=== 1. TEST TEMPORARY PASSWORD GENERATOR ===");
  for (let i = 0; i < 5; i++) {
    const pwd = generateTemporaryPassword();
    console.log(`Generated: '${pwd}' (Length: ${pwd.length}, Alphanumeric: ${/^[a-zA-Z0-9]{8}$/.test(pwd)})`);
    if (pwd.length !== 8) throw new Error("Temp password length is not 8!");
  }

  console.log("\n=== 2. TEST HASH & VERIFY ===");
  const testPwd = generateTemporaryPassword();
  const hash = hashPassword(testPwd);
  console.log(`Password: ${testPwd} -> Hash: ${hash.substring(0, 30)}...`);
  const match = verifyPassword(testPwd, hash);
  const wrongMatch = verifyPassword("WrongPassword123", hash);
  console.log(`Verify match: ${match}, Wrong match: ${wrongMatch}`);
  if (!match || wrongMatch) throw new Error("Hash verification failed!");

  console.log("\n=== 3. TEST GESTOR PERMISSIONS CHECK ===");
  const adminUser = { role: "ADMIN", systemAccess: "BOTH" };
  const backupUser = { role: "BACKUP_OPERATOR", systemAccess: "MSGL" };
  const normalUser = { role: "USER", systemAccess: "CHAT_PORTAL" };

  console.log("Admin isGestor:", isGestor(adminUser)); // true
  console.log("BackupOp isGestor:", isGestor(backupUser)); // true
  console.log("NormalUser isGestor:", isGestor(normalUser)); // false

  if (!isGestor(adminUser) || !isGestor(backupUser) || isGestor(normalUser)) {
    throw new Error("Gestor permission check failed!");
  }

  console.log("\n=== ALL UNIT TESTS PASSED ===");
}

runTests().catch(console.error).finally(() => prisma.$disconnect());
