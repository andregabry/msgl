/**
 * Humanizes complex cloud API errors (Microsoft Entra ID, Microsoft Graph, Google Workspace, Vault)
 * into clear, friendly, and actionable messages in Portuguese with step-by-step resolution hints.
 */

export interface FormattedError {
  title: string;
  description: string;
  resolutionHint?: string;
  technicalDetails?: string;
}

/**
 * Extracts and humanizes raw error messages, JSON strings, or error instances.
 */
export function humanizeError(rawInput: unknown, fallbackTitle: string = "Ocorreu um Erro"): FormattedError {
  let rawText = "";

  if (typeof rawInput === "string") {
    rawText = rawInput;
  } else if (rawInput && typeof rawInput === "object") {
    if ("message" in rawInput && typeof (rawInput as any).message === "string") {
      rawText = (rawInput as any).message;
    } else if ("error" in rawInput) {
      const err = (rawInput as any).error;
      rawText = typeof err === "string" ? err : JSON.stringify(err);
    } else {
      rawText = JSON.stringify(rawInput);
    }
  }

  // Try to parse nested JSON if present inside the text
  let parsedJson: any = null;
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      parsedJson = JSON.parse(jsonMatch[0]);
    } catch {}
  }

  const errorDesc = parsedJson?.error_description || parsedJson?.error?.message || rawText;

  // ---------------------------------------------------------------------------
  // 1. Microsoft Entra ID & Microsoft Graph Errors
  // ---------------------------------------------------------------------------

  // AADSTS7000215: Invalid client secret provided
  if (rawText.includes("AADSTS7000215") || /invalid client secret/i.test(rawText)) {
    return {
      title: "Client Secret do Microsoft 365 Inválido",
      description: "O Segredo do Cliente (Client Secret) configurado é inválido ou expirou no Microsoft Entra ID.",
      resolutionHint:
        "No portal do Microsoft Entra ID (Azure), aceda a 'Registos de Aplicações' > a sua aplicação > 'Certificados e Segredos'. Certifique-se de copiar o <strong>Valor (Value)</strong> do segredo gerado e não o <em>ID do Segredo (Secret ID)</em>.",
      technicalDetails: extractTechnicalDetails(rawText),
    };
  }

  // AADSTS700016: Application not found
  if (rawText.includes("AADSTS700016") || /application.*not found/i.test(rawText)) {
    return {
      title: "Aplicação Microsoft Não Encontrada",
      description: "A aplicação com o Client ID indicado não foi encontrada no Tenant do Microsoft Entra ID.",
      resolutionHint:
        "Verifique se o <strong>Client ID (ID da Aplicação)</strong> e o <strong>Tenant ID</strong> pertencem ao mesmo diretório onde a aplicação foi registada no portal Azure.",
      technicalDetails: extractTechnicalDetails(rawText),
    };
  }

  // AADSTS90002: Tenant not found
  if (rawText.includes("AADSTS90002") || /tenant.*not found/i.test(rawText)) {
    return {
      title: "Tenant ID Microsoft Não Encontrado",
      description: "O identificador do Tenant (Diretório) da Microsoft especificado não existe ou está incorreto.",
      resolutionHint:
        "Confirme o <strong>Tenant ID (ID do Diretório)</strong> na página de Visão Geral do Microsoft Entra ID ou da sua subscrição Microsoft 365.",
      technicalDetails: extractTechnicalDetails(rawText),
    };
  }

  // AADSTS65001 or Authorization_RequestDenied / Insufficient privileges
  if (
    rawText.includes("AADSTS65001") ||
    rawText.includes("Authorization_RequestDenied") ||
    /insufficient privileges/i.test(rawText) ||
    /consent.*required/i.test(rawText)
  ) {
    return {
      title: "Consentimento de Administrador Pendente",
      description: "A aplicação não possui permissões suficientes ou ainda não recebeu o consentimento de administrador.",
      resolutionHint:
        "Aceda a 'Permissões de API' no registo da aplicação no Entra ID e clique no botão <strong>'Conceder consentimento de administrador para [Organização]'</strong> para aprovar as permissões de aplicação necessárias (ex.: User.Read.All, Mail.ReadWrite, MailboxSettings.ReadWrite).",
      technicalDetails: extractTechnicalDetails(rawText),
    };
  }

  // MailboxNotEnabledForRESTAPI or ResourceNotFound
  if (rawText.includes("MailboxNotEnabledForRESTAPI") || rawText.includes("ResourceNotFound")) {
    return {
      title: "Caixa de Correio Indisponível",
      description: "A caixa de correio Microsoft indicada não foi encontrada ou não possui uma licença Exchange ativa.",
      resolutionHint:
        "Certifique-se de que a conta ou caixa partilhada possui uma licença Exchange ativa e que a sua criação no Microsoft 365 foi concluída.",
      technicalDetails: extractTechnicalDetails(rawText),
    };
  }

  // Generic invalid_client for Microsoft
  if (rawText.includes("invalid_client") && (rawText.includes("login.microsoftonline.com") || rawText.includes("AADSTS"))) {
    return {
      title: "Credenciais Microsoft 365 Recusadas",
      description: "O Microsoft Entra ID recusou a autenticação da aplicação com os parâmetros fornecidos.",
      resolutionHint:
        "Verifique com atenção o <strong>Tenant ID</strong>, <strong>Client ID</strong> e <strong>Client Secret</strong> configurados na janela de parâmetros.",
      technicalDetails: extractTechnicalDetails(rawText),
    };
  }

  // ---------------------------------------------------------------------------
  // 2. Google Workspace & Google Vault Errors
  // ---------------------------------------------------------------------------

  // invalid_grant
  if (rawText.includes("invalid_grant")) {
    return {
      title: "Falha de Autenticação Google Workspace (invalid_grant)",
      description: "A chave de serviço não foi aceite ou o utilizador administrativo a personificar não é válido.",
      resolutionHint:
        "Verifique se o e-mail em <strong>Conta de Administração a Impersonar</strong> existe e possui o papel de Super Administrador no Google Workspace. Verifique também se a data e hora do servidor estão devidamente sincronizadas.",
      technicalDetails: extractTechnicalDetails(rawText),
    };
  }

  // unauthorized_client / Client is unauthorized
  if (rawText.includes("unauthorized_client") || /client is unauthorized/i.test(rawText)) {
    return {
      title: "Delegação em Todo o Domínio Não Autorizada",
      description: "A Conta de Serviço Google não tem autorização para aceder aos dados da organização.",
      resolutionHint:
        "No Google Admin Console, aceda a <strong>Segurança > Controlos de API > Delegação em Todo o Domínio</strong> e autorize o Client ID da Conta de Serviço com todos os escopos OAuth necessários.",
      technicalDetails: extractTechnicalDetails(rawText),
    };
  }

  // Google Vault not installed
  if (/customer does not have vault installed/i.test(rawText)) {
    return {
      title: "Google Vault Inativo",
      description: "O serviço Google Vault não está ativo ou não faz parte do plano Google Workspace contratado.",
      resolutionHint:
        "A sincronização de Utilizadores e Grupos continuará a funcionar via Directory API. Para efetuar exportações automáticas de Vault, é necessário ativar o serviço Google Vault na consola Google Workspace.",
      technicalDetails: extractTechnicalDetails(rawText),
    };
  }

  // access_denied / 403 Google
  if (/access_denied/i.test(rawText) || (rawText.includes("403") && rawText.includes("google"))) {
    return {
      title: "Acesso Recusado pelo Google Workspace",
      description: "As permissões concedidas à Conta de Serviço não cobrem a operação solicitada.",
      resolutionHint:
        "Verifique se os escopos OAuth solicitados (Directory, Vault, Gmail, Groups) foram integralmente autorizados na Delegação em Todo o Domínio.",
      technicalDetails: extractTechnicalDetails(rawText),
    };
  }

  // ---------------------------------------------------------------------------
  // 3. Network and Database Errors
  // ---------------------------------------------------------------------------

  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed/i.test(rawText)) {
    return {
      title: "Falha de Conectividade de Rede",
      description: "Não foi possível estabelecer ligação aos servidores remotos na nuvem.",
      resolutionHint:
        "Verifique a ligação à Internet do servidor e certifique-se de que não existem firewalls ou proxies a bloquear o tráfego para os endpoints da Google ou Microsoft.",
      technicalDetails: extractTechnicalDetails(rawText),
    };
  }

  // Prisma unique constraint or foreign key
  if (rawText.includes("P2002") || /unique constraint/i.test(rawText)) {
    return {
      title: "Registo Já Existente",
      description: "Já existe um registo com estes dados identificadores na base de dados.",
      resolutionHint: "Verifique se o e-mail, identificador ou código introduzido já está em utilização.",
      technicalDetails: extractTechnicalDetails(rawText),
    };
  }

  // ---------------------------------------------------------------------------
  // 4. Default / Fallback Clean Formatting
  // ---------------------------------------------------------------------------

  // Clean up any remaining JSON or technical prefixes
  let cleanDesc = errorDesc;
  cleanDesc = cleanDesc.replace(/^Error:\s*/i, "");
  cleanDesc = cleanDesc.replace(/\{"error":.*?\}/g, "");
  cleanDesc = cleanDesc.replace(/HTTP \d{3}:\s*/g, "");
  cleanDesc = cleanDesc.trim();

  if (!cleanDesc) {
    cleanDesc = "Ocorreu um erro ao processar o seu pedido. Por favor, tente novamente.";
  }

  return {
    title: fallbackTitle,
    description: cleanDesc,
    technicalDetails: rawText !== cleanDesc ? extractTechnicalDetails(rawText) : undefined,
  };
}

