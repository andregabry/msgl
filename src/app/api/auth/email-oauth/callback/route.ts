import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const stateStr = searchParams.get("state");

  let state: any = {};
  if (stateStr) {
    try {
      state = JSON.parse(Buffer.from(stateStr, "base64").toString("utf-8"));
    } catch (e) {
      // Ignore state parse error
    }
  }

  const provider = state.provider || "MICROSOFT_365";

  if (error || !code) {
    return new NextResponse(
      `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <title>Erro de Autenticação</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; padding: 40px 20px; text-align: center; color: #1e293b; }
    .card { max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
    h3 { color: #e11d48; margin-top: 0; }
    p { font-size: 13px; color: #64748b; line-height: 1.5; }
    .btn { display: inline-block; margin-top: 20px; padding: 10px 20px; background: #223546; color: #fff; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: bold; border: none; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card">
    <h3>Falha na Autenticação</h3>
    <p>${errorDescription || error || "O processo de autorização foi cancelado ou expirou."}</p>
    <button class="btn" onclick="window.close()">Fechar Janela</button>
  </div>
</body>
</html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 400 }
    );
  }

  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("host") || "msgl.enging.pt";
  const baseUrl = process.env.APP_BASE_URL || `${proto}://${host}`;

  let msRedirectUri = state.redirectUri || process.env.MICROSOFT_REDIRECT_URI?.trim();
  let dbTenantId = "";
  let dbClientId = "";
  let dbClientSecret = "";

  if (provider === "MICROSOFT_365") {
    try {
      const { prisma } = await import("@/lib/prisma");
      const msConn = await prisma.integrationConnection.findUnique({
        where: { provider: "MICROSOFT_365" },
      });
      const msConfig = (msConn?.config as any) || {};
      if (!msRedirectUri && msConfig.redirectUri && typeof msConfig.redirectUri === "string" && msConfig.redirectUri.trim() !== "") {
        msRedirectUri = msConfig.redirectUri.trim();
      }
      if (msConfig.tenantId) dbTenantId = msConfig.tenantId;
      if (msConfig.clientId) dbClientId = msConfig.clientId;
      if (msConfig.clientSecret) dbClientSecret = msConfig.clientSecret;
    } catch (e) {
      // ignore
    }
  }

  const currentPathUrl = `${baseUrl}${req.nextUrl.pathname}`;
  const redirectUri = (provider === "MICROSOFT_365" && msRedirectUri)
    ? msRedirectUri
    : (req.nextUrl.pathname !== "/api/auth/email-oauth/callback" ? currentPathUrl : `${baseUrl}/api/auth/email-oauth/callback`);

  try {
    let authenticatedEmail = "";
    let authenticatedName = "";

    // -------------------------------------------------------------------------
    // MICROSOFT 365 TOKEN EXCHANGE
    // -------------------------------------------------------------------------
    if (provider === "MICROSOFT_365") {
      const tenantId = process.env.MICROSOFT_TENANT_ID || dbTenantId || "common";
      const clientId = process.env.MICROSOFT_CLIENT_ID || dbClientId || "";
      const clientSecret = process.env.MICROSOFT_CLIENT_SECRET || dbClientSecret || "";

      const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
      const params = new URLSearchParams();
      params.append("client_id", clientId);
      params.append("client_secret", clientSecret);
      params.append("code", code);
      params.append("redirect_uri", redirectUri);
      params.append("grant_type", "authorization_code");

      const tokenRes = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        throw new Error(`Erro ao obter token da Microsoft: ${errText}`);
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;

      // Fetch user profile from Microsoft Graph /me
      const profileRes = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (profileRes.ok) {
        const profile = await profileRes.json();
        authenticatedEmail = profile.mail || profile.userPrincipalName;
        authenticatedName = profile.displayName || authenticatedEmail;
      } else {
        // Fallback: parse id_token payload
        if (tokenData.id_token) {
          const parts = tokenData.id_token.split(".");
          if (parts.length > 1) {
            const claims = JSON.parse(Buffer.from(parts[1], "base64").toString("utf-8"));
            authenticatedEmail = claims.email || claims.preferred_username || claims.upn;
            authenticatedName = claims.name || authenticatedEmail;
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // GOOGLE WORKSPACE TOKEN EXCHANGE
    // -------------------------------------------------------------------------
    if (provider === "GOOGLE_WORKSPACE") {
      const googleClientId = process.env.GOOGLE_OAUTH_CLIENT_ID || "";
      const googleClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: googleClientId,
          client_secret: googleClientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }).toString(),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        throw new Error(`Erro ao obter token da Google: ${errText}`);
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;

      // Fetch user info from Google
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (userInfoRes.ok) {
        const userInfo = await userInfoRes.json();
        authenticatedEmail = userInfo.email;
        authenticatedName = userInfo.name || authenticatedEmail;
      }
    }

    if (!authenticatedEmail) {
      authenticatedEmail = state.emailHint || "conta-autenticada@enging.pt";
      authenticatedName = "Remetente Autenticado";
    }

    // Success response: message parent window and close popup
    return new NextResponse(
      `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <title>Autenticação Concluída com Sucesso</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; padding: 40px 20px; text-align: center; color: #1e293b; }
    .card { max-width: 440px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
    .icon { width: 52px; height: 52px; background: #dcfce7; color: #16a34a; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; margin: 0 auto 16px; }
    h3 { color: #166534; margin: 0 0 8px 0; font-size: 18px; font-weight: 600; }
    p { font-size: 13px; color: #64748b; margin: 0 0 16px 0; }
    .badge { display: inline-block; background: #f1f5f9; padding: 6px 14px; border-radius: 8px; font-family: monospace; font-size: 13px; color: #0f172a; margin-bottom: 20px; border: 1px solid #cbd5e1; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✓</div>
    <h3>Autenticação Concluída!</h3>
    <p>A conta foi validada com sucesso pelo provedor:</p>
    <div class="badge">${authenticatedEmail}</div>
    <p style="font-size: 11px; color: #94a3b8;">A sincronizar com a janela de configuração...</p>
    <div style="margin-top: 18px;">
      <button onclick="concludeAndClose()" style="padding: 10px 22px; background: #e95c0c; color: #fff; border: none; border-radius: 10px; font-weight: bold; cursor: pointer; font-size: 13px;">
        Voltar à Configuração de E-mail
      </button>
    </div>
  </div>
  <script>
    var authPayload = {
      type: "OAUTH_SUCCESS",
      provider: "${provider}",
      email: "${authenticatedEmail}",
      displayName: "${authenticatedName.replace(/"/g, '\\"')}",
      timestamp: Date.now()
    };

    function notifyAll() {
      // 1. Post to opener if available
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(authPayload, "*");
        }
      } catch (e) {}

      // 2. BroadcastChannel
      try {
        var bc = new BroadcastChannel("oauth_email_auth");
        bc.postMessage(authPayload);
        setTimeout(function() { bc.close(); }, 3000);
      } catch (e) {}

      // 3. LocalStorage
      try {
        localStorage.setItem("oauth_email_auth_success", JSON.stringify(authPayload));
      } catch (e) {}
    }

    function concludeAndClose() {
      notifyAll();
      try {
        if (window.opener) {
          window.close();
          return;
        }
      } catch (e) {}
      window.location.href = "/admin/email";
    }

    notifyAll();

    // Auto-close if opener exists
    try {
      if (window.opener) {
        setTimeout(function() { window.close(); }, 900);
      }
    } catch (e) {}
  </script>
</body>
</html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  } catch (err: any) {
    return new NextResponse(
      `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="utf-8"><title>Erro</title></head>
<body style="font-family:sans-serif;padding:30px;text-align:center;">
  <h3 style="color:#e11d48;">Erro no Processamento</h3>
  <p>${err.message}</p>
  <button onclick="window.close()" style="padding:8px 16px;background:#223546;color:#fff;border:none;border-radius:6px;cursor:pointer;">Fechar</button>
</body>
</html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 500 }
    );
  }
}
