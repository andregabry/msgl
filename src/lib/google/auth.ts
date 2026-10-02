import { google } from "googleapis";
import fs from "fs";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/admin.directory.user.readonly",
  "https://www.googleapis.com/auth/admin.directory.group.readonly",
  "https://www.googleapis.com/auth/admin.directory.group.member.readonly",
  "https://www.googleapis.com/auth/apps.groups.settings",
  "https://www.googleapis.com/auth/ediscovery.readonly",
  "https://mail.google.com/",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/contacts",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive.readonly",
];

export function getGoogleAuthClient() {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  const adminUser = process.env.GOOGLE_IMPERSONATED_ADMIN;

  if (!keyPath || !fs.existsSync(keyPath)) {
    throw new Error(
      `Ficheiro de Service Account Google não encontrado no caminho: ${keyPath || "(não configurado)"}`
    );
  }

  const rawKey = fs.readFileSync(keyPath, "utf-8");
  const keyJson = JSON.parse(rawKey);

  const auth = new google.auth.JWT({
    email: keyJson.client_email,
    key: keyJson.private_key,
    scopes: GOOGLE_SCOPES,
    subject: adminUser || undefined, // Domain-wide delegation impersonation
  });

  return auth;
}

export function isGoogleConfigured(): boolean {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  return Boolean(keyPath && fs.existsSync(keyPath));
}
