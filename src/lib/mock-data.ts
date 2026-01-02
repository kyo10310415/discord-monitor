// Test data for local development
export const MOCK_SPREADSHEET_DATA = [
  ['生徒名', '学籍番号', 'メモURL', '備考'], // Header row
  ['篠塚海斗', 'OLTS251163-UO', 'https://discord.com/channels/1415917261855658004/1415917264108257306', '連絡なし'],
  ['小野朋和', 'OLTS251166-YN', 'https://discord.com/channels/1415917261855658004/1415917264917758002', '連絡なし'],
  ['川端光', 'OLTS251170-KU', 'https://discord.com/channels/1415917261855658004/1415917266314199158', '連絡なし'],
];

export function useMockData(): boolean {
  // Use mock data for local development only
  // In production (Cloudflare Pages), use real Google Sheets API
  return false; // Change to false for production
}
