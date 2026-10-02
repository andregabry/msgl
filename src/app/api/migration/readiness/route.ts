import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { migrationService } from "@/lib/migration/migration.service";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const { searchParams } = new URL(req.url);
    const groupEmail = searchParams.get("groupEmail");
    const targetMailbox = searchParams.get("targetMailbox");
    const backupRequestId = searchParams.get("backupRequestId") || undefined;

    if (!groupEmail || !targetMailbox) {
      return NextResponse.json(
        { error: "Parâmetros obrigatórios em falta: groupEmail, targetMailbox." },
        { status: 400 }
      );
    }

    const report = await migrationService.checkMigrationReadiness(
      groupEmail,
      targetMailbox,
      backupRequestId
    );

    return NextResponse.json(report);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
