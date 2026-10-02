import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { isGoogleConfigured, getGoogleAuthClient } from "@/lib/google/auth";
import { graphClient } from "@/lib/microsoft/graph.client";
import { googleVaultService } from "@/lib/google/vault.service";
import { logAudit } from "@/lib/audit/audit.service";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";

function updateEnvFile(updates: Record<string, string>) {
  const envPath = path.resolve(process.cwd(), ".env");
  let content = "";
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, "utf-8");
  }

  for (const [key, val] of Object.entries(updates)) {
    process.env[key] = val; // Update active runtime in memory immediately
    const regex = new RegExp(`^${key}=.*$`, "m");
    const escapedVal = val.includes(" ") || val.includes(":") || val.includes("\\") ? `"${val}"` : val;
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${escapedVal}`);
    } else {
      content += `\n${key}=${escapedVal}`;
    }
  }

  fs.writeFileSync(envPath, content, "utf-8");
}

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req, "manage:integrations");

    // Check database connection record if present
    const googleConn = await prisma.integrationConnection.findUnique({
      where: { provider: "GOOGLE_WORKSPACE" },
    });
    const msConn = await prisma.integrationConnection.findUnique({
      where: { provider: "MICROSOFT_365" },
    });

    const google = {
      isConfigured: isGoogleConfigured(),
      serviceAccountKeyPath: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || "C:/Users/andre.gabry/Projects/m365/service-account.json",
      adminImpersonated: process.env.GOOGLE_IMPERSONATED_ADMIN || "andre.gabry@enging.pt",
      projectId: process.env.GOOGLE_PROJECT_ID || "enging-migration",
      customerId: process.env.GOOGLE_CUSTOMER_ID || "my_customer",
      matterId: process.env.GOOGLE_VAULT_MATTER_ID || "",
      allowedDomain: process.env.GOOGLE_ALLOWED_DOMAIN || "enging.pt",
      lastTestedAt: googleConn?.lastTestedAt || null,
      status: googleConn?.status || (isGoogleConfigured() ? "CONNECTED" : "NOT_CONFIGURED"),
    };

    const microsoft = {
      isConfigured: graphClient.isConfigured(),
      tenantId: process.env.MICROSOFT_TENANT_ID || "",
      clientId: process.env.MICROSOFT_CLIENT_ID || "14d82eec-204b-4c2f-b7e8-296a70dab67e",
      clientSecretConfigured: Boolean(process.env.MICROSOFT_CLIENT_SECRET && process.env.MICROSOFT_CLIENT_SECRET.trim() !== ""),
      clientSecretMasked: process.env.MICROSOFT_CLIENT_SECRET ? "••••••••••••" : "",
      purviewUploadConfigured: Boolean(process.env.PURVIEW_PST_SAS_URL && process.env.PURVIEW_PST_SAS_URL.trim() !== ""),
      purviewPstSasUrl: process.env.PURVIEW_PST_SAS_URL || "",
      targetDomain: process.env.M365_TARGET_DOMAIN || "dynamox.net",
      lastTestedAt: msConn?.lastTestedAt || null,
      status: msConn?.status || (graphClient.isConfigured() ? "CONNECTED" : "NOT_CONFIGURED"),
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
        return NextResponse.json({
          success: false,
          message: "Google Workspace não configurado. Por favor configure o caminho da Service Account JSON e o e-mail de Super Admin.",
        });
      }

      // Test real connection to Google Directory or Vault
      try {
        const auth = getGoogleAuthClient();
        await auth.getAccessToken();
        const matterId = await googleVaultService.getOrCreateAppMatter();

        await prisma.integrationConnection.upsert({
          where: { provider: "GOOGLE_WORKSPACE" },
          update: { status: "CONNECTED", lastTestedAt: new Date(), error: null },
          create: { provider: "GOOGLE_WORKSPACE", status: "CONNECTED", lastTestedAt: new Date() },
        });

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
      } catch (vaultErr: any) {
        await prisma.integrationConnection.upsert({
          where: { provider: "GOOGLE_WORKSPACE" },
          update: { status: "ERROR", lastTestedAt: new Date(), error: vaultErr.message },
          create: { provider: "GOOGLE_WORKSPACE", status: "ERROR", lastTestedAt: new Date(), error: vaultErr.message },
        });

        return NextResponse.json({
          success: false,
          message: `Erro na autenticação com a Google: ${vaultErr.message}. Verifique a Delegação em Todo o Domínio (Domain-Wide Delegation) e se a Google Vault API está ativa.`,
        });
      }
    }

    if (provider === "MICROSOFT") {
      if (!graphClient.isConfigured()) {
        return NextResponse.json({
          success: false,
          message: "Microsoft 365 não configurado. Por favor preencha o Tenant ID, Client ID e Client Secret na modal de configuração.",
        });
      }

      try {
        await graphClient.getAccessToken();

        await prisma.integrationConnection.upsert({
          where: { provider: "MICROSOFT_365" },
          update: { status: "CONNECTED", lastTestedAt: new Date(), error: null },
          create: { provider: "MICROSOFT_365", status: "CONNECTED", lastTestedAt: new Date() },
        });

        await logAudit({
          actorUserId: user.userId,
          action: "INTEGRATION_CONFIG_CHANGED",
          entityType: "INTEGRATION",
          provider: "MICROSOFT",
          metadata: { test: "SUCCESS" },
        });

        return NextResponse.json({
          success: true,
          message: "Ligação ao Microsoft Graph (Application-Only) autenticada com sucesso! Permissões de Tenant validadas.",
        });
      } catch (msErr: any) {
        await prisma.integrationConnection.upsert({
          where: { provider: "MICROSOFT_365" },
          update: { status: "ERROR", lastTestedAt: new Date(), error: msErr.message },
          create: { provider: "MICROSOFT_365", status: "ERROR", lastTestedAt: new Date(), error: msErr.message },
        });

        return NextResponse.json({
          success: false,
          message: `Erro na ligação Microsoft Graph: ${msErr.message}. Verifique o Tenant ID, Client ID, Client Secret e se o consentimento de administrador foi concedido no Entra ID.`,
        });
      }
    }

    return NextResponse.json({ error: "Provider inválido. Use GOOGLE ou MICROSOFT." }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth(req, "manage:integrations");
    const body = await req.json();
    const { provider, config } = body;

    if (!provider || !config) {
      return NextResponse.json({ error: "Provider e dados de configuração são obrigatórios." }, { status: 400 });
    }

    if (provider === "GOOGLE") {
      const updates: Record<string, string> = {};
      if (config.serviceAccountKeyPath !== undefined) updates["GOOGLE_SERVICE_ACCOUNT_KEY_PATH"] = config.serviceAccountKeyPath.trim();
      if (config.adminImpersonated !== undefined) updates["GOOGLE_IMPERSONATED_ADMIN"] = config.adminImpersonated.trim();
      if (config.projectId !== undefined) updates["GOOGLE_PROJECT_ID"] = config.projectId.trim();
      if (config.customerId !== undefined) updates["GOOGLE_CUSTOMER_ID"] = config.customerId.trim() || "my_customer";
      if (config.allowedDomain !== undefined) updates["GOOGLE_ALLOWED_DOMAIN"] = config.allowedDomain.trim();
      if (config.matterId !== undefined) updates["GOOGLE_VAULT_MATTER_ID"] = config.matterId.trim();

      updateEnvFile(updates);

      await prisma.integrationConnection.upsert({
        where: { provider: "GOOGLE_WORKSPACE" },
        update: {
          config: {
            serviceAccountKeyPath: updates["GOOGLE_SERVICE_ACCOUNT_KEY_PATH"],
            adminImpersonated: updates["GOOGLE_IMPERSONATED_ADMIN"],
            projectId: updates["GOOGLE_PROJECT_ID"],
            customerId: updates["GOOGLE_CUSTOMER_ID"],
            allowedDomain: updates["GOOGLE_ALLOWED_DOMAIN"],
            matterId: updates["GOOGLE_VAULT_MATTER_ID"],
          },
          updatedAt: new Date(),
        },
        create: {
          provider: "GOOGLE_WORKSPACE",
          status: isGoogleConfigured() ? "CONNECTED" : "NOT_CONFIGURED",
          config: {
            serviceAccountKeyPath: updates["GOOGLE_SERVICE_ACCOUNT_KEY_PATH"],
            adminImpersonated: updates["GOOGLE_IMPERSONATED_ADMIN"],
            projectId: updates["GOOGLE_PROJECT_ID"],
            customerId: updates["GOOGLE_CUSTOMER_ID"],
            allowedDomain: updates["GOOGLE_ALLOWED_DOMAIN"],
            matterId: updates["GOOGLE_VAULT_MATTER_ID"],
          },
        },
      });

      await logAudit({
        actorUserId: user.userId,
        action: "INTEGRATION_CONFIG_CHANGED",
        entityType: "INTEGRATION",
        provider: "GOOGLE",
        metadata: { updatedFields: Object.keys(updates) },
      });

      return NextResponse.json({
        success: true,
        message: "Parâmetros do Google Workspace e Google Vault guardados com sucesso!",
      });
    }

    if (provider === "MICROSOFT") {
      const updates: Record<string, string> = {};
      if (config.tenantId !== undefined) updates["MICROSOFT_TENANT_ID"] = config.tenantId.trim();
      if (config.clientId !== undefined) updates["MICROSOFT_CLIENT_ID"] = config.clientId.trim();
      if (config.clientSecret && config.clientSecret.trim() !== "" && config.clientSecret !== "••••••••••••") {
        updates["MICROSOFT_CLIENT_SECRET"] = config.clientSecret.trim();
      }
      if (config.targetDomain !== undefined) updates["M365_TARGET_DOMAIN"] = config.targetDomain.trim();
      if (config.purviewPstSasUrl !== undefined) updates["PURVIEW_PST_SAS_URL"] = config.purviewPstSasUrl.trim();

      updateEnvFile(updates);
      graphClient.resetToken();

      await prisma.integrationConnection.upsert({
        where: { provider: "MICROSOFT_365" },
        update: {
          config: {
            tenantId: updates["MICROSOFT_TENANT_ID"],
            clientId: updates["MICROSOFT_CLIENT_ID"],
            targetDomain: updates["M365_TARGET_DOMAIN"],
            purviewPstSasUrlConfigured: Boolean(updates["PURVIEW_PST_SAS_URL"]),
          },
          updatedAt: new Date(),
        },
        create: {
          provider: "MICROSOFT_365",
          status: graphClient.isConfigured() ? "CONNECTED" : "NOT_CONFIGURED",
          config: {
            tenantId: updates["MICROSOFT_TENANT_ID"],
            clientId: updates["MICROSOFT_CLIENT_ID"],
            targetDomain: updates["M365_TARGET_DOMAIN"],
            purviewPstSasUrlConfigured: Boolean(updates["PURVIEW_PST_SAS_URL"]),
          },
        },
      });

      await logAudit({
        actorUserId: user.userId,
        action: "INTEGRATION_CONFIG_CHANGED",
        entityType: "INTEGRATION",
        provider: "MICROSOFT",
        metadata: { updatedFields: Object.keys(updates) },
      });

      return NextResponse.json({
        success: true,
        message: "Parâmetros do Microsoft 365 e Microsoft Purview guardados com sucesso!",
      });
    }

    return NextResponse.json({ error: "Provider inválido. Use GOOGLE ou MICROSOFT." }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
