// Google Sheets API client using JWT authentication
export class GoogleSheetsClient {
  private serviceAccountEmail: string;
  private privateKey: string;
  private spreadsheetId: string;
  private sheetName: string;

  constructor(serviceAccountEmail: string, privateKey: string, spreadsheetId: string, sheetName: string) {
    this.serviceAccountEmail = serviceAccountEmail;
    this.privateKey = privateKey;
    this.spreadsheetId = spreadsheetId;
    this.sheetName = sheetName;
  }

  // Create JWT token for Google API authentication
  private async createJWT(): Promise<string> {
    const header = {
      alg: 'RS256',
      typ: 'JWT'
    };

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: this.serviceAccountEmail,
      scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    };

    // Encode header and payload
    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
    const signatureInput = `${encodedHeader}.${encodedPayload}`;

    // Sign with private key
    const signatureBuffer = await this.signWithRSA(signatureInput, this.privateKey);
    const encodedSignature = this.base64UrlEncodeBuffer(signatureBuffer);

    return `${signatureInput}.${encodedSignature}`;
  }

  // Sign data with RSA-SHA256 and return raw buffer
  private async signWithRSA(data: string, privateKey: string): Promise<ArrayBuffer> {
    try {
      // Import private key
      // In .dev.vars, the key is stored with literal \n
      // In Cloudflare Secrets, the key has actual newlines
      // Handle both cases
      let normalizedKey = privateKey;
      if (privateKey.indexOf('\\n') !== -1) {
        // Has literal \n, convert to actual newlines
        normalizedKey = privateKey.split('\\n').join('\n');
      }
      
      // Extract PEM content between headers
      const pemContents = normalizedKey
        .replace(/-----BEGIN PRIVATE KEY-----/g, '')
        .replace(/-----END PRIVATE KEY-----/g, '')
        .replace(/[\r\n\s]/g, '') // Remove all whitespace including newlines
        .trim();
      
      // Debug logging (remove after testing)
      console.log('PEM content length:', pemContents.length);
      console.log('PEM first 50 chars:', pemContents.substring(0, 50));
      
      // Decode base64 to binary
      const binaryString = atob(pemContents);
      const binaryDer = Uint8Array.from(binaryString, c => c.charCodeAt(0));
      
      console.log('Binary DER length:', binaryDer.length);
      console.log('First 20 bytes:', Array.from(binaryDer.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' '));

      const cryptoKey = await crypto.subtle.importKey(
        'pkcs8',
        binaryDer,
        {
          name: 'RSASSA-PKCS1-v1_5',
          hash: 'SHA-256'
        },
        false,
        ['sign']
      );

      // Sign the data
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);
      const signatureBuffer = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        cryptoKey,
        dataBuffer
      );

      // Return raw buffer
      return signatureBuffer;
    } catch (error) {
      throw new Error(`Failed to sign with RSA: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Base64 URL encode for string
  private base64UrlEncode(str: string): string {
    const base64 = btoa(str);
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  // Base64 URL encode for ArrayBuffer
  private base64UrlEncodeBuffer(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    const base64 = btoa(String.fromCharCode(...Array.from(bytes)));
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  // Get access token from JWT
  private async getAccessToken(): Promise<string> {
    const jwt = await this.createJWT();

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get access token: ${error}`);
    }

    const data = await response.json();
    return data.access_token;
  }

  // Get spreadsheet data
  async getSheetData(): Promise<string[][]> {
    const accessToken = await this.getAccessToken();

    const range = `${this.sheetName}!A:C`; // A列（生徒名）、B列（学籍番号）、C列（メモURL）
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${encodeURIComponent(range)}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch sheet data: ${error}`);
    }

    const data = await response.json();
    return data.values || [];
  }
}

// Types
export interface StudentChannelInfo {
  studentName: string;
  studentId: string;
  memoUrl: string;
  serverId: string;
  channelId: string;
}

// Parse Discord channel URL
export function parseDiscordChannelUrl(url: string): { serverId: string; channelId: string } | null {
  // Format: https://discord.com/channels/SERVER_ID/CHANNEL_ID
  const match = url.match(/discord\.com\/channels\/(\d+)\/(\d+)/);
  if (match) {
    return {
      serverId: match[1],
      channelId: match[2]
    };
  }
  return null;
}
