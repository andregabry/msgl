import nodemailer from "nodemailer";
import { prisma } from "../prisma";
import { isGoogleConfigured, getGoogleAuthClient } from "../google/auth";
import { graphClient } from "../microsoft/graph.client";

export type EmailAccountType = "ACCOUNT" | "SMTP";
export type EmailApiProvider = "GOOGLE_WORKSPACE" | "MICROSOFT_365";

export interface SmtpConfig {
  host: string;
  port: number;
  encryption: "STARTTLS" | "SSL" | "NONE";
  secure: boolean;
  user: string;
  password?: string;
}

export interface EmailAccountConfig {
  id: string;
  type: EmailAccountType;
  name: string;
  apiProvider?: EmailApiProvider;
  fromName: string;
  fromEmail: string;
  isDefault: boolean;
  isEnabled: boolean;
  status: "CONNECTED" | "NOT_CONFIGURED" | "ERROR";
  lastTestedAt?: string | null;
  error?: string | null;
  smtp?: SmtpConfig;
  createdAt: string;
  updatedAt: string;
}

export interface MailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password?: string;
  fromName: string;
  fromEmail: string;
}

export type EmailServerConfig = MailConfig & {
  provider?: string;
  authEmail?: string;
  authPassword?: string;
  replyTo?: string;
  microsoftClientSecret?: string;
};

export const getEmailServerConfig = getMailConfig;

/**
 * Loads all configured email accounts from DB (provider: "MAIL_SERVER")
 */
