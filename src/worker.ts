import { Worker, Job } from "bullmq";
import { redisConnection } from "./lib/queue/connection";
import { prisma } from "./lib/prisma";
import { googleDirectoryService } from "./lib/google/directory.service";
import { googleVaultService } from "./lib/google/vault.service";
import { microsoftDirectoryService } from "./lib/microsoft/directory.service";
import { migrationService } from "./lib/migration/migration.service";

console.log("[WORKER] A iniciar o worker de processamento de filas assíncronas...");

const maxVaultExports = parseInt(process.env.GOOGLE_VAULT_MAX_CONCURRENT_EXPORTS || "2", 10);

export const mainWorker = new Worker(
  "backupQueue",
  async (job: Job) => {
    const { backgroundJobId, ...payload } = job.data;
    console.log(`[WORKER] Processando trabalho ${job.name} (ID: ${job.id})`);

    if (backgroundJobId) {
      await prisma.backgroundJob.update({
        where: { id: backgroundJobId },
        data: { status: "RUNNING", startedAt: new Date() },
      });
    }

    try {
      switch (job.name) {
        case "GOOGLE_DIRECTORY_SYNC": {
          await googleDirectoryService.syncGoogleUsers(payload.actorUserId);
          break;
        }

        case "GOOGLE_GROUP_SYNC": {
          await googleDirectoryService.syncGoogleGroups(payload.actorUserId);
          break;
        }

        case "MICROSOFT_DIRECTORY_SYNC": {
          await microsoftDirectoryService.syncMicrosoftUsers(payload.actorUserId);
          break;
        }

        case "MICROSOFT_MAILBOX_SYNC": {
          await microsoftDirectoryService.syncMicrosoftMailboxes(payload.actorUserId);
          break;
        }

        case "GOOGLE_CHAT_SYNC": {
          const { googleChatSyncService } = await import("./lib/google/chat-sync.service");
          await googleChatSyncService.syncUserChat(payload.targetEmail, payload.actorUserId);
          break;
        }

        case "GOOGLE_VAULT_CREATE_EXPORT": {
          await googleVaultService.createExport({
            backupRequestId: payload.backupRequestId,
            serviceType: payload.serviceType,
            targetEmail: payload.targetEmail,
            format: payload.format,
            dateRangeStart: payload.dateRangeStart ? new Date(payload.dateRangeStart) : null,
            dateRangeEnd: payload.dateRangeEnd ? new Date(payload.dateRangeEnd) : null,
          });
          break;
        }

        case "GOOGLE_VAULT_DOWNLOAD": {
          await googleVaultService.downloadExportFiles(
            payload.backupRequestId,
            payload.matterId,
            payload.exportId
          );
          break;
        }

        case "MIGRATION_PREPARE": {
          await migrationService.createAndPrepareJob(
            payload.groupEmail,
            payload.targetMailboxEmail,
            payload.actorUserId
          );
          break;
        }

        default:
          console.warn(`[WORKER] Tipo de trabalho não reconhecido: ${job.name}`);
      }

      if (backgroundJobId) {
        await prisma.backgroundJob.update({
          where: { id: backgroundJobId },
          data: { status: "COMPLETED", finishedAt: new Date(), progress: 100 },
        });
      }
    } catch (err: any) {
      console.error(`[WORKER ERROR] Falha no trabalho ${job.name}:`, err);
      if (backgroundJobId) {
        await prisma.backgroundJob.update({
          where: { id: backgroundJobId },
          data: { status: "FAILED", finishedAt: new Date(), error: err.message },
        });
      }
      throw err;
    }
  },
  {
    connection: redisConnection,
    concurrency: maxVaultExports,
  }
);

mainWorker.on("completed", (job) => {
  console.log(`[WORKER] Trabalho ${job.id} (${job.name}) concluído com sucesso.`);
});

mainWorker.on("failed", (job, err) => {
  console.error(`[WORKER] Trabalho ${job?.id} (${job?.name}) falhou:`, err.message);
});
