import { prisma } from "../prisma";

export type AuditAction =
  | "LOGIN"
  | "LOGOUT"
  | "GOOGLE_SYNC"
  | "MICROSOFT_SYNC"
  | "BACKUP_REQUESTED"
  | "BACKUP_DOWNLOADED"
  | "BACKUP_VIEWED"
  | "BACKUP_FILE_DOWNLOADED"
  | "BACKUP_DELETED"
  | "CHAT_VIEW_ADMIN"
  | "CHAT_ATTACHMENT_DOWNLOAD"
  | "MIGRATION_CREATED"
  | "MIGRATION_DELETED"
  | "MIGRATION_RESTARTED"
  | "MIGRATION_QUEUE_ADDED"
  | "MIGRATION_QUEUE_REMOVED"
  | "MIGRATION_TARGET_CHANGED"
  | "MIGRATION_STARTED"
  | "MIGRATION_FINISHED"
  | "MIGRATION_FAILED"
  | "INTEGRATION_CONFIG_CHANGED"
  | "USER_ROLE_ASSIGNED"
  | "USER_ACTIVATED"
  | "PASSWORD_CHANGED"
  | "FIRST_ACCESS_PASSWORD_SENT"
  | "PASSWORD_RESET_BY_ADMIN"
  | "PASSWORD_SET_BY_ADMIN"
  | "SIMULATION_START"
  | "SIMULATION_END"
  | "USER_DELETED";

export interface LogAuditParams {
  actorUserId?: string | null;
  action: AuditAction;
  entityType: "USER" | "GROUP" | "BACKUP" | "CHAT" | "MIGRATION" | "INTEGRATION";
  entityId?: string | null;
  provider?: "GOOGLE" | "MICROSOFT" | "SYSTEM";
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

const REDACTED_KEYS = new Set([
  "password",
  "secret",
  "client_secret",
  "clientsecret",
  "token",
  "accesstoken",
  "refreshtoken",
  "private_key",
  "privatekey",
  "sas_url",
  "sasurl",
  "authorization",
]);

function sanitizeMetadata(data?: Record<string, unknown>): Record<string, unknown> {
  if (!data) return {};
  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (REDACTED_KEYS.has(lowerKey)) {
      cleaned[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      cleaned[key] = sanitizeMetadata(value as Record<string, unknown>);
    } else {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    const isUuid = params.actorUserId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.actorUserId);
    const metadata = sanitizeMetadata(params.metadata);
    if (params.actorUserId && !isUuid) {
      (metadata as Record<string, unknown>).actor = params.actorUserId;
    }

    await prisma.auditEvent.create({
      data: {
        actorUserId: isUuid ? params.actorUserId : null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId || null,
        provider: params.provider || "SYSTEM",
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
        metadata: metadata as any,
      },
    });
  } catch (error) {
    // Audit logging should never crash the main transaction, but log securely to console
    console.error("[AUDIT FAILURE] Não foi possível registar evento de auditoria:", error);
  }
}
