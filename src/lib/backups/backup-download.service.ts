import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import crypto from "crypto";
import { prisma } from "../prisma";
import { storageProvider } from "../storage/backup-storage.provider";
import { logAudit } from "../audit/audit.service";

export const APP_STORAGE_ROOT = path.resolve(process.cwd(), "storage/backups");

// Ensure the application internal backup storage directory exists
if (!fs.existsSync(APP_STORAGE_ROOT)) {
  fs.mkdirSync(APP_STORAGE_ROOT, { recursive: true });
}

export interface BackupLocalStatus {
  isDownloaded: boolean;
  localPath: string | null;
  bytes: number;
  filename: string | null;
  isInternal: boolean;
}

export class BackupDownloadService {
  /**
   * Returns the app internal storage directory root.
   */
  public getAppStorageDirectory(): string {
    return APP_STORAGE_ROOT;
  }

  /**
   * Resolves the target destination path inside the app's storage directory.
   */
  public getInternalPath(serviceType: string, entityEmail: string, filename: string): string {
    const cleanService = (serviceType || "general").toLowerCase().replace(/[^a-z0-9_-]/g, "");
    const cleanEmail = (entityEmail || "unknown").toLowerCase().replace(/[^a-z0-9@._-]/g, "_");
    const dir = path.join(APP_STORAGE_ROOT, cleanService, cleanEmail);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, filename);
  }

  /**
   * Checks if a backup request currently has a downloaded file available.
   */
  public getBackupStatus(backupRequest: any): BackupLocalStatus {
    if (!backupRequest) {
      return { isDownloaded: false, localPath: null, bytes: 0, filename: null, isInternal: false };
    }

    if (backupRequest.status === "REMOVED_LOCAL") {
      return { isDownloaded: false, localPath: null, bytes: 0, filename: null, isInternal: false };
    }

    const artifacts = backupRequest.artifacts || [];
    for (const art of artifacts) {
      // 1. Check if present in internal app directory
      const internal = this.getInternalPath(
        backupRequest.serviceType,
        backupRequest.entityEmail,
        art.originalFilename || art.storedFilename
      );
      if (fs.existsSync(internal)) {
        try {
          const stat = fs.statSync(internal);
          if (stat.size > 0) {
            return {
              isDownloaded: true,
              localPath: internal,
              bytes: stat.size,
              filename: art.originalFilename,
              isInternal: true,
            };
          }
        } catch {}
      }

      // 2. Check if present in storage provider path
      if (art.relativePath) {
        try {
          const resolved = storageProvider.resolveSafePath(art.relativePath);
          if (fs.existsSync(resolved)) {
            const stat = fs.statSync(resolved);
            if (stat.size > 0) {
              const isInsideApp = resolved.toLowerCase().startsWith(APP_STORAGE_ROOT.toLowerCase());
              return {
                isDownloaded: true,
                localPath: resolved,
                bytes: stat.size,
                filename: art.originalFilename,
                isInternal: isInsideApp,
              };
            }
          }
        } catch {}
      }
    }

    return {
      isDownloaded: false,
      localPath: null,
      bytes: 0,
      filename: null,
      isInternal: false,
    };
  }

  /**
   * Downloads or copies a backup into the app's internal storage directory.
   */
  public async downloadBackupToApp(backupRequestId: string, actorUserId?: string): Promise<{
    success: boolean;
    isDownloaded: boolean;
    localPath: string;
    bytes: number;
    filename: string;
    message: string;
  }> {
    const backupReq = await prisma.backupRequest.findUnique({
      where: { id: backupRequestId },
      include: {
        artifacts: true,
        exports: true,
      },
    });

    if (!backupReq) {
      throw new Error(`Pedido de backup não encontrado: ${backupRequestId}`);
    }

    let artifact = backupReq.artifacts[0];
    if (!artifact) {
      throw new Error("Nenhum artefacto de exportação associado a este backup.");
    }

    const filename = artifact.originalFilename || artifact.storedFilename || `backup-${backupReq.id}.${backupReq.format.toLowerCase()}`;
    const targetPath = this.getInternalPath(backupReq.serviceType, backupReq.entityEmail, filename);

    // If source file already exists somewhere on disk
    let sourcePath: string | null = null;
    if (artifact.relativePath) {
      try {
        const resolved = storageProvider.resolveSafePath(artifact.relativePath);
        if (fs.existsSync(resolved)) {
          sourcePath = resolved;
        }
      } catch {}
    }

    if (!sourcePath) {
      const importedFrom = (backupReq.criteria as any)?.importedFrom;
      if (importedFrom && fs.existsSync(importedFrom)) {
        sourcePath = importedFrom;
      }
    }

    if (!sourcePath && fs.existsSync(targetPath)) {
      sourcePath = targetPath;
    }

    if (sourcePath && sourcePath !== targetPath) {
      // Stream/copy source file into the app's internal storage directory
      await fsp.copyFile(sourcePath, targetPath);
    } else if (!sourcePath) {
      throw new Error("Ficheiro de origem não encontrado no disco para download.");
    }

    const stat = await fsp.stat(targetPath);
    const relativeToStorage = path.relative(storageProvider.getRootDirectory(), targetPath).replace(/\\/g, "/");

    // Update artifact with the app storage location
    await prisma.backupArtifact.update({
      where: { id: artifact.id },
      data: {
        relativePath: relativeToStorage,
        bytes: BigInt(stat.size),
        isVerified: true,
        verifiedAt: new Date(),
      },
    });

    // Update backup request status to READY
    await prisma.backupRequest.update({
      where: { id: backupReq.id },
      data: {
        status: "READY",
      },
    });

    await logAudit({
      actorUserId,
      action: "BACKUP_DOWNLOADED",
      entityType: "BACKUP",
      entityId: backupReq.id,
      metadata: {
        operation: "DOWNLOAD_TO_APP_STORAGE",
        filename,
        storedPath: targetPath,
        bytes: stat.size,
      },
    });

    return {
      success: true,
      isDownloaded: true,
      localPath: targetPath,
      bytes: stat.size,
      filename,
      message: `Backup descarregado com sucesso para o armazenamento interno da aplicação (${filename}).`,
    };
  }

  /**
   * Removes the downloaded physical backup file from the app directory,
   * retaining metadata and state history.
   */
  public async removeBackupFromApp(backupRequestId: string, actorUserId?: string): Promise<{
    success: boolean;
    isDownloaded: boolean;
    message: string;
  }> {
    const backupReq = await prisma.backupRequest.findUnique({
      where: { id: backupRequestId },
      include: {
        artifacts: true,
      },
    });

    if (!backupReq) {
      throw new Error(`Pedido de backup não encontrado: ${backupRequestId}`);
    }

    for (const art of backupReq.artifacts) {
      const internal = this.getInternalPath(
        backupReq.serviceType,
        backupReq.entityEmail,
        art.originalFilename || art.storedFilename
      );

      // Remove from internal app storage if exists
      if (fs.existsSync(internal)) {
        try {
          fs.unlinkSync(internal);
        } catch (err) {
          console.error("Erro ao remover ficheiro interno:", err);
        }
      }

      // If relativePath points inside app storage directory, also remove
      if (art.relativePath) {
        try {
          const resolved = storageProvider.resolveSafePath(art.relativePath);
          if (
            resolved.toLowerCase().startsWith(APP_STORAGE_ROOT.toLowerCase()) &&
            fs.existsSync(resolved)
          ) {
            fs.unlinkSync(resolved);
          }
        } catch {}
      }

      await prisma.backupArtifact.update({
        where: { id: art.id },
        data: {
          isVerified: false,
        },
      });
    }

    await prisma.backupRequest.update({
      where: { id: backupReq.id },
      data: {
        status: "REMOVED_LOCAL",
      },
    });

    await logAudit({
      actorUserId,
      action: "BACKUP_DELETED",
      entityType: "BACKUP",
      entityId: backupReq.id,
      metadata: {
        operation: "REMOVE_LOCAL_APP_COPY",
        backupRequestId,
        entityEmail: backupReq.entityEmail,
      },
    });

    return {
      success: true,
      isDownloaded: false,
      message: "Cópia local do backup removida do armazenamento interno da aplicação com sucesso.",
    };
  }
}

export const backupDownloadService = new BackupDownloadService();
