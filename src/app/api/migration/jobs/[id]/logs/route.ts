import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/session";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth(req);

    const job = await prisma.migrationJob.findUnique({
      where: { id: params.id },
      include: {
        events: {
          orderBy: { createdAt: "asc" },
        },
        items: {
          where: { status: "FAILED" },
          take: 10,
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!job) {
      return NextResponse.json({ error: "Trabalho não encontrado" }, { status: 404 });
    }

    return NextResponse.json({
      job: {
        id: job.id,
        direction: (job as any).direction || "GOOGLE_TO_MICROSOFT",
        sourceGroupEmail: job.sourceGroupEmail,
        targetMailboxEmail: job.targetMailboxEmail,
        status: job.status,
        totalItems: job.totalItems || job.validItems || 0,
        validItems: job.validItems,
        importedItems: job.importedItems,
        duplicateItems: job.duplicateItems,
        failedItems: job.failedItems,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        purviewJobId: job.purviewJobId,
        purviewMappingCsvPath: job.purviewMappingCsvPath,
      },
      events: job.events,
      failedItems: job.items,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
