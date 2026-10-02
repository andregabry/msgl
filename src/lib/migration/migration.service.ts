import { prisma } from "../prisma";
import { storageProvider } from "../storage/backup-storage.provider";
import { purviewPstAdapter } from "../microsoft/adapters/historical-mail-import.adapter";
import { logAudit } from "../audit/audit.service";

export interface ReadinessCheckItem {
  key: string;
  label: string;
  passed: boolean;
  message: string;
  isMandatory: boolean;
}

export interface MigrationReadinessReport {
  isReady: boolean;
  checks: ReadinessCheckItem[];
}

export class MigrationService {
  /**
   * Validate full readiness for a Google Group -> Microsoft Mailbox migration.
   */
  public async checkMigrationReadiness(
    groupEmail: string,
    targetMailboxEmail: string,
    backupRequestId?: string
  ): Promise<MigrationReadinessReport> {
    const checks: ReadinessCheckItem[] = [];

    // 1. Google Group Exists
    const group = await prisma.googleGroup.findUnique({
      where: { email: groupEmail.toLowerCase() },
    });
    checks.push({
      key: "group",
      label: "Grupo Google",
      passed: Boolean(group),
      message: group ? `Grupo '${group.name}' localizado.` : `Grupo '${groupEmail}' não existe no inventário local.`,
      isMandatory: true,
    });

    // 2. Backup Request and Artifacts Exist
    const backupReq = backupRequestId
      ? await prisma.backupRequest.findUnique({
          where: { id: backupRequestId },
          include: { artifacts: true },
        })
      : await prisma.backupRequest.findFirst({
          where: { entityEmail: groupEmail.toLowerCase(), status: "READY" },
          include: { artifacts: true },
          orderBy: { createdAt: "desc" },
        });

    const hasBackup = Boolean(backupReq && backupReq.artifacts.length > 0);
    checks.push({
      key: "backup",
      label: "Backup Disponível",
      passed: hasBackup,
      message: hasBackup
        ? `Backup ID '${backupReq!.id}' (${backupReq!.format}) disponível.`
        : "Nenhum backup concluído disponível para este grupo.",
      isMandatory: true,
    });

    // 3. Storage and Integrity Check
    let integrityPassed = false;
    let integrityMsg = "Não verificado";
    if (hasBackup && backupReq!.artifacts[0]) {
      const art = backupReq!.artifacts[0];
      const exists = await storageProvider.exists(art.relativePath);
      if (exists) {
        integrityPassed = await storageProvider.verifyChecksum(art.relativePath, art.sha256);
        integrityMsg = integrityPassed
          ? `Integridade verificada (SHA-256: ${art.sha256.substring(0, 12)}...)`
          : "Falha de verificação de checksum SHA-256 do arquivo local.";
      } else {
        integrityMsg = `Ficheiro físico não encontrado no storage: ${art.relativePath}`;
      }
    }
    checks.push({
      key: "integrity",
      label: "Integridade do Backup",
      passed: integrityPassed,
      message: integrityMsg,
      isMandatory: true,
    });

    // 4. Destination Mailbox Check
    const mailbox = await prisma.microsoftMailbox.findUnique({
      where: { primarySmtpAddress: targetMailboxEmail.toLowerCase() },
    });
    const destPassed = Boolean(mailbox);
    checks.push({
      key: "destination",
      label: "Caixa Microsoft de Destino",
      passed: destPassed,
      message: destPassed
        ? `Destino '${mailbox!.primarySmtpAddress}' (${mailbox!.recipientType}) verificado.`
        : `Caixa destino '${targetMailboxEmail}' não localizada no inventário Microsoft.`,
      isMandatory: true,
    });

    // 5. Shared Mailbox Recommendation
    const isShared = mailbox?.recipientType === "SHARED_MAILBOX";
    checks.push({
      key: "shared_recommendation",
      label: "Tipo de Caixa Recomendado",
      passed: isShared,
      message: isShared
        ? "Caixa de destino é uma Caixa Partilhada (Shared Mailbox)."
        : `Caixa é do tipo '${mailbox?.recipientType || "DESCONHECIDO"}'. O recomendado para Google Groups é Shared Mailbox.`,
      isMandatory: false,
    });

    // 6. Concurrency Check (No active job for same pair)
    const activeJob = await prisma.migrationJob.findFirst({
      where: {
        sourceGroupEmail: groupEmail.toLowerCase(),
        status: { in: ["PREPARING", "VALIDATING", "IMPORTING"] },
      },
    });
    checks.push({
      key: "concurrency",
      label: "Sem Jobs Concorrentes",
      passed: !activeJob,
      message: activeJob
        ? `Já existe uma migração em curso para este grupo (Job ID: ${activeJob.id}).`
        : "Nenhum trabalho concorrente em execução.",
      isMandatory: true,
    });

    const isReady = checks.every((c) => (c.isMandatory ? c.passed : true));

    return {
      isReady,
      checks,
    };
  }

