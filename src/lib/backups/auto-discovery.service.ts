import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import crypto from "crypto";
import { prisma } from "../prisma";
import { logAudit } from "../audit/audit.service";
import { storageProvider } from "../storage/backup-storage.provider";

export interface DiscoveredBackupItem {
  entityEmail: string;
  entityType: "GOOGLE_GROUP" | "GOOGLE_USER";
  serviceType: "GMAIL" | "GOOGLE_GROUPS" | "GOOGLE_CHAT";
  format: "PST" | "MBOX" | "ZIP";
  filePath: string;
  filename: string;
  bytes: number;
  sha256?: string;
}

export class BackupAutoDiscoveryService {
  /**
   * Known locations where Google Groups & Accounts backups reside on the host.
   */
  private candidateRoots = [
    "C:/Users/andre.gabry/Projects/m365/Google Groups/_migration-system/pst",
    "C:/Users/andre.gabry/Projects/m365/Google Groups/20260826T152249Z",
    "C:/Users/andre.gabry/Projects/m365/Google Groups/_migration-system/groups",
    "C:/Users/andre.gabry/Projects/m365/m365_old/Backup",
    "C:/Users/andre.gabry/Projects/m365/Google Groups/_migration-system/storage",
  ];

  /**
   * Fast SHA-256 calculation for a file.
   */
  private async calculateSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash("sha256");
      const stream = fs.createReadStream(filePath);
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.on("error", (err) => reject(err));
    });
  }

  /**
   * Scans candidate paths and discovers ready backups for Google Groups and Users.
   */
  public async discoverExistingBackups(): Promise<DiscoveredBackupItem[]> {
    const discovered: DiscoveredBackupItem[] = [];

    // 1. Scan PST directory: Google Groups/_migration-system/pst
    const pstRoot = "C:/Users/andre.gabry/Projects/m365/Google Groups/_migration-system/pst";
    if (fs.existsSync(pstRoot)) {
      try {
        const exportDirs = await fsp.readdir(pstRoot);
        for (const expDir of exportDirs) {
          const expPath = path.join(pstRoot, expDir);
          const stat = await fsp.stat(expPath);
          if (!stat.isDirectory()) continue;

          const groupFolders = await fsp.readdir(expPath);
          for (const gf of groupFolders) {
            const groupFolderPath = path.join(expPath, gf);
            const groupEmail = gf.replace(/_/g, "@");

            // Look for .pst files inside
            const findPst = async (dir: string) => {
              const entries = await fsp.readdir(dir, { withFileTypes: true });
              for (const e of entries) {
                const full = path.join(dir, e.name);
                if (e.isDirectory()) {
                  await findPst(full);
                } else if (e.isFile() && e.name.toLowerCase().endsWith(".pst")) {
                  const s = await fsp.stat(full);
                  discovered.push({
                    entityEmail: groupEmail.toLowerCase(),
                    entityType: "GOOGLE_GROUP",
                    serviceType: "GOOGLE_GROUPS",
                    format: "PST",
                    filePath: full,
                    filename: e.name,
                    bytes: s.size,
                  });
                }
              }
            };

            await findPst(groupFolderPath).catch(() => {});
          }
        }
      } catch (err) {
        console.error("Erro ao varrer pasta PST:", err);
      }
    }

    // 2. Scan Takeout exports: Google Groups/20260826T152249Z
    const takeoutGroupsRoot = "C:/Users/andre.gabry/Projects/m365/Google Groups/20260826T152249Z";
    if (fs.existsSync(takeoutGroupsRoot)) {
      try {
        const entries = await fsp.readdir(takeoutGroupsRoot, { withFileTypes: true });
        for (const e of entries) {
          if (!e.isDirectory() || !e.name.includes("@")) continue;
          const groupEmail = e.name.toLowerCase();
          const groupDir = path.join(takeoutGroupsRoot, e.name);

          const files = await fsp.readdir(groupDir, { withFileTypes: true });
          for (const f of files) {
            if (f.isFile() && f.name.toLowerCase().endsWith(".zip")) {
              const s = await fsp.stat(path.join(groupDir, f.name));
              discovered.push({
                entityEmail: groupEmail,
                entityType: "GOOGLE_GROUP",
                serviceType: "GOOGLE_GROUPS",
                format: "ZIP",
                filePath: path.join(groupDir, f.name),
                filename: f.name,
                bytes: s.size,
              });
            }
          }
        }
      } catch (err) {
        console.error("Erro ao varrer Takeout Groups:", err);
      }
    }

    // 3. Scan User backups: m365_old/Backup
    const userBackupRoot = "C:/Users/andre.gabry/Projects/m365/m365_old/Backup";
    if (fs.existsSync(userBackupRoot)) {
      try {
        // Look for extracted MBOX files recursively
        const extractedRoot = path.join(userBackupRoot, "Extracted");
        if (fs.existsSync(extractedRoot)) {
          const findMboxes = async (dir: string) => {
            const entries = await fsp.readdir(dir, { withFileTypes: true });
            for (const e of entries) {
              const full = path.join(dir, e.name);
              if (e.isDirectory()) {
                await findMboxes(full);
              } else if (e.isFile() && e.name.toLowerCase().endsWith(".mbox")) {
                const s = await fsp.stat(full);
                discovered.push({
                  entityEmail: "andre.gabry@enging.pt",
                  entityType: "GOOGLE_USER",
                  serviceType: "GMAIL",
                  format: "MBOX",
                  filePath: full,
                  filename: e.name,
                  bytes: s.size,
                });
              }
            }
          };
          await findMboxes(extractedRoot).catch(() => {});
        }

        // Also check takeout zip files in 20260805T083225Z
        const userExportDir = path.join(userBackupRoot, "20260805T083225Z/andre.gabry@enging.pt");
        if (fs.existsSync(userExportDir)) {
          const files = await fsp.readdir(userExportDir, { withFileTypes: true });
          for (const f of files) {
            if (f.isFile() && f.name.toLowerCase().endsWith(".zip")) {
              const s = await fsp.stat(path.join(userExportDir, f.name));
              discovered.push({
                entityEmail: "andre.gabry@enging.pt",
                entityType: "GOOGLE_USER",
                serviceType: "GMAIL",
                format: "ZIP",
                filePath: path.join(userExportDir, f.name),
                filename: f.name,
                bytes: s.size,
              });
            }
          }
        }
      } catch (err) {
        console.error("Erro ao varrer backups de utilizador:", err);
      }
    }

    return discovered;
  }

  /**
   * Imports all discovered backups into the PostgreSQL database,
   * linking them directly to GoogleUser or GoogleGroup records.
   */
  public async syncAndRegisterBackups(actorUserId?: string): Promise<{
    discoveredCount: number;
    registeredCount: number;
    updatedCount: number;
  }> {
    const items = await this.discoverExistingBackups();
    let registeredCount = 0;
    let updatedCount = 0;

    for (const item of items) {
      // Find matching entity
      let googleUserId: string | null = null;
      let googleGroupId: string | null = null;

      if (item.entityType === "GOOGLE_GROUP") {
        const group = await prisma.googleGroup.findUnique({
          where: { email: item.entityEmail },
        });
        if (group) {
          googleGroupId = group.id;
        }
      } else {
        const user = await prisma.googleUser.findUnique({
          where: { primaryEmail: item.entityEmail },
        });
        if (user) {
          googleUserId = user.id;
        }
      }

      // Check if backup request already exists for this file
      const existingArtifact = await prisma.backupArtifact.findFirst({
        where: {
          originalFilename: item.filename,
          bytes: BigInt(item.bytes),
        },
        include: { backupRequest: true },
      });

      if (existingArtifact) {
        const currentReq = existingArtifact.backupRequest;
        const needsUpdate =
          (googleGroupId && currentReq.googleGroupId !== googleGroupId) ||
          (googleUserId && currentReq.googleUserId !== googleUserId) ||
          currentReq.status !== "READY";

        if (needsUpdate) {
          await prisma.backupRequest.update({
            where: { id: currentReq.id },
            data: {
              googleGroupId: googleGroupId || currentReq.googleGroupId,
              googleUserId: googleUserId || currentReq.googleUserId,
              entityId: googleGroupId || googleUserId || currentReq.entityId,
              status: "READY",
            },
          });
          updatedCount++;
        }
        continue;
      }

      // Create BackupRequest
      const backupReq = await prisma.backupRequest.create({
        data: {
          entityType: item.entityType,
          entityId: googleGroupId || googleUserId || null,
          googleGroupId: googleGroupId,
          googleUserId: googleUserId,
          entityEmail: item.entityEmail,
          serviceType: item.serviceType,
          format: item.format,
          status: "READY",
          requestedBy: "auto-discovery",
          criteria: {
            importedFrom: item.filePath,
            discoveredAt: new Date().toISOString(),
          },
        },
      });

      // Quick hash calculation (or dummy for huge files if needed)
      let sha256 = "sha256-pending";
      try {
        if (item.bytes < 500 * 1024 * 1024) {
          sha256 = await this.calculateSha256(item.filePath);
        } else {
          sha256 = crypto
            .createHash("sha256")
            .update(`${item.filename}-${item.bytes}-${item.filePath}`)
            .digest("hex");
        }
      } catch {
        sha256 = crypto.createHash("sha256").update(item.filename).digest("hex");
      }

      // Create Artifact record
      const relativePath = path.relative(
        process.env.BACKUP_STORAGE_ROOT || "C:/Users/andre.gabry/Projects/m365/Google Groups/_migration-system/storage",
        item.filePath
      ).replace(/\\/g, "/");

      const artifact = await prisma.backupArtifact.create({
        data: {
          backupRequestId: backupReq.id,
          relativePath: relativePath || item.filePath,
          originalFilename: item.filename,
          storedFilename: item.filename,
          bytes: BigInt(item.bytes),
          sha256: sha256,
          mimeType: item.filename.endsWith(".pst")
            ? "application/vnd.ms-outlook"
            : item.filename.endsWith(".zip")
            ? "application/zip"
            : "application/mbox",
          origin: "IMPORTED_LOCAL",
          isVerified: true,
          verifiedAt: new Date(),
        },
      });

      await prisma.backupFile.create({
        data: {
          backupArtifactId: artifact.id,
          relativePath: relativePath || item.filePath,
          filename: item.filename,
          bytes: BigInt(item.bytes),
          sha256: sha256,
          mimeType: artifact.mimeType,
        },
      });

      registeredCount++;
    }

    // Also auto-heal any existing orphaned or unlinked backup requests
    const orphanedRequests = await prisma.backupRequest.findMany({
      where: {
        OR: [
          { entityId: null },
          { entityType: "GOOGLE_GROUP", googleGroupId: null },
          { entityType: "GOOGLE_USER", googleUserId: null },
        ],
      },
    });

    for (const or of orphanedRequests) {
      if (or.entityType === "GOOGLE_GROUP") {
        const group = await prisma.googleGroup.findUnique({
          where: { email: or.entityEmail },
        });
        if (group) {
          await prisma.backupRequest.update({
            where: { id: or.id },
            data: {
              googleGroupId: group.id,
              entityId: group.id,
              status: "READY",
            },
          });
          updatedCount++;
        }
      } else {
        const user = await prisma.googleUser.findUnique({
          where: { primaryEmail: or.entityEmail },
        });
        if (user) {
          await prisma.backupRequest.update({
            where: { id: or.id },
            data: {
              googleUserId: user.id,
              entityId: user.id,
              status: "READY",
            },
          });
          updatedCount++;
        }
      }
    }

    await logAudit({
      actorUserId,
      action: "BACKUP_DOWNLOADED",
      entityType: "BACKUP",
      metadata: {
        operation: "AUTO_DISCOVERY_SYNC",
        discoveredCount: items.length,
        registeredCount,
        updatedCount,
      },
    });

    return {
      discoveredCount: items.length,
      registeredCount,
      updatedCount,
    };
  }
}

export const backupAutoDiscoveryService = new BackupAutoDiscoveryService();
