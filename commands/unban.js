const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const { baseURL, axiosConfig } = require('../utils/restApi');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a player from the server')
    .addStringOption(option =>
      option.setName('userid')
        .setDescription('The Steam ID of the player to unban')
        .setRequired(true)),
  async execute(interaction) {
    const userid = interaction.options.getString('userid');
    try {
      await axios.post(`${baseURL}/unban`, { userid }, axiosConfig);
      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Player Unbanned')
        .addFields({ name: 'User ID', value: `\`${userid}\``, inline: true });
      return interaction.editReply({ embeds: [embed] });
    } catch (e) {
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('❌ Failed to Unban')
        .setDescription(e.message);
      return interaction.editReply({ embeds: [embed] });
    }
  },
};
