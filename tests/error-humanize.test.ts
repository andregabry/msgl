import test from "node:test";
import assert from "node:assert/strict";
import { humanizeError, buildErrorHtml } from "../src/lib/errors/humanize";

test("Error Humanizer: Correctly parses and explains AADSTS7000215 (invalid client secret)", () => {
  const rawMicrosoftError = `Erro na ligação Microsoft Graph: Falha ao obter token da Microsoft Graph (HTTP 401): {"error":"invalid_client","error_description":"AADSTS7000215: Invalid client secret provided. Ensure the secret being sent in the request is the client secret value, not the client secret ID, for a secret added to app '14d82eec-204b-4c2f-b7e8-296a70dab67e'. Trace ID: ad02179d-ea77-44b5-82be-1b1d22fc9d00 Correlation ID: ca20bbf8-f6b1-469f-be97-f373cbf99970 Timestamp: 2026-10-02 14:45:17Z","error_codes":[7000215],"timestamp":"2026-10-02 14:45:17Z","trace_id":"ad02179d-ea77-44b5-82be-1b1d22fc9d00","correlation_id":"ca20bbf8-f6b1-469f-be97-f373cbf99970","error_uri":"https://login.microsoftonline.com/error?code=7000215"}. Verifique o Tenant ID, Client ID, Client Secret e se o consentimento de administrador foi concedido no Entra ID.`;

  const formatted = humanizeError(rawMicrosoftError);

  assert.equal(formatted.title, "Client Secret do Microsoft 365 Inválido");
  assert.ok(formatted.description.includes("Client Secret"));
  assert.ok(formatted.resolutionHint?.includes("Valor (Value)"));
  assert.ok(formatted.resolutionHint?.includes("Secret ID"));

  const html = buildErrorHtml(formatted);
  assert.ok(html.includes("💡 Como resolver:"));
  assert.ok(html.includes("Valor (Value)"));
  assert.ok(html.includes("Ver detalhes técnicos"));
});

test("Error Humanizer: Handles Google invalid_grant and unauthorized_client", () => {
  const grantErr = humanizeError("Error: invalid_grant: Invalid JWT Signature or account mismatch");
  assert.equal(grantErr.title, "Falha de Autenticação Google Workspace (invalid_grant)");
  assert.ok(grantErr.resolutionHint?.includes("Super Administrador"));

  const unauthErr = humanizeError("Error: unauthorized_client: Client is unauthorized to retrieve access tokens using this method.");
  assert.equal(unauthErr.title, "Delegação em Todo o Domínio Não Autorizada");
  assert.ok(unauthErr.resolutionHint?.includes("Delegação em Todo o Domínio"));
});
