import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req, "manage:users");

    const users = await prisma.appUser.findMany({
      include: {
        externalIdentities: true,
        identityLinks: {
          include: {
            googleUser: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ users });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireAuth(req, "manage:users");
    const body = await req.json();
    const { email, displayName, role } = body;

    if (!email || !displayName || !role) {
      return NextResponse.json(
        { error: "Email, nome de exibição e função são obrigatórios." },
        { status: 400 }
      );
    }

    const validRoles = ["ADMIN", "BACKUP_OPERATOR", "MIGRATION_OPERATOR", "AUDITOR", "USER"];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: `Função inválida. Válidas: ${validRoles.join(", ")}` }, { status: 400 });
    }

    const user = await prisma.appUser.upsert({
      where: { email: email.toLowerCase() },
      update: {
        displayName,
        role: role as any,
        isActive: true,
      },
      create: {
        email: email.toLowerCase(),
        displayName,
        role: role as any,
        isActive: true,
      },
    });

    const { logAudit } = await import("@/lib/audit/audit.service");
    await logAudit({
      actorUserId: actor.userId,
      action: "USER_ROLE_ASSIGNED",
      entityType: "USER",
      entityId: user.id,
      metadata: { role, email: user.email },
    });

    return NextResponse.json({ success: true, user });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

