const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { exec } = require('child_process');

module.exports = {
  data: new SlashCommandBuilder().setName('start').setDescription('Start the PalServer'),
  async execute(interaction) {
    const screenName = process.env.PALSERVER_SCREEN_NAME || 'palserver';
    const startCmd = `cd ~/Steam/steamapps/common/PalServer && box64 ./PalServer.sh`;

    exec(
      `screen -dmS ${screenName} bash -c "${startCmd}"`,
      (err, stdout, stderr) => {
        if (err) console.error('start exec error:', err.message);
        if (stderr) console.error('start stderr:', stderr);
      }
    );

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('🚀 Starting PalServer')
      .addFields(
        { name: 'Screen', value: screenName, inline: true },
        { name: 'Command', value: `\`\`\`${startCmd}\`\`\`` }
      );
    return interaction.editReply({ embeds: [embed] });
  },
};
