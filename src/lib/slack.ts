// Slack notification client
export class SlackClient {
  private webhookUrl: string;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  async sendNotification(channels: InactiveChannel[]) {
    if (channels.length === 0) return;

    // Slackのブロック数制限: 最大50ブロック
    // 1チャンネルあたり2ブロック（section + divider）なので、最大20チャンネルまで
    const maxChannels = 20;
    const displayChannels = channels.slice(0, maxChannels);
    const remainingCount = channels.length - maxChannels;

    const blocks = [
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
          text: `*${channels.length}個のチャンネル*で2日間以上更新が止まっています。${remainingCount > 0 ? `\n（最初の${maxChannels}件を表示）` : ''}`,
        },
      },
      {
        type: 'divider',
      },
    ];

    // Add each channel as a block (up to maxChannels)
    for (const channel of displayChannels) {
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
      } as any);
      
      blocks.push({
        type: 'divider',
      });
    }

    // Add remaining count if there are more channels
    if (remainingCount > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `_... 他 ${remainingCount} 件のチャンネルがあります_`,
        },
      });
    }

    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        blocks,
      }),
    });

    if (!response.ok) {
      throw new Error(`Slack notification failed: ${response.status}`);
    }
  }

  private formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return '今日';
    } else if (diffDays === 1) {
      return '昨日';
    } else {
      return `${diffDays}日前`;
    }
  }
}

// Types
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
