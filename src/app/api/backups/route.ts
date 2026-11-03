import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/session";
import { enqueueJob } from "@/lib/queue/queues";
import { logAudit } from "@/lib/audit/audit.service";

import { backupDownloadService } from "@/lib/backups/backup-download.service";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const { searchParams } = new URL(req.url);
    const serviceType = searchParams.get("serviceType");
    const status = searchParams.get("status");
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "25", 10);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (serviceType && serviceType !== "ALL") {
      where.serviceType = serviceType;
    }
    if (status && status !== "ALL") {
      where.status = status;
    }
    if (search.trim() !== "") {
      where.entityEmail = { contains: search.trim(), mode: "insensitive" };
    }

    const [total, backups] = await Promise.all([
      prisma.backupRequest.count({ where }),
      prisma.backupRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          exports: true,
          artifacts: {
            include: {
              files: true,
            },
          },
          events: {
            orderBy: { createdAt: "desc" },
            take: 3,
          },
          chatArchives: true,
        },
      }),
    ]);

    // Calculate total bytes
    const totalBytesAggregate = await prisma.backupArtifact.aggregate({
      _sum: { bytes: true },
    });

    return NextResponse.json({
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      totalStorageBytes: totalBytesAggregate._sum.bytes ? totalBytesAggregate._sum.bytes.toString() : "0",
      backups: backups.map((b) => {
        const localStatus = backupDownloadService.getBackupStatus(b);
        return {
          ...b,
          isDownloaded: localStatus.isDownloaded,
          localPath: localStatus.localPath,
          artifacts: b.artifacts.map((a) => ({
            ...a,
            bytes: a.bytes.toString(),
            files: a.files.map((f) => ({ ...f, bytes: f.bytes.toString() })),
          })),
        };
      }),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, "backup:request");
    const body = await req.json();

    const { entityEmail, entityType, serviceType, format = "MBOX", dateRangeStart, dateRangeEnd } = body;

    if (!entityEmail || !serviceType || !entityType) {
      return NextResponse.json(
        { error: "Parâmetros obrigatórios em falta: entityEmail, entityType, serviceType." },
        { status: 400 }
      );
    }

    const backupReq = await prisma.backupRequest.create({
      data: {
        entityEmail: entityEmail.toLowerCase(),
        entityType,
        serviceType,
        format,
        status: "REQUESTED",
        requestedBy: user.email,
        dateRangeStart: dateRangeStart ? new Date(dateRangeStart) : null,
        dateRangeEnd: dateRangeEnd ? new Date(dateRangeEnd) : null,
      },
    });

    await prisma.backupEvent.create({
      data: {
        backupRequestId: backupReq.id,
        toStatus: "REQUESTED",
        message: `Pedido de backup solicitado por ${user.email} (${serviceType} / ${format})`,
      },
    });

    await logAudit({
      actorUserId: user.userId,
      action: "BACKUP_REQUESTED",
      entityType: "BACKUP",
      entityId: backupReq.id,
      metadata: { entityEmail, serviceType, format },
    });

    // Enqueue job based on service type
    if (serviceType === "GOOGLE_CHAT") {
      await enqueueJob("backupQueue", "GOOGLE_CHAT_SYNC", {
        backupRequestId: backupReq.id,
        targetEmail: entityEmail.toLowerCase(),
        actorUserId: user.userId,
      });
    } else {
      // Enqueue Vault creation job
      await enqueueJob("backupQueue", "GOOGLE_VAULT_CREATE_EXPORT", {
        backupRequestId: backupReq.id,
        serviceType,
        targetEmail: entityEmail.toLowerCase(),
        format,
        dateRangeStart,
        dateRangeEnd,
        actorUserId: user.userId,
      });
    }

    return NextResponse.json({ success: true, backupRequest: backupReq });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
