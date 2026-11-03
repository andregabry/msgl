import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { logAudit } from "@/lib/audit/audit.service";

export async function POST(req: NextRequest) {
  try {
    const actor = await requireAuth(req, "manage:users");

    if (actor.role !== "ADMIN" && !actor.isGestor) {
      return NextResponse.json(
        { error: "Apenas administradores podem definir palavras-passe manualmente." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { userId, email, newPassword, requireChangeOnLogin } = body;

    if (!userId && !email) {
      return NextResponse.json(
        { error: "Identificador do utilizador ou e-mail é obrigatório." },
        { status: 400 }
      );
    }

    if (!newPassword || typeof newPassword !== "string" || newPassword.trim().length < 6) {
      return NextResponse.json(
        { error: "A nova palavra-passe deve conter pelo menos 6 caracteres." },
        { status: 400 }
      );
    }

    const targetUser = await prisma.appUser.findFirst({
      where: userId ? { id: userId } : { email: email.toLowerCase().trim() },
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: "Utilizador não encontrado no sistema." },
        { status: 404 }
      );
    }

    const trimmedPassword = newPassword.trim();
    const passwordHash = hashPassword(trimmedPassword);
    const mustChange = !!requireChangeOnLogin;

    const updatedUser = await prisma.appUser.update({
      where: { id: targetUser.id },
      data: {
        passwordHash,
        mustChangePassword: mustChange,
        tempPasswordExpiresAt: null,
      },
    });

    await logAudit({
      actorUserId: actor.userId,
      action: "PASSWORD_SET_BY_ADMIN",
      entityType: "USER",
      entityId: targetUser.id,
      metadata: {
        targetEmail: targetUser.email,
        setByEmail: actor.email,
        requireChangeOnLogin: mustChange,
      },
      ipAddress: req.headers.get("x-forwarded-for") || req.ip || "127.0.0.1",
      userAgent: req.headers.get("user-agent") || undefined,
    });

    return NextResponse.json({
      success: true,
      message: `Palavra-passe personalizada definida com sucesso para ${targetUser.displayName || targetUser.email}.`,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        displayName: updatedUser.displayName,
        mustChangePassword: updatedUser.mustChangePassword,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Erro interno." }, { status: 500 });
  }
}
