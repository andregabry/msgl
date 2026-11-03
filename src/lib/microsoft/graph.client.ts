export interface GraphTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export class MicrosoftGraphClient {
  private cachedToken: string | null = null;
  private tokenExpiresAt: number = 0;

  public async getAccessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.cachedToken && this.tokenExpiresAt > now + 300) {
      return this.cachedToken;
    }

    const tenantId = process.env.MICROSOFT_TENANT_ID;
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) {
      throw new Error(
        "Microsoft 365 não configurado. Verifique MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID e MICROSOFT_CLIENT_SECRET no ficheiro .env."
      );
    }

    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("client_secret", clientSecret);
    params.append("scope", "https://graph.microsoft.com/.default");
    params.append("grant_type", "client_credentials");

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Falha ao obter token da Microsoft Graph (HTTP ${response.status}): ${errText}`);
    }

    const data: GraphTokenResponse = await response.json();
    this.cachedToken = data.access_token;
    this.tokenExpiresAt = now + data.expires_in;

    return this.cachedToken;
  }

  public async fetchGraph<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = await this.getAccessToken();
    const url = endpoint.startsWith("https://") ? endpoint : `https://graph.microsoft.com/v1.0${endpoint}`;

    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("Accept", "application/json");

    const res = await fetch(url, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Erro na API Microsoft Graph (${res.status} ${res.statusText}): ${errText}`);
    }

    if (res.status === 202 || res.status === 204) {
      return {} as T;
    }

    const text = await res.text();
    return text ? (JSON.parse(text) as T) : ({} as T);
  }

  public resetToken(): void {
    this.cachedToken = null;
    this.tokenExpiresAt = 0;
  }

  public isConfigured(): boolean {
    return Boolean(
      process.env.MICROSOFT_TENANT_ID &&
      process.env.MICROSOFT_CLIENT_ID &&
      process.env.MICROSOFT_CLIENT_SECRET
    );
  }
}

export const graphClient = new MicrosoftGraphClient();
