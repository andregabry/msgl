import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import {
  getMailAccounts,
  saveMailAccounts,
  authenticateApiAccount,
  testMailConnection,
  testAccountSending,
  EmailAccountConfig,
  EmailAccountType,
  EmailApiProvider,
} from "@/lib/email/mailer";
import { logAudit } from "@/lib/audit/audit.service";
import crypto from "crypto";
import fs from "fs";
import path from "path";

function updateEnvFile(updates: Record<string, string>) {
  for (const [key, val] of Object.entries(updates)) {
    process.env[key] = val; // Update active runtime in memory immediately
  }

  try {
    const envPath = path.resolve(process.cwd(), ".env");
    let content = "";
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, "utf-8");
    }

    for (const [key, val] of Object.entries(updates)) {
      const regex = new RegExp(`^${key}=.*$`, "m");
      const escapedVal =
        val.includes(" ") || val.includes(":") || val.includes("\\") || val.includes('"')
          ? `"${val.replace(/"/g, '\\"')}"`
          : val;
      if (regex.test(content)) {
        content = content.replace(regex, `${key}=${escapedVal}`);
      } else {
        content += `\n${key}=${escapedVal}`;
      }
    }

    fs.writeFileSync(envPath, content, "utf-8");
  } catch (err: any) {
    console.warn("Aviso ao gravar .env (runtime e BD atualizados):", err.message);
  }
}

