import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    // 1. Google Workspace Stats
    const [
      googleUsersTotal,
      googleUsersActive,
      googleUsersSuspended,
      googleGroupsTotal,
      lastGoogleSyncUser,
    ] = await Promise.all([
      prisma.googleUser.count(),
      prisma.googleUser.count({ where: { suspended: false } }),
      prisma.googleUser.count({ where: { suspended: true } }),
      prisma.googleGroup.count(),
      prisma.googleUser.findFirst({
        orderBy: { lastSyncedAt: "desc" },
        select: { lastSyncedAt: true },
      }),
    ]);

    // 2. Backup Stats
    const [
      backupsTotal,
      backupsRequested,
      backupsRunning,
      backupsRemoteReady,
      backupsDownloading,
      backupsReady,
      backupsFailed,
      storageAggregate,
    ] = await Promise.all([
      prisma.backupRequest.count(),
      prisma.backupRequest.count({ where: { status: "REQUESTED" } }),
      prisma.backupRequest.count({ where: { status: { in: ["CREATING_EXPORT", "EXPORT_RUNNING"] } } }),
      prisma.backupRequest.count({ where: { status: "REMOTE_READY" } }),
      prisma.backupRequest.count({ where: { status: "DOWNLOADING" } }),
      prisma.backupRequest.count({ where: { status: "READY" } }),
      prisma.backupRequest.count({ where: { status: "FAILED" } }),
      prisma.backupArtifact.aggregate({
        _sum: { bytes: true },
      }),
    ]);

    // 3. Google Chat Stats
    const [
      chatArchivesCount,
      chatMessagesCount,
      chatSpacesCount,
      chatAttachmentsCount,
      chatUsersWithAccessCount,
    ] = await Promise.all([
      prisma.chatArchive.count({ where: { status: { in: ["READY", "PARTIAL"] } } }),
      prisma.chatMessage.count(),
      prisma.chatSpace.count(),
      prisma.chatAttachment.count(),
      prisma.chatUserAccess.groupBy({
        by: ["appUserId"],
        _count: true,
      }),
    ]);

    // 4. Microsoft 365 Stats
    const [
      msUsersTotal,
      msUserMailboxes,
      msSharedMailboxes,
      lastMsSync,
    ] = await Promise.all([
      prisma.microsoftUser.count(),
      prisma.microsoftMailbox.count({ where: { recipientType: "USER_MAILBOX" } }),
      prisma.microsoftMailbox.count({ where: { recipientType: "SHARED_MAILBOX" } }),
      prisma.microsoftMailbox.findFirst({
        orderBy: { lastSyncedAt: "desc" },
        select: { lastSyncedAt: true },
      }),
    ]);

    // 5. Migration Stats
    const [
      migrationsPrepared,
      migrationsPending,
      migrationsRunning,
      migrationsCompleted,
      migrationsFailed,
    ] = await Promise.all([
      prisma.migrationJob.count({ where: { status: { in: ["PREPARING", "READY_TO_IMPORT"] } } }),
      prisma.migrationJob.count({ where: { status: "AWAITING_PURVIEW_JOB" } }),
      prisma.migrationJob.count({ where: { status: "IMPORTING" } }),
      prisma.migrationJob.count({ where: { status: "COMPLETED" } }),
      prisma.migrationJob.count({ where: { status: "FAILED" } }),
    ]);

    // Recent Background Jobs & Errors
    const [recentJobs, recentErrors] = await Promise.all([
      prisma.backgroundJob.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
      }),
      prisma.auditEvent.findMany({
        take: 5,
        where: {
          action: { in: ["MIGRATION_FAILED", "BACKUP_DELETED"] },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({
      google: {
        totalUsers: googleUsersTotal,
        activeUsers: googleUsersActive,
        suspendedUsers: googleUsersSuspended,
        totalGroups: googleGroupsTotal,
        lastSync: lastGoogleSyncUser?.lastSyncedAt,
      },
      backups: {
        total: backupsTotal,
        requested: backupsRequested,
        running: backupsRunning,
        remoteReady: backupsRemoteReady,
        downloading: backupsDownloading,
        ready: backupsReady,
        failed: backupsFailed,
        storageBytes: storageAggregate._sum.bytes ? storageAggregate._sum.bytes.toString() : "0",
      },
      chat: {
        archivesProcessed: chatArchivesCount,
        indexedMessages: chatMessagesCount,
        spaces: chatSpacesCount,
        attachments: chatAttachmentsCount,
        usersWithHistory: chatUsersWithAccessCount.length,
      },
      microsoft: {
        totalUsers: msUsersTotal,
        userMailboxes: msUserMailboxes,
        sharedMailboxes: msSharedMailboxes,
        lastSync: lastMsSync?.lastSyncedAt,
      },
      migrations: {
        prepared: migrationsPrepared,
        pendingPurview: migrationsPending,
        running: migrationsRunning,
        completed: migrationsCompleted,
        failed: migrationsFailed,
      },
      recentJobs,
      recentErrors,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
