import { prisma } from "../../prisma";
import { storageProvider } from "../../storage/backup-storage.provider";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { spawn } from "child_process";

export interface ImportValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ImportPrepareResult {
  preparedCount: number;
  mappingCsvPath?: string;
  purviewTargetRoot?: string;
}

export interface MicrosoftHistoricalMailImportAdapter {
  readonly adapterName: string;

  validate(migrationJobId: string): Promise<ImportValidationResult>;

  prepare(migrationJobId: string): Promise<ImportPrepareResult>;

  import(migrationJobId: string): Promise<{ status: string; message: string }>;

  getStatus(migrationJobId: string): Promise<{ status: string; progressPercent: number; details: any }>;
}

/**
 * Official Microsoft Purview PST Import Adapter (Required Fallback & Standard for Google Groups)
 */
export class MicrosoftPurviewPstAdapter implements MicrosoftHistoricalMailImportAdapter {
  readonly adapterName = "MicrosoftPurviewPstAdapter";

  public async validate(migrationJobId: string): Promise<ImportValidationResult> {
    const job = await prisma.migrationJob.findUniqueOrThrow({
      where: { id: migrationJobId },
      include: { backupArtifact: true },
    });

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!job.backupArtifact) {
      errors.push("Nenhum artefacto de backup associado ao trabalho de migração.");
    } else {
      const exists = await storageProvider.exists(job.backupArtifact.relativePath);
      if (!exists) {
        errors.push(`Ficheiro de backup não existe no storage: ${job.backupArtifact.relativePath}`);
      }
    }

    if (!job.targetMailboxEmail || !job.targetMailboxEmail.includes("@")) {
      errors.push("Caixa de correio Microsoft de destino inválida ou não especificada.");
    }

    const mailbox = await prisma.microsoftMailbox.findUnique({
      where: { primarySmtpAddress: job.targetMailboxEmail.toLowerCase() },
    });

