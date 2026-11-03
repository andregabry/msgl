import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  try {
    const session = await getCurrentUser(req);
    if (!session || (session.role !== "ADMIN" && session.role !== "AUDITOR")) {
      return new NextResponse(
        `<!DOCTYPE html><html><body><h3>Acesso Negado</h3><p>Apenas administradores podem autenticar contas de envio.</p><script>setTimeout(() => window.close(), 3000);</script></body></html>`,
        { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 403 }
      );
    }

    const searchParams = req.nextUrl.searchParams;
    const provider = searchParams.get("provider") || "GOOGLE_WORKSPACE";
    const emailHint = searchParams.get("email") || "";

    const proto = req.headers.get("x-forwarded-proto") || "https";
    const host = req.headers.get("host") || "msgl.enging.pt";
    const baseUrl = process.env.APP_BASE_URL || `${proto}://${host}`;
    const defaultRedirectUri = `${baseUrl}/api/auth/email-oauth/callback`;

    // -------------------------------------------------------------------------
    // MICROSOFT 365 OAUTH FLOW
    // -------------------------------------------------------------------------
    if (provider === "MICROSOFT_365") {
      const tenantId = process.env.MICROSOFT_TENANT_ID || "common";
      const clientId = process.env.MICROSOFT_CLIENT_ID;

      if (!clientId) {
        return new NextResponse(
          `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Erro de Configuração</title></head>
<body style="font-family:sans-serif;padding:30px;text-align:center;">
  <h3 style="color:#e11d48;">Microsoft 365 Não Configurado</h3>
  <p>O Client ID da Microsoft não está configurado em Conexões Cloud.</p>
  <button onclick="window.close()" style="padding:8px 16px;background:#223546;color:#fff;border:none;border-radius:6px;cursor:pointer;">Fechar</button>
</body>
</html>`,
          { headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      }

      let msRedirectUri = process.env.MICROSOFT_REDIRECT_URI?.trim();
      if (!msRedirectUri) {
        try {
          const { prisma } = await import("@/lib/prisma");
          const msConn = await prisma.integrationConnection.findUnique({
            where: { provider: "MICROSOFT_365" },
          });
          const msConfig = (msConn?.config as any) || {};
          if (msConfig.redirectUri && typeof msConfig.redirectUri === "string" && msConfig.redirectUri.trim() !== "") {
            msRedirectUri = msConfig.redirectUri.trim();
          }
        } catch (e) {
          // ignore
        }
      }

      const redirectUri = msRedirectUri || defaultRedirectUri;

      const statePayload = Buffer.from(
        JSON.stringify({
          provider: "MICROSOFT_365",
          emailHint,
          redirectUri,
          timestamp: Date.now(),
        })
      ).toString("base64");

      const msAuthUrl = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`);
      msAuthUrl.searchParams.set("client_id", clientId);
      msAuthUrl.searchParams.set("response_type", "code");
      msAuthUrl.searchParams.set("redirect_uri", redirectUri);
      msAuthUrl.searchParams.set("response_mode", "query");
      msAuthUrl.searchParams.set("scope", "openid profile email offline_access User.Read");
      msAuthUrl.searchParams.set("state", statePayload);
      msAuthUrl.searchParams.set("prompt", "select_account");
      if (emailHint) {
        msAuthUrl.searchParams.set("login_hint", emailHint);
      }

      return NextResponse.redirect(msAuthUrl.toString());
    }

    // -------------------------------------------------------------------------
    // GOOGLE WORKSPACE OAUTH FLOW
    // -------------------------------------------------------------------------
    const googleClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;

    if (googleClientId) {
      const statePayload = Buffer.from(
        JSON.stringify({
          provider: "GOOGLE_WORKSPACE",
          emailHint,
          redirectUri: defaultRedirectUri,
          timestamp: Date.now(),
        })
      ).toString("base64");

      const gAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      gAuthUrl.searchParams.set("client_id", googleClientId);
      gAuthUrl.searchParams.set("redirect_uri", defaultRedirectUri);
      gAuthUrl.searchParams.set("response_type", "code");
      gAuthUrl.searchParams.set("scope", "openid profile email https://www.googleapis.com/auth/gmail.send");
      gAuthUrl.searchParams.set("state", statePayload);
      gAuthUrl.searchParams.set("access_type", "offline");
      gAuthUrl.searchParams.set("prompt", "select_account");
      if (emailHint) {
        gAuthUrl.searchParams.set("login_hint", emailHint);
      }

      return NextResponse.redirect(gAuthUrl.toString());
    }

    // If GOOGLE_OAUTH_CLIENT_ID is not configured, redirect to Google Workspace Domain SSO Validator
    const domainSsoUrl = new URL(`${baseUrl}/api/auth/email-oauth/google-sso`);
    if (emailHint) {
      domainSsoUrl.searchParams.set("email", emailHint);
    }
    return NextResponse.redirect(domainSsoUrl.toString());
  } catch (err: any) {
    return new NextResponse(`Erro ao iniciar autenticação: ${err.message}`, { status: 500 });
  }
}