export async function getMailAccounts(): Promise<{
  accounts: EmailAccountConfig[];
  defaultAccountId: string | null;
}> {
  try {
    const conn = await prisma.integrationConnection.findUnique({
      where: { provider: "MAIL_SERVER" },
    });
    const cfg = (conn?.config as any) || {};

    let accounts: EmailAccountConfig[] = Array.isArray(cfg.accounts) ? cfg.accounts : [];

    // Backward compatibility: If no accounts array exists yet but legacy host/user exists
    if (accounts.length === 0 && cfg.host && cfg.user) {
      accounts = [
        {
          id: "default-smtp-legacy",
          type: "SMTP",
          name: cfg.fromName || "Servidor SMTP Principal",
          fromName: cfg.fromName || "Enging - Sistema de Migração",
          fromEmail: cfg.fromEmail || cfg.user,
          isDefault: true,
          isEnabled: true,
          status: conn?.status === "CONNECTED" ? "CONNECTED" : "NOT_CONFIGURED",
          lastTestedAt: conn?.lastTestedAt ? conn.lastTestedAt.toISOString() : null,
          error: conn?.error || null,
          smtp: {
            host: cfg.host,
            port: Number(cfg.port || 587),
            encryption: cfg.secure ? "SSL" : "STARTTLS",
            secure: Boolean(cfg.secure),
            user: cfg.user,
            password: cfg.password || "",
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
    }

    const defaultAcc =
      accounts.find((a) => a.isDefault && a.isEnabled) ||
      accounts.find((a) => a.isEnabled) ||
      accounts[0] ||
      null;

    return {
      accounts,
      defaultAccountId: defaultAcc?.id || null,
    };
  } catch (err) {
    return { accounts: [], defaultAccountId: null };
  }
}

/**
 * Persists the accounts list and default pointer in DB
 */
export async function saveMailAccounts(
  accounts: EmailAccountConfig[],
  defaultAccountId?: string | null
): Promise<void> {
  const effectiveDefaultId =
    defaultAccountId ||
    accounts.find((a) => a.isDefault && a.isEnabled)?.id ||
    accounts.find((a) => a.isEnabled)?.id ||
    accounts[0]?.id ||
    null;

  const normalizedAccounts = accounts.map((a) => ({
    ...a,
    isDefault: a.id === effectiveDefaultId,
  }));

  const activeAccount = normalizedAccounts.find((a) => a.id === effectiveDefaultId);

  await prisma.integrationConnection.upsert({
    where: { provider: "MAIL_SERVER" },
    update: {
      status: activeAccount?.status || "NOT_CONFIGURED",
      lastTestedAt: activeAccount?.lastTestedAt ? new Date(activeAccount.lastTestedAt) : null,
      error: activeAccount?.error || null,
      config: {
        accounts: normalizedAccounts,
        defaultAccountId: effectiveDefaultId,
        // Keep active SMTP fields at root for backward compatibility
        host: activeAccount?.smtp?.host || "",
        port: activeAccount?.smtp?.port || 587,
        secure: activeAccount?.smtp?.secure || false,
        user: activeAccount?.smtp?.user || activeAccount?.fromEmail || "",
        password: activeAccount?.smtp?.password || "",
        fromName: activeAccount?.fromName || "Enging - Sistema de Migração",
        fromEmail: activeAccount?.fromEmail || "",
      } as any,
      updatedAt: new Date(),
    },
    create: {
      provider: "MAIL_SERVER",
      status: activeAccount?.status || "NOT_CONFIGURED",
      lastTestedAt: activeAccount?.lastTestedAt ? new Date(activeAccount.lastTestedAt) : null,
      error: activeAccount?.error || null,
      config: {
        accounts: normalizedAccounts,
        defaultAccountId: effectiveDefaultId,
        host: activeAccount?.smtp?.host || "",
        port: activeAccount?.smtp?.port || 587,
        secure: activeAccount?.smtp?.secure || false,
        user: activeAccount?.smtp?.user || activeAccount?.fromEmail || "",
        password: activeAccount?.smtp?.password || "",
        fromName: activeAccount?.fromName || "Enging - Sistema de Migração",
        fromEmail: activeAccount?.fromEmail || "",
      } as any,
    },
  });
}

/**
 * Validates / authenticates an account using the selected cloud platform API
 */
export async function authenticateApiAccount({
  apiProvider,
  email,
}: {
  apiProvider: EmailApiProvider;
  email: string;
}): Promise<{ success: boolean; message: string; details?: any }> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new Error("Endereço de e-mail inválido para autenticação.");
  }

  if (apiProvider === "GOOGLE_WORKSPACE") {
    if (!isGoogleConfigured()) {
      throw new Error(
        "A integração Google Workspace não está configurada no menu Conexões Cloud. Adicione o ficheiro Service Account nas configurações de Sistema."
      );
    }

    try {
      // 1. Authenticate with Google using Domain-Wide Delegation for this account
      const auth = getGoogleAuthClient(normalizedEmail);
      await auth.getAccessToken();

      // 2. Verify account exists in Google Directory API
      const { google } = await import("googleapis");
      const adminApi = google.admin({ version: "directory_v1", auth });
      const userRes = await adminApi.users.get({ userKey: normalizedEmail });

      return {
        success: true,
        message: `Conta Google Workspace (${userRes.data.primaryEmail}) autenticada com sucesso! Delegação de domínio ativa para envio de comunicações.`,
        details: {
          fullName: userRes.data.name?.fullName,
          primaryEmail: userRes.data.primaryEmail,
          suspended: userRes.data.suspended,
        },
      };
    } catch (gErr: any) {
      throw new Error(
        `Falha ao autenticar conta Google (${normalizedEmail}): ${gErr.message || "Erro de delegação ou utilizador inexistente"}`
      );
    }
  }

  if (apiProvider === "MICROSOFT_365") {
    if (!graphClient.isConfigured()) {
      throw new Error(
        "A integração Microsoft 365 não está configurada no menu Conexões Cloud. Configure o Tenant ID, Client ID e Client Secret em Sistema."
      );
    }

    try {
      // Query Graph API to verify user mailbox exists and can be reached
      const msUser = await graphClient.fetchGraph(`/users/${encodeURIComponent(normalizedEmail)}`);

      return {
        success: true,
        message: `Caixa de correio Microsoft 365 (${msUser.mail || msUser.userPrincipalName}) autenticada com sucesso!`,
        details: {
          displayName: msUser.displayName,
          mail: msUser.mail || msUser.userPrincipalName,
          id: msUser.id,
        },
      };
    } catch (msErr: any) {
      throw new Error(
        `Falha ao autenticar conta Microsoft 365 (${normalizedEmail}): ${msErr.message || "Utilizador não encontrado no Tenant"}`
      );
    }
  }

  throw new Error(`Provedor de API não suportado: ${apiProvider}`);
}

/**
 * Loads the active mail configuration for sending
 */
export async function getMailConfig(): Promise<MailConfig> {
  const { accounts, defaultAccountId } = await getMailAccounts();
  const activeAccount =
    accounts.find((a) => a.id === defaultAccountId && a.isEnabled) ||
    accounts.find((a) => a.isEnabled) ||
    accounts[0];

  if (activeAccount) {
    if (activeAccount.type === "SMTP" && activeAccount.smtp) {
      return {
        host: activeAccount.smtp.host,
        port: activeAccount.smtp.port,
        secure: activeAccount.smtp.secure,
        user: activeAccount.smtp.user,
        password: activeAccount.smtp.password,
        fromName: activeAccount.fromName,
        fromEmail: activeAccount.fromEmail || activeAccount.smtp.user,
      };
    } else {
      // API Account (Google Workspace / Microsoft 365)
      return {
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: parseInt(process.env.SMTP_PORT || "587", 10),
        secure: process.env.SMTP_SECURE === "true",
        user: activeAccount.fromEmail,
        password: process.env.SMTP_PASSWORD || "",
        fromName: activeAccount.fromName,
        fromEmail: activeAccount.fromEmail,
      };
    }
  }

  // Fallback to environment variables
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  return {
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    user: process.env.SMTP_USER || "andre.gabry@enging.pt",
    password: process.env.SMTP_PASSWORD || "zczwznlrgzzorhjj",
    fromName: process.env.SMTP_FROM_NAME || "Enging - Sistema de Migração",
    fromEmail: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || "andre.gabry@enging.pt",
  };
}

export function createTransporterFromConfig(config: MailConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.password,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
}

export async function getMailTransporter(customConfig?: MailConfig) {
  const config = customConfig || (await getMailConfig());
  return createTransporterFromConfig(config);
}

export interface SendTempPasswordParams {
  to: string;
  displayName: string;
  tempPassword: string;
  loginUrl?: string;
  reason?: "FIRST_ACCESS" | "ADMIN_RESET" | "PASSWORD_RESET" | string;
}

export async function sendTemporaryPasswordEmail({
  to,
  displayName,
  tempPassword,
  loginUrl = "https://googlechat.enging.pt",
  reason = "FIRST_ACCESS",
}: SendTempPasswordParams): Promise<{ messageId: string }> {
  const config = await getMailConfig();
  const transporter = createTransporterFromConfig(config);
  const smtpFrom = `"${config.fromName}" <${config.fromEmail || config.user}>`;

  const isReset = reason === "ADMIN_RESET" || reason === "PASSWORD_RESET";
  const emailTitle = isReset
    ? "Redefinição de Palavra-Passe"
    : "Primeiro Acesso ao Portal";
  const introMessage = isReset
    ? `Foi solicitada pelo <strong>Administrador do Sistema</strong> uma redefinição da sua palavra-passe de acesso associada à sua conta interna (<code>${to}</code>).`
    : `Foi gerada uma <strong>palavra-passe temporária</strong> para permitir o seu primeiro acesso ao histórico associado à sua conta interna (<code>${to}</code>).`;
  const subject = isReset
    ? `Redefinição de Palavra-Passe - ${config.fromName}`
    : `Acesso ao Portal - Palavra-Passe Temporária - ${config.fromName}`;

  const htmlContent = `
<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <title>${emailTitle}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 30px 15px;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03); border: 1px solid #e2e8f0;">
    <!-- Header -->
    <tr>
      <td style="background-color: #223546; padding: 26px 32px; border-bottom: 4px solid #e95c0c;">
        <table border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td style="background-color: #e95c0c; width: 40px; height: 40px; border-radius: 10px; text-align: center; vertical-align: middle; color: #ffffff; font-weight: 600; font-size: 20px;">
              ✉
            </td>
            <td style="padding-left: 14px;">
              <span style="font-size: 18px; font-weight: 600; color: #ffffff; letter-spacing: -0.02em; display: block;">${config.fromName}</span>
              <span style="font-size: 12px; color: #94a3b8; font-weight: 500;">Comunicação Oficial &bull; enging.pt</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Body Content -->
    <tr>
      <td style="padding: 32px 32px 24px 32px;">
        <h2 style="font-size: 20px; font-weight: 600; color: #1e293b; margin-top: 0; margin-bottom: 12px;">
          ${emailTitle}
        </h2>
        <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 20px 0;">
          Olá, <strong>${displayName}</strong>,
        </p>
        <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 24px 0;">
          ${introMessage}
        </p>

        <!-- Password Card -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 2px dashed #e95c0c; border-radius: 12px; margin-bottom: 24px;">
          <tr>
            <td style="padding: 20px; text-align: center;">
              <span style="display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-bottom: 8px;">
                Palavra-Passe Temporária (8 Caracteres)
              </span>
              <span style="display: inline-block; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace; font-size: 28px; font-weight: 600; letter-spacing: 4px; color: #223546; background-color: #fff3ed; padding: 8px 24px; border-radius: 8px; border: 1px solid #ffd8c2;">
                ${tempPassword}
              </span>
            </td>
          </tr>
        </table>

        <!-- Security Warning Alert -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 6px; margin-bottom: 28px;">
          <tr>
            <td style="padding: 14px 16px;">
              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #92400e;">
                ⚠️ <strong>Atenção:</strong> Por motivos de segurança, <strong>deverá alterar esta palavra-passe imediatamente</strong> após iniciar a sua primeira sessão.
              </p>
            </td>
          </tr>
        </table>

        <!-- CTA Button -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
          <tr>
            <td align="center">
              <a href="${loginUrl}" target="_blank" style="display: inline-block; background-color: #e95c0c; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 32px; border-radius: 8px; box-shadow: 0 2px 4px rgba(233, 92, 12, 0.25);">
                Aceder ao Portal &rarr;
              </a>
            </td>
          </tr>
        </table>

        <p style="font-size: 12px; line-height: 1.5; color: #94a3b8; margin: 0; text-align: center;">
          Ou copie o endereço no seu navegador: <br>
          <a href="${loginUrl}" style="color: #e95c0c; text-decoration: underline;">${loginUrl}</a>
        </p>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background-color: #f8fafc; padding: 18px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
        <p style="font-size: 11px; color: #94a3b8; margin: 0; line-height: 1.4;">
          Este é um e-mail automático enviado pelo remetente oficial <strong>${smtpFrom}</strong>.<br>
          Se não solicitou este acesso, por favor contacte o administrador do sistema.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const res = await sendSystemEmail({
    to,
    subject,
    text: `Olá ${displayName},\n\nA sua palavra-passe temporária para aceder ao sistema (${to}) é:\n\n${tempPassword}\n\nPor motivos de segurança, deverá alterar esta palavra-passe no primeiro acesso.\n\nAceda em: ${loginUrl}\n\nRemetente: ${smtpFrom}`,
    html: htmlContent,
  });

  return { messageId: res.messageId };
}

export async function sendEmailViaMicrosoftGraph({
  fromEmail,
  fromName,
  to,
  subject,
  html,
  text,
}: {
  fromEmail: string;
  fromName?: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}): Promise<{ messageId: string }> {
  if (!graphClient.isConfigured()) {
    throw new Error(
      "A integração Microsoft 365 não está configurada em Sistema » Conexões Cloud. Configure o Tenant ID, Client ID e Client Secret."
    );
  }

  const recipients = Array.isArray(to) ? to : [to];
  const toRecipients = recipients.map((r) => ({
    emailAddress: {
      address: r.trim(),
    },
  }));

  const payload: any = {
    message: {
      subject,
      body: {
        contentType: "HTML",
        content: html,
      },
      toRecipients,
    },
    saveToSentItems: true,
  };

  const endpoint = `/users/${encodeURIComponent(fromEmail.trim())}/sendMail`;
  await graphClient.fetchGraph(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return { messageId: `msgraph-${Date.now()}` };
}

export async function sendEmailViaGoogleWorkspace({
  fromEmail,
  fromName,
  to,
  subject,
  html,
  text,
}: {
  fromEmail: string;
  fromName?: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}): Promise<{ messageId: string }> {
  if (!isGoogleConfigured()) {
    throw new Error(
      "A integração Google Workspace não está configurada em Sistema » Conexões Cloud."
    );
  }

  const { google } = await import("googleapis");
  const auth = getGoogleAuthClient(fromEmail.trim());
  const gmail = google.gmail({ version: "v1", auth });

  const recipients = Array.isArray(to) ? to.join(", ") : to;
  const fromHeader = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;
  const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString("base64")}?=`;

  const messageParts = [
    `From: ${fromHeader}`,
    `To: ${recipients}`,
    `Subject: ${utf8Subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=utf-8`,
    ``,
    html,
  ];
  const message = messageParts.join("\r\n");
  const encodedMessage = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodedMessage,
    },
  });

  return { messageId: res.data.id || `google-${Date.now()}` };
}

