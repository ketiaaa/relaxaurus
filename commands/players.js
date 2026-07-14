const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const { baseURL, axiosConfig } = require('../utils/restApi');

// Convert raw world coordinates to in-game map coords (±1000 range)
// Source: https://github.com/palworldlol/palworld-coord
function toMapCoords(x, y) {
  if (x == null || y == null) return null;
  const mapX = (Number(x) + 123888) / 459;
  const mapY = (Number(y) - 158000) / 459;
  return { x: mapX, y: mapY };
}

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
          const pos = toMapCoords(p.location_x, p.location_y);
          embed.addFields({
            name: `${p.name} — Lv.${p.level}`,
            value: [
              `Steam: \`${p.userId || 'N/A'}\``,
              `Ping: **${p.ping ?? '?'}ms**`,
              `Pos: \`${pos ? `${pos.x.toFixed(0)}, ${pos.y.toFixed(0)}` : '?'}\``
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
