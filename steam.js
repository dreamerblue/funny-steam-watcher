const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp');
const axios = require('axios');
const path = require('path');
const fs = require('fs-extra');
const dayjs = require('dayjs');
const yaml = require('js-yaml');

function getLoggerPrefix() {
  return process.env.USE_TIME_PREFIX === 'true' || process.env.USE_TIME_PREFIX === '1'
    ? `[${dayjs().format('YYYY-MM-DD HH:mm:ss')}] `
    : '';
}

const logger = {
  info: (category, ...args) => {
    console.log(`${getLoggerPrefix()}[${category}]`, ...args);
  },
  warn: (category, ...args) => {
    console.warn(`${getLoggerPrefix()}[${category}]`, ...args);
  },
  error: (category, ...args) => {
    console.error(`${getLoggerPrefix()}[${category}]`, ...args);
  },
};

const CONFIG_PATH = process.env.CONFIG_PATH || path.join(__dirname, 'config.yaml');
const STEAM_DATA_DIR = process.env.STEAM_DATA_DIR || path.join(__dirname, 'steam-data');
const REFRESH_TOKEN_PATH = path.join(
  STEAM_DATA_DIR,
  `steam-refresh-token.${process.env.STEAM_USERNAME}.txt`,
);

if (!process.env.STEAM_USERNAME) {
  logger.error('process', 'Env `STEAM_USERNAME` is required');
  process.exit(1);
}

if (!process.env.STEAM_PASSWORD && !fs.existsSync(REFRESH_TOKEN_PATH)) {
  logger.error('process', 'Env `STEAM_PASSWORD` is required if no refresh token file is found');
  process.exit(1);
}

if (!fs.existsSync(CONFIG_PATH)) {
  logger.error('process', `Cannot find config file at ${CONFIG_PATH}`);
  process.exit(1);
}

const config = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf-8'));

const client = new SteamUser({
  language: 'schinese',
  dataDirectory: path.join(__dirname, 'steam-data'),
  renewRefreshTokens: true,
});

const PersonaStateTextMap = {
  0: '离线/隐身',
  1: '在线',
  2: '忙碌',
  3: '离开',
  4: '打盹',
  5: '寻找交易',
  6: '寻找游戏',
};

const lastPersonaMap = new Map();
const appNameCache = new Map();

async function fetchGameName(appid) {
  if (!appid || +appid === 0) return null;
  if (appNameCache.has(appid)) return appNameCache.get(appid);
  try {
    const { data } = await axios.get(
      `https://store.steampowered.com/api/appdetails?appids=${appid}&l=schinese`,
    );
    const info = data?.[appid]?.data;
    const name = info?.name || null;
    if (name) appNameCache.set(appid, name);
    return name;
  } catch (err) {
    logger.warn('[fetchGameName]', `Failed to fetch game name of ${appid}:`, err.message);
    return null;
  }
}

function toSid64(sid) {
  return typeof sid === 'string' ? sid : sid.getSteamID64();
}

function summarizePersona(u) {
  return {
    state: u.persona_state ?? null,
    appid: u.gameid ? String(u.gameid) : null,
    rich: u.rich_presence_string || null,
    rich_presence: u.rich_presence || [],
  };
}

function hasPersonaChanged(a, b) {
  return (
    a.state !== b.state ||
    a.appid !== b.appid ||
    a.rich !== b.rich ||
    JSON.stringify(a.rich_presence) !== JSON.stringify(b.rich_presence)
  );
}

function isUserPlayingGame(snap) {
  return snap.appid && +snap.appid !== 0;
}

async function notifyBark(title, body) {
  const barkKey = process.env.BARK_KEY;
  if (!barkKey) {
    logger.warn('Bark', 'Env `BARK_KEY` is not set, skipping Bark notification');
    return;
  }

  try {
    const url = `${
      process.env.BARK_DOMAIN || 'https://api.day.app'
    }/${barkKey}/${encodeURIComponent(title)}/${encodeURIComponent(body)}?group=SteamWatcher`;
    await axios.get(url);
  } catch (err) {
    logger.error('Bark', 'Failed to push notification:', err.message);
  }
}

