import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/session";
import { migrationService } from "@/lib/migration/migration.service";
import { logAudit } from "@/lib/audit/audit.service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const { searchParams } = new URL(req.url);
    const direction = searchParams.get("direction");

    const where: any = {
      status: { not: "COMPLETED" },
    };
    if (direction && direction !== "ALL") {
      where.direction = direction;
    }

    const mappings = await prisma.migrationMapping.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      { mappings },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, "migration:prepare");
    const body = await req.json();

    const {
      sourceEmail,
      targetEmail,
      direction = "GOOGLE_TO_MICROSOFT",
      scope = "USERS",
      selectedTypes = ["EMAILS", "CALENDARS", "CONTACTS", "RULES", "TAGS"],
    } = body;

    if (!sourceEmail || !targetEmail) {
      return NextResponse.json(
        { error: "Parâmetros obrigatórios em falta: conta de origem e conta de destino." },
        { status: 400 }
      );
    }

    const mapping = await migrationService.addToQueue({
      sourceEmail,
      targetEmail,
      direction,
      scope,
      selectedTypes,
      userEmail: user.email,
    });

    await logAudit({
      actorUserId: user.userId,
      action: "MIGRATION_QUEUE_ADDED",
      entityType: "MIGRATION",
      entityId: mapping.id,
      metadata: { sourceEmail, targetEmail, direction, scope, selectedTypes },
    });

    return NextResponse.json({ success: true, mapping });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth(req, "migration:prepare");
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID obrigatório." }, { status: 400 });
    }

    await prisma.migrationMapping.delete({ where: { id } });

    await logAudit({
      actorUserId: user.userId,
      action: "MIGRATION_QUEUE_REMOVED",
      entityType: "MIGRATION",
      entityId: id,
    });

    return NextResponse.json({ success: true, message: "Conta removida da fila de migração." });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
