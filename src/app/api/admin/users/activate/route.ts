import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit/audit.service";

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAuth(req, "manage:users");
    const body = await req.json();

    const { googleUserId, role = "USER" } = body;

    if (!googleUserId) {
      return NextResponse.json({ error: "googleUserId obrigatório." }, { status: 400 });
    }

    const gUser = await prisma.googleUser.findUniqueOrThrow({
      where: { id: googleUserId },
    });

    // Check if app_user already exists with this email
    let appUser = await prisma.appUser.findUnique({
      where: { email: gUser.primaryEmail.toLowerCase() },
    });

    if (!appUser) {
      appUser = await prisma.appUser.create({
        data: {
          email: gUser.primaryEmail.toLowerCase(),
          displayName: gUser.fullName || gUser.primaryEmail,
          role: role || "USER",
          isActive: true,
        },
      });
    }

    // Upsert External Identity
    await prisma.externalIdentity.upsert({
      where: {
        provider_subjectId: {
          provider: "GOOGLE",
          subjectId: gUser.providerId,
        },
      },
      create: {
        appUserId: appUser.id,
        provider: "GOOGLE",
        subjectId: gUser.providerId,
        email: gUser.primaryEmail.toLowerCase(),
        rawProfile: gUser.rawMetadata || {},
      },
      update: {
        appUserId: appUser.id,
        email: gUser.primaryEmail.toLowerCase(),
      },
    });

    // Link IdentityLink
    const link = await prisma.identityLink.upsert({
      where: {
        googleUserId_appUserId: {
          googleUserId: gUser.id,
          appUserId: appUser.id,
        },
      },
      create: {
        googleUserId: gUser.id,
        appUserId: appUser.id,
        linkType: "MANUAL",
        confidence: "EXACT",
        verifiedBy: admin.email,
        verifiedAt: new Date(),
      },
      update: {
        verifiedBy: admin.email,
        verifiedAt: new Date(),
      },
    });

    await logAudit({
      actorUserId: admin.userId,
      action: "USER_ACTIVATED",
      entityType: "USER",
      entityId: appUser.id,
      metadata: { googleEmail: gUser.primaryEmail, appUserId: appUser.id, role },
    });

    return NextResponse.json({
      success: true,
      appUser,
      identityLink: link,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
