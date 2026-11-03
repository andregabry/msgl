import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { migrationService } from "@/lib/migration/migration.service";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, "migration:prepare");
    const body = await req.json();

    const {
      direction = "GOOGLE_TO_MICROSOFT",
      scope = "USERS",
      sourceEmail,
      targetEmail,
      groupEmail,
      targetMailboxEmail,
      selectedTypes = ["EMAILS", "CALENDARS", "CONTACTS", "RULES", "TAGS"],
    } = body;

    const effectiveSource = (sourceEmail || groupEmail || "").trim();
    const effectiveTarget = (targetEmail || targetMailboxEmail || "").trim();

    if (!effectiveSource || !effectiveTarget) {
      return NextResponse.json(
        { error: "Parâmetros obrigatórios em falta: conta de origem e conta de destino." },
        { status: 400 }
      );
    }

    const { job, prepResult } = await migrationService.createAndPrepareJob(
      effectiveSource,
      effectiveTarget,
      direction,
      scope,
      selectedTypes,
      user.userId
    );

    return NextResponse.json({
      success: true,
      job,
      prepResult,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
