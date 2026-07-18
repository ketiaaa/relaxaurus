const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { exec } = require('child_process');
const util = require('util');
const axios = require('axios');
const { baseURL, axiosConfig } = require('../utils/restApi');

const execPromise = util.promisify(exec);

module.exports = {
  data: new SlashCommandBuilder().setName('start').setDescription('Start the PalServer'),
  async execute(interaction) {
    const screenName = process.env.PALSERVER_SCREEN_NAME || 'palserver';
    const startCmd = `cd ~/Steam/steamapps/common/PalServer && BOX64_MALLOC_HACK=1 box64 ./PalServer.sh -useperfthreads -UseMultithreadForDS`;
    const MAX_RETRIES = 3;

    const embed = new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle('🔄 Starting PalServer...')
      .setDescription('Launching server process...')
      .addFields({ name: 'Screen', value: screenName, inline: true });

    await interaction.editReply({ embeds: [embed] });

    let online = false;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 1) {
        embed.setDescription(`Previous attempt crashed — retrying (${attempt}/${MAX_RETRIES})...`);
        await interaction.editReply({ embeds: [embed] });
        // Kill the dead screen session if it still exists
        await execPromise(`screen -S ${screenName} -X quit`).catch(() => {});
      }

      exec(
        `screen -dmS ${screenName} bash -c "${startCmd}"`,
        (err) => { if (err) console.error('start exec error:', err.message); }
      );

      // Poll until the API responds
      for (let i = 0; i < 12; i++) {
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
              { name: 'Screen', value: screenName, inline: true },
              { name: 'Attempts', value: String(attempt), inline: true }
            );
          await interaction.editReply({ embeds: [embed] });
          online = true;
          break;
        } catch {}
      }

      if (online) break;
    }

    if (!online) {
      embed
        .setColor(0xED4245)
        .setTitle('❌ Server Failed to Start')
        .setDescription(`Crashed after ${MAX_RETRIES} attempts. Box64 memory bug — try again.`)
        .setFields(
          { name: 'Screen', value: screenName, inline: true },
          { name: 'Tip', value: 'Large mods or saves can cause the crash. Try again in a moment.' }
        );
      await interaction.editReply({ embeds: [embed] });
    }
  },
};
