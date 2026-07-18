const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { exec } = require('child_process');
const util = require('util');
const axios = require('axios');
const { baseURL, axiosConfig } = require('../utils/restApi');

const execPromise = util.promisify(exec);
const CONTAINER = 'palworld-server';

module.exports = {
  data: new SlashCommandBuilder().setName('start').setDescription('Start the PalServer'),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle('🔄 Starting PalServer...')
      .setDescription('Launching Docker container...');

    await interaction.editReply({ embeds: [embed] });

    // Start the Docker container
    try {
      await execPromise(`docker start ${CONTAINER}`);
    } catch {
      // Container doesn't exist, try compose up
      await execPromise('cd /home/steam/palworld-server && docker compose up -d').catch(() => {});
    }

    // Poll until the API responds
    let online = false;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const res = await axios.get(`${baseURL}/info`, axiosConfig);
        const { servername, version } = res.data;
        embed
          .setColor(0x57F287)
          .setTitle('✅ PalServer is Running')
          .setDescription(null)
          .setFields(
            { name: 'Server', value: servername, inline: true },
            { name: 'Version', value: version, inline: true },
            { name: 'Container', value: CONTAINER, inline: true }
          );
        await interaction.editReply({ embeds: [embed] });
        online = true;
        break;
      } catch {}
    }

    if (!online) {
      embed
        .setColor(0xE67E22)
        .setTitle('⚠️ Server Still Booting')
        .setDescription('Container is starting. Large saves can take 2-3 minutes. Check /info in a moment.')
        .setFields({ name: 'Container', value: CONTAINER, inline: true });
      await interaction.editReply({ embeds: [embed] });
    }
  },
};
