const REALM = "Zotero Context Translator API Key";

export class CredentialStore {
  constructor(backend) {
    this.backend = backend;
  }

  async getAPIKey(baseURL) {
    const query = credentialIdentity(baseURL);
    const login = await this.backend.find(query);
    return login?.password ?? "";
  }

  async setAPIKey(baseURL, apiKey) {
    if (typeof apiKey !== "string" || !apiKey) {
      throw new TypeError("API key is required");
    }
    const query = credentialIdentity(baseURL);
    const existing = await this.backend.find(query);
    if (existing) await this.backend.remove(existing);
    await this.backend.add({ ...query, password: apiKey });
  }

  async clearAPIKey(baseURL) {
    const query = credentialIdentity(baseURL);
    const existing = await this.backend.find(query);
    if (existing) await this.backend.remove(existing);
  }
}

function credentialIdentity(baseURL) {
  const endpoint = String(baseURL ?? "").trim().replace(/\/+$/, "");
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new TypeError("Base URL must be a valid URL");
  }
  return { origin: url.origin, realm: REALM, username: endpoint };
}
