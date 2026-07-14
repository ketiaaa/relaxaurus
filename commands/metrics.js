const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const { baseURL, axiosConfig } = require('../utils/restApi');

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

module.exports = {
  data: new SlashCommandBuilder().setName('metrics').setDescription('Get server performance metrics'),
  async execute(interaction) {
    try {
      const res = await axios.get(`${baseURL}/metrics`, axiosConfig);
      const { serverfps, currentplayernum, serverframetime, maxplayernum, uptime } = res.data;
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📊 Server Metrics')
        .addFields(
          { name: 'FPS', value: String(serverfps), inline: true },
          { name: 'Frame Time', value: `${serverframetime}ms`, inline: true },
          { name: 'Players', value: `${currentplayernum}/${maxplayernum}`, inline: true },
          { name: 'Uptime', value: formatUptime(uptime), inline: true }
        );
      return interaction.editReply({ embeds: [embed] });
    } catch (e) {
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('❌ Failed to Fetch Metrics')
        .setDescription(e.message);
      return interaction.editReply({ embeds: [embed] });
    }
  },
};
