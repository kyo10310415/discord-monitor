import { GoogleAuth } from 'google-auth-library';
import { google } from 'googleapis';

export interface StudentChannelInfo {
  studentName: string;
  studentId: string;
  memoUrl: string;
  serverId: string;
  channelId: string;
}

export class GoogleSheetsClient {
  private spreadsheetId: string;
  private sheetName: string;
  private serviceAccountEmail: string;
  private privateKey: string;

  constructor(
    serviceAccountEmail: string,
    privateKey: string,
    spreadsheetId: string,
    sheetName: string
  ) {
    this.serviceAccountEmail = serviceAccountEmail;
    this.privateKey = privateKey;
    this.spreadsheetId = spreadsheetId;
    this.sheetName = sheetName;
  }

  async getSheetData(): Promise<string[][]> {
    // \n リテラルを実際の改行に変換
    const normalizedKey = this.privateKey.indexOf('\\n') !== -1
      ? this.privateKey.split('\\n').join('\n')
      : this.privateKey;

    const auth = new GoogleAuth({
      credentials: {
        client_email: this.serviceAccountEmail,
        private_key: normalizedKey,
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const range = `${this.sheetName}!A:D`;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range,
    });

    return (response.data.values as string[][]) || [];
  }
}

export function parseDiscordChannelUrl(url: string): { serverId: string; channelId: string } | null {
  const match = url.match(/discord\.com\/channels\/(\d+)\/(\d+)/);
  if (match) {
    return { serverId: match[1], channelId: match[2] };
  }
  return null;
}
