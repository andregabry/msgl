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

    const user = await prisma.googleUser.findUnique({
      where: { id: params.id },
      include: {
        aliases: true,
        identityLinks: {
          include: {
            appUser: true,
          },
        },
        backupRequests: {
          orderBy: { createdAt: "desc" },
          include: {
            exports: true,
            artifacts: {
              include: {
                files: true,
              },
            },
            chatArchives: {
              include: {
                spaces: {
                  include: {
                    _count: {
                      select: { messages: true },
                    },
                  },
                  orderBy: { displayName: "asc" },
                },
              },
            },
            events: {
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Utilizador Google não encontrado." }, { status: 404 });
    }

    const userWithStatus = {
      ...user,
      backupRequests: user.backupRequests.map((b) => ({
        ...b,
        isDownloaded: backupDownloadService.getBackupStatus(b).isDownloaded,
      })),
    };

    return NextResponse.json(serializeBigInt({ user: userWithStatus }));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
