import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit/audit.service";
import { migrationExecutionEngine } from "@/lib/migration/engine.service";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth(req);
    const job = await prisma.migrationJob.findUnique({
      where: { id: params.id },
      include: {
        sourceGroup: true,
        targetMailbox: true,
        backupArtifact: true,
        events: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!job) return NextResponse.json({ error: "Trabalho não encontrado" }, { status: 404 });
    return NextResponse.json({
      job,
      events: job.events,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth(req, "migration:execute");
    const body = await req.json().catch(() => ({}));
    const action = body.action || "start";

    if (action === "start") {
      await migrationExecutionEngine.startOrResumeMigration(params.id, session.userId);
      return NextResponse.json({ success: true, message: "Motor de migração em tempo real iniciado." });
    }

    if (action === "pause") {
      await migrationExecutionEngine.pauseMigration(params.id, session.userId);
      return NextResponse.json({ success: true, message: "Migração pausada com sucesso." });
    }

    if (action === "diagnose-and-resume" || action === "repair") {
      const result = await migrationExecutionEngine.diagnoseAndResume(params.id, session.userId);
      return NextResponse.json({ success: true, result });
    }

    return NextResponse.json({ error: `Ação inválida: ${action}` }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth(req, "migration:execute");
    const job = await prisma.migrationJob.findUnique({
      where: { id: params.id },
    });
    if (!job) return NextResponse.json({ error: "Trabalho não encontrado" }, { status: 404 });

    await prisma.migrationJob.delete({
      where: { id: params.id },
    });

    await logAudit({
      actorUserId: session.userId,
      action: "MIGRATION_DELETED",
      entityType: "MIGRATION",
      entityId: params.id,
      metadata: {
        action: "DELETED",
        source: job.sourceGroupEmail,
        target: job.targetMailboxEmail,
        direction: (job as any).direction || "GOOGLE_TO_MICROSOFT",
      },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth(req, "migration:execute");
    const body = await req.json();
    const { targetMailboxEmail, status, purviewJobId, selectedTypes, scope } = body;

    const data: any = {};
    if (targetMailboxEmail !== undefined) data.targetMailboxEmail = targetMailboxEmail.trim();
    if (status !== undefined) data.status = status;
    if (purviewJobId !== undefined) data.purviewJobId = purviewJobId ? purviewJobId.trim() : null;
    if (selectedTypes !== undefined) {
      data.selectedTypes = Array.isArray(selectedTypes) ? selectedTypes.join(",") : selectedTypes;
    }
    if (scope !== undefined) data.scope = scope;

    const updated = await prisma.migrationJob.update({
      where: { id: params.id },
      data,
    });

    await logAudit({
      actorUserId: session.userId,
      action: "MIGRATION_TARGET_CHANGED",
      entityType: "MIGRATION",
      entityId: params.id,
      metadata: { updatedFields: Object.keys(data), targetMailboxEmail, status },
    });

    return NextResponse.json({ success: true, job: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
