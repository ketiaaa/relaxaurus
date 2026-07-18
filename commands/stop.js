const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);
const CONTAINER = 'palworld-server';

module.exports = {
  data: new SlashCommandBuilder().setName('stop').setDescription('Stop the PalServer'),
  async execute(interaction) {
    try {
      await execPromise(`docker stop ${CONTAINER}`);
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('🛑 Server Stopped');
      return interaction.editReply({ embeds: [embed] });
    } catch (e) {
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('❌ Failed to Stop Server')
        .setDescription(e.message);
      return interaction.editReply({ embeds: [embed] });
    }
  },
};
