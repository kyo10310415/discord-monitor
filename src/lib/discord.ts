// Discord API client

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

export class DiscordClient {
  private token: string;
  private baseUrl = 'https://discord.com/api/v10';

  constructor(token: string) {
    this.token = token;
  }

  private async fetch(endpoint: string, options: RequestInit = {}, retries = 3): Promise<any> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bot ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    // レート制限 (429) → Retry-After 秒待ってリトライ
    if (response.status === 429) {
      const retryAfter = parseFloat(response.headers.get('Retry-After') || '1');
      const waitMs = Math.ceil(retryAfter * 1000) + 200;
      console.warn(`[Discord] Rate limited on ${endpoint}, waiting ${waitMs}ms (retries left: ${retries})`);
      if (retries <= 0) throw new Error(`Discord API rate limited: ${endpoint}`);
      await sleep(waitMs);
      return this.fetch(endpoint, options, retries - 1);
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Discord API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async getGuildChannels(guildId: string) {
    return this.fetch(`/guilds/${guildId}/channels`);
  }

  async getChannelMessages(channelId: string, limit: number = 1) {
    return this.fetch(`/channels/${channelId}/messages?limit=${limit}`);
  }

  async getGuild(guildId: string) {
    return this.fetch(`/guilds/${guildId}?with_counts=false`);
  }

  async getBotGuilds() {
    return this.fetch('/users/@me/guilds');
  }
}

export interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  guild_id?: string;
}

export interface DiscordMessage {
  id: string;
  channel_id: string;
  timestamp: string;
  content: string;
}

export interface DiscordGuild {
  id: string;
  name: string;
}
