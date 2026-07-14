const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const { baseURL, axiosConfig } = require('../utils/restApi');

const MAX_FIELDS = 25;
const MAX_VALUE = 1024;
const EMBED_COLOR = 0x5865F2; // Discord blurple

function formatValue(value) {
  if (value === null || value === undefined) return 'N/A';
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? '✅ Yes' : '❌ No';
  return String(value).slice(0, MAX_VALUE);
}

function buildEmbeds(settings) {
  const entries = Object.entries(settings).filter(([, v]) => v !== null && v !== undefined);
  const embeds = [];
  let current = new EmbedBuilder().setColor(EMBED_COLOR);
  let count = 0;

  for (let i = 0; i < entries.length; i++) {
    const [key, value] = entries[i];
    if (count === 0) current.setTitle('🛠 Server Settings');
    current.addFields({ name: key, value: formatValue(value), inline: true });
    count++;

    if (count === MAX_FIELDS || i === entries.length - 1) {
      embeds.push(current);
      current = new EmbedBuilder().setColor(EMBED_COLOR);
      count = 0;
    }
  }

  return embeds;
}

module.exports = {
  data: new SlashCommandBuilder().setName('settings').setDescription('Get server settings'),
  async execute(interaction) {
    try {
      const res = await axios.get(`${baseURL}/settings`, axiosConfig);
      const settings = res.data;
      if (!settings || Object.keys(settings).length === 0) {
        return interaction.editReply('No settings returned.');
      }

      const embeds = buildEmbeds(settings);
      await interaction.editReply({ embeds: [embeds[0]] });
      for (let i = 1; i < embeds.length; i++) {
        await interaction.followUp({ embeds: [embeds[i]] });
      }
    } catch (e) {
      return interaction.editReply('Failed to fetch settings: ' + e.message);
    }
  },
};
