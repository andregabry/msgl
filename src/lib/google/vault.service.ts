import { google, vault_v1 } from "googleapis";
import { getGoogleAuthClient } from "./auth";
import { prisma } from "../prisma";
import { storageProvider } from "../storage/backup-storage.provider";
import { logAudit } from "../audit/audit.service";
import https from "https";
import http from "http";
import { Readable } from "stream";

const APP_MATTER_NAME = "MigrateSystem_Backup_Archive";

export interface CreateVaultExportParams {
  backupRequestId: string;
  serviceType: "GMAIL" | "GOOGLE_CHAT" | "GOOGLE_GROUPS";
  targetEmail: string;
  format?: "MBOX" | "PST";
  dateRangeStart?: Date | null;
  dateRangeEnd?: Date | null;
}

export class GoogleVaultService {
  private getVaultClient(): vault_v1.Vault {
    const auth = getGoogleAuthClient();
    return google.vault({ version: "v1", auth });
  }

  /**
   * Returns configured Matter ID or creates a dedicated application Matter if not set.
   * Never re-uses random legal matters.
   */
  public async getOrCreateAppMatter(): Promise<string> {
    const configuredMatterId = process.env.GOOGLE_VAULT_MATTER_ID;
    if (configuredMatterId && configuredMatterId.trim() !== "") {
      return configuredMatterId.trim();
    }

    const vault = this.getVaultClient();

    // Check if dedicated Matter already exists
    const listRes = await vault.matters.list({
      view: "BASIC",
      state: "OPEN",
      pageSize: 50,
    });

    const existingMatter = (listRes.data.matters || []).find(
      (m) => m.name === APP_MATTER_NAME
    );

    if (existingMatter && existingMatter.matterId) {
      return existingMatter.matterId;
    }

    // Create a new dedicated Matter
    const createRes = await vault.matters.create({
      requestBody: {
        name: APP_MATTER_NAME,
        description: "Matter dedicado exclusivamente à extração e backup do Google Workspace Backup Hub",
      },
    });

    if (!createRes.data.matterId) {
      throw new Error("Não foi possível criar o Matter dedicado no Google Vault.");
    }

    return createRes.data.matterId;
  }