  /**
   * Suggest target Microsoft mailboxes for a Google Group with confidence rating.
   */
  public async suggestMapping(groupEmail: string) {
    const localPart = groupEmail.split("@")[0].toLowerCase();
    const mailboxes = await prisma.microsoftMailbox.findMany();

    const suggestions = mailboxes.map((mb) => {
      const mbLocal = mb.primarySmtpAddress.split("@")[0].toLowerCase();
      let confidence: "EXACT" | "ALIAS" | "MANUAL" | "NONE" = "NONE";

      if (mbLocal === localPart) {
        confidence = "EXACT";
      } else if (mbLocal.includes(localPart) || localPart.includes(mbLocal)) {
        confidence = "ALIAS";
      } else {
        confidence = "MANUAL";
      }

      return {
        mailbox: mb,
        confidence,
        isRecommended: mb.recipientType === "SHARED_MAILBOX",
      };
    });

    // Sort by Exact, then Alias, then Shared Mailbox
    return suggestions.sort((a, b) => {
      if (a.confidence === "EXACT" && b.confidence !== "EXACT") return -1;
      if (b.confidence === "EXACT" && a.confidence !== "EXACT") return 1;
      if (a.isRecommended && !b.isRecommended) return -1;
      if (!a.isRecommended && b.isRecommended) return 1;
      return 0;
    });
  }

  /**
   * Prepare a MigrationJob for execution via Purview PST adapter.
   */
  public async createAndPrepareJob(
    groupEmail: string,
    targetMailboxEmail: string,
    actorUserId?: string
  ) {
    const group = await prisma.googleGroup.findUniqueOrThrow({
      where: { email: groupEmail.toLowerCase() },
    });

    const mailbox = await prisma.microsoftMailbox.findUniqueOrThrow({
      where: { primarySmtpAddress: targetMailboxEmail.toLowerCase() },
    });

    const backupReq = await prisma.backupRequest.findFirst({
      where: { entityEmail: groupEmail.toLowerCase(), status: "READY" },
      include: { artifacts: true },
      orderBy: { createdAt: "desc" },
    });

    if (!backupReq || backupReq.artifacts.length === 0) {
      throw new Error(`Não foi encontrado backup concluído para o grupo ${groupEmail}.`);
    }

    const artifact = backupReq.artifacts[0];

    const job = await prisma.migrationJob.create({
      data: {
        sourceGroupId: group.id,
        sourceGroupEmail: group.email,
        targetMailboxId: mailbox.id,
        targetMailboxEmail: mailbox.primarySmtpAddress,
        backupRequestId: backupReq.id,
        backupArtifactId: artifact.id,
        status: "PREPARING",
      },
    });

    // Run preparation with Purview adapter
    const prepResult = await purviewPstAdapter.prepare(job.id);

    await logAudit({
      actorUserId,
      action: "MIGRATION_CREATED",
      entityType: "MIGRATION",
      entityId: job.id,
      metadata: {
        groupEmail,
        targetMailboxEmail,
        mappingCsv: prepResult.mappingCsvPath,
      },
    });

    return { job, prepResult };
  }
}

export const migrationService = new MigrationService();
