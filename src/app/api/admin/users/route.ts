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

    const sanitizedUsers = users.map((u) => {
      const { passwordHash, ...rest } = u;
      return {
        ...rest,
        hasPassword: !!passwordHash,
      };
    });

    return NextResponse.json({ users: sanitizedUsers });
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

    let passwordUpdate: any = {};
    if (body.password && typeof body.password === "string" && body.password.trim().length >= 6) {
      const { hashPassword } = await import("@/lib/auth/password");
      passwordUpdate.passwordHash = hashPassword(body.password.trim());
      passwordUpdate.mustChangePassword = false;
    }

    let systemAccess = body.systemAccess;
    if (!systemAccess) {
      if (role === "ADMIN") systemAccess = "BOTH";
      else if (role === "USER") systemAccess = "CHAT_PORTAL";
      else systemAccess = "MSGL";
    }

    const user = await prisma.appUser.upsert({
      where: { email: email.toLowerCase() },
      update: {
        displayName,
        role: role as any,
        systemAccess,
        isActive: true,
        ...passwordUpdate,
      },
      create: {
        email: email.toLowerCase(),
        displayName,
        role: role as any,
        systemAccess,
        isActive: true,
        ...passwordUpdate,
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

