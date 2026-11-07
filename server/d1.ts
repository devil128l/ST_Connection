/**
 * Cloudflare D1 Database REST Client
 * Connects to Cloudflare D1 native SQL database via Cloudflare D1 REST API.
 */

export interface D1Config {
  accountId: string;
  databaseId: string;
  apiToken: string;
}

export interface D1QueryResult<T = any> {
  success: boolean;
  results: T[];
  meta?: {
    duration: number;
    rows_read: number;
    rows_written: number;
  };
  error?: string;
}

class D1ClientService {
  private config: D1Config | null = null;

  constructor() {
    this.initFromEnv();
  }

  public initFromEnv() {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID || process.env.D1_DATABASE_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;

    if (accountId && databaseId && apiToken) {
      this.config = {
        accountId,
        databaseId,
        apiToken,
      };
      console.log(`[Cloudflare D1] Configured with Database ID: ${databaseId.slice(0, 8)}... on Account: ${accountId.slice(0, 6)}...`);
    } else {
      this.config = null;
    }
  }

  public isConfigured(): boolean {
    return this.config !== null;
  }

  public getConfigInfo() {
    return {
      configured: this.isConfigured(),
      databaseId: this.config ? `${this.config.databaseId.slice(0, 8)}...` : 'Not configured (using local file DB)',
      accountId: this.config ? `${this.config.accountId.slice(0, 6)}...` : undefined,
    };
  }

  /**
   * Executes a SQL query against Cloudflare D1 database.
   */
  public async query<T = any>(sql: string, params: any[] = []): Promise<D1QueryResult<T>> {
    if (!this.config) {
      return { success: false, results: [], error: 'Cloudflare D1 is not configured in environment.' };
    }

    try {
      const url = `https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/d1/database/${this.config.databaseId}/query`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sql,
          params,
        }),
      });

      const data = (await response.json()) as any;

      if (!response.ok || !data.success) {
        const errorMsg = data.errors?.[0]?.message || `D1 HTTP error ${response.status}`;
        console.error('[Cloudflare D1 Query Error]:', errorMsg);
        return { success: false, results: [], error: errorMsg };
      }

      const queryResult = data.result?.[0];
      return {
        success: true,
        results: queryResult?.results || [],
        meta: queryResult?.meta,
      };
    } catch (err: any) {
      console.error('[Cloudflare D1 Network Error]:', err);
      return { success: false, results: [], error: err.message || 'Unknown network error' };
    }
  }

  /**
   * Executes a batch of SQL queries in a transaction
   */
  public async batch(statements: { sql: string; params?: any[] }[]): Promise<boolean> {
    if (!this.config) return false;

    try {
      const url = `https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/d1/database/${this.config.databaseId}/query`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(statements),
      });

      const data = (await response.json()) as any;
      return response.ok && data.success;
    } catch (err) {
      console.error('[Cloudflare D1 Batch Error]:', err);
      return false;
    }
  }
}

export const d1 = new D1ClientService();
