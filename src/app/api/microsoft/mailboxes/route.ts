import { NextRequest, NextResponse } from "next/server";
import { prisma, serializeBigInt } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/session";
import { microsoftDirectoryService } from "@/lib/microsoft/directory.service";
import { backupDownloadService } from "@/lib/backups/backup-download.service";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const type = searchParams.get("type"); // USER_MAILBOX, SHARED_MAILBOX, ALL
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limitParam = searchParams.get("limit");
    const isAll = limitParam === "all" || limitParam === "-1" || searchParams.get("all") === "true";
    const limit = isAll ? 1000 : parseInt(limitParam || "25", 10);
    const skip = isAll ? 0 : (page - 1) * limit;

    const where: any = {};
    if (type && type !== "ALL") {
      where.recipientType = type;
    }
    if (search.trim() !== "") {
      where.OR = [
        { primarySmtpAddress: { contains: search.trim(), mode: "insensitive" } },
        { displayName: { contains: search.trim(), mode: "insensitive" } },
      ];
    }

    const [total, mailboxes, counts] = await Promise.all([
      prisma.microsoftMailbox.count({ where }),
      prisma.microsoftMailbox.findMany({
        where,
        skip,
        take: limit,
        orderBy: { displayName: "asc" },
        include: {
          migrationMappings: {
            include: {
              sourceGroup: {
                include: {
                  backupRequests: {
                    take: 3,
                    orderBy: { createdAt: "desc" },
                    include: {
                      artifacts: true,
                    },
                  },
                },
              },
            },
          },
          migrationJobs: {
            take: 1,
            orderBy: { createdAt: "desc" },
          },
        },
      }),
      prisma.microsoftMailbox.groupBy({
        by: ["recipientType"],
        _count: true,
      }),
    ]);

    // Check direct backup requests for these mailboxes
    const mailboxEmails = mailboxes.map((m) => m.primarySmtpAddress.toLowerCase());
    const directBackups = mailboxEmails.length > 0
      ? await prisma.backupRequest.findMany({
          where: {
            entityEmail: {
              in: mailboxEmails,
              mode: "insensitive",
            },
          },
          take: 50,
          orderBy: { createdAt: "desc" },
          include: {
            artifacts: true,
          },
        })
      : [];

    const directBackupMap = new Map<string, any[]>();
    directBackups.forEach((b) => {
      const email = b.entityEmail.toLowerCase();
      const list = directBackupMap.get(email) || [];
      list.push({
        ...b,
        isDownloaded: backupDownloadService.getBackupStatus(b).isDownloaded,
      });
      directBackupMap.set(email, list);
    });

    const enrichedMailboxes = mailboxes.map((m) => {
      const direct = directBackupMap.get(m.primarySmtpAddress.toLowerCase()) || [];
      const mappingsWithStatus = m.migrationMappings.map((map) => ({
        ...map,
        sourceGroup: map.sourceGroup ? {
          ...map.sourceGroup,
          backupRequests: (map.sourceGroup.backupRequests || []).map((b) => ({
            ...b,
            isDownloaded: backupDownloadService.getBackupStatus(b).isDownloaded,
          })),
        } : null,
      }));

      return {
        ...m,
        directBackups: direct,
        migrationMappings: mappingsWithStatus,
      };
    });

    const countMap: Record<string, number> = {
      USER_MAILBOX: 0,
      SHARED_MAILBOX: 0,
      ARCHIVE: 0,
      UNKNOWN: 0,
    };
    counts.forEach((c) => {
      countMap[c.recipientType] = c._count;
    });

    return NextResponse.json(
      serializeBigInt({
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        counts: countMap,
        mailboxes: enrichedMailboxes,
      })
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, "manage:integrations");
    const result = await microsoftDirectoryService.syncMicrosoftMailboxes(user.userId);
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
