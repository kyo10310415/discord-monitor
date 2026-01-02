// Simple Google Sheets client using public CSV export
export class GoogleSheetsSimpleClient {
  private spreadsheetId: string;
  private sheetName: string;

  constructor(spreadsheetId: string, sheetName: string) {
    this.spreadsheetId = spreadsheetId;
    this.sheetName = encodeURIComponent(sheetName);
  }

  // Get spreadsheet data as CSV
  async getSheetData(): Promise<string[][]> {
    // Google Sheets CSV export URL
    // Note: Spreadsheet must be shared as "Anyone with the link can view"
    const url = `https://docs.google.com/spreadsheets/d/${this.spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${this.sheetName}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch sheet data: ${response.status} ${response.statusText}`);
    }

    const csvText = await response.text();
    return this.parseCSV(csvText);
  }

  // Parse CSV text
  private parseCSV(csvText: string): string[][] {
    const lines = csvText.split('\n');
    const result: string[][] = [];

    for (const line of lines) {
      if (!line.trim()) continue;

      // Simple CSV parsing (handles quoted fields)
      const row: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            // Escaped quote
            current += '"';
            i++;
          } else {
            // Toggle quotes
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          // End of field
          row.push(current);
          current = '';
        } else {
          current += char;
        }
      }

      // Add last field
      row.push(current);
      result.push(row);
    }

    return result;
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
