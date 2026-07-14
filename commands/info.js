const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const { baseURL, axiosConfig } = require('../utils/restApi');

module.exports = {
  data: new SlashCommandBuilder().setName('info').setDescription('Get server info'),
  async execute(interaction) {
    try {
      const res = await axios.get(`${baseURL}/info`, axiosConfig);
      const { servername, version, description } = res.data;
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`📋 ${servername}`)
        .addFields(
          { name: 'Version', value: version, inline: true },
          { name: 'Description', value: description || 'N/A', inline: true }
        );
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
