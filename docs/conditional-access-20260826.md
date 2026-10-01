# Diagnóstico de Acesso Condicional — Exchange Online PowerShell

## Objetivo

Permitir que `andre.gabry@dynamox.net` use o módulo oficial `ExchangeOnlineManagement` em um Mac gerido pela empresa.

## Estado local verificado

- macOS: 26.5.2, Apple Silicon.
- Microsoft Company Portal: 5.2606.0, assinado pela Microsoft e notarizado pela Apple.
- Intune MDM: `Yes (User Approved)`.
- Servidor MDM: Microsoft Intune.
- Platform SSO (`app-sso platform -s`): sem Device, Login ou User Configuration.
- Extensão/ponte BrowserCore do Chrome: instalada globalmente e idêntica ao arquivo fornecido pelo Company Portal.
- PowerShell: 7.6.5.
- ExchangeOnlineManagement: 3.10.1.

## Tentativa 1 — Device Code

- Resultado: `AADSTS53003`.
- Aplicativo: Microsoft Exchange REST API Based Powershell.
- Application ID: `fb78d390-0c51-40cd-8e17-fdbfab77341b`.
- Estado apresentado ao Entra: `Unregistered`.
- Request ID: `80143605-cd89-42fa-9fe2-cc1dfb262000`.
- Correlation ID: `83351433-c3ed-48f1-931f-ddc41ef5c526`.
- Timestamp UTC: `2026-08-25T22:51:44.638Z`.

## Tentativa 2 — Autenticação interativa no navegador padrão

- Resultado: `AADSTS53003: Access has been blocked by Conditional Access policies. The access policy does not allow token issuance.`
- Trace ID: `dfde0b7c-6276-4da8-b3d3-fc133b7a0500`.
- Correlation ID: `1188d04f-395d-4d55-a77a-9693388864b0`.
- Timestamp UTC: `2026-08-25T23:05:54Z`.

## Ações solicitadas ao TI/administrador Entra-Intune

1. Localizar as duas tentativas nos Sign-in logs usando os IDs acima e identificar a política de Acesso Condicional que falhou.
2. Confirmar se o objeto do Mac está registado no Microsoft Entra e marcado como compliant no Intune.
3. Distribuir ao utilizador/dispositivo a configuração macOS Platform SSO ou Microsoft Enterprise SSO exigida pela política:
   - Extension identifier: `com.microsoft.CompanyPortalMac.ssoextension`;
   - Team identifier: `UBF8T346G9`;
   - Type: `Redirect`;
   - URL de autenticação: `https://login.microsoftonline.com`.
4. Após o perfil ser aplicado, concluir o registo solicitado pelo macOS e verificar que `app-sso platform -s` deixa de apresentar configuração nula.
5. Sincronizar/verificar o dispositivo no Company Portal e repetir o login do Exchange PowerShell.

## Alternativa para automação

Se a política da empresa não permitir administração interativa pelo Mac, o TI pode aprovar autenticação app-only para Exchange Online com certificado e `Exchange.ManageAsApp`. Essa alternativa deve ser criada e autorizada pelo administrador do tenant; não deve ser usada para contornar a política sem aprovação.

