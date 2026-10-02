import { NextRequest, NextResponse } from "next/server";
import { prisma, serializeBigInt } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/session";
import { googleDirectoryService } from "@/lib/google/directory.service";
import { backupDownloadService } from "@/lib/backups/backup-download.service";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "25", 10);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search.trim() !== "") {
      where.OR = [
        { email: { contains: search.trim(), mode: "insensitive" } },
        { name: { contains: search.trim(), mode: "insensitive" } },
      ];
    }

    const [total, groups] = await Promise.all([
      prisma.googleGroup.count({ where }),
      prisma.googleGroup.findMany({
        where,
        skip,
        take: limit,
        orderBy: { email: "asc" },
        include: {
          aliases: true,
          members: {
            take: 10,
          },
          backupRequests: {
            orderBy: { createdAt: "desc" },
            take: 5,
            include: {
              artifacts: true,
            },
          },
          migrationMappings: {
            include: {
              targetMailbox: true,
            },
          },
          migrationJobs: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      }),
    ]);

    const groupsWithStatus = groups.map((g) => ({
      ...g,
      backupRequests: g.backupRequests.map((b) => ({
        ...b,
        isDownloaded: backupDownloadService.getBackupStatus(b).isDownloaded,
      })),
    }));

    return NextResponse.json(
      serializeBigInt({
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        groups: groupsWithStatus,
      })
    );
  } catch (err: any) {
    console.error("Erro em GET /api/google/groups:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, "manage:integrations");
    const result = await googleDirectoryService.syncGoogleGroups(user.userId);
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
