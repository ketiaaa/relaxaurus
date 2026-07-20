// Generates the Relaxaurus Palworld egg JSON
const fs = require('fs');

function v(name, desc, def, rules = 'required|string', opts = {}) {
  return {
    name: opts.label || name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/Arm64/, 'ARM64').replace(/Rcon/, 'RCON').replace(/Cpu/, 'CPU').replace(/Gpu/, 'GPU').replace(/Hp /, 'HP ').replace(/Pvp/, 'PvP').replace(/Unko/i, 'UNKO'),
    description: desc,
    env_variable: name,
    default_value: String(def),
    user_viewable: opts.viewable !== false,
    user_editable: opts.editable !== false,
    rules: rules,
    field_type: opts.type || 'text',
    ...(opts.options ? { options: opts.options } : {})
  };
}

const vars = [
  // ── Core Server ──
  v('TZ', 'Timezone for backup timestamps', 'UTC', 'required|string'),
  v('PLAYERS', 'Max players (1-32)', '10', 'required|integer|between:1,32'),
  v('PORT', 'UDP game port', '8211', 'required|integer|between:1024,65535', { editable: false }),
  v('PUID', 'User ID for file ownership', '1000', 'required|integer', { editable: false }),
  v('PGID', 'Group ID for file ownership', '1000', 'required|integer', { editable: false }),
  v('SERVER_NAME', 'Server name', 'Pipot', 'required|string|max:64'),
  v('SERVER_DESCRIPTION', 'Server description', '', 'nullable|string|max:256'),
  v('SERVER_PASSWORD', 'Server password (empty = no password)', '', 'nullable|string|max:64'),
  v('ADMIN_PASSWORD', 'Admin password for RCON/REST API', '', 'required|string|min:8|max:64'),
  v('COMMUNITY', 'Show in community browser (requires password)', 'false', 'required|string|in:true,false'),
  v('PUBLIC_IP', 'Public IP (auto-detect if empty)', '', 'nullable|string'),
  v('PUBLIC_PORT', 'Public port (auto-detect if empty)', '', 'nullable|integer'),

  // ── RCON / REST API ──
  v('RCON_ENABLED', 'Enable RCON', 'true', 'required|string|in:true,false'),
  v('RCON_PORT', 'RCON port', '25575', 'required|integer', { editable: false }),
  v('REST_API_ENABLED', 'Enable REST API', 'true', 'required|string|in:true,false', { editable: false }),
  v('REST_API_PORT', 'REST API port', '8212', 'required|integer', { editable: false }),
  v('ENABLE_GAMEDATA_API', 'Enable game data API', 'false', 'required|string|in:true,false'),
  v('QUERY_PORT', 'Steam query port', '27015', 'required|integer', { editable: false }),
  v('ALLOW_CONNECT_PLATFORM', 'Platform: Steam or Xbox', 'Steam', 'required|string|in:Steam,Xbox', { options: ['Steam', 'Xbox'] }),

  // ── Performance ──
  v('ENABLE_PERF_THREADING_ARGS', 'Enable -useperfthreads args', 'false', 'required|string|in:true,false'),
  v('WORKER_THREADS_SERVER', 'NumberOfWorkerThreadsServer (empty=default)', '', 'nullable|integer'),
  v('PALWORLD_ALLOW_NEGATIVE_DELTA_TIME', 'Enable negative delta time recovery', 'false', 'required|string|in:true,false'),

  // ── Updates & Reboots ──
  v('UPDATE_ON_BOOT', 'Update game on container start', 'true', 'required|string|in:true,false'),
  v('AUTO_UPDATE_ENABLED', 'Enable auto-updates', 'false', 'required|string|in:true,false'),
  v('AUTO_UPDATE_CRON_EXPRESSION', 'Auto-update schedule (cron)', '0 * * * *', 'nullable|string'),
  v('AUTO_UPDATE_WARN_MINUTES', 'Warning before auto-update (min)', '30', 'required|integer'),
  v('AUTO_REBOOT_ENABLED', 'Enable auto-reboots', 'false', 'required|string|in:true,false'),
  v('AUTO_REBOOT_CRON_EXPRESSION', 'Auto-reboot schedule (cron)', '0 0 * * *', 'nullable|string'),
  v('AUTO_REBOOT_WARN_MINUTES', 'Warning before auto-reboot (min)', '5', 'required|integer'),
  v('AUTO_REBOOT_EVEN_IF_PLAYERS_ONLINE', 'Reboot even with players online', 'false', 'required|string|in:true,false'),

  // ── Auto-Pause ──
  v('AUTO_PAUSE_ENABLED', 'Pause server when no players', 'false', 'required|string|in:true,false'),
  v('AUTO_PAUSE_TIMEOUT_EST', 'Seconds after last disconnect before pause', '180', 'required|integer'),
  v('AUTO_PAUSE_LOG', 'Enable pause logging', 'true', 'required|string|in:true,false'),
  v('AUTO_PAUSE_DEBUG', 'Enable pause debug logging', 'false', 'required|string|in:true,false'),

  // ── Backups ──
  v('BACKUP_ENABLED', 'Enable auto-backups', 'true', 'required|string|in:true,false'),
  v('BACKUP_CRON_EXPRESSION', 'Backup schedule (cron)', '0 * * * *', 'nullable|string'),
  v('USE_BACKUP_SAVE_DATA', 'Use native automatic backups', 'true', 'required|string|in:true,false'),
  v('DELETE_OLD_BACKUPS', 'Auto-delete old backups', 'true', 'required|string|in:true,false'),
  v('OLD_BACKUP_DAYS', 'Days to keep backups', '7', 'required|integer'),

  // ── Discord Webhooks ──
  v('DISCORD_WEBHOOK_URL', 'Discord webhook URL', '', 'nullable|string'),
  v('DISCORD_SUPPRESS_NOTIFICATIONS', 'Use @silent for webhook messages', 'false', 'required|string|in:true,false'),
  v('DISCORD_CONNECT_TIMEOUT', 'Webhook connect timeout (s)', '30', 'required|integer'),
  v('DISCORD_MAX_TIMEOUT', 'Webhook total timeout (s)', '30', 'required|integer'),

  // -- Discord: Player Join --
  v('DISCORD_PLAYER_JOIN_MESSAGE_ENABLED', 'Send join messages', 'true', 'required|string|in:true,false'),
  v('DISCORD_PLAYER_JOIN_MESSAGE', 'Join message text', 'player_name has joined Palworld!', 'nullable|string'),
  v('DISCORD_PLAYER_JOIN_MESSAGE_URL', 'Override webhook URL for join messages', '', 'nullable|string'),

  // -- Discord: Player Leave --
  v('DISCORD_PLAYER_LEAVE_MESSAGE_ENABLED', 'Send leave messages', 'true', 'required|string|in:true,false'),
  v('DISCORD_PLAYER_LEAVE_MESSAGE', 'Leave message text', 'player_name has left Palworld.', 'nullable|string'),
  v('DISCORD_PLAYER_LEAVE_MESSAGE_URL', 'Override webhook URL for leave messages', '', 'nullable|string'),

  // -- Discord: Server Start/Stop --
  v('DISCORD_PRE_START_MESSAGE_ENABLED', 'Send server start message', 'true', 'required|string|in:true,false'),
  v('DISCORD_PRE_START_MESSAGE', 'Server start message text', 'Server has been started!', 'nullable|string'),
  v('DISCORD_PRE_SHUTDOWN_MESSAGE_ENABLED', 'Send shutdown message', 'true', 'required|string|in:true,false'),
  v('DISCORD_PRE_SHUTDOWN_MESSAGE', 'Shutdown message text', 'Server is shutting down...', 'nullable|string'),
  v('DISCORD_POST_SHUTDOWN_MESSAGE_ENABLED', 'Send stopped message', 'true', 'required|string|in:true,false'),
  v('DISCORD_POST_SHUTDOWN_MESSAGE', 'Server stopped message text', 'Server is stopped!', 'nullable|string'),

  // -- Discord: Backups --
  v('DISCORD_PRE_BACKUP_MESSAGE_ENABLED', 'Send backup start message', 'true', 'required|string|in:true,false'),
  v('DISCORD_PRE_BACKUP_MESSAGE', 'Backup start message text', 'Creating backup...', 'nullable|string'),
  v('DISCORD_POST_BACKUP_MESSAGE_ENABLED', 'Send backup complete message', 'true', 'required|string|in:true,false'),
  v('DISCORD_POST_BACKUP_MESSAGE', 'Backup complete message text', 'Backup created at file_path', 'nullable|string'),

  // ── Logging ──
  v('ENABLE_PLAYER_LOGGING', 'Log player joins/leaves', 'true', 'required|string|in:true,false'),
  v('PLAYER_LOGGING_POLL_PERIOD', 'Player logging poll interval (s)', '5', 'required|integer'),
  v('LOG_FILTER_ENABLED', 'Filter duplicate log lines', 'true', 'required|string|in:true,false'),
  v('LOG_LEVEL', 'Minimum log level', 'INFO', 'required|string', { options: ['DEBUG', 'INFO', 'WARN', 'ERROR'] }),
  v('LOG_FORMAT_TYPE', 'Log format', 'default', 'required|string', { options: ['default', 'json', 'logfmt', 'colored', 'plain'] }),

  // ── Config Generation ──
  v('DISABLE_GENERATE_SETTINGS', 'Skip auto-generating PalWorldSettings.ini', 'false', 'required|string|in:true,false'),
  v('DISABLE_GENERATE_ENGINE', 'Skip auto-generating Engine.ini', 'false', 'required|string|in:true,false'),

  // ── Advanced ──
  v('TARGET_MANIFEST_ID', 'Lock game version to manifest ID', '', 'nullable|string'),
  v('INSTALL_BETA_INSIDER', 'Install beta version', 'false', 'required|string|in:true,false'),
  v('USE_DEPOT_DOWNLOADER', 'Use DepotDownloader instead of steamcmd', 'false', 'required|string|in:true,false'),

  // ── ARM64 / Box64 ──
  v('ARM64_DEVICE', 'Box64 optimization target', 'generic', 'required|string|in:generic,m1,rpi5,adlink', { options: ['generic', 'm1', 'rpi5', 'adlink'] }),
  v('BOX64_DYNAREC_STRONGMEM', 'Simulate Strong Memory (0-3)', '1', 'required|integer|between:0,3'),
  v('BOX64_DYNAREC_BIGBLOCK', 'BigBlock building (0-3)', '1', 'required|integer|between:0,3'),
  v('BOX64_DYNAREC_SAFEFLAGS', 'Flag handling on CALL/RET (0-2)', '1', 'required|integer|between:0,2'),
  v('BOX64_DYNAREC_FASTROUND', 'Precise x86 rounding (0-1)', '1', 'required|integer|between:0,1'),
  v('BOX64_DYNAREC_FASTNAN', 'Generate -NAN (0-1)', '1', 'required|integer|between:0,1'),
  v('BOX64_DYNAREC_X87DOUBLE', 'Force Double for x87 (0-1)', '0', 'required|integer|between:0,1'),

  // ── Game Settings ──
  v('DIFFICULTY', 'Game difficulty', 'None', 'required|string', { options: ['None', 'Normal', 'Difficult'] }),
  v('DAYTIME_SPEEDRATE', 'Day time speed (higher = shorter days)', '1.000000', 'required|numeric'),
  v('NIGHTTIME_SPEEDRATE', 'Night time speed (higher = shorter nights)', '1.000000', 'required|numeric'),
  v('EXP_RATE', 'XP multiplier', '10.000000', 'required|numeric'),
  v('PAL_CAPTURE_RATE', 'Capture rate multiplier', '2.000000', 'required|numeric'),
  v('PAL_SPAWN_NUM_RATE', 'Pal spawn rate', '1.000000', 'required|numeric'),
  v('PAL_DAMAGE_RATE_ATTACK', 'Damage from pals multiplier', '1.000000', 'required|numeric'),
  v('PAL_DAMAGE_RATE_DEFENSE', 'Damage to pals multiplier', '1.000000', 'required|numeric'),
  v('PLAYER_DAMAGE_RATE_ATTACK', 'Damage from players multiplier', '1.000000', 'required|numeric'),
  v('PLAYER_DAMAGE_RATE_DEFENSE', 'Damage to players multiplier', '1.000000', 'required|numeric'),
  v('PLAYER_STOMACH_DECREASE_RATE', 'Hunger depletion rate', '1.000000', 'required|numeric'),
  v('PLAYER_STAMINA_DECREASE_RATE', 'Stamina depletion rate', '1.000000', 'required|numeric'),
  v('PLAYER_AUTO_HP_REGEN_RATE', 'Player HP regen rate', '1.000000', 'required|numeric'),
  v('PLAYER_AUTO_HP_REGEN_RATE_IN_SLEEP', 'Player sleep HP regen rate', '1.000000', 'required|numeric'),
  v('PAL_STOMACH_DECREASE_RATE', 'Pal hunger depletion rate', '1.000000', 'required|numeric'),
  v('PAL_STAMINA_DECREASE_RATE', 'Pal stamina depletion rate', '1.000000', 'required|numeric'),
  v('PAL_AUTO_HP_REGEN_RATE', 'Pal HP regen rate', '1.000000', 'required|numeric'),
  v('PAL_AUTO_HP_REGEN_RATE_IN_SLEEP', 'Pal sleep HP regen rate', '1.000000', 'required|numeric'),
  v('BUILD_OBJECT_DAMAGE_RATE', 'Damage to structures multiplier', '1.000000', 'required|numeric'),
  v('BUILD_OBJECT_HP_RATE', 'Structure HP multiplier', '1.000000', 'required|numeric'),
  v('BUILD_OBJECT_DETERIORATION_DAMAGE_RATE', 'Structure decay rate', '1.000000', 'required|numeric'),
  v('COLLECTION_DROP_RATE', 'Gatherable items multiplier', '5.000000', 'required|numeric'),
  v('COLLECTION_OBJECT_HP_RATE', 'Gatherable object HP multiplier', '1.000000', 'required|numeric'),
  v('COLLECTION_OBJECT_RESPAWN_SPEED_RATE', 'Resource respawn speed (lower=faster)', '1.000000', 'required|numeric'),
  v('ENEMY_DROP_ITEM_RATE', 'Enemy item drop multiplier', '5.000000', 'required|numeric'),
  v('DROP_ITEM_MAX_NUM', 'Max dropped items in world', '3000', 'required|integer'),
  v('DROP_ITEM_ALIVE_MAX_HOURS', 'Hours before dropped items despawn', '1.000000', 'required|numeric'),
  v('DEATH_PENALTY', 'Death penalty type', 'Item', 'required|string|in:None,Item,ItemAndEquipment,All', { options: ['None', 'Item', 'ItemAndEquipment', 'All'] }),
  v('IS_MULTIPLAY', 'Enable multiplayer', 'true', 'required|string|in:true,false'),
  v('IS_PVP', 'Enable PvP', 'false', 'required|string|in:true,false'),
  v('HARDCORE', 'Enable hardcore mode', 'false', 'required|string|in:true,false'),
  v('ENABLE_PLAYER_TO_PLAYER_DAMAGE', 'Allow player-vs-player damage', 'false', 'required|string|in:true,false'),
  v('ENABLE_FRIENDLY_FIRE', 'Allow friendly fire', 'false', 'required|string|in:true,false'),
  v('ENABLE_INVADER_ENEMY', 'Enable invader events', 'true', 'required|string|in:true,false'),
  v('ENABLE_FAST_TRAVEL', 'Enable fast travel', 'true', 'required|string|in:true,false'),
  v('PAL_LOST', 'Lose pals on death', 'false', 'required|string|in:true,false'),
  v('PAL_EGG_DEFAULT_HATCHING_TIME', 'Egg hatch time in hours (0.01 = near instant)', '0.010000', 'required|numeric'),
  v('WORK_SPEED_RATE', 'Work speed multiplier', '10.000000', 'required|numeric'),
  v('ITEM_WEIGHT_RATE', 'Item weight multiplier (0.1 = 10x lighter)', '0.100000', 'required|numeric'),
  v('AUTO_SAVE_SPAN', 'Seconds between auto-saves', '30.000000', 'required|numeric'),
  v('BASE_CAMP_MAX_NUM', 'Max base camps per guild', '128', 'required|integer'),
  v('BASE_CAMP_WORKER_MAX_NUM', 'Max workers per base', '50', 'required|integer'),
  v('BASE_CAMP_MAX_NUM_IN_GUILD', 'Max bases per guild', '10', 'required|integer'),
  v('GUILD_PLAYER_MAX_NUM', 'Max players per guild', '20', 'required|integer'),
  v('COOP_PLAYER_MAX_NUM', 'Max coop players', '4', 'required|integer'),
  v('SUPPLY_DROP_SPAN', 'Minutes between supply drops', '20', 'required|integer'),
  v('ENABLE_PREDATOR_BOSS_PAL', 'Enable predator boss pals', 'true', 'required|string|in:true,false'),
  v('USEAUTH', 'Use authentication', 'false', 'required|string|in:true,false'),
  v('EQUIPMENT_DURABILITY_DAMAGE_RATE', 'Equipment durability damage rate (0 = no damage)', '0.000000', 'required|numeric'),
  v('CROSSPLAY_PLATFORMS', 'Allowed platforms', '(Steam,Xbox,PS5,Mac)', 'required|string'),
  v('ALLOW_CLIENT_MOD', 'Allow client mods', 'true', 'required|string|in:true,false'),
  v('ENABLE_VOICE_CHAT', 'Enable voice chat', 'false', 'required|string|in:true,false'),

  // ── Engine Settings ──
  v('LAN_SERVER_MAX_TICK_RATE', 'LAN tick rate', '120', 'required|integer'),
  v('NET_SERVER_MAX_TICK_RATE', 'Internet tick rate', '120', 'required|integer'),
  v('NET_CLIENT_TICKS_PER_SECOND', 'Client update ticks per second', '120', 'required|integer'),
  v('CONFIGURED_INTERNET_SPEED', 'Assumed internet speed (bytes/s)', '104857600', 'required|integer'),
  v('CONFIGURED_LAN_SPEED', 'Assumed LAN speed (bytes/s)', '104857600', 'required|integer'),
  v('MAX_CLIENT_RATE', 'Max data rate per client (bytes/s)', '104857600', 'required|integer'),
  v('MAX_INTERNET_CLIENT_RATE', 'Max internet client rate (bytes/s)', '104857600', 'required|integer'),
  v('SMOOTH_FRAME_RATE', 'Smooth frame rate', 'true', 'required|string|in:true,false'),
  v('SMOOTH_FRAME_RATE_UPPER_LIMIT', 'Frame rate smoothing upper limit', '120.000000', 'required|numeric'),
  v('SMOOTH_FRAME_RATE_LOWER_LIMIT', 'Frame rate smoothing lower limit', '30.000000', 'required|numeric'),
  v('USE_FIXED_FRAME_RATE', 'Use fixed frame rate', 'false', 'required|string|in:true,false'),
  v('FIXED_FRAME_RATE', 'Fixed frame rate target', '120.000000', 'required|numeric'),
  v('MIN_DESIRED_FRAME_RATE', 'Minimum desired frame rate', '60.000000', 'required|numeric'),
];

