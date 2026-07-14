const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const { baseURL, axiosConfig } = require('../utils/restApi');

module.exports = {
  data: new SlashCommandBuilder().setName('stop').setDescription('Stop the PalServer'),
  async execute(interaction) {
    try {
      await axios.post(`${baseURL}/shutdown`,
        { waittime: 10, message: 'Server shutting down in 10 seconds.' },
        axiosConfig
      );
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('🛑 Shutdown Initiated')
        .setDescription('Server will shut down in 10 seconds.');
      return interaction.editReply({ embeds: [embed] });
    } catch (e) {
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('❌ Failed to Shut Down')
        .setDescription(e.message);
      return interaction.editReply({ embeds: [embed] });
    }
  },
};
