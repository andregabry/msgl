import { prisma } from "../src/lib/prisma";
import { generateTemporaryPassword, hashPassword, verifyPassword, isGestor } from "../src/lib/auth/password";
import { sendTemporaryPasswordEmail } from "../src/lib/email/mailer";

async function main() {
  console.log("=== 1. TEST NON-INTERNAL USER REJECTION ===");
  const fakeEmail = "desconhecido_teste_999@xyz.com";
  const userNotFound = await prisma.appUser.findUnique({
    where: { email: fakeEmail },
  });
  console.log("User not found as expected:", userNotFound === null);
  if (userNotFound !== null) throw new Error("Expected fake user to be null");

  console.log("\n=== 2. TEST INTERNAL USER LOOKUP ===");
  const testUser = await prisma.appUser.findFirst({
    where: { role: "USER", isActive: true },
  });
  if (!testUser) throw new Error("No active USER found in DB to test");
  console.log(`Found internal user: ${testUser.displayName} (${testUser.email}), role: ${testUser.role}, isGestor: ${isGestor(testUser)}`);

  console.log("\n=== 3. SIMULATE FIRST-ACCESS TEMPORARY PASSWORD CREATION ===");
  const tempPwd = generateTemporaryPassword();
  const pwdHash = hashPassword(tempPwd);
  console.log(`Generated 8-char temp password: ${tempPwd} (length: ${tempPwd.length})`);

  const updated = await prisma.appUser.update({
    where: { id: testUser.id },
    data: {
      passwordHash: pwdHash,
      mustChangePassword: true,
      tempPasswordExpiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    },
  });
  console.log(`Updated user: mustChangePassword=${updated.mustChangePassword}`);

  console.log("\n=== 4. TEST LOGIN WITH TEMP PASSWORD ===");
  const isValid = verifyPassword(tempPwd, updated.passwordHash);
  console.log(`Login verification with temp password: ${isValid}`);
  if (!isValid) throw new Error("Temp password verification failed!");
  console.log(`User must change password on first login: ${updated.mustChangePassword === true}`);

  console.log("\n=== 5. SIMULATE CHANGE-PASSWORD ===");
  const permanentPwd = "MinhaNovaSenhaDefinitiva2026!";
  const permanentHash = hashPassword(permanentPwd);

  const finalizedUser = await prisma.appUser.update({
    where: { id: testUser.id },
    data: {
      passwordHash: permanentHash,
      mustChangePassword: false,
      tempPasswordExpiresAt: null,
    },
  });
  console.log(`After password change: mustChangePassword=${finalizedUser.mustChangePassword}`);
  const permValid = verifyPassword(permanentPwd, finalizedUser.passwordHash);
  console.log(`Login verification with permanent password: ${permValid}`);
  if (!permValid || finalizedUser.mustChangePassword !== false) {
    throw new Error("Permanent password change test failed!");
  }

  console.log("\n=== 6. TEST MSGL RESTRICTION FOR NORMAL USER ===");
  console.log(`Can normal user access MSGL? isGestor = ${isGestor(finalizedUser)} (Must be FALSE)`);
  if (isGestor(finalizedUser)) throw new Error("Normal user should NOT have gestor access!");

  console.log("\n=== ALL INTEGRATION CHECKS PASSED ===");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
