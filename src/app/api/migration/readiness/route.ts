import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { migrationService } from "@/lib/migration/migration.service";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const { searchParams } = new URL(req.url);
    const sourceEmail = searchParams.get("sourceEmail") || searchParams.get("groupEmail") || "";
    const targetEmail = searchParams.get("targetEmail") || searchParams.get("targetMailbox") || "";
    const direction = (searchParams.get("direction") || "GOOGLE_TO_MICROSOFT") as any;
    const scope = (searchParams.get("scope") || "USERS") as any;
    const backupRequestId = searchParams.get("backupRequestId") || undefined;

    if (!sourceEmail || !targetEmail) {
      return NextResponse.json(
        { error: "Parâmetros obrigatórios em falta: sourceEmail, targetEmail." },
        { status: 400 }
      );
    }

    const report = await migrationService.checkMigrationReadiness(
      sourceEmail,
      targetEmail,
      direction,
      scope,
      backupRequestId
    );

    return NextResponse.json(report);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
