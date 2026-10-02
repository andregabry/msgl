import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { migrationService } from "@/lib/migration/migration.service";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, "migration:prepare");
    const body = await req.json();

    const { groupEmail, targetMailboxEmail } = body;

    if (!groupEmail || !targetMailboxEmail) {
      return NextResponse.json(
        { error: "Parâmetros obrigatórios: groupEmail, targetMailboxEmail." },
        { status: 400 }
      );
    }

    const { job, prepResult } = await migrationService.createAndPrepareJob(
      groupEmail,
      targetMailboxEmail,
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