    if (!mailbox) {
      warnings.push(`Caixa de correio destino '${job.targetMailboxEmail}' não encontrada no inventário local Microsoft.`);
    } else if (mailbox.recipientType !== "SHARED_MAILBOX") {
      warnings.push(`Destino '${job.targetMailboxEmail}' é do tipo '${mailbox.recipientType}'. O recomendado para Google Groups é 'SHARED_MAILBOX'.`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Generates standard Microsoft 365 Purview PST Import Mapping CSV
   * Columns: Workload,FilePath,Name,Mailbox,IsArchive,TargetRootFolder,ContentCodePage,SPFileContainer,SPManifestContainer,SPSiteUrl
   */
  public async prepare(migrationJobId: string): Promise<ImportPrepareResult> {
    const job = await prisma.migrationJob.findUniqueOrThrow({
      where: { id: migrationJobId },
      include: { backupArtifact: true },
    });

    if (!job.backupArtifact) {
      throw new Error("Trabalho de migração não possui artefacto de backup.");
    }

    const pstFilename = job.backupArtifact.storedFilename;
    const targetFolder = `/Google Groups/${job.sourceGroupEmail}`;

    // Standard RFC-compliant Purview CSV format
    const csvHeader = "Workload,FilePath,Name,Mailbox,IsArchive,TargetRootFolder,ContentCodePage,SPFileContainer,SPManifestContainer,SPSiteUrl\r\n";
    const csvRow = `Exchange,,${pstFilename},${job.targetMailboxEmail},FALSE,"${targetFolder}",,,,\r\n`;
    const csvContent = csvHeader + csvRow;

    // Save CSV to staging storage
    const subPath = `microsoft/staging/${migrationJobId}`;
    const csvBuffer = Buffer.from(csvContent, "utf-8");
    const writeResult = await storageProvider.writeStream(
      subPath,
      `pst-mapping-${job.sourceGroupEmail.replace(/[^a-zA-Z0-9_-]/g, "_")}.csv`,
      require("stream").Readable.from(csvBuffer)
    );

    await prisma.migrationJob.update({
      where: { id: migrationJobId },
      data: {
        purviewMappingCsvPath: writeResult.relativePath,
        status: "READY_TO_IMPORT",
      },
    });

    await prisma.migrationEvent.create({
      data: {
        migrationJobId,
        step: "PURVIEW_MAPPING_GENERATED",
        status: "SUCCESS",
        message: `Ficheiro de mapeamento Microsoft Purview gerado: ${writeResult.storedFilename}`,
        metadata: { relativePath: writeResult.relativePath, targetFolder },
      },
    });

    return {
      preparedCount: 1,
      mappingCsvPath: writeResult.relativePath,
      purviewTargetRoot: targetFolder,
    };
  }

  /**
   * Transitions to AWAITING_PURVIEW_JOB and executes AzCopy upload if SAS URL is provided.
   */
  public async import(migrationJobId: string): Promise<{ status: string; message: string }> {
    const job = await prisma.migrationJob.findUniqueOrThrow({
      where: { id: migrationJobId },
      include: { backupArtifact: true },
    });

    const sasUrl = process.env.PURVIEW_PST_SAS_URL;

    if (sasUrl && sasUrl.trim() !== "") {
      // Execute AzCopy in background worker
      this.runAzCopyUpload(migrationJobId, sasUrl, job.backupArtifact!.relativePath);
    }

    await prisma.migrationJob.update({
      where: { id: migrationJobId },
      data: { status: "AWAITING_PURVIEW_JOB" },
    });

    await prisma.migrationEvent.create({
      data: {
        migrationJobId,
        step: "IMPORT_STATE_UPDATED",
        status: "AWAITING_PURVIEW_JOB",
        message: "Dados preparados. Aguardando submissão / execução do trabalho no Microsoft Purview.",
      },
    });

    return {
      status: "AWAITING_PURVIEW_JOB",
      message: "Ficheiro PST e mapeamento CSV preparados com sucesso. Crie o trabalho de importação no Microsoft Purview.",
    };
  }

  public async getStatus(migrationJobId: string) {
    const job = await prisma.migrationJob.findUniqueOrThrow({
      where: { id: migrationJobId },
    });

    return {
      status: job.status,
      progressPercent: job.status === "COMPLETED" ? 100 : job.status === "AWAITING_PURVIEW_JOB" ? 80 : 20,
      details: {
        purviewJobId: job.purviewJobId,
        mappingCsvPath: job.purviewMappingCsvPath,
        azcopyStatus: job.azcopyStatus,
      },
    };
  }

  /**
   * Run AzCopy in an isolated child process without exposing SAS URL
   */
  private runAzCopyUpload(migrationJobId: string, sasUrl: string, relativePath: string): void {
    const safeSourcePath = storageProvider.resolveSafePath(relativePath);

    // Launch AzCopy if available on system
    const azCopyCmd = process.platform === "win32" ? "azcopy.exe" : "azcopy";
    const child = spawn(azCopyCmd, ["copy", safeSourcePath, sasUrl, "--recursive=false"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.on("close", async (code) => {
      await prisma.migrationJob.update({
        where: { id: migrationJobId },
        data: {
          azcopyStatus: code === 0 ? "UPLOADED" : `FAILED_CODE_${code}`,
        },
      });

      await prisma.migrationEvent.create({
        data: {
          migrationJobId,
          step: "AZCOPY_UPLOAD",
          status: code === 0 ? "SUCCESS" : "ERROR",
          message: code === 0 ? "Upload do PST para o storage da Microsoft concluído via AzCopy." : `Falha no upload do AzCopy (Exit Code ${code}).`,
        },
      });
    });

    child.on("error", async (err) => {
      console.warn("[AZCOPY] Executável azcopy não encontrado ou erro de execução:", err.message);
      await prisma.migrationJob.update({
        where: { id: migrationJobId },
        data: { azcopyStatus: "AZCOPY_NOT_FOUND" },
      });
    });
  }
}

/**
 * Future Official Non-Draft MIME Import Adapter
 */
export class MicrosoftSupportedMimeImportAdapter implements MicrosoftHistoricalMailImportAdapter {
  readonly adapterName = "MicrosoftSupportedMimeImportAdapter";

  async validate(_migrationJobId: string): Promise<ImportValidationResult> {
    // Currently, Microsoft has not released a generally available, non-draft historical MIME direct ingestion endpoint.
    return {
      isValid: false,
      errors: [
        "A API oficial Microsoft Graph para importação histórica non-draft com preservação completa de cabeçalhos RFC ainda não se encontra GA.",
        "Utilize o adaptador oficial MicrosoftPurviewPstAdapter para migrações em produção.",
      ],
      warnings: [],
    };
  }

  async prepare(_migrationJobId: string): Promise<ImportPrepareResult> {
    throw new Error("Adaptador MIME direto indisponível. Utilize MicrosoftPurviewPstAdapter.");
  }

  async import(_migrationJobId: string): Promise<{ status: string; message: string }> {
    throw new Error("Adaptador MIME direto indisponível. Utilize MicrosoftPurviewPstAdapter.");
  }

  async getStatus(_migrationJobId: string) {
    return {
      status: "UNAVAILABLE",
      progressPercent: 0,
      details: {},
    };
  }
}

export const purviewPstAdapter = new MicrosoftPurviewPstAdapter();
export const supportedMimeAdapter = new MicrosoftSupportedMimeImportAdapter();
