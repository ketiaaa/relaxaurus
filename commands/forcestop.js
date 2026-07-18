const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);
const CONTAINER = 'palworld-server';

module.exports = {
  data: new SlashCommandBuilder().setName('forcestop').setDescription('Force stop the PalServer immediately'),
  async execute(interaction) {
    try {
      await execPromise(`docker stop -t 0 ${CONTAINER}`);
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