function syncActiveEnv(accounts: EmailAccountConfig[], defaultAccountId: string | null) {
  const active =
    accounts.find((a) => a.id === defaultAccountId && a.isEnabled) ||
    accounts.find((a) => a.isEnabled) ||
    accounts[0];

  if (active) {
    updateEnvFile({
      SMTP_HOST: active.smtp?.host || process.env.SMTP_HOST || "smtp.gmail.com",
      SMTP_PORT: String(active.smtp?.port || 587),
      SMTP_SECURE: active.smtp?.secure ? "true" : "false",
      SMTP_USER: active.smtp?.user || active.fromEmail,
      SMTP_PASSWORD: active.smtp?.password || "",
      SMTP_FROM_NAME: active.fromName,
      SMTP_FROM_EMAIL: active.fromEmail,
      SMTP_FROM: `"${active.fromName}" <${active.fromEmail}>`,
    });
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req, "manage:integrations");

    const { accounts, defaultAccountId } = await getMailAccounts();

    // Mask passwords in SMTP accounts before returning to client
    const safeAccounts = accounts.map((acc) => ({
      ...acc,
      smtp: acc.smtp
        ? {
            ...acc.smtp,
            hasPassword: Boolean(acc.smtp.password && acc.smtp.password.trim() !== ""),
            passwordMasked: acc.smtp.password ? "••••••••••••" : "",
            password: "", // Never return cleartext
          }
        : undefined,
    }));

    return NextResponse.json({
      accounts: safeAccounts,
      defaultAccountId,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, "manage:integrations");
    const body = await req.json();
    const { action } = body;

    // -------------------------------------------------------------------------
    // 1. AUTHENTICATE_API: Verify cloud API account
    // -------------------------------------------------------------------------
    if (action === "AUTHENTICATE_API") {
      const { apiProvider, email } = body;
      if (!apiProvider || !email) {
        return NextResponse.json(
          { success: false, message: "A API e a conta de e-mail são obrigatórias." },
          { status: 400 }
        );
      }

      try {
        const result = await authenticateApiAccount({
          apiProvider: apiProvider as EmailApiProvider,
          email,
        });

        await logAudit({
          actorUserId: user.userId,
          action: "INTEGRATION_CONFIG_CHANGED",
          entityType: "INTEGRATION",
          provider: "SYSTEM",
          metadata: {
            action: "AUTHENTICATE_EMAIL_API",
            apiProvider,
            email,
            success: true,
          },
        });

        return NextResponse.json({
          success: true,
          message: result.message,
          details: result.details,
        });
      } catch (authErr: any) {
        return NextResponse.json(
          { success: false, message: authErr.message },
          { status: 400 }
        );
      }
    }

    // -------------------------------------------------------------------------
    // 2. TEST_SEND / TEST_SMTP: Verify connection & dispatch test email
    // -------------------------------------------------------------------------
    if (action === "TEST_SEND" || action === "TEST_SMTP") {
      const { host, port, secure, user: smtpUser, password, fromName, fromEmail, testRecipient, accountId } = body;

      const { accounts } = await getMailAccounts();
      const existingAccount = accountId ? accounts.find((a) => a.id === accountId) : null;

      // If testing an existing API Account (Microsoft 365 or Google Workspace)
      if (existingAccount && existingAccount.type === "ACCOUNT") {
        try {
          const result = await testAccountSending({
            account: existingAccount,
            testRecipient: testRecipient ? testRecipient.trim() : undefined,
          });

          // Mark status connected on successful test
          existingAccount.status = "CONNECTED";
          existingAccount.lastTestedAt = new Date().toISOString();
          existingAccount.error = null;
          await saveMailAccounts(accounts);

          return NextResponse.json({
            success: true,
            message: result.message,
            messageId: result.messageId,
          });
        } catch (apiTestErr: any) {
          existingAccount.status = "ERROR";
          existingAccount.error = apiTestErr.message;
          await saveMailAccounts(accounts);

          return NextResponse.json(
            {
              success: false,
              message: `Falha na emissão de teste via API: ${apiTestErr.message}`,
            },
            { status: 400 }
          );
        }
      }

      // Otherwise SMTP test
      const effectivePassword =
        password && password.trim() !== ""
          ? password.trim()
          : existingAccount?.smtp?.password || "";

      const effectiveHost = host?.trim() || existingAccount?.smtp?.host || "";
      const effectiveUser = smtpUser?.trim() || existingAccount?.smtp?.user || existingAccount?.fromEmail || "";

      if (!effectiveHost || !effectiveUser) {
        return NextResponse.json(
          { success: false, message: "O Servidor SMTP (Host) e a Conta de Envio são obrigatórios." },
          { status: 400 }
        );
      }

      try {
        const result = await testMailConnection({
          testRecipient: testRecipient ? testRecipient.trim() : undefined,
          configOverride: {
            host: effectiveHost,
            port: Number(port) || existingAccount?.smtp?.port || 587,
            secure: typeof secure === "boolean" ? secure : existingAccount?.smtp?.secure || false,
            user: effectiveUser,
            password: effectivePassword,
            fromName: (fromName || existingAccount?.fromName || "Enging - Teste SMTP").trim(),
            fromEmail: (fromEmail || existingAccount?.fromEmail || effectiveUser).trim(),
          },
        });

        if (existingAccount) {
          existingAccount.status = "CONNECTED";
          existingAccount.lastTestedAt = new Date().toISOString();
          existingAccount.error = null;
          await saveMailAccounts(accounts);
        }

        return NextResponse.json({
          success: true,
          message: result.message,
          messageId: result.messageId,
        });
      } catch (testErr: any) {
        if (existingAccount) {
          existingAccount.status = "ERROR";
          existingAccount.error = testErr.message;
          await saveMailAccounts(accounts);
        }

        return NextResponse.json(
          {
            success: false,
            message: `Falha na ligação ou autenticação SMTP: ${testErr.message}`,
          },
          { status: 400 }
        );
      }
    }

    // -------------------------------------------------------------------------
    // 3. ADD: Create a new email account or SMTP server
    // -------------------------------------------------------------------------
    if (action === "ADD") {
      const {
        type,
        name,
        apiProvider,
        fromName,
        fromEmail,
        isDefault,
        smtp,
      } = body;

      if (!type || !["ACCOUNT", "SMTP"].includes(type)) {
        return NextResponse.json(
          { success: false, message: "O tipo de conta ('Conta de e-mail' ou 'Servidor SMTP') é inválido." },
          { status: 400 }
        );
      }

      if (!fromName || !fromEmail) {
        return NextResponse.json(
          { success: false, message: "O Nome e o E-mail do remetente são de preenchimento obrigatório." },
          { status: 400 }
        );
      }

      if (type === "ACCOUNT" && !apiProvider) {
        return NextResponse.json(
          { success: false, message: "Selecione a API que será usada para autenticar a conta." },
          { status: 400 }
        );
      }

      if (type === "SMTP") {
        if (!smtp?.host || !smtp?.user) {
          return NextResponse.json(
            { success: false, message: "O Host do servidor e a Conta de autenticação são obrigatórios para SMTP." },
            { status: 400 }
          );
        }
      }

      const { accounts } = await getMailAccounts();
      const newId = crypto.randomUUID();

      const newAccount: EmailAccountConfig = {
        id: newId,
        type: type as EmailAccountType,
        name: (name || (type === "ACCOUNT" ? `Conta ${fromEmail}` : `SMTP ${smtp?.host}`)).trim(),
        apiProvider: type === "ACCOUNT" ? (apiProvider as EmailApiProvider) : undefined,
        fromName: fromName.trim(),
        fromEmail: fromEmail.trim(),
        isDefault: Boolean(isDefault) || accounts.length === 0,
        isEnabled: true,
        status: "CONNECTED",
        lastTestedAt: new Date().toISOString(),
        smtp:
          type === "SMTP"
            ? {
                host: smtp.host.trim(),
                port: Number(smtp.port) || 587,
                encryption: smtp.encryption || (smtp.secure ? "SSL" : "STARTTLS"),
                secure: Boolean(smtp.secure),
                user: smtp.user.trim(),
                password: (smtp.password || "").trim(),
              }
            : undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const updatedAccounts = [...accounts, newAccount];
      const effectiveDefaultId = newAccount.isDefault ? newId : null;

      await saveMailAccounts(updatedAccounts, effectiveDefaultId);
      syncActiveEnv(updatedAccounts, effectiveDefaultId);

      await logAudit({
        actorUserId: user.userId,
        action: "INTEGRATION_CONFIG_CHANGED",
        entityType: "INTEGRATION",
        provider: "SYSTEM",
        metadata: {
          action: "ADD_EMAIL_ACCOUNT",
          accountId: newId,
          type,
          fromName,
          fromEmail,
          isDefault: newAccount.isDefault,
        },
      });

      return NextResponse.json({
        success: true,
        message: "Conta de correio registada com sucesso!",
        accountId: newId,
      });
    }

    // -------------------------------------------------------------------------
    // 4. UPDATE: Edit existing email account
    // -------------------------------------------------------------------------
    if (action === "UPDATE") {
      const { id, type, name, apiProvider, fromName, fromEmail, isDefault, isEnabled, smtp } = body;

      if (!id) {
        return NextResponse.json({ success: false, message: "ID da conta não informado." }, { status: 400 });
      }

      const { accounts, defaultAccountId } = await getMailAccounts();
      const existingIndex = accounts.findIndex((a) => a.id === id);

      if (existingIndex === -1) {
        return NextResponse.json({ success: false, message: "Conta não encontrada." }, { status: 404 });
      }

      const current = accounts[existingIndex];
      const preservePassword =
        smtp && (!smtp.password || smtp.password.trim() === "")
          ? current.smtp?.password || ""
          : smtp?.password || "";

      const updatedAccount: EmailAccountConfig = {
        ...current,
        name: (name || current.name).trim(),
        fromName: (fromName || current.fromName).trim(),
        fromEmail: (fromEmail || current.fromEmail).trim(),
        isDefault: typeof isDefault === "boolean" ? isDefault : current.isDefault,
        isEnabled: typeof isEnabled === "boolean" ? isEnabled : current.isEnabled,
        apiProvider: type === "ACCOUNT" ? apiProvider || current.apiProvider : undefined,
        smtp:
          type === "SMTP" && smtp
            ? {
                host: smtp.host?.trim() || current.smtp?.host || "",
                port: Number(smtp.port) || current.smtp?.port || 587,
                encryption: smtp.encryption || current.smtp?.encryption || "STARTTLS",
                secure: typeof smtp.secure === "boolean" ? smtp.secure : current.smtp?.secure || false,
                user: smtp.user?.trim() || current.smtp?.user || "",
                password: preservePassword,
              }
            : current.smtp,
        updatedAt: new Date().toISOString(),
      };

      const updatedAccounts = [...accounts];
      updatedAccounts[existingIndex] = updatedAccount;

      const effectiveDefaultId = updatedAccount.isDefault ? id : defaultAccountId;
      await saveMailAccounts(updatedAccounts, effectiveDefaultId);
      syncActiveEnv(updatedAccounts, effectiveDefaultId);

      await logAudit({
        actorUserId: user.userId,
        action: "INTEGRATION_CONFIG_CHANGED",
        entityType: "INTEGRATION",
        provider: "SYSTEM",
        metadata: {
          action: "UPDATE_EMAIL_ACCOUNT",
          accountId: id,
          fromName: updatedAccount.fromName,
          fromEmail: updatedAccount.fromEmail,
        },
      });

      return NextResponse.json({
        success: true,
        message: "Configurações da conta atualizadas com sucesso!",
      });
    }

    // -------------------------------------------------------------------------
    // 5. DELETE: Remove account
    // -------------------------------------------------------------------------
    if (action === "DELETE") {
      const { id } = body;
      if (!id) {
        return NextResponse.json({ success: false, message: "ID da conta não informado." }, { status: 400 });
      }

      const { accounts, defaultAccountId } = await getMailAccounts();
      const filtered = accounts.filter((a) => a.id !== id);

      let nextDefaultId = defaultAccountId;
      if (defaultAccountId === id) {
        nextDefaultId = filtered.find((a) => a.isEnabled)?.id || filtered[0]?.id || null;
      }

      await saveMailAccounts(filtered, nextDefaultId);
      syncActiveEnv(filtered, nextDefaultId);

      await logAudit({
        actorUserId: user.userId,
        action: "INTEGRATION_CONFIG_CHANGED",
        entityType: "INTEGRATION",
        provider: "SYSTEM",
        metadata: {
          action: "DELETE_EMAIL_ACCOUNT",
          accountId: id,
        },
      });

      return NextResponse.json({
        success: true,
        message: "Conta removida com sucesso!",
      });
    }

    // -------------------------------------------------------------------------
    // 6. TOGGLE_ENABLED: Quick toggle active state
    // -------------------------------------------------------------------------
    if (action === "TOGGLE_ENABLED") {
      const { id } = body;
      const { accounts, defaultAccountId } = await getMailAccounts();
      const target = accounts.find((a) => a.id === id);

      if (!target) {
        return NextResponse.json({ success: false, message: "Conta não encontrada." }, { status: 404 });
      }

      target.isEnabled = !target.isEnabled;
      target.updatedAt = new Date().toISOString();

      let nextDefaultId = defaultAccountId;
      if (!target.isEnabled && defaultAccountId === id) {
        nextDefaultId = accounts.find((a) => a.isEnabled && a.id !== id)?.id || null;
      } else if (target.isEnabled && !defaultAccountId) {
        nextDefaultId = target.id;
      }

      await saveMailAccounts(accounts, nextDefaultId);
      syncActiveEnv(accounts, nextDefaultId);

      return NextResponse.json({
        success: true,
        isEnabled: target.isEnabled,
        message: target.isEnabled ? "Conta ativada!" : "Conta desativada!",
      });
    }

    // -------------------------------------------------------------------------
    // 7. SET_DEFAULT: Set primary sending account
    // -------------------------------------------------------------------------
    if (action === "SET_DEFAULT") {
      const { id } = body;
      const { accounts } = await getMailAccounts();
      const target = accounts.find((a) => a.id === id);

      if (!target) {
        return NextResponse.json({ success: false, message: "Conta não encontrada." }, { status: 404 });
      }

      target.isEnabled = true; // Ensure default is enabled
      await saveMailAccounts(accounts, id);
      syncActiveEnv(accounts, id);

      return NextResponse.json({
        success: true,
        message: `A conta "${target.fromName} <${target.fromEmail}>" é agora o remetente padrão do sistema!`,
      });
    }

    return NextResponse.json({ success: false, message: "Ação não reconhecida." }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
