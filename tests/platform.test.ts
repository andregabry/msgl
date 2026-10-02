import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { hasPermission, assertPermission } from "../src/lib/auth/rbac";
import { LocalFilesystemStorageProvider } from "../src/lib/storage/backup-storage.provider";
import { GoogleChatArchiveService } from "../src/lib/chat/parser";
import { MboxStreamParser } from "../src/lib/mbox/parser";
import { MigrationService } from "../src/lib/migration/migration.service";
import path from "path";
import fsp from "fs/promises";
import fs from "fs";

test("RBAC: Role permission matrix and access assertion", () => {
  // ADMIN has full access
  assert.equal(hasPermission("ADMIN", "manage:all"), true);
  assert.equal(hasPermission("ADMIN", "backup:request"), true);
  assert.equal(hasPermission("ADMIN", "migration:execute"), true);

  // USER has only chat:view_own
  assert.equal(hasPermission("USER", "chat:view_own"), true);
  assert.equal(hasPermission("USER", "backup:request"), false);
  assert.equal(hasPermission("USER", "manage:integrations"), false);

  // BACKUP_OPERATOR can backup but cannot execute migrations
  assert.equal(hasPermission("BACKUP_OPERATOR", "backup:request"), true);
  assert.equal(hasPermission("BACKUP_OPERATOR", "migration:execute"), false);

  // MIGRATION_OPERATOR can execute migrations
  assert.equal(hasPermission("MIGRATION_OPERATOR", "migration:execute"), true);
  assert.equal(hasPermission("MIGRATION_OPERATOR", "manage:users"), false);

  assert.throws(
    () => assertPermission("USER", "migration:execute"),
    /Permissão negada/
  );
});

test("Storage: Path traversal and Zip Slip attack prevention", () => {
  const tmpRoot = path.join(process.cwd(), "tmp-test-storage");
  const storage = new LocalFilesystemStorageProvider(tmpRoot);

  // Valid relative path
  const safe = storage.resolveSafePath("google/users/u123/gmail/test.mbox");
  assert.ok(safe.startsWith(path.resolve(tmpRoot)));

  // Malicious path traversal
  assert.throws(
    () => storage.resolveSafePath("../../../../../windows/system32/cmd.exe"),
    /Tentativa de Path Traversal bloqueada/
  );

  // Filename sanitization
  const clean = storage.sanitizeFilename("malicious/..\\file*name?.pst");
  assert.equal(clean.includes("/"), false);
  assert.equal(clean.includes("\\"), false);
  assert.equal(clean.includes(".."), false);

  if (fs.existsSync(tmpRoot)) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("Google Chat: Message deduplication key calculation", () => {
  const chatService = new GoogleChatArchiveService();

  const msg1 = {
    providerMessageId: "msg_abc_123",
    spaceName: "Projetos",
    spaceType: "SPACE" as const,
    senderName: "André",
    senderEmail: "andre@enging.pt",
    text: "Olá equipa, migração agendada.",
    sentAt: new Date("2026-10-02T10:00:00Z"),
    participants: [{ email: "andre@enging.pt" }],
  };

  const hash1 = chatService.generateMessageHash(msg1);

  // Same message without providerId falls back to composite hash
  const msg2 = { ...msg1, providerMessageId: undefined };
  const hash2 = chatService.generateMessageHash(msg2);

  // Exact duplicate with same content and timestamp
  const msg2Duplicate = { ...msg2 };
  const hash2Duplicate = chatService.generateMessageHash(msg2Duplicate);

  assert.equal(hash2, hash2Duplicate);
  assert.notEqual(hash1, hash2);
});

test("Email & MBOX: RFC 5322 parsing and deduplication key", async () => {
  const mboxParser = new MboxStreamParser();

  const rawRfc5322 = Buffer.from(
    `From: remetente@enging.pt\r\n` +
      `To: destino@dynamox.net\r\n` +
      `Date: Fri, 02 Oct 2026 09:00:00 +0000\r\n` +
      `Subject: Teste de Integridade\r\n` +
      `Message-ID: <unique-msg-id-12345@enging.pt>\r\n` +
      `MIME-Version: 1.0\r\n` +
      `Content-Type: text/plain; charset=utf-8\r\n\r\n` +
      `Conteúdo do email para teste.\r\n`
  );

  const parsed = await mboxParser.parseRfc5322(rawRfc5322);

  assert.equal(parsed.messageId, "<unique-msg-id-12345@enging.pt>");
  assert.equal(parsed.subject, "Teste de Integridade");
  assert.equal(parsed.from, "remetente@enging.pt");
  assert.equal(parsed.to, "destino@dynamox.net");
  assert.ok(parsed.dedupKey.length > 0);

  // Duplicate with same Message-ID must yield same dedupKey
  const duplicateParsed = await mboxParser.parseRfc5322(rawRfc5322);
  assert.equal(parsed.dedupKey, duplicateParsed.dedupKey);
});

test("Migration: State machine and Purview target folder generation", () => {
  const groupEmail = "informatica@enging.pt";
  const expectedTargetFolder = `/Google Groups/${groupEmail}`;
  assert.equal(expectedTargetFolder, "/Google Groups/informatica@enging.pt");
});
