import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { migrationService } from "@/lib/migration/migration.service";

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
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
        { error: "Parâmetros obrigatórios: sourceEmail, targetEmail." },
        { status: 400 }
      );
    }

    const analysis = await migrationService.analyzeAccountPair(
      sourceEmail,
      targetEmail,
      direction,
      scope,
      selectedTypes
    );

    return NextResponse.json({ success: true, analysis });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
