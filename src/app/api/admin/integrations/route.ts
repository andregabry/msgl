import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { isGoogleConfigured, getGoogleAuthClient } from "@/lib/google/auth";
import { graphClient } from "@/lib/microsoft/graph.client";
import { googleVaultService } from "@/lib/google/vault.service";
import { logAudit } from "@/lib/audit/audit.service";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req, "manage:integrations");

    const google = {
      isConfigured: isGoogleConfigured(),
      adminImpersonated: process.env.GOOGLE_IMPERSONATED_ADMIN || "Não configurado",
      projectId: process.env.GOOGLE_PROJECT_ID || "Não configurado",
      customerId: process.env.GOOGLE_CUSTOMER_ID || "my_customer",
      matterId: process.env.GOOGLE_VAULT_MATTER_ID || "(Automático / Dedicado)",
      allowedDomain: process.env.GOOGLE_ALLOWED_DOMAIN || "Não configurado",
    };

    const microsoft = {
      isConfigured: graphClient.isConfigured(),
      tenantId: process.env.MICROSOFT_TENANT_ID || "Não configurado",
      clientId: process.env.MICROSOFT_CLIENT_ID || "Não configurado",
      clientSecretConfigured: Boolean(process.env.MICROSOFT_CLIENT_SECRET),
      purviewUploadConfigured: Boolean(process.env.PURVIEW_PST_SAS_URL),
      targetDomain: process.env.M365_TARGET_DOMAIN || "Não configurado",
    };

    return NextResponse.json({ google, microsoft });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, "manage:integrations");
    const body = await req.json();
    const { provider } = body; // GOOGLE or MICROSOFT

    if (provider === "GOOGLE") {
      if (!isGoogleConfigured()) {
        return NextResponse.json({ success: false, message: "Google Workspace não configurado (.json ausente)." });
      }

      // Test real connection to Google Directory or Vault
      const auth = getGoogleAuthClient();
      await auth.getAccessToken();
      const matterId = await googleVaultService.getOrCreateAppMatter();

      await logAudit({
        actorUserId: user.userId,
        action: "INTEGRATION_CONFIG_CHANGED",
        entityType: "INTEGRATION",
        provider: "GOOGLE",
        metadata: { test: "SUCCESS", matterId },
      });

      return NextResponse.json({
        success: true,
        message: `Ligação ao Google Workspace e Google Vault verificada com sucesso! (Matter ID: ${matterId})`,
      });
    }

    if (provider === "MICROSOFT") {
      if (!graphClient.isConfigured()) {
        return NextResponse.json({ success: false, message: "Microsoft 365 não configurado (Faltam credenciais no .env)." });
      }

      await graphClient.getAccessToken();

      await logAudit({
        actorUserId: user.userId,
        action: "INTEGRATION_CONFIG_CHANGED",
        entityType: "INTEGRATION",
        provider: "MICROSOFT",
        metadata: { test: "SUCCESS" },
      });

      return NextResponse.json({
        success: true,
        message: "Ligação ao Microsoft Graph (Application-Only) autenticada com sucesso!",
      });
    }

    return NextResponse.json({ error: "Provider inválido. Use GOOGLE ou MICROSOFT." }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
