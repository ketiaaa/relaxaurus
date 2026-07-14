const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const { baseURL, axiosConfig } = require('../utils/restApi');

module.exports = {
  data: new SlashCommandBuilder().setName('forcestop').setDescription('Force stop the PalServer immediately'),
  async execute(interaction) {
    try {
      await axios.post(`${baseURL}/stop`, {}, axiosConfig);
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('⛔ Server Force Stopped');
      return interaction.editReply({ embeds: [embed] });
    } catch (e) {
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('❌ Failed to Force Stop')
        .setDescription(e.message);
      return interaction.editReply({ embeds: [embed] });
    }
  },
};
