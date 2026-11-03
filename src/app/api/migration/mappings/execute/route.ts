import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/session";
import { migrationService } from "@/lib/migration/migration.service";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, "migration:prepare");
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "ID de mapeamento obrigatório." }, { status: 400 });
    }

    const mapping = await prisma.migrationMapping.findUniqueOrThrow({
      where: { id },
    });

    const selectedTypes = (mapping.selectedTypes || "EMAILS,CALENDARS,CONTACTS,RULES,TAGS").split(",");

    const { job, prepResult } = await migrationService.createAndPrepareJob(
      mapping.sourceGroupEmail,
      mapping.targetEmail,
      mapping.direction as any,
      mapping.scope as any,
      selectedTypes,
      user.userId
    );

    // Removido da fila de planeamento pois agora é um trabalho de migração registado
    await prisma.migrationMapping.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, job, prepResult });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
