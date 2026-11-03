import { NextRequest, NextResponse } from "next/server";
import { prisma, serializeBigInt } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/session";
import { backupDownloadService } from "@/lib/backups/backup-download.service";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth(req);

    const user = await prisma.microsoftUser.findUnique({
      where: { id: params.id },
    });

    if (!user) {
      return NextResponse.json({ error: "Utilizador Microsoft não encontrado." }, { status: 404 });
    }

    const emailCandidates = [user.userPrincipalName, user.mail]
      .filter(Boolean)
      .map((e) => (e as string).toLowerCase().trim());

    // Look for associated mailbox
    const mailbox = await prisma.microsoftMailbox.findFirst({
      where: {
        primarySmtpAddress: {
          in: emailCandidates,
          mode: "insensitive",
        },
      },
      include: {
        migrationMappings: {
          include: {
            sourceGroup: true,
          },
        },
      },
    });

    // Look for associated internal app user
    const appUser = await prisma.appUser.findFirst({
      where: {
        email: {
          in: emailCandidates,
          mode: "insensitive",
        },
      },
      include: {
        externalIdentities: true,
      },
    });

    // Match backup requests by entityEmail
    const backupRequests = await prisma.backupRequest.findMany({
      where: {
        entityEmail: {
          in: emailCandidates,
          mode: "insensitive",
        },
      },
      orderBy: { createdAt: "desc" },
      include: {
        exports: true,
        artifacts: {
          include: {
            files: true,
          },
        },
        events: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    const userWithDetails = {
      ...user,
      mailbox,
      appUser,
      backupRequests: backupRequests.map((b) => ({
        ...b,
        isDownloaded: backupDownloadService.getBackupStatus(b).isDownloaded,
      })),
    };

    return NextResponse.json(serializeBigInt({ user: userWithDetails }));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
