import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, hashPassword, isGestor } from "@/lib/auth/password";
import { createSessionToken, SESSION_COOKIE_NAME, getCurrentUser } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit/audit.service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, currentPassword, newPassword, confirmPassword } = body;

    const sessionUser = await getCurrentUser(req);
    const targetEmail = (email || sessionUser?.email || "").toLowerCase().trim();

    if (!targetEmail) {
      return NextResponse.json({ error: "E-mail de utilizador não fornecido." }, { status: 400 });
    }

    if (!currentPassword) {
      return NextResponse.json(
        { error: "A palavra-passe atual é obrigatória." },
        { status: 400 }
      );
    }

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json(
        { error: "A nova palavra-passe deve conter pelo menos 6 caracteres." },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { error: "A confirmação da nova palavra-passe não coincide." },
        { status: 400 }
      );
    }

    const user = await prisma.appUser.findUnique({
      where: { email: targetEmail },
    });

    if (!user) {
      return NextResponse.json({ error: "Utilizador não encontrado." }, { status: 404 });
    }

    // Verify current password
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      return NextResponse.json(
        { error: "A palavra-passe atual informada está incorreta." },
        { status: 401 }
      );
    }

    // Hash new password and clear mustChangePassword
    const newPasswordHash = hashPassword(newPassword);

    const updatedUser = await prisma.appUser.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
        mustChangePassword: false,
        tempPasswordExpiresAt: null,
      },
    });

    const userIsGestor = isGestor(updatedUser);

    const token = createSessionToken({
      userId: updatedUser.id,
      email: updatedUser.email,
      role: updatedUser.role as any,
      displayName: updatedUser.displayName,
      mustChangePassword: false,
      systemAccess: updatedUser.systemAccess,
      isGestor: userIsGestor,
    });

    await logAudit({
      actorUserId: updatedUser.id,
      action: "PASSWORD_CHANGED",
      entityType: "USER",
      entityId: updatedUser.id,
      metadata: { email: updatedUser.email },
      ipAddress: req.headers.get("x-forwarded-for") || req.ip || "127.0.0.1",
      userAgent: req.headers.get("user-agent") || undefined,
    });

    const res = NextResponse.json({
      success: true,
      message: "Palavra-passe alterada com sucesso! A sua sessão está ativa.",
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        displayName: updatedUser.displayName,
        role: updatedUser.role,
        isGestor: userIsGestor,
      },
    });

    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return res;
  } catch (err: any) {
    console.error("Change-password error:", err);
    return NextResponse.json(
      { error: err.message || "Erro interno ao alterar a palavra-passe." },
      { status: 500 }
    );
  }
}