const egg = {
  _comment: "Relaxaurus Palworld Egg — generated by generate-egg.js. Native ARM64 Docker image, all env vars exposed.",
  meta: { version: "PLCN_v2", update_url: null },
  exported_at: new Date().toISOString(),
  name: "Palworld (Relaxaurus Full)",
  author: "relaxaurus@github",
  description: "Palworld dedicated server using thijsvanloef/palworld-server-docker. Native ARM64/AMD64 — no Box64 or SteamCMD setup. All server, game, engine, backup, Discord webhook, and ARM64 settings exposed.",
  features: ["gsl_token"],
  docker_images: {
    "Palworld Docker": "thijsvanloef/palworld-server-docker:latest"
  },
  file_denylist: [],
  startup: '{"done":"REST API started on port"}',
  config: {
    files: '{"palworld/Pal/Saved/Config/LinuxServer/PalWorldSettings.ini":{"parser":"ini","find":{"ServerName":"{{server.build.env.SERVER_NAME}}","AdminPassword":"{{server.build.env.ADMIN_PASSWORD}}","ServerPassword":"{{server.build.env.SERVER_PASSWORD}}","ServerPlayerMaxNum":"{{server.build.env.PLAYERS}}","RCONEnabled":"True","RCONPort":"{{server.build.env.RCON_PORT}}"}}}',
    startup: '{"done":"REST API started on port"}',
    logs: '{}',
    stop: 'docker exec -i {{server.container.id}} rcon-cli "Shutdown 10 Server stopping"'
  },
  scripts: {
    installation: {
      script: "#!/bin/bash\necho \"Relaxaurus Palworld — Docker handles installation on first boot\"",
      container: "thijsvanloef/palworld-server-docker:latest",
      entrypoint: "bash"
    }
  },
  variables: vars
};

fs.writeFileSync(__dirname + '/egg-relaxaurus-palworld.json', JSON.stringify(egg, null, 2));
console.log(`Generated egg with ${vars.length} variables`);
