import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { migrationExecutionEngine } from "@/lib/migration/engine.service";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth(req, "migration:execute");
    await migrationExecutionEngine.pauseMigration(params.id, session.userId);

    return NextResponse.json({
      success: true,
      message: "Migração pausada com sucesso.",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
