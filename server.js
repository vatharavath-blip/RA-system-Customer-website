require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const QRCode = require('qrcode');
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;
const API_KEY = process.env.TOPUP_API_KEY;
const API_URL = process.env.TOPUP_API_URL || 'https://khmer-topup.com/api/v1';

// PayWay Payment Gateway System API Configuration
const PAYWAY_API_URL = (process.env.PAYWAY_API_URL || 'https://payway.payment-system.dev/api/v1').replace(/\/$/, '');
const PAYWAY_API_TOKEN = process.env.PAYWAY_API_TOKEN || '501b874f552921021559e05dbe2b4604a889221e5ca96a860a0e039e0ee21c0a';
const PAYWAY_LINK = process.env.PAYWAY_LINK || 'https://link.payway.com.kh/ABAPAYTh526248G';

// Realistic browser headers to prevent Cloudflare/WAF HTML 403 blocks on datacenter IPs
const PAYWAY_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache'
};

// Persistent Transaction Store (Maps md5 -> payment record for duplicate protection and order processing)
const PAYMENTS_FILE = path.join(__dirname, 'payments.json');
const paymentStore = new Map();

function savePayments() {
  try {
    const obj = Object.fromEntries(paymentStore);
    fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.error('Error saving payments.json:', e.message);
  }
}

function loadPayments() {
  try {
    if (fs.existsSync(PAYMENTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PAYMENTS_FILE, 'utf8'));
      for (const [k, v] of Object.entries(data)) {
        paymentStore.set(k, v);
      }
      console.log(`Loaded ${paymentStore.size} payment records from payments.json`);
    }
  } catch (e) {
    console.error('Error loading payments.json:', e.message);
  }
}

loadPayments();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));


// Tiered Profit Margin:
// Under $5.00: +$0.15 profit
// $5.00 - $9.99: +$0.25 profit
// $10.00 - $49.99: +$1.00 profit
// $50.00 and above: +$1.50 profit
function applyMarkup(basePrice) {
  const price = Number(basePrice) || 0;
  if (price <= 0) return 0;
  let markup = 0.15;
  if (price >= 50.0) {
    markup = 1.50;
  } else if (price >= 10.0) {
    markup = 1.00;
  } else if (price >= 5.0) {
    markup = 0.25;
  }
  return Number((price + markup).toFixed(2));
}