/**
 * Extracts a concise technical trace snippet, stripping unnecessary verbosity.
 */
function extractTechnicalDetails(raw: string): string {
  let cleaned = raw.trim();

  // Try to extract error_description from JSON if present
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const obj = JSON.parse(match[0]);
      if (obj.error_description) {
        return obj.error_description;
      }
    }
  } catch {}

  // Strip long JSON bodies if we only need the core message
  if (cleaned.length > 300) {
    cleaned = cleaned.substring(0, 300) + "...";
  }

  return cleaned;
}

/**
 * Builds clean, responsive HTML for SweetAlert2 with actionable guidance and expandable technical details.
 */
export function buildErrorHtml(formatted: FormattedError): string {
  let html = `<div class="text-left space-y-3 font-sans">`;

  // Main friendly description
  html += `<p class="text-sm text-slate-700 dark:text-slate-200 leading-relaxed font-medium">${formatted.description}</p>`;

  // Actionable resolution hint box
  if (formatted.resolutionHint) {
    html += `
      <div class="p-3 bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl text-xs text-amber-900 dark:text-amber-200 leading-relaxed space-y-1">
        <div class="flex items-center gap-1.5 font-bold text-amber-950 dark:text-amber-100">
          <span>💡 Como resolver:</span>
        </div>
        <p class="text-[12px] opacity-95">${formatted.resolutionHint}</p>
      </div>
    `;
  }

  // Expandable technical details
  if (formatted.technicalDetails) {
    html += `
      <details class="text-[11px] text-slate-500 pt-1 group cursor-pointer">
        <summary class="font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 select-none">
          Ver detalhes técnicos
        </summary>
        <pre class="mt-2 p-2.5 bg-slate-100 dark:bg-[#121921] border border-slate-200 dark:border-slate-800 rounded-lg text-[10px] text-slate-700 dark:text-slate-300 font-mono overflow-x-auto whitespace-pre-wrap break-all">${escapeHtml(
          formatted.technicalDetails
        )}</pre>
      </details>
    `;
  }

  html += `</div>`;
  return html;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
