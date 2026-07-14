const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const { baseURL, axiosConfig } = require('../utils/restApi');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Announce a message to the server')
    .addStringOption(option =>
      option.setName('message')
        .setDescription('The message to announce')
        .setRequired(true)),
  async execute(interaction) {
    const message = interaction.options.getString('message');
    try {
      await axios.post(`${baseURL}/announce`, { message }, axiosConfig);
      const embed = new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle('📢 Announcement')
        .setDescription(message);
      return interaction.editReply({ embeds: [embed] });
    } catch (e) {
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('❌ Failed to Announce')
        .setDescription(e.message);
      return interaction.editReply({ embeds: [embed] });
    }
  },
};
