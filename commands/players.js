const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const { baseURL, axiosConfig } = require('../utils/restApi');

module.exports = {
  data: new SlashCommandBuilder().setName('players').setDescription('List online players'),
  async execute(interaction) {
    try {
      const res = await axios.get(`${baseURL}/players`, axiosConfig);
      const players = res.data.players || [];
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`👥 Online Players (${players.length})`)
        .setTimestamp();

      if (players.length === 0) {
        embed.setDescription('No players online.');
      } else {
        for (const p of players) {
          embed.addFields({
            name: `${p.name} — Lv.${p.level}`,
            value: [
              `Steam: \`${p.userId || 'N/A'}\``,
              `Ping: **${p.ping ?? '?'}ms**`,
              `Pos: \`${Math.round(p.location_x)}, ${Math.round(p.location_y)}\``
            ].join('\n'),
            inline: true
          });
        }
      }

      return interaction.editReply({ embeds: [embed] });
    } catch (e) {
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('❌ Failed to Fetch Players')
        .setDescription(e.message);
      return interaction.editReply({ embeds: [embed] });
    }
  },
};
