const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const { baseURL, axiosConfig } = require('../utils/restApi');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a player from the server')
    .addStringOption(option =>
      option.setName('userid')
        .setDescription('The Steam ID of the player to ban')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Optional ban reason')
        .setRequired(false)),
  async execute(interaction) {
    const userid = interaction.options.getString('userid');
    const message = interaction.options.getString('message');
    try {
      const body = { userid };
      if (message) body.message = message;
      await axios.post(`${baseURL}/ban`, body, axiosConfig);
      const embed = new EmbedBuilder()
        .setColor(0xE67E22)
        .setTitle('🔨 Player Banned')
        .addFields({ name: 'User ID', value: `\`${userid}\``, inline: true });
      if (message) embed.addFields({ name: 'Reason', value: message, inline: true });
      return interaction.editReply({ embeds: [embed] });
    } catch (e) {
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('❌ Failed to Ban')
        .setDescription(e.message);
      return interaction.editReply({ embeds: [embed] });
    }
  },
};
