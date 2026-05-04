// Slack notification client
export class SlackClient {
  private webhookUrl: string;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  async sendNotification(channels: InactiveChannel[]) {
    if (channels.length === 0) return;

    const blocks: object[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🔔 Discord チャンネル更新停止通知',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${channels.length}個のチャンネル*で2日間以上更新が止まっています。`,
        },
      },
      { type: 'divider' },
    ];

    for (const channel of channels) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            `👤 *${channel.studentName}* (${channel.studentId})`,
            `*最終更新:* ${channel.lastMessageAt ? this.formatDate(channel.lastMessageAt) : '不明'}`,
            `📝 <${channel.memoUrl}|メモを開く>`,
          ].join('\n'),
        },
      });
      blocks.push({ type: 'divider' });
    }

    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
    });

    if (!response.ok) {
      throw new Error(`Slack notification failed: ${response.status}`);
    }
  }

  private formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return '今日';
    if (diffDays === 1) return '昨日';
    return `${diffDays}日前`;
  }
}

export interface InactiveChannel {
  studentName: string;
  studentId: string;
  memoUrl: string;
  serverId: string;
  serverName: string;
  channelId: string;
  channelName: string;
  lastMessageAt: string | null;
}
