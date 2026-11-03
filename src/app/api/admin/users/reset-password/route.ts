import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/session";
import { generateTemporaryPassword, hashPassword } from "@/lib/auth/password";
import { sendTemporaryPasswordEmail } from "@/lib/email/mailer";
import { logAudit } from "@/lib/audit/audit.service";

export async function POST(req: NextRequest) {
  try {
    const actor = await requireAuth(req, "manage:users");

    // Only Gestor / Admin can reset passwords
    if (actor.role !== "ADMIN" && !actor.isGestor) {
      return NextResponse.json(
        { error: "Apenas administradores podem redefinir palavras-passe de utilizadores." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { userId, email } = body;

    if (!userId && !email) {
      return NextResponse.json(
        { error: "Identificador do utilizador ou e-mail é obrigatório." },
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

    // Generate strictly 8-character temporary password
    const tempPassword = generateTemporaryPassword();
    const passwordHash = hashPassword(tempPassword);

    // Update user in database
    const updatedUser = await prisma.appUser.update({
      where: { id: targetUser.id },
      data: {
        passwordHash,
        mustChangePassword: true,
        tempPasswordExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });

    // Determine login URL according to user permissions
    const loginUrl =
      targetUser.systemAccess === "MSGL" || targetUser.role !== "USER"
        ? "https://msgl.enging.pt"
        : "https://googlechat.enging.pt";

    // Send email with temporary password via SMTP
    let emailSent = false;
    let emailError: string | null = null;
    try {
      await sendTemporaryPasswordEmail({
        to: targetUser.email,
        displayName: targetUser.displayName || targetUser.email,
        tempPassword,
        loginUrl,
        reason: "ADMIN_RESET",
      });
      emailSent = true;
    } catch (err: any) {
      console.error("[SMTP ERROR] Falha ao enviar e-mail de redefinição:", err);
      emailError = err.message || "Falha ao enviar e-mail.";
    }

    // Log audit event
    await logAudit({
      actorUserId: actor.userId,
      action: "PASSWORD_RESET_BY_ADMIN",
      entityType: "USER",
      entityId: targetUser.id,
      metadata: {
        targetEmail: targetUser.email,
        resetByEmail: actor.email,
        emailSent,
      },
      ipAddress: req.headers.get("x-forwarded-for") || req.ip || "127.0.0.1",
      userAgent: req.headers.get("user-agent") || undefined,
    });

    return NextResponse.json({
      success: true,
      message: emailSent
        ? `Palavra-passe temporária gerada e enviada com sucesso para ${targetUser.email}.`
        : `Palavra-passe temporária gerada. Nota de envio por e-mail: ${emailError || "Aviso no envio"}`,
      temporaryPassword: tempPassword,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        displayName: updatedUser.displayName,
      },
      emailSent,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Erro interno." }, { status: 500 });
  }
}