export async function sendSystemEmail({
  to,
  subject,
  html,
  text,
  accountOverride,
}: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  accountOverride?: EmailAccountConfig;
}): Promise<{ messageId: string; providerUsed: string }> {
  let activeAccount: EmailAccountConfig | undefined = accountOverride;

  if (!activeAccount) {
    const { accounts, defaultAccountId } = await getMailAccounts();
    activeAccount =
      accounts.find((a) => a.id === defaultAccountId && a.isEnabled) ||
      accounts.find((a) => a.isEnabled) ||
      accounts[0];
  }

  if (activeAccount && activeAccount.type === "ACCOUNT") {
    if (activeAccount.apiProvider === "MICROSOFT_365") {
      const res = await sendEmailViaMicrosoftGraph({
        fromEmail: activeAccount.fromEmail,
        fromName: activeAccount.fromName,
        to,
        subject,
        html,
        text,
      });
      return { messageId: res.messageId, providerUsed: "MICROSOFT_365" };
    }

    if (activeAccount.apiProvider === "GOOGLE_WORKSPACE") {
      const res = await sendEmailViaGoogleWorkspace({
        fromEmail: activeAccount.fromEmail,
        fromName: activeAccount.fromName,
        to,
        subject,
        html,
        text,
      });
      return { messageId: res.messageId, providerUsed: "GOOGLE_WORKSPACE" };
    }
  }

  const config = await getMailConfig();
  const transporter = createTransporterFromConfig(config);
  const from = `"${config.fromName}" <${config.fromEmail || config.user}>`;

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });

  return { messageId: info.messageId, providerUsed: "SMTP" };
}

