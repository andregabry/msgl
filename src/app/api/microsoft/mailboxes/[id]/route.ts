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

    const mailbox = await prisma.microsoftMailbox.findUnique({
      where: { id: params.id },
      include: {
        migrationMappings: {
          include: {
            sourceGroup: {
              include: {
                members: true,
                aliases: true,
                backupRequests: {
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
                },
              },
            },
          },
        },
        migrationJobs: {
          orderBy: { createdAt: "desc" },
          include: {
            events: {
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });

    if (!mailbox) {
      return NextResponse.json({ error: "Caixa de correio Microsoft não encontrada." }, { status: 404 });
    }

    // Direct backup requests matching mailbox primarySmtpAddress
    const directBackups = await prisma.backupRequest.findMany({
      where: {
        entityEmail: {
          equals: mailbox.primarySmtpAddress,
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

    // Decorate backups with isDownloaded
    const directBackupsWithStatus = directBackups.map((b) => ({
      ...b,
      isDownloaded: backupDownloadService.getBackupStatus(b).isDownloaded,
    }));

    const mappingsWithStatus = mailbox.migrationMappings.map((m) => {
      if (!m.sourceGroup) return m;
      return {
        ...m,
        sourceGroup: {
          ...m.sourceGroup,
          backupRequests: m.sourceGroup.backupRequests.map((b) => ({
            ...b,
            isDownloaded: backupDownloadService.getBackupStatus(b).isDownloaded,
          })),
        },
      };
    });

    const mailboxWithDetails = {
      ...mailbox,
      directBackups: directBackupsWithStatus,
      migrationMappings: mappingsWithStatus,
    };

    return NextResponse.json(serializeBigInt({ mailbox: mailboxWithDetails }));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
