const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const { baseURL, axiosConfig } = require('../utils/restApi');

const MAX_FIELDS = 25;
const MAX_VALUE = 1024;
const EMBED_COLOR = 0x5865F2;
const PAGE_TIMEOUT = 120_000; // 2 minutes

function formatValue(value) {
  if (value === null || value === undefined) return 'N/A';
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? '✅ Yes' : '❌ No';
  return String(value).slice(0, MAX_VALUE);
}

function buildPages(settings) {
  const entries = Object.entries(settings).filter(([, v]) => v !== null && v !== undefined);
  const pages = [];
  let current = new EmbedBuilder().setColor(EMBED_COLOR);
  let count = 0;

  for (let i = 0; i < entries.length; i++) {
    const [key, value] = entries[i];
    if (count === 0) current.setTitle('🛠 Server Settings');
    current.addFields({ name: key, value: formatValue(value), inline: true });
    count++;

    if (count === MAX_FIELDS || i === entries.length - 1) {
      pages.push(current);
      current = new EmbedBuilder().setColor(EMBED_COLOR);
      count = 0;
    }
  }

  return pages;
}

function buildButtons(page, total) {
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('prev')
        .setLabel('◀ Prev')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId('page')
        .setLabel(`${page + 1} / ${total}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId('next')
        .setLabel('Next ▶')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === total - 1)
    );
  return row;
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

      const pages = buildPages(settings);
      let page = 0;

      const msg = await interaction.editReply({
        embeds: [pages[page]],
        components: pages.length > 1 ? [buildButtons(page, pages.length)] : []
      });

      if (pages.length <= 1) return;

      const collector = msg.createMessageComponentCollector({ time: PAGE_TIMEOUT });

      collector.on('collect', async (btn) => {
        if (btn.user.id !== interaction.user.id) {
          return btn.reply({ content: 'Only the command user can switch pages.', ephemeral: true });
        }

        if (btn.customId === 'prev') page--;
        else if (btn.customId === 'next') page++;

        await btn.update({
          embeds: [pages[page]],
          components: [buildButtons(page, pages.length)]
        });
      });

      collector.on('end', async () => {
        await interaction.editReply({ components: [] }).catch(() => {});
      });

    } catch (e) {
      return interaction.editReply('Failed to fetch settings: ' + e.message);
    }
  },
};