// CRC16-CCITT for Bakong KHQR EMVCo Standard
function crc16_ccitt(data) {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= (data.charCodeAt(i) << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Generate Dynamic NBC Bakong KHQR for POV KIMHOV (ABA Bank USD with Auto Amount)
function generateDynamicKhqr(amount) {
  const amtStr = Number(amount).toFixed(2);
  const tag54 = '54' + String(amtStr.length).padStart(2, '0') + amtStr;
  const now = Date.now();
  const expire = now + 15 * 60 * 1000; // 15 mins validity
  const tag99Val = '0013' + now + '0113' + expire;
  const tag99 = '99' + String(tag99Val.length).padStart(2, '0') + tag99Val;

  const parts = [
    '000201',
    '010212', // 12 = Dynamic QR (Auto Price)
    '30510016abaakhppxxx@abaa01151260917172414410208ABA Bank',
    '52044814',
    '5303840', // USD 840
    tag54,
    '5802KH',
    '5910POV KIMHOV',
    '6010BATTAMBANG',
    '624268380010PAYWAY@ABA010719916270209032528705',
    tag99,
    '6304'
  ];
  const raw = parts.join('');
  const crc = crc16_ccitt(raw);
  return raw + crc;
}

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
  return { code: null, name: null, flagUrl: null, emoji: '' };
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
      const markedUpPackages = (g.packages || []).map(pkg => ({
        ...pkg,
        base_price: pkg.price,
        price: applyMarkup(pkg.price)
      }));
      return {
        ...g,
        packages: markedUpPackages,
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
    const markedUpPackages = (game.packages || []).map(pkg => ({
      ...pkg,
      base_price: pkg.price,
      price: applyMarkup(pkg.price)
    }));

    res.json({
      ...game,
      packages: markedUpPackages,
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

// Core Helper: Direct Top-Up Order Execution with Khmer Top-Up API
async function executeTopUpOrder({ packageId, playerId, serverId, zoneId, reference, game, slug }) {
  let targetPlayerId = String(playerId || '').trim();
  let targetServerId = String(serverId || zoneId || '').trim();
  const targetPackageId = packageId;
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
    throw new Error('player_id and package_id are required');
  }

  if (!API_KEY) {
    return {
      order_code: 'SIM-' + Date.now().toString().slice(-8),
      status: 'processing',
      simulated: true,
      game: game || 'Game Top Up',
      package: 'Package #' + targetPackageId,
      player_id: targetPlayerId,
      server_id: targetServerId,
      reference: targetReference,
      message: 'Simulated order created locally.'
    };
  }

  const payload = {
    package_id: Number(targetPackageId),
    player_id: String(targetPlayerId),
    reference: targetReference
  };
  if (targetServerId) {
    payload.server_id = String(targetServerId);
  }

  console.log(`[Top-Up Provider] Fulfilling order for player ${targetPlayerId} (package ${targetPackageId}):`, payload);
  const response = await fetch(`${API_URL}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  console.log(`[Top-Up Provider] Order response:`, data);
  return { status: response.status, data };
}

// 4. Place Top-Up Order (POST /api/v1/orders)
app.post('/api/topup/order', async (req, res) => {
  const { package_id, packageId, player_id, playerId, server_id, zoneId, serverId, reference, game, slug } = req.body;
  try {
    const result = await executeTopUpOrder({
      packageId: package_id || packageId,
      playerId: player_id || playerId,
      serverId: server_id || zoneId || serverId,
      reference,
      game,
      slug
    });
    if (result.status) {
      return res.status(result.status).json(result.data);
    }
    return res.json(result);
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

// 6. PayWay Payment System API Endpoints

// 6.1 Create Payment & Generate Dynamic KHQR (Auto-filled Price)
app.post('/api/payment/create', async (req, res) => {
  try {
    const { amount, orderId, reference, game, slug, playerId, zoneId, packageId, packageName } = req.body;
    const numAmount = Number(amount) || 0;
    if (numAmount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    const amtStr = numAmount.toFixed(2);
    const billNumber = orderId || reference || ('INV-' + Date.now());

    // 1. If PAYWAY_API_TOKEN is configured, call external PayWay Payment System API
    if (PAYWAY_API_TOKEN) {
      try {
        const externalUrl = `${PAYWAY_API_URL}/generate_qr/?payway_link=${encodeURIComponent(PAYWAY_LINK)}&amount=${amtStr}&api_token=${encodeURIComponent(PAYWAY_API_TOKEN)}`;
        console.log(`[PayWay Generate] Calling external API for amount $${amtStr}`);
        const extResp = await fetch(externalUrl, {
          headers: PAYWAY_HEADERS,
          signal: AbortSignal.timeout(35000)
        });
        const rawText = await extResp.text();
        let extData = null;
        try {
          extData = JSON.parse(rawText);
        } catch (jsonErr) {
          console.error(`[PayWay] Generate returned non-JSON (Status ${extResp.status}):`, rawText.substring(0, 250));
          throw new Error(`PayWay generate returned status ${extResp.status}`);
        }

        if (extData && (extData.success === true || extData.qr_string)) {
          const md5Val = extData.md5;
          if (!md5Val) {
            console.error('PayWay external API did not return md5:', extData);
            throw new Error('PayWay API missing official md5');
          }
          console.log(`[PayWay] Captured official MD5 directly from Generate: ${md5Val} (Invoice: ${extData.bill_number})`);
          const linkQrCode = extData.link_qr_code || `${PAYWAY_API_URL}/qr/${md5Val}.png`;

          // Store transaction record with duplicate protection
          paymentStore.set(md5Val, {
            id: billNumber,
            billNumber: extData.bill_number || billNumber,
            md5: md5Val,
            paywayLink: PAYWAY_LINK,
            amount: numAmount,
            currency: extData.currency || 'USD',
            status: 'pending',
            qrString: extData.qr_string,
            linkQrCode: linkQrCode,
            downloadQr: extData.download_qr || linkQrCode,
            checkout: extData.checkout || null,
            deeplinkAba: extData.deeplink_aba || PAYWAY_LINK,
            deeplinkBakong: extData.deeplink_bakong || null,
            expireInSec: Number(extData.expire_in_sec) || 180,
            expireDate: extData.expire_date || new Date(Date.now() + 180000).toISOString(),
            checkCount: 0,
            lastCheckAt: null,
            paidAt: null,
            createdAt: new Date().toISOString(),
            orderFulfilled: false,
            orderDetails: { game, slug, playerId, zoneId, packageId, packageName, orderId: billNumber }
          });
          savePayments();

          return res.json({
            success: true,
            status: 'pending',
            md5: md5Val,
            bill_number: extData.bill_number || billNumber,
            amount: amtStr,
            currency: extData.currency || 'USD',
            qr_string: extData.qr_string,
            link_qr_code: linkQrCode,
            download_qr: extData.download_qr || linkQrCode,
            checkout: extData.checkout || null,
            deeplink_aba: extData.deeplink_aba || PAYWAY_LINK,
            deeplink_bakong: extData.deeplink_bakong || null,
            expire_in_sec: Number(extData.expire_in_sec) || 180,
            expire_date: extData.expire_date || null
          });
        }
      } catch (extErr) {
        console.warn('PayWay external API call error, using local NBC Bakong dynamic engine:', extErr.message);
      }
    }

    // 2. High-reliability NBC Bakong Dynamic KHQR Engine (Auto-Price Embedded)
    const dynamicKhqr = generateDynamicKhqr(numAmount);
    const md5Val = crypto.createHash('md5').update(billNumber + amtStr + Date.now()).digest('hex');
    const expireSec = 180;
    const expireDate = new Date(Date.now() + expireSec * 1000).toISOString();

    paymentStore.set(md5Val, {
      id: billNumber,
      billNumber: billNumber,
      md5: md5Val,
      paywayLink: PAYWAY_LINK,
      amount: numAmount,
      currency: 'USD',
      status: 'pending',
      qrString: dynamicKhqr,
      downloadQr: null,
      checkout: null,
      deeplinkAba: PAYWAY_LINK,
      deeplinkBakong: null,
      expireInSec: expireSec,
      expireDate: expireDate,
      checkCount: 0,
      lastCheckAt: null,
      paidAt: null,
      createdAt: new Date().toISOString(),
      orderFulfilled: false,
      orderDetails: { game, slug, playerId, zoneId, packageId, packageName, orderId: billNumber }
    });
    savePayments();

    res.json({
      success: true,
      status: 'pending',
      md5: md5Val,
      bill_number: billNumber,
      amount: amtStr,
      currency: 'USD',
      qr_string: dynamicKhqr,
      download_qr: null,
      checkout: null,
      deeplink_aba: PAYWAY_LINK,
      deeplink_bakong: null,
      expire_in_sec: expireSec,
      expire_date: expireDate
    });
  } catch (err) {
    console.error('Payment Create Error:', err);
    res.status(500).json({ success: false, error: 'Failed to create payment', details: err.message });
  }
});

// Legacy Alias
app.post('/api/payment/generate-khqr', (req, res, next) => {
  req.url = '/api/payment/create';
  app.handle(req, res, next);
});

// 6.2 Check Transaction Status (Idempotent with Duplicate Protection)
app.post('/api/payment/check', async (req, res) => {
  try {
    const { md5 } = req.body;
    if (!md5) {
      return res.status(400).json({ success: false, error: 'md5 parameter is required' });
    }

    const payment = paymentStore.get(md5);
    if (payment) {
      payment.checkCount = (payment.checkCount || 0) + 1;
      payment.lastCheckAt = new Date().toISOString();
    }

    // 10. If already confirmed SUCCESS, return idempotent response
    if (payment && payment.status === 'success') {
      return res.json({
        success: true,
        status: 'success',
        amount: payment.amount,
        currency: payment.currency,
        bill_number: payment.billNumber,
        transaction_hash: payment.transactionHash || null
      });
    }

    // Call PayWay check_transaction_by_md5 if API token is configured
    if (PAYWAY_API_TOKEN) {
      try {
        const checkUrl = `${PAYWAY_API_URL}/check_transaction_by_md5/?md5=${encodeURIComponent(md5)}&api_token=${encodeURIComponent(PAYWAY_API_TOKEN)}`;
        console.log(`[PayWay Check] Polling transaction status with MD5: ${md5}`);
        const extResp = await fetch(checkUrl, {
          headers: PAYWAY_HEADERS,
          signal: AbortSignal.timeout(35000)
        });
        const rawText = await extResp.text();
        let extData = null;
        try {
          extData = JSON.parse(rawText);
        } catch (jsonErr) {
          console.warn(`[PayWay Check] Check returned non-JSON (Status ${extResp.status}):`, rawText.substring(0, 200));
        }
        if (extData) {
          console.log(`[PayWay Check] Result for MD5 ${md5}:`, extData);
        }

        // When Paid: responseCode === 0 (or "0")
        if (extData && Number(extData.responseCode) === 0) {
          const tx = extData.data || {};
          console.log(`[PayWay Check] Payment SUCCESS confirmed by responseCode === 0:`, tx);

          if (payment) {
            payment.status = 'success';
            payment.transactionHash = tx.hash || null;
            payment.receiptUrl = tx.download_receipt || null;
            payment.paidAt = tx.acknowledgedDateMs ? new Date(tx.acknowledgedDateMs).toISOString() : new Date().toISOString();
            payment.paywayData = tx;
            savePayments();

            // Auto-fulfill Game Top-Up Order (Direct API fulfillment with idempotent protection)
            if (!payment.orderFulfilled && payment.orderDetails && payment.orderDetails.playerId) {
              payment.orderFulfilled = true;
              savePayments();
              executeTopUpOrder({
                packageId: payment.orderDetails.packageId,
                playerId: payment.orderDetails.playerId,
                serverId: payment.orderDetails.zoneId || null,
                zoneId: payment.orderDetails.zoneId || null,
                reference: payment.billNumber,
                game: payment.orderDetails.game,
                slug: payment.orderDetails.slug
              }).then(topupRes => {
                if (topupRes && topupRes.data) {
                  payment.orderCode = topupRes.data.order_code || topupRes.data.id || null;
                  payment.topupStatus = topupRes.data.status || 'completed';
                  savePayments();
                }
              }).catch(e => console.warn('Auto topup dispatch notice:', e.message));
            }
          }

          return res.json({
            success: true,
            status: 'success',
            responseCode: 0,
            amount: tx.amount || (payment ? payment.amount : null),
            currency: tx.currency || (payment ? payment.currency : 'USD'),
            bill_number: tx.description || (payment ? payment.billNumber : null),
            transaction_hash: tx.hash || null,
            download_receipt: tx.download_receipt || null
          });
        }

        // When Not Paid Yet: responseCode === 1 (PENDING)
        if (extData && Number(extData.responseCode) === 1) {
          if (payment && payment.expireDate && Date.now() > new Date(payment.expireDate).getTime()) {
            payment.status = 'expired';
            savePayments();
            return res.json({ success: true, status: 'expired', responseCode: 1 });
          }
          return res.json({ success: true, status: 'pending', responseCode: 1 });
        }
      } catch (extErr) {
        console.warn('PayWay check API error:', extErr.message);
      }
    }

    // Expiration check for active transactions
    if (payment && payment.expireDate && Date.now() > new Date(payment.expireDate).getTime()) {
      payment.status = 'expired';
      savePayments();
      return res.json({ success: true, status: 'expired' });
    }

    return res.json({ success: true, status: payment ? payment.status : 'pending' });
  } catch (err) {
    console.error('Payment Check Error:', err);
    res.status(500).json({ success: false, error: 'Failed to check payment status', details: err.message });
});

// 6.3 Direct Payment Confirmation (Client-Side Direct Verification Fallback)
app.post('/api/payment/confirm', async (req, res) => {
  try {
    const { md5, hash, download_receipt, txData } = req.body;
    if (!md5) return res.status(400).json({ success: false, error: 'md5 is required' });

    let payment = paymentStore.get(md5);
    if (!payment) {
      console.warn(`[Payment Confirm] Payment record for MD5 ${md5} not in memory, attempting fallback.`);
    }

    if (payment && payment.status === 'success') {
      return res.json({ success: true, status: 'success', bill_number: payment.billNumber });
    }

    if (payment) {
      payment.status = 'success';
      payment.transactionHash = hash || (txData && txData.hash) || payment.transactionHash || null;
      payment.receiptUrl = download_receipt || (txData && txData.download_receipt) || null;
      payment.paidAt = new Date().toISOString();
      savePayments();

      // Auto-fulfill Game Top-Up Order
      if (!payment.orderFulfilled && payment.orderDetails && payment.orderDetails.playerId) {
        payment.orderFulfilled = true;
        savePayments();
        executeTopUpOrder({
          packageId: payment.orderDetails.packageId,
          playerId: payment.orderDetails.playerId,
          serverId: payment.orderDetails.zoneId || null,
          zoneId: payment.orderDetails.zoneId || null,
          reference: payment.billNumber,
          game: payment.orderDetails.game,
          slug: payment.orderDetails.slug
        }).then(topupRes => {
          if (topupRes && topupRes.data) {
            payment.orderCode = topupRes.data.order_code || topupRes.data.id || null;
            payment.topupStatus = topupRes.data.status || 'completed';
            savePayments();
          }
        }).catch(e => console.warn('Auto topup confirm dispatch notice:', e.message));
      }
    }

    return res.json({ success: true, status: 'success' });
  } catch (err) {
    console.error('Payment Confirm Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
// 6.3 Get Payment Status by MD5
app.get('/api/payment/status', (req, res) => {
  const md5 = req.query.md5;
  if (!md5 || !paymentStore.has(md5)) {
    return res.status(404).json({ success: false, error: 'Transaction not found' });
  }
  const p = paymentStore.get(md5);
  res.json({
    success: true,
    status: p.status,
    bill_number: p.billNumber,
    amount: p.amount,
    currency: p.currency,
    created_at: p.createdAt,
    paid_at: p.paidAt || null,
    transaction_hash: p.transactionHash || null
  });
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
