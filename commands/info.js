const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { exec } = require('child_process');
const util = require('util');
const axios = require('axios');
const { baseURL, axiosConfig } = require('../utils/restApi');

const execPromise = util.promisify(exec);

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

function getHostMetrics() {
  // Single shell script that gathers CPU, RAM, and GPU utilization in one pass
  const script = `
    CPU_IDLE=$(LC_ALL=C top -bn1 | grep -E '^%?Cpu' | awk '{print \$8}' | cut -d'%' -f1)
    if [ -n "\$CPU_IDLE" ]; then
      CPU_USED=\$(awk "BEGIN {printf \\"%.1f\\", 100 - \$CPU_IDLE}")
    else
      CPU_USED="N/A"
    fi

    RAM=\$(LC_ALL=C free -m | awk '/Mem:/ {printf "%d/%d MB (%.1f%%)", \$3, \$2, (\$3/\$2)*100}')

    echo "\${CPU_USED}|\${RAM}"
  `;

  return execPromise(script, { timeout: 8000 })
    .then(({ stdout }) => {
      const parts = stdout.trim().split('|');
      return {
        cpu: parts[0] ? `${parts[0]}%` : 'N/A',
        ram: parts[1] || 'N/A',
      };
    })
    .catch((err) => {
      console.error('Host metrics collection failed:', err.message);
      return { cpu: 'N/A', ram: 'N/A' };
    });
}

module.exports = {
  data: new SlashCommandBuilder().setName('info').setDescription('Get server info'),
  async execute(interaction) {
    try {
      const [infoRes, metricsRes, hostMetrics] = await Promise.all([
        axios.get(`${baseURL}/info`, axiosConfig),
        axios.get(`${baseURL}/metrics`, axiosConfig),
        getHostMetrics(),
      ]);

      const { servername, version, worldguid } = infoRes.data;
      const { serverfps, currentplayernum, maxplayernum, uptime } = metricsRes.data;

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`📋 ${servername}`)
        .addFields(
          { name: 'Version', value: version, inline: true },
          { name: 'Players', value: `${currentplayernum}/${maxplayernum}`, inline: true },
          { name: 'Uptime', value: formatUptime(uptime), inline: true },
          { name: 'FPS', value: String(serverfps), inline: true },
          { name: 'CPU', value: hostMetrics.cpu, inline: true },
          { name: 'RAM', value: hostMetrics.ram, inline: true }
        )
        .setFooter({ text: `World GUID: ${worldguid}` })
        .setTimestamp();

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
