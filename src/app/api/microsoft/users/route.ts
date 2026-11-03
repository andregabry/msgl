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
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limitParam = searchParams.get("limit");
    const isAll = limitParam === "all" || limitParam === "-1" || searchParams.get("all") === "true";
    const limit = isAll ? 1000 : parseInt(limitParam || "25", 10);
    const skip = isAll ? 0 : (page - 1) * limit;

    const where: any = {};
    if (search.trim() !== "") {
      where.OR = [
        { userPrincipalName: { contains: search.trim(), mode: "insensitive" } },
        { displayName: { contains: search.trim(), mode: "insensitive" } },
        { mail: { contains: search.trim(), mode: "insensitive" } },
      ];
    }

    const [total, users] = await Promise.all([
      prisma.microsoftUser.count({ where }),
      prisma.microsoftUser.findMany({
        where,
        skip,
        take: limit,
        orderBy: { displayName: "asc" },
      }),
    ]);

    // Gather all candidate emails for this page
    const allEmails = users.flatMap((u) => [u.userPrincipalName, u.mail].filter(Boolean) as string[]);

    // Find linked app users
    const appUsers = allEmails.length > 0
      ? await prisma.appUser.findMany({
          where: {
            email: {
              in: allEmails.map((e) => e.toLowerCase()),
              mode: "insensitive",
            },
          },
          select: { id: true, email: true, role: true, displayName: true, isActive: true },
        })
      : [];

    const appUserMap = new Map(appUsers.map((a) => [a.email.toLowerCase(), a]));

    // Find linked mailboxes
    const mailboxes = allEmails.length > 0
      ? await prisma.microsoftMailbox.findMany({
          where: {
            primarySmtpAddress: {
              in: allEmails.map((e) => e.toLowerCase()),
              mode: "insensitive",
            },
          },
          select: { id: true, primarySmtpAddress: true, recipientType: true, archiveEnabled: true },
        })
      : [];

    const mailboxMap = new Map(mailboxes.map((m) => [m.primarySmtpAddress.toLowerCase(), m]));

    // Find backup requests
    const backups = allEmails.length > 0
      ? await prisma.backupRequest.findMany({
          where: {
            entityEmail: {
              in: allEmails.map((e) => e.toLowerCase()),
              mode: "insensitive",
            },
          },
          orderBy: { createdAt: "desc" },
          include: {
            artifacts: true,
          },
        })
      : [];

    const backupMap = new Map<string, any[]>();
    backups.forEach((b) => {
      const email = b.entityEmail.toLowerCase();
      const list = backupMap.get(email) || [];
      list.push({
        ...b,
        isDownloaded: backupDownloadService.getBackupStatus(b).isDownloaded,
      });
      backupMap.set(email, list);
    });

    const enrichedUsers = users.map((u) => {
      const candidates = [u.userPrincipalName, u.mail].filter(Boolean).map((e) => (e as string).toLowerCase());
      const linkedAppUser = candidates.map((e) => appUserMap.get(e)).find(Boolean) || null;
      const linkedMailbox = candidates.map((e) => mailboxMap.get(e)).find(Boolean) || null;
      const userBackups = candidates.flatMap((e) => backupMap.get(e) || []);

      return {
        ...u,
        appUser: linkedAppUser,
        mailbox: linkedMailbox,
        backupRequests: userBackups,
      };
    });

    return NextResponse.json(
      serializeBigInt({
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        users: enrichedUsers,
      })
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, "manage:integrations");
    const result = await microsoftDirectoryService.syncMicrosoftUsers(user.userId);
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
