// Discord API client
export class DiscordClient {
  private token: string;
  private baseUrl = 'https://discord.com/api/v10';

  constructor(token: string) {
    this.token = token;
  }

  private async fetch(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bot ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Discord API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  // Get all channels in a guild
  async getGuildChannels(guildId: string) {
    return this.fetch(`/guilds/${guildId}/channels`);
  }

  // Get the last message in a channel
  async getChannelMessages(channelId: string, limit: number = 1) {
    return this.fetch(`/channels/${channelId}/messages?limit=${limit}`);
  }

  // Get guild information
  async getGuild(guildId: string) {
    return this.fetch(`/guilds/${guildId}?with_counts=false`);
  }

  // Get bot's guilds
  async getBotGuilds() {
    return this.fetch('/users/@me/guilds');
  }
}

// Types
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
