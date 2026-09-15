import { EmbedBuilder } from 'discord.js';
import { getHealth } from '../bloxgen.js';
import { COLORS } from '../config.js';
import {
  getBotTitle,
  getAutoPasswordConfig,
  getHealthChannel,
  getHealthMessage,
  setHealthMessage,
} from './settings.js';

function buildHealthEmbed({ apiOk, autoPassword, guildId, lastCheck = new Date() }) {
  return new EmbedBuilder()
    .setTitle(`🏥 ${getBotTitle(guildId)} — Health`)
    .setColor(apiOk ? COLORS.success : COLORS.error)
    .addFields(
      { name: 'Generator', value: '🟢 Online', inline: true },
      { name: 'Auto Password', value: autoPassword ? '🟢 Online' : '⚪ Disabled', inline: true },
      { name: 'API', value: apiOk ? '🟢 Online' : '🔴 Offline', inline: true },
      { name: 'Last Check', value: `<t:${Math.floor(lastCheck.getTime() / 1000)}:t>`, inline: false },
    );
}

export async function updateHealthMessage(client, guildId, { autoPassword } = {}) {
  const channelId = getHealthChannel(guildId);
  if (!channelId) return null;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return null;

  const health = await getHealth();
  const payload = {
    embeds: [buildHealthEmbed({
      apiOk: health.ok,
      autoPassword: autoPassword ?? getAutoPasswordConfig(guildId).enabled,
      guildId,
    })],
  };
  let message = null;
  const messageId = getHealthMessage(guildId);
  if (messageId) message = await channel.messages.fetch(messageId).catch(() => null);
  if (message) {
    await message.edit(payload).catch(() => {});
  } else {
    message = await channel.send(payload).catch(() => null);
    if (message) setHealthMessage(guildId, message.id);
  }
  return message;
}