async function printFriendPersonaDelta(accountId, sid64, prev, curr, displayName) {
  if (!PersonaStateTextMap[curr.state]) return;
  const name = displayName || sid64;
  const stateText = PersonaStateTextMap[curr.state] ?? '未知';

  let gameName = null;
  let groupSize = null;
  let gameText = '';
  let richText = '';
  let groupText = '';

  if (isUserPlayingGame(curr)) {
    gameName = await fetchGameName(curr.appid);
    const groupSizeStr = curr.rich_presence?.find(
      (rp) => rp.key === 'steam_player_group_size',
    )?.value;
    groupSize = Number.isInteger(+groupSizeStr) ? Number(groupSizeStr) : null;
    gameText = isUserPlayingGame(curr)
      ? `｜正在玩：${gameName || '未知游戏'} (AppID: ${curr.appid})`
      : '';
    richText = curr.rich ? `｜状态：${curr.rich}` : '';
    groupText = groupSize > 1 ? `｜与其他 ${groupSize - 1} 人一起游戏` : '';
    if (!isUserPlayingGame(prev)) {
      const gameNameText = `${gameName || `未知游戏 (${curr.appid})`}`;
      logger.info('Persona.Playing', `[${accountId}] ${name} 开始玩 ${gameNameText}`);
      if (
        config.watch[accountId] &&
        (config.watch[accountId].includes(+curr.appid) || config.watch[accountId].includes('*'))
      ) {
        logger.info('Caught!', `[${accountId}] ${name} is now playing ${gameNameText}`);
        notifyBark('关注的 Steam 好友正在玩游戏', `${name} 开始玩 ${gameNameText}`).then(() => {
          logger.info('Bark', `Notification sent: ${name} - ${gameNameText}`);
        });
      }
    }
  }

  logger.info(
    'Persona.Changed',
    `[${accountId}] ${name} → ${stateText}${gameText}${richText}${groupText}`,
  );
}

client.on('steamGuard', (domain, cb) => {
  process.stdout.write(`Input Steam Guard${domain ? ` (${domain})` : ''} auth code: `);
  process.stdin.once('data', (d) => cb(d.toString().trim()));
});

client.on('refreshToken', (token) => {
  fs.ensureDirSync(STEAM_DATA_DIR);
  fs.writeFileSync(REFRESH_TOKEN_PATH, token);
  logger.info('Steam', 'New refresh token saved');
});

if (process.env.DEBUG_STEAM === 'true' || process.env.DEBUG_STEAM === '1') {
  client.on('debug', (...args) => {
    logger.info('Steam.Debug', ...args);
  });

  client.on('debug-verbose', (...args) => {
    logger.info('Steam.DebugVerbose', ...args);
  });
}

client.on('friendsList', () => {
  const ids = Object.keys(client.myFriends || {});
  logger.info('Steam', `Friends list is ready, total ${ids.length} friends`);
  client.getPersonas(ids, (err, personas) => {
    if (err) return logger.error('Steam', 'Get personas failed:', err);
    for (const sid64 of Object.keys(personas)) {
      const u = personas[sid64];
      lastPersonaMap.set(sid64, summarizePersona(u));
    }
  });
});

client.on('user', async (sid, user) => {
  const sid64 = toSid64(sid);
  const snap = summarizePersona(user);
  const prev = lastPersonaMap.get(sid64) || {};

  if (Object.keys(prev).length === 0 || hasPersonaChanged(prev, snap)) {
    await printFriendPersonaDelta(sid.accountid, sid64, prev, snap, user.player_name);
    lastPersonaMap.set(sid64, snap);
  }
});

client.on('loggedOn', () => {
  const state = process.env.STEAM_PERSONA_STATE
    ? +process.env.STEAM_PERSONA_STATE
    : SteamUser.EPersonaState.Invisible;
  logger.info(
    'Steam',
    `Logged on successfully, setting persona state to ${SteamUser.EPersonaState[state] || state}`,
  );
  client.setPersona(state);
});

client.on('error', (err) => {
  logger.error('Steam', 'Error:', err);
});

let exiting = false;

function gracefulExit(sig) {
  if (exiting) return;
  exiting = true;

  if (!(process.env.LOGOUT_BEFORE_EXIT === 'true' || process.env.LOGOUT_BEFORE_EXIT === '1')) {
    process.exit(0);
  } else {
    logger.info('process', `Received signal ${sig}, ready to log off Steam...`);

    const timeout = setTimeout(() => {
      logger.info('process', 'Log off timeout after 8s, forcing exit');
      process.exit(0);
    }, 8000);

    client.once('disconnected', () => {
      clearTimeout(timeout);
      logger.info('process', 'Logged off Steam successfully, exiting program');
      process.exit(0);
    });

    try {
      client.logOff();
    } catch (err) {
      logger.warn('process', `Log off exception, exiting directly: ${err.message}`);
      process.exit(0);
    }
  }
}

['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach((sig) => process.on(sig, () => gracefulExit(sig)));

process.on('uncaughtException', (e) => {
  logger.error('process', 'Uncaught exception:', e);
  gracefulExit('EXCEPTION');
});

async function main() {
  const refreshTokenExists = fs.existsSync(REFRESH_TOKEN_PATH);
  const logOnOptions = {
    machineName: process.env.STEAM_MACHINE_NAME,
    clientOS: process.env.STEAM_CLIENT_OS ? +process.env.STEAM_CLIENT_OS : undefined,
  };
  if (refreshTokenExists) {
    logOnOptions.refreshToken = fs.readFileSync(REFRESH_TOKEN_PATH, 'utf-8');
  } else {
    logOnOptions.accountName = process.env.STEAM_USERNAME;
    logOnOptions.password = process.env.STEAM_PASSWORD;
    logOnOptions.twoFactorCode = process.env.STEAM_TOTP
      ? SteamTotp.generateAuthCode(process.env.STEAM_TOTP)
      : undefined;
  }

  client.logOn(logOnOptions);
}

main();
