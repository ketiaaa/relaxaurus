const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const { baseURL, axiosConfig } = require('../utils/restApi');

module.exports = {
  data: new SlashCommandBuilder().setName('save').setDescription('Save the world'),
  async execute(interaction) {
    try {
      await axios.post(`${baseURL}/save`, {}, axiosConfig);
      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('💾 World Saved')
        .setDescription('Game world saved successfully.');
      return interaction.editReply({ embeds: [embed] });
    } catch (e) {
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('❌ Failed to Save')
        .setDescription(e.message);
      return interaction.editReply({ embeds: [embed] });
    }
  },
};
