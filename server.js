require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;
const API_KEY = process.env.TOPUP_API_KEY;
const API_URL = process.env.TOPUP_API_URL || 'https://khmer-topup.com/api/v1';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Country & Region Flag Mapping with Official Logo Flag Image URLs
function getCountryFlagInfo(name, slug) {
  const s = ((slug || '') + ' ' + (name || '')).toLowerCase();
  if (s.includes('vietnam') || s.includes('-vn')) {
    return { code: 'vn', name: 'Vietnam', flagUrl: 'https://flagcdn.com/w80/vn.png', emoji: '🇻🇳' };
  }
  if (s.includes('cambodia') || s.includes('-kh')) {
    return { code: 'kh', name: 'Cambodia', flagUrl: 'https://flagcdn.com/w80/kh.png', emoji: '🇰🇭' };
  }
  if (s.includes('singapore') || s.includes('-sg')) {
    return { code: 'sg', name: 'Singapore', flagUrl: 'https://flagcdn.com/w80/sg.png', emoji: '🇸🇬' };
  }
  if (s.includes('indonesia') || s.includes('-id')) {
    return { code: 'id', name: 'Indonesia', flagUrl: 'https://flagcdn.com/w80/id.png', emoji: '🇮🇩' };
  }
  if (s.includes('malaysia') || s.includes('-my')) {
    return { code: 'my', name: 'Malaysia', flagUrl: 'https://flagcdn.com/w80/my.png', emoji: '🇲🇾' };
  }
  if (s.includes('philippines') || s.includes('-ph')) {
    return { code: 'ph', name: 'Philippines', flagUrl: 'https://flagcdn.com/w80/ph.png', emoji: '🇵🇭' };
  }
  if (s.includes('brazil') || s.includes('-br')) {
    return { code: 'br', name: 'Brazil', flagUrl: 'https://flagcdn.com/w80/br.png', emoji: '🇧🇷' };
  }
  if (s.includes('turkey') || s.includes('-tr')) {
    return { code: 'tr', name: 'Turkey', flagUrl: 'https://flagcdn.com/w80/tr.png', emoji: '🇹🇷' };
  }
  if (s.includes('russia') || s.includes('-ru')) {
    return { code: 'ru', name: 'Russia', flagUrl: 'https://flagcdn.com/w80/ru.png', emoji: '🇷🇺' };
  }
  if (s.includes('taiwan') || s.includes('-tw')) {
    return { code: 'tw', name: 'Taiwan', flagUrl: 'https://flagcdn.com/w80/tw.png', emoji: '🇹🇼' };
  }
  if (s.includes('bangladesh') || s.includes('-bd')) {
    return { code: 'bd', name: 'Bangladesh', flagUrl: 'https://flagcdn.com/w80/bd.png', emoji: '🇧🇩' };
  }
  if (s.includes('middle east') || s.includes('mena')) {
    return { code: 'ae', name: 'Middle East', flagUrl: 'https://flagcdn.com/w80/ae.png', emoji: '🇦🇪' };
  }
  if (s.includes('europe') || s.includes('-eu')) {
    return { code: 'eu', name: 'Europe', flagUrl: 'https://flagcdn.com/w80/eu.png', emoji: '🇪🇺' };
  }
  if (s.includes('america') || s.includes('latam')) {
    return { code: 'us', name: 'Americas', flagUrl: 'https://flagcdn.com/w80/us.png', emoji: '🌎' };
  }
  if (s.includes('special')) {
    return { code: 'special', name: 'Special', flagUrl: null, emoji: '⚡' };
  }
  return { code: 'global', name: 'Global', flagUrl: null, emoji: '🌍' };
}

function getCountryFlag(name, slug) {
  return getCountryFlagInfo(name, slug).emoji;
}

