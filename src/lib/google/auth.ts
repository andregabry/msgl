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
  "https://www.googleapis.com/auth/chat.spaces.readonly",
  "https://www.googleapis.com/auth/chat.messages.readonly",
];

function resolveKeyPath(): string | null {
  const envPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;
  if (fs.existsSync("/app/service-account.json")) return "/app/service-account.json";
  if (fs.existsSync("service-account.json")) return "service-account.json";
  return envPath || null;
}

export function getGoogleAuthClient(impersonatedUser?: string) {
  const keyPath = resolveKeyPath();
  const adminUser = impersonatedUser || process.env.GOOGLE_IMPERSONATED_ADMIN;

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
  const keyPath = resolveKeyPath();
  return Boolean(keyPath && fs.existsSync(keyPath));
}
