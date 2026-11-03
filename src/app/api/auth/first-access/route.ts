import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateTemporaryPassword, hashPassword } from "@/lib/auth/password";
import { sendTemporaryPasswordEmail } from "@/lib/email/mailer";
import { logAudit } from "@/lib/audit/audit.service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { error: "O endereço de e-mail é obrigatório." },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if the user is registered as an internal user in app_users
    const appUser = await prisma.appUser.findUnique({
      where: { email: normalizedEmail },
    });

    if (!appUser) {
      return NextResponse.json(
        {
          error:
            "O endereço de e-mail informado não está registado como utilizador interno no sistema. Contacte o administrador para criar ou ativar a sua conta.",
        },
        { status: 404 }
      );
    }

    if (!appUser.isActive) {
      return NextResponse.json(
        {
          error:
            "Esta conta de utilizador encontra-se desativada. Contacte o administrador do sistema.",
        },
        { status: 403 }
      );
    }

    // Generate an 8-character temporary password
    const tempPassword = generateTemporaryPassword();
    const passwordHash = hashPassword(tempPassword);

    // Save temporary password with mustChangePassword flag
    await prisma.appUser.update({
      where: { id: appUser.id },
      data: {
        passwordHash,
        mustChangePassword: true,
        tempPasswordExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });

    // Send email with the temporary password
    try {
      await sendTemporaryPasswordEmail({
        to: appUser.email,
        displayName: appUser.displayName,
        tempPassword,
        loginUrl: "https://googlechat.enging.pt",
      });
    } catch (mailErr: any) {
      console.error("Falha ao enviar e-mail de senha temporária:", mailErr);
      return NextResponse.json(
        {
          error: `Falha no envio do e-mail: ${mailErr.message || "Não foi possível contactar o servidor SMTP."}. Contacte o suporte.`,
        },
        { status: 500 }
      );
    }

    await logAudit({
      actorUserId: appUser.id,
      action: "FIRST_ACCESS_PASSWORD_SENT",
      entityType: "USER",
      entityId: appUser.id,
      metadata: {
        email: appUser.email,
        reason: "First access temporary password requested",
      },
      ipAddress: req.headers.get("x-forwarded-for") || req.ip || "127.0.0.1",
      userAgent: req.headers.get("user-agent") || undefined,
    });

    return NextResponse.json({
      success: true,
      message: `Uma palavra-passe temporária de 8 caracteres foi enviada com sucesso para o e-mail ${appUser.email}. Verifique a sua caixa de entrada e utilize-a para aceder.`,
    });
  } catch (err: any) {
    console.error("First-access error:", err);
    return NextResponse.json(
      { error: err.message || "Erro interno ao processar primeiro acesso." },
      { status: 500 }
    );
  }
}