// Helper to map game names/aliases to khmer-topup.com slugs
function getGameSlug(game) {
  const g = (game || '').toLowerCase().trim();
  if (!g) return '';
  // If it's already an exact slug with hyphen, preserve it
  if (g.includes('-')) return g;
  if (g === 'freefire' || g === 'free-fire' || g === 'free fire') return 'free-fire-kh-sg';
  if (g === 'mlbb' || g === 'mobile legends' || g === 'mobile-legends') return 'mobile-legends';
  if (g.includes('exclusive')) return 'mobile-legends-exclusive';
  if (g.includes('special')) return 'mobile-legends-special';
  if (g.includes('global') && (g.includes('legend') || g.includes('mlbb'))) return 'mobile-legends-global';
  if (g.includes('delta')) return 'delta-force';
  if (g.includes('blood')) return 'blood-strike';
  return g.replace(/\s+/g, '-');
}

// Identify franchise/group and collect all sister server variants with flags
function getServerVariants(targetGame, allGames) {
  const slug = targetGame.slug;
  let familyKey = null;

  if (slug.includes('freefire') || slug.includes('free-fire')) familyKey = 'freefire';
  else if (slug.includes('mobile-legends') && !slug.includes('adventure')) familyKey = 'mobile-legends';
  else if (slug.includes('valorant')) familyKey = 'valorant';
  else if (slug.includes('wild-rift')) familyKey = 'wild-rift';
  else if (slug.includes('league-of-legends')) familyKey = 'league-of-legends';
  else if (slug.includes('teamfight-tactics')) familyKey = 'teamfight-tactics';
  else if (slug.includes('magic-chess-gogo')) familyKey = 'magic-chess-gogo';
  else if (slug.includes('blood-strike')) familyKey = 'blood-strike';
  else if (slug.includes('delta-force') || slug.includes('deltaforce')) familyKey = 'delta-force';
  else if (slug.includes('eafc-mobile')) familyKey = 'eafc-mobile';

  if (!familyKey) return [];

  const matched = allGames.filter(g => {
    const s = g.slug;
    if (familyKey === 'freefire') return s.includes('freefire') || s.includes('free-fire');
    if (familyKey === 'mobile-legends') return s.includes('mobile-legends') && !s.includes('adventure');
    if (familyKey === 'valorant') return s.includes('valorant');
    if (familyKey === 'wild-rift') return s.includes('wild-rift');
    if (familyKey === 'league-of-legends') return s.includes('league-of-legends');
    if (familyKey === 'teamfight-tactics') return s.includes('teamfight-tactics');
    if (familyKey === 'magic-chess-gogo') return s.includes('magic-chess-gogo');
    if (familyKey === 'blood-strike') return s.includes('blood-strike');
    if (familyKey === 'delta-force') return s.includes('delta-force') || s.includes('deltaforce');
    if (familyKey === 'eafc-mobile') return s.includes('eafc-mobile');
    return false;
  });

  return matched.map(g => {
    const flagInfo = getCountryFlagInfo(g.name, g.slug);
    return {
      slug: g.slug,
      name: g.name,
      flag: flagInfo.emoji,
      flagUrl: flagInfo.flagUrl,
      active: g.slug === targetGame.slug,
      packageCount: g.packages ? g.packages.length : 0
    };
  });
}

// In-memory cache for provider games list
let cachedGames = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getGamesList() {
  const now = Date.now();
  if (cachedGames && (now - lastCacheTime < CACHE_TTL_MS)) {
    return cachedGames;
  }
  const response = await fetch(`${API_URL}/games`, {
    headers: { 'Authorization': `Bearer ${API_KEY}` }
  });
  if (!response.ok) {
    throw new Error(`Provider returned ${response.status}`);
  }
  const data = await response.json();
  cachedGames = Array.isArray(data.games) ? data.games : (Array.isArray(data) ? data : []);
  lastCacheTime = now;
  return cachedGames;
}

