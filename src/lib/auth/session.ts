import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "../prisma";
import { AppRole, Permission, hasPermission } from "./rbac";

const SESSION_COOKIE_NAME = "migrate_session";
const SESSION_SECRET = process.env.SESSION_SECRET || "default_development_secret_do_not_use_in_prod";

export interface SessionPayload {
  userId: string;
  email: string;
  role: AppRole;
  displayName: string;
}

export function createSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, SESSION_SECRET, { expiresIn: "7d" });
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, SESSION_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

export async function getCurrentUser(req?: NextRequest): Promise<SessionPayload | null> {
  let token: string | undefined;

  if (req) {
    token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!token) {
      const authHeader = req.headers.get("Authorization");
      if (authHeader?.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      }
    }
  }

  if (token) {
    const payload = verifySessionToken(token);
    if (payload) {
      // Validate user is still active in database
      const user = await prisma.appUser.findUnique({
        where: { id: payload.userId },
        select: { id: true, email: true, role: true, displayName: true, isActive: true },
      });
      if (user && user.isActive) {
        return {
          userId: user.id,
          email: user.email,
          role: user.role as AppRole,
          displayName: user.displayName,
        };
      }
    }
  }

  // In development mode fallback: ensure default admin exists and can be resolved
  if (process.env.NODE_ENV !== "production") {
    let admin = await prisma.appUser.findFirst({
      where: { role: "ADMIN" },
    });
    if (!admin) {
      admin = await prisma.appUser.create({
        data: {
          email: "andre.gabry@dynamox.net",
          displayName: "André Gabry (Admin)",
          role: "ADMIN",
          isActive: true,
        },
      });
    }
    return {
      userId: admin.id,
      email: admin.email,
      role: admin.role as AppRole,
      displayName: admin.displayName,
    };
  }

  return null;
}

export async function requireAuth(req: NextRequest, permission?: Permission): Promise<SessionPayload> {
  const user = await getCurrentUser(req);
  if (!user) {
    throw new Error("Não autenticado. Inicie sessão para continuar.");
  }

  if (permission && !hasPermission(user.role, permission)) {
    throw new Error(`Permissão insuficiente. Requer '${permission}'.`);
  }

  return user;
}

export { SESSION_COOKIE_NAME };
