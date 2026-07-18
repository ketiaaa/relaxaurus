const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);
const CONTAINER = 'palworld-server';

module.exports = {
  data: new SlashCommandBuilder().setName('stop').setDescription('Stop the PalServer'),
  async execute(interaction) {
    try {
      // Save first, then graceful shutdown
      await execPromise(`docker exec ${CONTAINER} rcon-cli "Save"`);
      await execPromise(`docker exec ${CONTAINER} rcon-cli "Shutdown 10 Server stopping, be right back!"`);
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('🛑 Server Stopping')
        .setDescription('World saved. Shutting down in 10 seconds.');
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
