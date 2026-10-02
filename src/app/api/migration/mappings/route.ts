import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/session";
import { migrationService } from "@/lib/migration/migration.service";
import { logAudit } from "@/lib/audit/audit.service";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const { searchParams } = new URL(req.url);
    const groupEmail = searchParams.get("groupEmail");

    if (groupEmail) {
      const suggestions = await migrationService.suggestMapping(groupEmail);
      return NextResponse.json({ suggestions });
    }

    const mappings = await prisma.migrationMapping.findMany({
      include: {
        sourceGroup: true,
        targetMailbox: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ mappings });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, "migration:prepare");
    const body = await req.json();

    const { sourceGroupEmail, targetMailboxEmail, confidence = "MANUAL", isConfirmed = true } = body;

    if (!sourceGroupEmail || !targetMailboxEmail) {
      return NextResponse.json(
        { error: "Parâmetros obrigatórios: sourceGroupEmail, targetMailboxEmail." },
        { status: 400 }
      );
    }

    const group = await prisma.googleGroup.findUniqueOrThrow({
      where: { email: sourceGroupEmail.toLowerCase() },
    });

    const mailbox = await prisma.microsoftMailbox.findUniqueOrThrow({
      where: { primarySmtpAddress: targetMailboxEmail.toLowerCase() },
    });

    const mapping = await prisma.migrationMapping.upsert({
      where: {
        sourceGroupId_targetMailboxId: {
          sourceGroupId: group.id,
          targetMailboxId: mailbox.id,
        },
      },
      create: {
        sourceGroupId: group.id,
        sourceGroupEmail: group.email,
        targetMailboxId: mailbox.id,
        targetEmail: mailbox.primarySmtpAddress,
        confidence,
        isConfirmed,
        confirmedBy: user.email,
        confirmedAt: isConfirmed ? new Date() : null,
      },
      update: {
        confidence,
        isConfirmed,
        confirmedBy: user.email,
        confirmedAt: isConfirmed ? new Date() : null,
      },
    });

    await logAudit({
      actorUserId: user.userId,
      action: "MIGRATION_TARGET_CHANGED",
      entityType: "MIGRATION",
      entityId: mapping.id,
      metadata: { sourceGroupEmail, targetMailboxEmail, confidence, isConfirmed },
    });

    return NextResponse.json({ success: true, mapping });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
