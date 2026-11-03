import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { verifyPassword, isGestor } from "@/lib/auth/password";
import { logAudit } from "@/lib/audit/audit.service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, targetSystem } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "E-mail e palavra-passe são obrigatórios." },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user is registered in the internal system
    const user = await prisma.appUser.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Utilizador ou palavra-passe incorretos." },
        { status: 401 }
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        { error: "Esta conta está desativada. Contacte o administrador do sistema." },
        { status: 403 }
      );
    }

    // If user has no password set yet
    if (!user.passwordHash) {
      return NextResponse.json(
        {
          error:
            "Ainda não configurou a sua palavra-passe. Utilize a opção 'Primeiro Acesso' para receber uma senha temporária no seu e-mail.",
          needsFirstAccess: true,
        },
        { status: 400 }
      );
    }

    // Verify password
    const isPasswordValid = verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: "Utilizador ou palavra-passe incorretos." },
        { status: 401 }
      );
    }

    // Check system permission if attempting to log in to MSGL
    const host = req.headers.get("host") || "";
    const isMsglRequest =
      targetSystem === "msgl" ||
      host.startsWith("msgl.") ||
      body.system === "msgl";

    const userIsGestor = isGestor(user);

    if (isMsglRequest && !userIsGestor) {
      return NextResponse.json(
        {
          error:
            "Acesso não autorizado ao sistema MSGL. Este utilizador apenas tem permissão para aceder ao Portal Google Chat (googlechat.enging.pt).",
        },
        { status: 403 }
      );
    }

    const token = createSessionToken({
      userId: user.id,
      email: user.email,
      role: user.role as any,
      displayName: user.displayName,
      mustChangePassword: user.mustChangePassword,
      systemAccess: user.systemAccess,
      isGestor: userIsGestor,
    });

    await logAudit({
      actorUserId: user.id,
      action: "LOGIN",
      entityType: "USER",
      entityId: user.id,
      metadata: {
        targetSystem: isMsglRequest ? "msgl" : "googlechat",
        host,
      },
      ipAddress: req.headers.get("x-forwarded-for") || req.ip || "127.0.0.1",
      userAgent: req.headers.get("user-agent") || undefined,
    });

    const res = NextResponse.json({
      success: true,
      mustChangePassword: user.mustChangePassword,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        systemAccess: user.systemAccess,
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
    console.error("Login error:", err);
    return NextResponse.json(
      { error: err.message || "Erro interno ao processar autenticação." },
      { status: 500 }
    );
  }
}
