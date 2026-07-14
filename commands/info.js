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
  data: new SlashCommandBuilder().setName('info').setDescription('Get server info'),
  async execute(interaction) {
    try {
      const [infoRes, metricsRes] = await Promise.all([
        axios.get(`${baseURL}/info`, axiosConfig),
        axios.get(`${baseURL}/metrics`, axiosConfig)
      ]);

      const { servername, version, description, worldguid } = infoRes.data;
      const { serverfps, currentplayernum, maxplayernum, uptime } = metricsRes.data;

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`📋 ${servername}`)
        .addFields(
          { name: 'Version', value: version, inline: true },
          { name: 'Players', value: `${currentplayernum}/${maxplayernum}`, inline: true },
          { name: 'Uptime', value: formatUptime(uptime), inline: true },
          { name: 'FPS', value: String(serverfps), inline: true },
          { name: 'Description', value: description || 'N/A', inline: true },
          { name: 'World GUID', value: `\`${worldguid}\``, inline: true }
        )
        .setFooter({ text: `World GUID: ${worldguid}` })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    } catch (e) {
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('❌ Failed to Fetch Server Info')
        .setDescription(e.message);
      return interaction.editReply({ embeds: [embed] });
    }
  },
};
