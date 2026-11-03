import { NextRequest, NextResponse } from "next/server";
import { getGoogleAuthClient, isGoogleConfigured } from "@/lib/google/auth";

export async function GET(req: NextRequest) {
  const emailHint = req.nextUrl.searchParams.get("email") || "";

  return new NextResponse(
    `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <title>Google Workspace SSO &bull; Validação de Conta</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; padding: 30px 15px; margin: 0; color: #1e293b; }
    .card { max-width: 440px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 32px 28px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.06); }
    .logo { width: 44px; height: 44px; background: #fff3ed; color: #e95c0c; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: bold; margin: 0 auto 16px; }
    h2 { font-size: 18px; font-weight: 600; color: #0f172a; margin: 0 0 6px 0; text-align: center; }
    p { font-size: 13px; color: #64748b; margin: 0 0 20px 0; text-align: center; line-height: 1.4; }
    label { display: block; font-size: 12px; font-weight: bold; color: #334155; margin-bottom: 6px; }
    input { width: 100%; box-sizing: border-box; padding: 11px 14px; font-size: 13px; font-family: monospace; border: 1px solid #cbd5e1; border-radius: 10px; background: #f8fafc; margin-bottom: 16px; }
    input:focus { outline: none; border-color: #e95c0c; background: #fff; box-shadow: 0 0 0 3px rgba(233,92,12,0.15); }
    .btn-auth { width: 100%; padding: 12px; font-size: 13px; font-weight: bold; color: #fff; background: #e95c0c; border: none; border-radius: 10px; cursor: pointer; transition: background 0.2s; }
    .btn-auth:hover { background: #d04f08; }
    .btn-auth:disabled { opacity: 0.6; cursor: not-allowed; }
    .status { margin-top: 14px; padding: 10px 14px; border-radius: 8px; font-size: 12px; display: none; text-align: center; }
    .status.error { background: #fee2e2; color: #991b1b; display: block; }
    .status.success { background: #dcfce7; color: #166534; display: block; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">G</div>
    <h2>Autenticação Google Workspace</h2>
    <p>Validação da conta de envio através da API e Delegação de Domínio (@enging.pt)</p>

    <form id="ssoForm">
      <label for="email">Conta Google a Validar:</label>
      <input type="email" id="email" value="${emailHint}" placeholder="notificacoes@enging.pt" required autofocus />

      <button type="submit" id="btnSubmit" class="btn-auth">Validar e Autorizar Conta</button>
      <div id="statusBox" class="status"></div>
    </form>
  </div>

  <script>
    const form = document.getElementById("ssoForm");
    const emailInput = document.getElementById("email");
    const btn = document.getElementById("btnSubmit");
    const statusBox = document.getElementById("statusBox");

    form.onsubmit = async (e) => {
      e.preventDefault();
      const email = emailInput.value.trim();
      if (!email || !email.includes("@")) return;

      btn.disabled = true;
      btn.innerText = "A validar delegação...";
      statusBox.style.display = "none";

      try {
        const res = await fetch("/api/admin/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "AUTHENTICATE_API",
            apiProvider: "GOOGLE_WORKSPACE",
            email: email
          })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          statusBox.className = "status success";
          statusBox.innerText = "✓ Conta autenticada com sucesso! A regressar ao painel...";
          statusBox.style.display = "block";

          if (window.opener) {
            window.opener.postMessage({
              type: "OAUTH_SUCCESS",
              provider: "GOOGLE_WORKSPACE",
              email: email,
              displayName: data.details?.fullName || "Google Workspace Notificações"
            }, "*");
            setTimeout(() => window.close(), 700);
          } else {
            setTimeout(() => window.location.href = "/admin/email", 1200);
          }
        } else {
          btn.disabled = false;
          btn.innerText = "Tentar Novamente";
          statusBox.className = "status error";
          statusBox.innerText = data.message || "Falha na autenticação da conta Google.";
          statusBox.style.display = "block";
        }
      } catch (err) {
        btn.disabled = false;
        btn.innerText = "Tentar Novamente";
        statusBox.className = "status error";
        statusBox.innerText = err.message || "Erro de rede ao validar.";
        statusBox.style.display = "block";
      }
    };
  </script>
</body>
</html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
