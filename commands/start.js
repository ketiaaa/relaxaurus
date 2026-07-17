const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { exec } = require('child_process');
const axios = require('axios');
const { baseURL, axiosConfig } = require('../utils/restApi');

module.exports = {
  data: new SlashCommandBuilder().setName('start').setDescription('Start the PalServer'),
  async execute(interaction) {
    const screenName = process.env.PALSERVER_SCREEN_NAME || 'palserver';
    const startCmd = `cd ~/Steam/steamapps/common/PalServer && BOX64_DYNAREC_BIGBLOCK=0 BOX64_MALLOC_HACK=1 box64 ./PalServer.sh -useperfthreads -UseMultithreadForDS`;

    exec(
      `screen -dmS ${screenName} bash -c "${startCmd}"`,
      (err, stdout, stderr) => {
        if (err) console.error('start exec error:', err.message);
        if (stderr) console.error('start stderr:', stderr);
      }
    );

    const embed = new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle('🔄 Starting PalServer...')
      .setDescription('Waiting for the server to come online...')
      .addFields(
        { name: 'Screen', value: screenName, inline: true }
      );

    await interaction.editReply({ embeds: [embed] });

    // Poll the API until the server responds
    let online = false;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const res = await axios.get(`${baseURL}/info`, axiosConfig);
        const { servername, version } = res.data;
        const uptime = Math.floor(i * 3);
        embed
          .setColor(0x57F287)
          .setTitle('✅ PalServer is Running')
          .setDescription(null)
          .setFields(
            { name: 'Server', value: servername, inline: true },
            { name: 'Version', value: version, inline: true },
            { name: 'Screen', value: screenName, inline: true }
          );
        await interaction.editReply({ embeds: [embed] });
        online = true;
        break;
      } catch {}
    }

    if (!online) {
      embed
        .setColor(0xE67E22)
        .setTitle('⚠️ Server Start Pending')
        .setDescription('Server process was launched but is not responding yet. It may still be booting — check `/info` in a moment.')
        .setFields(
          { name: 'Screen', value: screenName, inline: true },
          { name: 'Note', value: 'Large servers can take 30–60 seconds to start.' }
        );
      await interaction.editReply({ embeds: [embed] });
    }
  },
};
