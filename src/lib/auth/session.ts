import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "../prisma";
import { AppRole, Permission, hasPermission } from "./rbac";

import { isGestor } from "./password";

const SESSION_COOKIE_NAME = "migrate_session";
const SESSION_SECRET = process.env.SESSION_SECRET || "default_development_secret_do_not_use_in_prod";

export interface SessionPayload {
  userId: string;
  email: string;
  role: AppRole;
  displayName: string;
  isSimulated?: boolean;
  mustChangePassword?: boolean;
  systemAccess?: string;
  isGestor?: boolean;
  impersonator?: {
    userId: string;
    email: string;
    role: AppRole;
    displayName: string;
  };
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
        select: {
          id: true,
          email: true,
          role: true,
          displayName: true,
          isActive: true,
          mustChangePassword: true,
          systemAccess: true,
        },
      });
      if (user && user.isActive) {
        const gestor = isGestor(user);
        return {
          userId: user.id,
          email: user.email,
          role: user.role as AppRole,
          displayName: user.displayName,
          mustChangePassword: user.mustChangePassword,
          systemAccess: user.systemAccess,
          isGestor: gestor,
          isSimulated: payload.isSimulated || !!payload.impersonator,
          impersonator: payload.impersonator,
        };
      }
    }
  }

  // Return null when unauthenticated so login is required
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

export function requireGestor(user: SessionPayload): void {
  if (!user.isGestor) {
    throw new Error("Acesso restrito. Este sistema requer privilégios de gestor.");
  }
}

export { SESSION_COOKIE_NAME };
