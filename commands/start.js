const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { exec } = require('child_process');
const util = require('util');
const axios = require('axios');
const { baseURL, axiosConfig } = require('../utils/restApi');

const execPromise = util.promisify(exec);
const CONTAINER = 'palworld-server';
const MAX_ATTEMPTS = 3;

async function isContainerRunning() {
  try {
    const { stdout } = await execPromise(
      `docker inspect --format='{{.State.Running}}' ${CONTAINER}`
    );
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

async function startContainer() {
  try {
    await execPromise(`docker start ${CONTAINER}`);
  } catch {
    await execPromise('cd /home/steam/palworld-server && docker compose up -d').catch(() => {});
  }
}

module.exports = {
  data: new SlashCommandBuilder().setName('start').setDescription('Start the PalServer'),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle('🔄 Starting PalServer...')
      .setDescription('Launching Docker container...');

    await interaction.editReply({ embeds: [embed] });

    // Start the container
    await startContainer();

    let online = false;
    let crashed = false;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      // Poll until the API responds or the container dies
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 3000));
        try {
          const res = await axios.get(`${baseURL}/info`, axiosConfig);
          const { servername, version } = res.data;
          embed
            .setColor(0x57F287)
            .setTitle('✅ PalServer is Running')
            .setDescription(attempt > 1 ? `Started on attempt ${attempt}` : null)
            .setFields(
              { name: 'Server', value: servername, inline: true },
              { name: 'Version', value: version, inline: true },
              { name: 'Container', value: CONTAINER, inline: true }
            );
          await interaction.editReply({ embeds: [embed] });
          online = true;
          break;
        } catch {}

        // Check if container died mid-boot
        if (!(await isContainerRunning())) {
          crashed = true;
          break;
        }
      }

      if (online) break;

      if (crashed && attempt < MAX_ATTEMPTS) {
        embed
          .setColor(0xED4245)
          .setTitle('💥 Server Crashed During Boot')
          .setDescription(
            `Container exited unexpectedly on attempt ${attempt}/${MAX_ATTEMPTS}. Retrying...`
          );
        await interaction.editReply({ embeds: [embed] });
        await startContainer();
        crashed = false;
        // Brief pause to let the container stabilize before polling again
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (!online) {
      if (crashed) {
        embed
          .setColor(0xED4245)
          .setTitle('❌ Server Failed to Start')
          .setDescription(
            `Container crashed ${MAX_ATTEMPTS} times during boot.\n` +
            'The server binary may need an update, or the host may be low on memory.'
          )
          .setFields({ name: 'Container', value: CONTAINER, inline: true });
      } else {
        embed
          .setColor(0xE67E22)
          .setTitle('⚠️ Server Still Booting')
          .setDescription('Container is starting. Large saves can take 2-3 minutes. Check /info in a moment.')
          .setFields({ name: 'Container', value: CONTAINER, inline: true });
      }
      await interaction.editReply({ embeds: [embed] });
    }
  },
};
