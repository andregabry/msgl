import { Queue } from "bullmq";
import { redisConnection } from "./connection";
import { prisma } from "../prisma";

export const backupQueue = new Queue("backupQueue", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

export const syncQueue = new Queue("syncQueue", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 3000,
    },
  },
});

export const migrationQueue = new Queue("migrationQueue", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: "fixed",
      delay: 10000,
    },
  },
});

export async function enqueueJob(
  queueName: "backupQueue" | "syncQueue" | "migrationQueue",
  jobType: string,
  payload: Record<string, any>
) {
  // Track in database BackgroundJob entity
  const bgJob = await prisma.backgroundJob.create({
    data: {
      queueName,
      jobType,
      payload,
      status: "PENDING",
    },
  });

  const queue =
    queueName === "backupQueue"
      ? backupQueue
      : queueName === "syncQueue"
      ? syncQueue
      : migrationQueue;

  await queue.add(jobType, { ...payload, backgroundJobId: bgJob.id }, { jobId: bgJob.id });

  return bgJob;
}
