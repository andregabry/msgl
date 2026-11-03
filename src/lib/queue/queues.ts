import { Queue } from "bullmq";
import { redisConnection } from "./connection";
import { prisma } from "../prisma";

let _backupQueue: Queue | null = null;
let _syncQueue: Queue | null = null;
let _migrationQueue: Queue | null = null;

export function getBackupQueue(): Queue {
  if (!_backupQueue) {
    _backupQueue = new Queue("backupQueue", {
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
  }
  return _backupQueue;
}

export function getSyncQueue(): Queue {
  if (!_syncQueue) {
    _syncQueue = new Queue("syncQueue", {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 3000,
        },
      },
    });
  }
  return _syncQueue;
}

export function getMigrationQueue(): Queue {
  if (!_migrationQueue) {
    _migrationQueue = new Queue("migrationQueue", {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: "fixed",
          delay: 10000,
        },
      },
    });
  }
  return _migrationQueue;
}

export const backupQueue = new Proxy({} as Queue, {
  get(target, prop, receiver) {
    const instance = getBackupQueue();
    const val = Reflect.get(instance, prop, receiver);
    return typeof val === "function" ? val.bind(instance) : val;
  },
});

export const syncQueue = new Proxy({} as Queue, {
  get(target, prop, receiver) {
    const instance = getSyncQueue();
    const val = Reflect.get(instance, prop, receiver);
    return typeof val === "function" ? val.bind(instance) : val;
  },
});

export const migrationQueue = new Proxy({} as Queue, {
  get(target, prop, receiver) {
    const instance = getMigrationQueue();
    const val = Reflect.get(instance, prop, receiver);
    return typeof val === "function" ? val.bind(instance) : val;
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
      ? getBackupQueue()
      : queueName === "syncQueue"
      ? getSyncQueue()
      : getMigrationQueue();

  await queue.add(jobType, { ...payload, backgroundJobId: bgJob.id }, { jobId: bgJob.id });

  return bgJob;
}

