import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit/audit.service";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  return NextResponse.json({ user });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json({ error: "Email obrigatório." }, { status: 400 });
    }

    const appUser = await prisma.appUser.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!appUser || !appUser.isActive) {
      return NextResponse.json(
        { error: "Esta conta ainda não tem acesso à plataforma. Contacte o administrador." },
        { status: 403 }
      );
    }

    const token = createSessionToken({
      userId: appUser.id,
      email: appUser.email,
      role: appUser.role as any,
      displayName: appUser.displayName,
    });

    await logAudit({
      actorUserId: appUser.id,
      action: "LOGIN",
      entityType: "USER",
      entityId: appUser.id,
      ipAddress: req.headers.get("x-forwarded-for") || req.ip || "127.0.0.1",
      userAgent: req.headers.get("user-agent") || undefined,
    });

    const res = NextResponse.json({ success: true, user: appUser });
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return res;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (user) {
    await logAudit({
      actorUserId: user.userId,
      action: "LOGOUT",
      entityType: "USER",
      entityId: user.userId,
    });
  }

  const res = NextResponse.json({ success: true });
  res.cookies.delete(SESSION_COOKIE_NAME);
  return res;
}