// 1. API Status & Wallet Balance Check
app.get('/api/status', async (req, res) => {
  let wallet = null;
  if (API_KEY && API_URL) {
    try {
      const response = await fetch(`${API_URL}/me`, {
        headers: {
          'Authorization': `Bearer ${API_KEY}`
        }
      });
      if (response.ok) {
        wallet = await response.json();
      }
    } catch (e) {
      console.warn('Could not fetch wallet balance:', e.message);
    }
  }

  res.json({
    status: 'online',
    provider: 'khmer-topup.com',
    apiKeyConfigured: Boolean(API_KEY),
    providerUrl: API_URL,
    wallet: wallet
  });
});

// 2. Fetch Live Games & Pricing from Provider
app.get('/api/topup/games', async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const games = await getGamesList();
    const formatted = games.map(g => {
      const flagInfo = getCountryFlagInfo(g.name, g.slug);
      return {
        ...g,
        flag: flagInfo.emoji,
        flagUrl: flagInfo.flagUrl,
        countryCode: flagInfo.code,
        countryName: flagInfo.name
      };
    });
    res.json({ games: formatted, count: formatted.length });
  } catch (error) {
    console.error('Fetch Games Error:', error);
    res.status(500).json({ error: 'Failed to fetch games from provider', details: error.message });
  }
});

// 2b. Fetch Single Game by Slug or Key
app.get('/api/topup/game/:slug', async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const { slug } = req.params;
  const targetSlug = getGameSlug(slug);

  try {
    const games = await getGamesList();

    // 1. Exact match first (CRITICAL for regional slugs: freefire-vietnam, free-fire-kh-sg, etc.)
    let game = games.find(g => g.slug === slug);

    // 2. Case-insensitive match
    if (!game) {
      game = games.find(g => g.slug.toLowerCase() === slug.toLowerCase());
    }

    // 3. Fallback to mapped targetSlug if alias was used (e.g. 'freefire', 'mlbb')
    if (!game && targetSlug) {
      game = games.find(g => g.slug === targetSlug);
    }

    // 4. Fuzzy fallback if still not found
    if (!game) {
      game = games.find(g => g.slug.includes(slug) || slug.includes(g.slug));
    }

    if (!game) {
      return res.status(404).json({ error: 'Game not found', slug });
    }

    const flagInfo = getCountryFlagInfo(game.name, game.slug);
    const serverVariants = getServerVariants(game, games);

    res.json({
      ...game,
      flag: flagInfo.emoji,
      flagUrl: flagInfo.flagUrl,
      countryCode: flagInfo.code,
      countryName: flagInfo.name,
      server_variants: serverVariants
    });
  } catch (error) {
    console.error('Fetch Single Game Error:', error);
    res.status(500).json({ error: 'Failed to fetch game details', details: error.message });
  }
});

// 3. Verify Player Account (GET /api/v1/check)
app.post('/api/topup/check-id', async (req, res) => {
  const { game, slug, playerId, player_id, zoneId, serverId, server_id } = req.body;
  let targetPlayerId = String(playerId || player_id || '').trim();
  let targetServerId = String(zoneId || serverId || server_id || '').trim();
  const targetSlug = (slug && String(slug).trim()) || getGameSlug(game);

  // If player pasted e.g. "1264663279 (14037)" into player ID
  const combinedMatch = targetPlayerId.match(/^([^(]+)\s*\(([^)]+)\)$/);
  if (combinedMatch) {
    targetPlayerId = combinedMatch[1].trim();
    if (!targetServerId) {
      targetServerId = combinedMatch[2].trim();
    }
  }

  // Strip parentheses, brackets, and whitespace
  targetPlayerId = targetPlayerId.replace(/[\s()\[\]]/g, '');
  targetServerId = targetServerId.replace(/[\s()\[\]]/g, '');

  if (!targetPlayerId) {
    return res.status(400).json({ valid: false, error: 'Player ID is required' });
  }

  if (!API_KEY) {
    return res.json({
      valid: true,
      result: 'valid',
      simulated: true,
      nickname: 'Player_' + String(targetPlayerId).slice(-4),
      message: 'Simulated check (API key not configured)'
    });
  }

  try {
    let checkUrl = `${API_URL}/check?slug=${encodeURIComponent(targetSlug)}&player_id=${encodeURIComponent(targetPlayerId)}`;
    if (targetServerId) {
      checkUrl += `&server_id=${encodeURIComponent(targetServerId)}`;
    }

    const response = await fetch(checkUrl, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      }
    });

    const data = await response.json();
    const nickname = data.nickname || data.username || data.name || data.player_name || null;
    const isValid = data.result === 'valid' || Boolean(nickname);

    res.status(response.status).json({
      valid: isValid,
      result: data.result || (isValid ? 'valid' : 'invalid'),
      nickname: nickname,
      raw: data
    });
  } catch (error) {
    console.error('Check ID Error:', error);
    res.status(500).json({ valid: false, error: 'Failed to communicate with top-up provider', details: error.message });
  }
});

