import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/session";
import { migrationService } from "@/lib/migration/migration.service";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, "migration:prepare");
    const body = await req.json().catch(() => ({}));
    const { ids } = body;

    const where: any = { status: "PENDING" };
    if (ids && Array.isArray(ids) && ids.length > 0) {
      where.id = { in: ids };
    }

    const pending = await prisma.migrationMapping.findMany({ where });

    if (pending.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Nenhuma conta pendente na fila de migração.",
        processedCount: 0,
      });
    }

    const results: any[] = [];
    for (const m of pending) {
      try {
        const selectedTypes = (m.selectedTypes || "EMAILS,CALENDARS,CONTACTS,RULES,TAGS").split(",");
        const { job } = await migrationService.createAndPrepareJob(
          m.sourceGroupEmail,
          m.targetEmail,
          m.direction as any,
          m.scope as any,
          selectedTypes,
          user.userId
        );
        // Removido da fila de planeamento pois agora é um trabalho de migração registado
        await prisma.migrationMapping.delete({
          where: { id: m.id },
        });
        results.push({ id: m.id, success: true, jobId: job.id, source: m.sourceGroupEmail });
      } catch (e: any) {
        await prisma.migrationMapping.update({
          where: { id: m.id },
          data: { status: "FAILED" },
        });
        results.push({ id: m.id, success: false, error: e.message, source: m.sourceGroupEmail });
      }
    }

    return NextResponse.json({
      success: true,
      processedCount: pending.length,
      successCount: results.filter((r) => r.success).length,
      results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
