import { DiscordClient } from './discord.js';
import { SlackClient, InactiveChannel } from './slack.js';
import { GoogleSheetsClient, parseDiscordChannelUrl, StudentChannelInfo } from './sheets.js';
import { getDb } from './init-db.js';

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

export interface Env {
  DISCORD_BOT_TOKEN: string;
  SLACK_WEBHOOK_URL: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;
  GOOGLE_SPREADSHEET_ID: string;
  GOOGLE_SHEET_NAME: string;
}

export interface MonitorOptions {
  skipSlackNotification?: boolean;
}

export async function monitorChannels(env: Env, options: MonitorOptions = {}): Promise<{
  channelsChecked: number;
  alertsSent: number;
  errors: string[];
  inactiveChannels: InactiveChannel[];
}> {
  const discord = new DiscordClient(env.DISCORD_BOT_TOKEN);
  const slack = new SlackClient(env.SLACK_WEBHOOK_URL);
  const sheets = new GoogleSheetsClient(
    env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    env.GOOGLE_PRIVATE_KEY,
    env.GOOGLE_SPREADSHEET_ID,
    env.GOOGLE_SHEET_NAME
  );

  const db = getDb();
  let channelsChecked = 0;
  let alertsSent = 0;
  const errors: string[] = [];
  const errorDetails: Array<{ studentName: string; studentId: string; memoUrl: string; error: string }> = [];
  const inactiveChannels: InactiveChannel[] = [];

  try {
    // Google Sheetsからデータ取得
    const sheetData = await sheets.getSheetData();

    // ヘッダー行スキップ、D列(index=3)が空の行スキップ
    const studentChannels: StudentChannelInfo[] = [];
    for (let i = 1; i < sheetData.length; i++) {
      const row = sheetData[i];
      const studentName = row[0] || '';
      const studentId = row[1] || '';
      const memoUrl = row[3] || '';  // D列

      if (!memoUrl) continue;

      const parsed = parseDiscordChannelUrl(memoUrl);
      if (!parsed) {
        errors.push(`Invalid Discord URL for ${studentName} (${studentId}): ${memoUrl}`);
        continue;
      }

      studentChannels.push({ studentName, studentId, memoUrl, ...parsed });
    }

    // 各チャンネルを監視
    for (const student of studentChannels) {
      channelsChecked++;

      // レート制限対策: 50件ごとに1秒待機、毎リクエスト間200ms待機
      if (channelsChecked > 1) await sleep(200);
      if (channelsChecked % 50 === 0) {
        console.log(`[Monitor] Progress: ${channelsChecked}/${studentChannels.length}, inactive=${inactiveChannels.length}, errors=${errors.length}`);
        await sleep(1000);
      }

      try {
        const messages = await discord.getChannelMessages(student.channelId);

        let lastMessageAt: string | null = null;
        let isInactive = false;

        if (messages.length > 0) {
          lastMessageAt = messages[0].timestamp;
          const lastMessageDate = new Date(lastMessageAt);
          const twoDaysAgo = new Date();
          twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
          isInactive = lastMessageDate < twoDaysAgo;
        } else {
          isInactive = true;
        }

        // SQLiteにUPSERT
        db.prepare(`
          INSERT INTO channels (id, server_id, name, last_message_at, last_checked_at, student_name, student_id, memo_url)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            last_message_at = excluded.last_message_at,
            last_checked_at = excluded.last_checked_at,
            student_name    = excluded.student_name,
            student_id      = excluded.student_id,
            memo_url        = excluded.memo_url
        `).run(
          student.channelId,
          student.serverId,
          'メモ',
          lastMessageAt,
          student.studentName,
          student.studentId,
          student.memoUrl
        );

        if (isInactive) {
          inactiveChannels.push({
            studentName: student.studentName,
            studentId: student.studentId,
            memoUrl: student.memoUrl,
            serverId: student.serverId,
            serverName: '',
            channelId: student.channelId,
            channelName: 'メモ',
            lastMessageAt,
          });
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push(`Server ${student.serverId} / Channel ${student.channelId} (${student.studentName}): ${errorMsg}`);
        errorDetails.push({
          studentName: student.studentName,
          studentId: student.studentId,
          memoUrl: student.memoUrl,
          error: errorMsg,
        });
      }
    }

    // Slack通知
    if (inactiveChannels.length > 0 && !options.skipSlackNotification) {
      try {
        await slack.sendNotification(inactiveChannels);
        alertsSent = inactiveChannels.length;
      } catch (err) {
        errors.push(`Slack notification failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // ログ記録（更新停止チャンネル + エラー詳細を両方保存）
    const detailsPayload: {
      inactive: Array<{ studentName: string; studentId: string; memoUrl: string; lastMessageAt: string | null }>;
      errors: typeof errorDetails;
    } = {
      inactive: inactiveChannels.map(ch => ({
        studentName: ch.studentName,
        studentId: ch.studentId,
        memoUrl: ch.memoUrl,
        lastMessageAt: ch.lastMessageAt,
      })),
      errors: errorDetails,
    };
    const hasDetails = detailsPayload.inactive.length > 0 || detailsPayload.errors.length > 0;

    db.prepare(`
      INSERT INTO check_logs (channels_checked, alerts_sent, status, error_message, channel_details)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      channelsChecked,
      alertsSent,
      errors.length > 0 ? 'partial' : 'success',
      errors.length > 0 ? errors.join('; ') : null,
      hasDetails ? JSON.stringify(detailsPayload) : null
    );

  } catch (err) {
    errors.push(`Monitor failed: ${err instanceof Error ? err.message : String(err)}`);
    db.prepare(`
      INSERT INTO check_logs (channels_checked, alerts_sent, status, error_message, channel_details)
      VALUES (?, ?, 'error', ?, ?)
    `).run(channelsChecked, alertsSent, errors.join('; '), null);
  } finally {
    db.close();
  }

  return { channelsChecked, alertsSent, errors, inactiveChannels };
}
