import { DiscordClient } from './discord';
import { SlackClient, InactiveChannel } from './slack';
import { GoogleSheetsClient, parseDiscordChannelUrl, StudentChannelInfo } from './sheets';
import { MOCK_SPREADSHEET_DATA, useMockData } from './mock-data';

export interface Env {
  DB: D1Database;
  DISCORD_BOT_TOKEN: string;
  SLACK_WEBHOOK_URL: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;
  GOOGLE_PRIVATE_KEY_BASE64?: string;
  GOOGLE_SPREADSHEET_ID: string;
  GOOGLE_SHEET_NAME: string;
}

export interface MonitorOptions {
  skipSlackNotification?: boolean;
}

// Monitor channels for inactivity (Spreadsheet-based)
export async function monitorChannels(env: Env, options: MonitorOptions = {}): Promise<{
  channelsChecked: number;
  alertsSent: number;
  errors: string[];
  inactiveChannels: InactiveChannel[];
}> {
  const discord = new DiscordClient(env.DISCORD_BOT_TOKEN);
  const slack = new SlackClient(env.SLACK_WEBHOOK_URL);
  
  // Use private key directly (it contains actual newlines)
  const privateKey = env.GOOGLE_PRIVATE_KEY;
  
  const sheets = new GoogleSheetsClient(
    env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey,
    env.GOOGLE_SPREADSHEET_ID,
    env.GOOGLE_SHEET_NAME
  );
  
  let channelsChecked = 0;
  let alertsSent = 0;
  const errors: string[] = [];
  const errorDetails: Array<{studentName: string; studentId: string; memoUrl: string; error: string}> = [];
  const inactiveChannels: InactiveChannel[] = [];
  
  try {
    // Get student data from Google Sheets (or mock data for testing)
    let sheetData: string[][];
    
    if (useMockData()) {
      console.log('Using mock spreadsheet data for testing');
      sheetData = MOCK_SPREADSHEET_DATA;
    } else {
      sheetData = await sheets.getSheetData();
    }
    
    // Skip header row (row 0)
    const studentChannels: StudentChannelInfo[] = [];
    
    for (let i = 1; i < sheetData.length; i++) {
      const row = sheetData[i];
      const studentName = row[0] || '';
      const studentId = row[1] || '';
      const memoUrl = row[2] || '';
      
      // Skip rows without memo URL
      if (!memoUrl) continue;
      
      // Parse Discord channel URL
      const parsed = parseDiscordChannelUrl(memoUrl);
      if (!parsed) {
        errors.push(`Invalid Discord URL for ${studentName} (${studentId}): ${memoUrl}`);
        continue;
      }
      
      studentChannels.push({
        studentName,
        studentId,
        memoUrl,
        serverId: parsed.serverId,
        channelId: parsed.channelId
      });
    }
    
    // Monitor each channel
    for (const student of studentChannels) {
      channelsChecked++;
      
      try {
        // Get the last message
        const messages = await discord.getChannelMessages(student.channelId);
        
        let lastMessageAt: string | null = null;
        let isInactive = false;
        
        if (messages.length > 0) {
          lastMessageAt = messages[0].timestamp;
          
          // Check if last message was more than 2 days ago
          const lastMessageDate = new Date(lastMessageAt);
          const twoDaysAgo = new Date();
          twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
          
          isInactive = lastMessageDate < twoDaysAgo;
        } else {
          // No messages = inactive
          isInactive = true;
        }
        
        // Update channel record in database
        await env.DB.prepare(
          `INSERT INTO channels (id, server_id, name, last_message_at, last_checked_at, student_name, student_id, memo_url)
           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             last_message_at = excluded.last_message_at,
             last_checked_at = excluded.last_checked_at,
             student_name = excluded.student_name,
             student_id = excluded.student_id,
             memo_url = excluded.memo_url`
        ).bind(
          student.channelId,
          student.serverId,
          'メモ',
          lastMessageAt,
          student.studentName,
          student.studentId,
          student.memoUrl
        ).run();
        
        if (isInactive) {
          inactiveChannels.push({
            studentName: student.studentName,
            studentId: student.studentId,
            memoUrl: student.memoUrl,
            serverId: student.serverId,
            serverName: '', // Not needed for new notification format
            channelId: student.channelId,
            channelName: 'メモ',
            lastMessageAt,
          });
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push(`Channel ${student.channelId} (${student.studentName}): ${errorMsg}`);
        errorDetails.push({
          studentName: student.studentName,
          studentId: student.studentId,
          memoUrl: student.memoUrl,
          error: errorMsg
        });
      }
    }
    
    // Send Slack notification if there are inactive channels (unless skipped)
    if (inactiveChannels.length > 0 && !options.skipSlackNotification) {
      try {
        await slack.sendNotification(inactiveChannels);
        alertsSent = inactiveChannels.length;
      } catch (err) {
        errors.push(`Slack notification failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    
    // Log the check
    await env.DB.prepare(
      `INSERT INTO check_logs (channels_checked, alerts_sent, status, error_message, channel_details, inactive_count)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      channelsChecked,
      alertsSent,
      errors.length > 0 ? 'partial' : 'success',
      errors.length > 0 ? errors.join('; ') : null,
      errorDetails.length > 0 ? JSON.stringify(errorDetails) : null,
      inactiveChannels.length
    ).run();
    
  } catch (err) {
    errors.push(`Monitor failed: ${err instanceof Error ? err.message : String(err)}`);
    
    // Log the failed check
    await env.DB.prepare(
      `INSERT INTO check_logs (channels_checked, alerts_sent, status, error_message, channel_details, inactive_count)
       VALUES (?, ?, 'error', ?, ?, ?)`
    ).bind(channelsChecked, alertsSent, errors.join('; '), null, 0).run();
  }
  
  return {
    channelsChecked,
    alertsSent,
    errors,
    inactiveChannels,
  };
}