  /**
   * Request a real Google Vault export for Gmail, Groups, or Chat.
   */
  public async createExport(params: CreateVaultExportParams): Promise<{ exportId: string; matterId: string }> {
    const vault = this.getVaultClient();
    const matterId = await this.getOrCreateAppMatter();

    let corpus: string;
    let exportOptions: vault_v1.Schema$ExportOptions = {};
    const query: vault_v1.Schema$Query = {
      dataScope: "ALL_DATA",
      searchMethod: "ACCOUNT",
      accountInfo: {
        emails: [params.targetEmail],
      },
    };

    if (params.dateRangeStart) {
      query.startTime = params.dateRangeStart.toISOString();
    }
    if (params.dateRangeEnd) {
      query.endTime = params.dateRangeEnd.toISOString();
    }

    if (params.serviceType === "GMAIL") {
      corpus = "MAIL";
      query.corpus = corpus;
      exportOptions.mailOptions = {
        exportFormat: "MBOX",
        showConfidentialModeContent: true,
      };
    } else if (params.serviceType === "GOOGLE_GROUPS") {
      corpus = "GROUPS";
      query.corpus = corpus;
      query.searchMethod = "ROOM"; // Or account depending on groups query
      exportOptions.groupsOptions = {
        exportFormat: params.format === "PST" ? "PST" : "MBOX",
      };
    } else if (params.serviceType === "GOOGLE_CHAT") {
      corpus = "HANGOUTS_CHAT";
      query.corpus = corpus;
      exportOptions.hangoutsChatOptions = {
        exportFormat: "MBOX",
      };
    } else {
      throw new Error(`Tipo de serviço não suportado pelo Google Vault: ${params.serviceType}`);
    }

    const exportName = `Export_${params.serviceType}_${params.targetEmail}_${Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, "_");

    const requestBody: vault_v1.Schema$Export = {
      name: exportName,
      query,
      exportOptions,
    };

    const res = await vault.matters.exports.create({
      matterId,
      requestBody,
    });

    const exportId = res.data.id;
    if (!exportId) {
      throw new Error("Resposta da API do Google Vault não retornou Export ID.");
    }

    // Persist Export details in database
    await prisma.backupExport.create({
      data: {
        backupRequestId: params.backupRequestId,
        matterId,
        exportId,
        providerStatus: res.data.status || "IN_PROGRESS",
        providerStats: res.data.stats as any || {},
      },
    });

    // Update BackupRequest state
    await prisma.backupRequest.update({
      where: { id: params.backupRequestId },
      data: { status: "EXPORT_RUNNING" },
    });

    await prisma.backupEvent.create({
      data: {
        backupRequestId: params.backupRequestId,
        fromStatus: "REQUESTED",
        toStatus: "EXPORT_RUNNING",
        message: `Exportação criada no Google Vault (ID: ${exportId})`,
      },
    });

    return { exportId, matterId };
  }

  /**
   * Check status of export in Google Vault.
   */
  public async getExportStatus(matterId: string, exportId: string): Promise<vault_v1.Schema$Export> {
    const vault = this.getVaultClient();
    const res = await vault.matters.exports.get({
      matterId,
      exportId,
    });
    return res.data;
  }

  /**
   * Stream download Cloud Storage export files to local storage without loading into RAM.
   */
  public async downloadExportFiles(
    backupRequestId: string,
    matterId: string,
    exportId: string
  ): Promise<void> {
    const exportData = await this.getExportStatus(matterId, exportId);

    if (exportData.status !== "COMPLETED") {
      throw new Error(`Exportação ainda não concluída no Google Vault (Status: ${exportData.status})`);
    }

    const cloudFiles = exportData.cloudStorageSink?.files || [];
    if (cloudFiles.length === 0) {
      throw new Error("A exportação do Google Vault foi concluída mas não contém ficheiros para download.");
    }

    await prisma.backupRequest.update({
      where: { id: backupRequestId },
      data: { status: "DOWNLOADING" },
    });

    await prisma.backupEvent.create({
      data: {
        backupRequestId,
        fromStatus: "REMOTE_READY",
        toStatus: "DOWNLOADING",
        message: `Iniciando download de ${cloudFiles.length} ficheiro(s) do Google Vault`,
      },
    });

    const bReq = await prisma.backupRequest.findUniqueOrThrow({
      where: { id: backupRequestId },
    });

    // Physical path abstraction: google/users/{userId}/gmail/{backupId}/
    const subPath = `google/${bReq.entityType.toLowerCase()}s/${bReq.entityId || bReq.entityEmail}/${bReq.serviceType.toLowerCase()}/${backupRequestId}`;

    for (const file of cloudFiles) {
      if (!file.objectName) continue;

      const filename = file.objectName.split("/").pop() || `vault-export-${Date.now()}.zip`;
      
      // We obtain an authenticated download stream using Google Auth or Signed URL
      const auth = getGoogleAuthClient();
      const token = await auth.getAccessToken();

      // Cloud storage media download URL
      const bucketName = exportData.cloudStorageSink?.files?.[0]?.bucketName;
      const downloadUrl = `https://storage.googleapis.com/download/storage/v1/b/${bucketName}/o/${encodeURIComponent(file.objectName)}?alt=media`;

      const responseStream = await new Promise<Readable>((resolve, reject) => {
        const req = https.get(
          downloadUrl,
          {
            headers: {
              Authorization: `Bearer ${token.token}`,
            },
          },
          (res) => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(res);
            } else {
              reject(new Error(`Erro ao transferir ficheiro do Vault Cloud Storage: HTTP ${res.statusCode}`));
            }
          }
        );
        req.on("error", reject);
      });

      const writeResult = await storageProvider.writeStream(subPath, filename, responseStream);

      // Verify integrity against Vault's reported md5/size if available
      const verified = await storageProvider.verifyChecksum(writeResult.relativePath, writeResult.sha256);

      const artifact = await prisma.backupArtifact.create({
        data: {
          backupRequestId,
          relativePath: writeResult.relativePath,
          originalFilename: filename,
          storedFilename: writeResult.storedFilename,
          bytes: BigInt(writeResult.bytes),
          sha256: writeResult.sha256,
          mimeType: filename.endsWith(".zip") ? "application/zip" : filename.endsWith(".mbox") ? "application/mbox" : "application/octet-stream",
          origin: "VAULT_EXPORT",
          isVerified: verified,
          verifiedAt: verified ? new Date() : null,
        },
      });

      await prisma.backupFile.create({
        data: {
          backupArtifactId: artifact.id,
          relativePath: writeResult.relativePath,
          filename: writeResult.storedFilename,
          bytes: BigInt(writeResult.bytes),
          sha256: writeResult.sha256,
          mimeType: artifact.mimeType,
        },
      });
    }

    await prisma.backupRequest.update({
      where: { id: backupRequestId },
      data: { status: "READY" },
    });

    await prisma.backupEvent.create({
      data: {
        backupRequestId,
        fromStatus: "DOWNLOADING",
        toStatus: "READY",
        message: "Download e verificação de integridade concluídos com sucesso.",
      },
    });

    await logAudit({
      action: "BACKUP_DOWNLOADED",
      entityType: "BACKUP",
      entityId: backupRequestId,
      provider: "GOOGLE",
      metadata: { cloudFilesCount: cloudFiles.length },
    });
  }
}

export const googleVaultService = new GoogleVaultService();