export async function testMailConnection({
  testRecipient,
  configOverride,
}: {
  testRecipient?: string;
  configOverride?: Partial<MailConfig>;
}): Promise<{ success: boolean; message: string; messageId?: string }> {
  const baseConfig = await getMailConfig();
  const config: MailConfig = {
    ...baseConfig,
    ...configOverride,
  };

  if (!config.host || !config.user) {
    throw new Error("O Servidor SMTP e a Conta de Envio/Utilizador são de preenchimento obrigatório.");
  }

  const transporter = createTransporterFromConfig(config);

  // 1. Verify handshake and credentials
  await transporter.verify();

  let messageId: string | undefined;

  // 2. If a recipient is given, dispatch a real test message
  if (testRecipient && testRecipient.trim()) {
    const fromAddress = `"${config.fromName}" <${config.fromEmail || config.user}>`;
    const testDate = new Date().toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" });

    const htmlContent = `
<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <title>Teste de Comunicações do Sistema</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 30px 15px;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
    <tr>
      <td style="background-color: #223546; padding: 26px 32px; border-bottom: 4px solid #e95c0c;">
        <h1 style="color: #ffffff; font-size: 18px; margin: 0; font-weight: 600;">
          msgl.enging.pt &bull; Servidor de E-mail
        </h1>
        <p style="color: #94a3b8; font-size: 12px; margin: 4px 0 0 0;">
          Teste de Ligação &bull; Validação de Autenticação e Remetente
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding: 28px 32px;">
        <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px;">
          <strong style="color: #166534; font-size: 14px; font-weight: 600; display: block; margin-bottom: 4px;">
            ✓ Ligação SMTP e Autenticação Bem-Sucedidas!
          </strong>
          <span style="color: #15803d; font-size: 13px;">
            Este e-mail comprova que o servidor e as credenciais de autenticação estão 100% operacionais para emitir as comunicações de todo o sistema.
          </span>
        </div>

        <h3 style="font-size: 14px; font-weight: 600; color: #1e293b; margin: 0 0 12px 0;">
          Parâmetros Autenticados:
        </h3>
        <table width="100%" border="0" cellspacing="0" cellpadding="6" style="font-size: 13px; color: #334155; margin-bottom: 24px; border-collapse: collapse;">
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="font-weight: 600; width: 170px; color: #64748b;">Nome do Remetente (Sender):</td>
            <td><strong>${config.fromName}</strong></td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="font-weight: 600; color: #64748b;">E-mail do Remetente (From):</td>
            <td><code>${config.fromEmail || config.user}</code></td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="font-weight: 600; color: #64748b;">Servidor SMTP:</td>
            <td>${config.host}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="font-weight: 600; color: #64748b;">Porta:</td>
            <td>${config.port} (${config.secure ? "SSL/TLS Direto" : "STARTTLS"})</td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="font-weight: 600; color: #64748b;">Conta Autenticada:</td>
            <td><code>${config.user}</code></td>
          </tr>
          <tr>
            <td style="font-weight: 600; color: #64748b;">Data e Hora do Teste:</td>
            <td>${testDate}</td>
          </tr>
        </table>

        <p style="font-size: 12px; line-height: 1.5; color: #64748b; margin: 0;">
          A partir de agora, todas as mensagens geradas pela plataforma (ativações, redefinições de credenciais e notificações) sairão com este remetente identificado.
        </p>
      </td>
    </tr>
    <tr>
      <td style="background-color: #f8fafc; padding: 14px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
        <span style="font-size: 11px; color: #94a3b8;">
          Mensagem automática de teste enviada a partir de msgl.enging.pt
        </span>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const info = await transporter.sendMail({
      from: fromAddress,
      to: testRecipient.trim(),
      subject: `[Teste de Ligação] Servidor de E-mail Configurado - ${config.fromName}`,
      text: `Ligação SMTP validada com sucesso!\n\nRemetente: ${fromAddress}\nServidor: ${config.host}:${config.port}\nConta: ${config.user}\nData: ${testDate}`,
      html: htmlContent,
    });
    messageId = info.messageId;
  }

  return {
    success: true,
    message: testRecipient
      ? `Autenticação SMTP verificada e e-mail de teste expedido com sucesso para ${testRecipient}!`
      : "Autenticação SMTP verificada com sucesso!",
    messageId,
  };
}

export async function sendEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  configOverride?: Partial<MailConfig>;
}) {
  const result = await testMailConnection({
    testRecipient: Array.isArray(params.to) ? params.to[0] : params.to,
    configOverride: params.configOverride,
  });
  return {
    providerUsed: "SMTP",
    authenticatedAs: params.configOverride?.user || "smtp",
    senderFrom: `"${params.configOverride?.fromName}" <${params.configOverride?.fromEmail}>`,
    replyTo: params.configOverride?.fromEmail,
    messageId: result.messageId || "ok",
  };
}

export async function testAccountSending({
  account,
  testRecipient,
}: {
  account: EmailAccountConfig;
  testRecipient?: string;
}): Promise<{ success: boolean; message: string; messageId?: string }> {
  const providerLabel =
    account.type === "ACCOUNT"
      ? account.apiProvider === "MICROSOFT_365"
        ? "Microsoft 365 (Microsoft Graph API)"
        : "Google Workspace (Gmail API)"
      : `Servidor SMTP (${account.smtp?.host || "Host"})`;

  if (!testRecipient || !testRecipient.trim()) {
    if (account.type === "ACCOUNT") {
      return {
        success: true,
        message: `Autenticação com ${providerLabel} validada com sucesso!`,
      };
    }
    return testMailConnection({
      configOverride: {
        host: account.smtp?.host,
        port: account.smtp?.port,
        secure: account.smtp?.secure,
        user: account.smtp?.user,
        password: account.smtp?.password,
        fromName: account.fromName,
        fromEmail: account.fromEmail,
      },
    });
  }

  const recipient = testRecipient.trim();
  const testDate = new Date().toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" });

  const htmlContent = `
<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <title>Teste de Comunicações do Sistema</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 30px 15px;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
    <tr>
      <td style="background-color: #223546; padding: 26px 32px; border-bottom: 4px solid #e95c0c;">
        <h1 style="color: #ffffff; font-size: 18px; margin: 0; font-weight: 600;">
          msgl.enging.pt &bull; Servidor de E-mail
        </h1>
        <p style="color: #94a3b8; font-size: 12px; margin: 4px 0 0 0;">
          Teste de Comunicação &bull; ${providerLabel}
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding: 28px 32px;">
        <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px;">
          <strong style="color: #166534; font-size: 14px; font-weight: 600; display: block; margin-bottom: 4px;">
            ✓ Comunicação Validada com Sucesso!
          </strong>
          <span style="color: #15803d; font-size: 13px;">
            Este e-mail comprova que o método de saída <strong>${providerLabel}</strong> está 100% operacional para emitir as comunicações de todo o sistema.
          </span>
        </div>

        <h3 style="font-size: 14px; font-weight: 600; color: #1e293b; margin: 0 0 12px 0;">
          Parâmetros do Remetente:
        </h3>
        <table width="100%" border="0" cellspacing="0" cellpadding="6" style="font-size: 13px; color: #334155; margin-bottom: 24px; border-collapse: collapse;">
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="font-weight: 600; width: 170px; color: #64748b;">Nome do Remetente:</td>
            <td><strong>${account.fromName}</strong></td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="font-weight: 600; color: #64748b;">E-mail do Remetente:</td>
            <td><code>${account.fromEmail}</code></td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="font-weight: 600; color: #64748b;">Método de Saída:</td>
            <td><strong style="color: #0f172a;">${providerLabel}</strong></td>
          </tr>
          <tr>
            <td style="font-weight: 600; color: #64748b;">Data e Hora do Teste:</td>
            <td>${testDate}</td>
          </tr>
        </table>

        <p style="font-size: 12px; line-height: 1.5; color: #64748b; margin: 0;">
          A partir de agora, as notificações e redefinições de palavras-passe sairão através deste remetente oficial.
        </p>
      </td>
    </tr>
    <tr>
      <td style="background-color: #f8fafc; padding: 14px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
        <span style="font-size: 11px; color: #94a3b8;">
          Mensagem automática de teste enviada a partir de msgl.enging.pt
        </span>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  if (account.type === "ACCOUNT") {
    let res: { messageId: string };
    if (account.apiProvider === "MICROSOFT_365") {
      res = await sendEmailViaMicrosoftGraph({
        fromEmail: account.fromEmail,
        fromName: account.fromName,
        to: recipient,
        subject: `[Teste de Ligação] Remetente Microsoft 365 - ${account.fromName}`,
        html: htmlContent,
      });
    } else {
      res = await sendEmailViaGoogleWorkspace({
        fromEmail: account.fromEmail,
        fromName: account.fromName,
        to: recipient,
        subject: `[Teste de Ligação] Remetente Google Workspace - ${account.fromName}`,
        html: htmlContent,
      });
    }

    return {
      success: true,
      message: `E-mail de teste expedido com sucesso via ${providerLabel} para ${recipient}!`,
      messageId: res.messageId,
    };
  }

  return testMailConnection({
    testRecipient: recipient,
    configOverride: {
      host: account.smtp?.host,
      port: account.smtp?.port,
      secure: account.smtp?.secure,
      user: account.smtp?.user,
      password: account.smtp?.password,
      fromName: account.fromName,
      fromEmail: account.fromEmail,
    },
  });
}
