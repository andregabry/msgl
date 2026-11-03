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

    // 1. Handle Exit Simulation (restore original Admin session)
    if (body.exitSimulation) {
      const current = await getCurrentUser(req);
      let adminUser = null;

      if (current?.impersonator?.userId) {
        adminUser = await prisma.appUser.findUnique({
          where: { id: current.impersonator.userId },
        });
      }

      if (!adminUser || !adminUser.isActive) {
        adminUser = await prisma.appUser.findFirst({
          where: { role: "ADMIN", isActive: true },
        });
      }

      if (!adminUser) {
        adminUser = await prisma.appUser.findFirst({
          where: { role: "ADMIN" },
        });
      }

      if (!adminUser) {
        return NextResponse.json(
          { error: "Nenhuma conta de Administrador encontrada para restaurar." },
          { status: 404 }
        );
      }

      const token = createSessionToken({
        userId: adminUser.id,
        email: adminUser.email,
        role: adminUser.role as any,
        displayName: adminUser.displayName,
      });

      await logAudit({
        actorUserId: adminUser.id,
        action: "SIMULATION_END",
        entityType: "USER",
        entityId: current?.userId || adminUser.id,
        metadata: {
          previousSimulatedUserId: current?.userId,
          previousSimulatedEmail: current?.email,
        },
        ipAddress: req.headers.get("x-forwarded-for") || req.ip || "127.0.0.1",
        userAgent: req.headers.get("user-agent") || undefined,
      });

      const res = NextResponse.json({ success: true, restored: true, user: adminUser });
      res.cookies.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
      });
      return res;
    }

    // 2. Handle User Simulation or Standard Login
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

    const caller = await getCurrentUser(req);
    const isSimulating = Boolean(body.simulate || caller?.role === "ADMIN" || caller?.isSimulated);

    let impersonator = caller?.impersonator;
    if (isSimulating && !impersonator && caller) {
      impersonator = {
        userId: caller.userId,
        email: caller.email,
        role: caller.role,
        displayName: caller.displayName,
      };
    }

    // If caller is switching back to the impersonator account itself, remove simulation flag
    if (impersonator && appUser.id === impersonator.userId) {
      impersonator = undefined;
    }

    const token = createSessionToken({
      userId: appUser.id,
      email: appUser.email,
      role: appUser.role as any,
      displayName: appUser.displayName,
      isSimulated: !!impersonator,
      impersonator: impersonator,
    });

    await logAudit({
      actorUserId: impersonator ? impersonator.userId : appUser.id,
      action: impersonator ? "SIMULATION_START" : "LOGIN",
      entityType: "USER",
      entityId: appUser.id,
      metadata: impersonator
        ? {
            impersonatedBy: impersonator.email,
            targetUser: appUser.email,
          }
        : undefined,
      ipAddress: req.headers.get("x-forwarded-for") || req.ip || "127.0.0.1",
      userAgent: req.headers.get("user-agent") || undefined,
    });

    const res = NextResponse.json({
      success: true,
      user: {
        ...appUser,
        isSimulated: !!impersonator,
        impersonator,
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