// 4. Place Top-Up Order (POST /api/v1/orders)
app.post('/api/topup/order', async (req, res) => {
  const { package_id, packageId, player_id, playerId, server_id, zoneId, serverId, reference, game } = req.body;
  
  const targetPackageId = package_id || packageId;
  let targetPlayerId = String(player_id || playerId || '').trim();
  let targetServerId = String(server_id || zoneId || serverId || '').trim();
  const targetReference = reference || ('R1CKKY-' + Date.now().toString().slice(-8));

  const combinedMatch = targetPlayerId.match(/^([^(]+)\s*\(([^)]+)\)$/);
  if (combinedMatch) {
    targetPlayerId = combinedMatch[1].trim();
    if (!targetServerId) {
      targetServerId = combinedMatch[2].trim();
    }
  }

  targetPlayerId = targetPlayerId.replace(/[\s()\[\]]/g, '');
  targetServerId = targetServerId ? targetServerId.replace(/[\s()\[\]]/g, '') : null;

  if (!targetPlayerId || !targetPackageId) {
    return res.status(400).json({ error: 'player_id and package_id are required' });
  }

  if (!API_KEY) {
    return res.json({
      order_code: 'SIM-' + Date.now().toString().slice(-8),
      status: 'processing',
      simulated: true,
      game: game || 'Game Top Up',
      package: 'Package #' + targetPackageId,
      player_id: targetPlayerId,
      server_id: targetServerId,
      reference: targetReference,
      message: 'Simulated order created locally.'
    });
  }

  try {
    const payload = {
      package_id: Number(targetPackageId),
      player_id: String(targetPlayerId),
      reference: targetReference
    };
    if (targetServerId) {
      payload.server_id = String(targetServerId);
    }

    const response = await fetch(`${API_URL}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Order Dispatch Error:', error);
    res.status(500).json({ error: 'Failed to dispatch top-up order', details: error.message });
  }
});

// 5. Query Order Status (GET /api/v1/orders/{order_code})
app.get('/api/topup/order-status/:orderCode', async (req, res) => {
  const { orderCode } = req.params;

  if (!API_KEY) {
    return res.json({
      order_code: orderCode,
      status: 'completed',
      simulated: true
    });
  }

  try {
    const response = await fetch(`${API_URL}/orders/${encodeURIComponent(orderCode)}`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      }
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Order Status Query Error:', error);
    res.status(500).json({ error: 'Failed to query order status', details: error.message });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`===========================================`);
  console.log(` R1ckky Store Server running at:`);
  console.log(` http://localhost:${PORT}`);
  console.log(` Provider URL: ${API_URL}`);
  console.log(` API Key: ${API_KEY ? 'Loaded (kt_***)' : 'Missing'}`);
  console.log(`===========================================`);
});

module.exports = app;
