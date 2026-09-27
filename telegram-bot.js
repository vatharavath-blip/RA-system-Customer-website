/**
 * Telegram Admin Bot for R1ckky Store
 * - Real-time order notifications with profit calculation
 * - Live Khmer Top Up wallet balance check
 * - Track expenses: Apsara hosting, domain registration/renewal, server costs
 * - Record & note deposits made into Khmer Top Up balance
 * - Net profit calculation (Gross Profit - Expenses)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Storage file paths
const DATA_DIR = path.join(__dirname, 'data');
const EXPENSES_FILE = path.join(DATA_DIR, 'expenses.json');
const DEPOSITS_FILE = path.join(DATA_DIR, 'deposits.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders_history.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Helpers for reading/writing JSON files safely
function loadJson(file, defaultValue = []) {
  try {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error(`[TelegramBot] Failed to read ${file}:`, e.message);
  }
  return defaultValue;
}

function saveJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error(`[TelegramBot] Failed to save ${file}:`, e.message);
  }
}

// Telegram Bot Configuration
let BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
let ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || '';
const TOPUP_API_KEY = process.env.TOPUP_API_KEY || '';
const TOPUP_API_URL = (process.env.TOPUP_API_URL || 'https://khmer-topup.com/api/v1').replace(/\/$/, '');

let isPolling = false;
let pollingAbortCtrl = null;
let lastUpdateId = 0;

// Check if a chat ID is authorized admin
function isAdmin(chatId) {
  if (!ADMIN_CHAT_ID) return true; // If not set yet, allow to configure
  const authorized = String(ADMIN_CHAT_ID).split(',').map(s => s.trim());
  return authorized.includes(String(chatId));
}

// Telegram API Wrapper using native fetch
async function callTelegram(method, payload = {}) {
  if (!BOT_TOKEN) return null;
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45000)
    });
    const data = await res.json();
    if (!data.ok) {
      console.warn(`[TelegramBot] API Error (${method}):`, data.description);
    }
    return data;
  } catch (err) {
    console.warn(`[TelegramBot] Network error (${method}):`, err.message);
    return null;
  }
}

// Send Telegram Message helper
async function sendMessage(chatId, text, options = {}) {
  return await callTelegram('sendMessage', {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML',
    ...options
  });
}

// Fetch Live Khmer Top Up Balance from /me
async function fetchProviderBalance() {
  if (!TOPUP_API_KEY) {
    return { success: false, message: 'TOPUP_API_KEY មិនទាន់បានកំណត់' };
  }
  try {
    const res = await fetch(`${TOPUP_API_URL}/me`, {
      headers: {
        'Authorization': `Bearer ${TOPUP_API_KEY}`,
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) {
      return { success: false, message: `Provider error HTTP ${res.status}` };
    }
    const data = await res.json();
    return {
      success: true,
      username: data.username || 'Admin',
      balance: Number(data.balance) || 0,
      currency: data.currency || 'USD'
    };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ── Expense Management ──────────────────────────────────
function getExpenses() {
  return loadJson(EXPENSES_FILE, []);
}

function addExpense(amount, category, note) {
  const expenses = getExpenses();
  const newExp = {
    id: 'exp_' + Date.now(),
    amount: Number(amount) || 0,
    category: category || 'General',
    note: note || '',
    createdAt: new Date().toISOString(),
    formattedDate: new Date().toLocaleDateString('km-KH', {
      timeZone: 'Asia/Phnom_Penh',
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  };
  expenses.unshift(newExp);
  saveJson(EXPENSES_FILE, expenses);
  return newExp;
}

function getTotalExpenses() {
  const expenses = getExpenses();
  let total = 0;
  let byCategory = {
    'Apsara Hosting': 0,
    'Domain': 0,
    'Server': 0,
    'Other': 0
  };

  expenses.forEach(e => {
    const amt = Number(e.amount) || 0;
    total += amt;
    const cat = (e.category || '').toLowerCase();
    if (cat.includes('hosting') || cat.includes('apsara')) {
      byCategory['Apsara Hosting'] += amt;
    } else if (cat.includes('domain') || cat.includes('ដូម៉េន')) {
      byCategory['Domain'] += amt;
    } else if (cat.includes('server')) {
      byCategory['Server'] += amt;
    } else {
      byCategory['Other'] += amt;
    }
  });

  return { total, byCategory, count: expenses.length };
}

// ── Deposit Management (Note ប្រាក់ដែលបានដាក់ចូល Balance) ─
function getDeposits() {
  return loadJson(DEPOSITS_FILE, []);
}

function addDeposit(amount, note, method = 'Bank Transfer') {
  const deposits = getDeposits();
  const newDep = {
    id: 'dep_' + Date.now(),
    amount: Number(amount) || 0,
    method: method,
    note: note || '',
    createdAt: new Date().toISOString(),
    formattedDate: new Date().toLocaleDateString('km-KH', {
      timeZone: 'Asia/Phnom_Penh',
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  };
  deposits.unshift(newDep);
  saveJson(DEPOSITS_FILE, deposits);
  return newDep;
}

function getTotalDeposits() {
  const deposits = getDeposits();
  let total = 0;
  deposits.forEach(d => {
    total += Number(d.amount) || 0;
  });
  return { total, count: deposits.length };
}

// ── Orders & Profit History ─────────────────────────────
function getOrders() {
  return loadJson(ORDERS_FILE, []);
}

function recordOrder(order) {
  const orders = getOrders();
  // Avoid duplicate records
  const existing = orders.find(o => o.orderId === order.orderId || (order.billNumber && o.billNumber === order.billNumber));
  if (existing) return existing;

  const sellPrice = Number(order.sellPrice || order.amount || 0);
  const baseCost = Number(order.baseCost || 0);
  const profit = Number((sellPrice - baseCost).toFixed(2));

  const newOrder = {
    id: 'ord_' + Date.now(),
    orderId: order.orderId || order.billNumber || ('INV-' + Date.now()),
    billNumber: order.billNumber || order.orderId || '',
    game: order.game || 'Game Top Up',
    packageName: order.packageName || 'Diamond Package',
    playerId: order.playerId || '',
    zoneId: order.zoneId || '',
    sellPrice: sellPrice,
    baseCost: baseCost,
    profit: profit,
    status: order.status || 'completed',
    createdAt: new Date().toISOString(),
    formattedDate: new Date().toLocaleDateString('km-KH', {
      timeZone: 'Asia/Phnom_Penh',
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  };

  orders.unshift(newOrder);
  saveJson(ORDERS_FILE, orders);
  return newOrder;
}

function getProfitSummary() {
  const orders = getOrders();
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const thisMonthStr = todayStr.substring(0, 7);

  let todayRevenue = 0, todayCost = 0, todayProfit = 0, todayCount = 0;
  let monthRevenue = 0, monthCost = 0, monthProfit = 0, monthCount = 0;
  let allRevenue = 0, allCost = 0, allProfit = 0, allCount = orders.length;

  orders.forEach(o => {
    const sell = Number(o.sellPrice) || 0;
    const cost = Number(o.baseCost) || 0;
    const prof = Number(o.profit) || (sell - cost);
    const date = o.createdAt ? o.createdAt.split('T')[0] : '';

    allRevenue += sell;
    allCost += cost;
    allProfit += prof;

    if (date === todayStr) {
      todayRevenue += sell;
      todayCost += cost;
      todayProfit += prof;
      todayCount++;
    }

    if (date.startsWith(thisMonthStr)) {
      monthRevenue += sell;
      monthCost += cost;
      monthProfit += prof;
      monthCount++;
    }
  });

  return {
    today: { revenue: todayRevenue, cost: todayCost, profit: todayProfit, count: todayCount },
    month: { revenue: monthRevenue, cost: monthCost, profit: monthProfit, count: monthCount },
    allTime: { revenue: allRevenue, cost: allCost, profit: allProfit, count: allCount }
  };
}

// ── Interactive Keyboard Menu ───────────────────────────
function getMainKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: '📊 របាយការណ៍ប្រាក់ចំណេញ' }, { text: '💰 ពិនិត្យ Balance' }],
        [{ text: '💸 ចំណាយ Hosting/Domain' }, { text: '📥 ប្រវត្តិដាក់លុយ Balance' }],
        [{ text: '📈 សរុបប្រាក់ចំណេញសុទ្ធ' }, { text: '📋 Order ចុងក្រោយ' }],
        [{ text: 'ℹ️ របៀបប្រើ Bot (Help)' }]
      ],
      resize_keyboard: true,
      persistent: true
    }
  };
}

// ── Telegram Real-Time Order Notification ───────────────
async function notifyNewOrder(order) {
  if (!BOT_TOKEN) return;
  // Automatically record to persistent orders history
  const saved = recordOrder(order);

  // Live provider wallet balance check
  const wallet = await fetchProviderBalance();
  const balanceStr = wallet.success ? `$${wallet.balance.toFixed(2)} USD` : 'N/A';

  const text = 
`🎉 <b>ការកម្ម៉ង់ថ្មីជោគជ័យ! (New Order Fulfilled)</b>
━━━━━━━━━━━━━━━━━━━━
🎮 <b>ហ្គេម:</b> ${escapeHtml(order.game || 'Game Top Up')}
📦 <b>កញ្ចប់:</b> ${escapeHtml(order.packageName || 'Diamond Package')}
👤 <b>Player ID:</b> <code>${escapeHtml(order.playerId || '-')}${order.zoneId ? ` (${escapeHtml(order.zoneId)})` : ''}</code>
${order.playerNickname ? `🏷️ <b>ឈ្មោះ:</b> <code>${escapeHtml(order.playerNickname)}</code>\n` : ''}
💵 <b>អតិថិជនបង់:</b> <b>$${Number(saved.sellPrice).toFixed(2)}</b>
🏷️ <b>ថ្លៃដើម (Provider):</b> $${Number(saved.baseCost).toFixed(2)}
💰 <b>ប្រាក់ចំណេញ:</b> <span class="tg-spoiler"><b>+$${Number(saved.profit).toFixed(2)}</b></span>
━━━━━━━━━━━━━━━━━━━━
🧾 <b>វិក្កយបត្រ:</b> <code>${escapeHtml(order.billNumber || order.orderId || '-')}</code>
🏦 <b>Balance នៅសល់ក្នុង Wallet:</b> <b>${balanceStr}</b>
⏰ <b>កាលបរិច្ឆេទ:</b> ${saved.formattedDate || new Date().toLocaleString('km-KH', { timeZone: 'Asia/Phnom_Penh' })}`;

  const targetChats = ADMIN_CHAT_ID ? String(ADMIN_CHAT_ID).split(',').map(s => s.trim()) : [];
  for (const chatId of targetChats) {
    if (chatId) {
      await sendMessage(chatId, text);
    }
  }
}

// HTML Escaping
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Message Handlers ────────────────────────────────────
async function handleMessage(msg) {
  const chatId = msg.chat?.id;
  const text = (msg.text || '').trim();
  const user = msg.from?.first_name || 'Admin';

  if (!chatId || !text) return;

  console.log(`[TelegramBot] Message from ${user} (${chatId}): ${text}`);

  // Auto-register first admin if ADMIN_CHAT_ID is empty
  if (!ADMIN_CHAT_ID) {
    ADMIN_CHAT_ID = String(chatId);
    console.log(`[TelegramBot] First admin auto-claimed: ${chatId}`);
  }

  // 1. /start or /menu or ម៉ឺនុយដើម
  if (text === '/start' || text === '/menu' || text.includes('ម៉ឺនុយ')) {
    const welcome = 
`👋 <b>សួស្តី ${escapeHtml(user)}!</b>
សូមស្វាគមន៍មកកាន់ <b>R1ckky Store Admin Bot</b> 🤖

Bot នេះជួយសម្រួលការងារលោកអ្នក៖
• 📊 មើលប្រាក់ចំណេញពីការលក់ពេជ្រ
• 💰 ពិនិត្យ Balance ផ្ទាល់ក្នុង Khmer Top Up
• 💸 កត់ត្រាចំណាយ (Apsara Hosting, Domain, Server)
• 📥 កត់ត្រាប្រាក់ដែលបានដាក់ចូល Balance
• 📈 គណនាប្រាក់ចំណេញសុទ្ធ (Net Profit)
• 🔔 ទទួលដំណឹង Real-time ពេលមាន Order ថ្មី

<i>ចុចប៊ូតុងខាងក្រោម ឬវាយបញ្ជា /help ដើម្បីមើលបន្ថែម។</i>`;
    return await sendMessage(chatId, welcome, getMainKeyboard());
  }

  // 2. 💰 ពិនិត្យ Balance ឬ /balance
  if (text === '💰 ពិនិត្យ Balance' || text === '/balance') {
    const wallet = await fetchProviderBalance();
    const deposits = getTotalDeposits();

    if (!wallet.success) {
      return await sendMessage(chatId, `❌ <b>មិនអាចទាញយក Balance បានទេ:</b>\n${wallet.message}`, getMainKeyboard());
    }

    const isLow = wallet.balance < 5.0;
    const balanceMsg = 
`🏦 <b>ព័ត៌មានសមតុល្យ (Khmer Top Up Wallet)</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>គណនី:</b> <code>${escapeHtml(wallet.username)}</code>
💵 <b>Balance បច្ចុប្បន្ន:</b> <b>$${wallet.balance.toFixed(2)} ${wallet.currency}</b>
${isLow ? '⚠️ <b>ការព្រមាន:</b> សមតុល្យនៅសល់តិច (< $5.00) សូមដាក់បន្ថែម!\n' : '✅ <b>ស្ថានភាព:</b> សមតុល្យគ្រប់គ្រាន់សម្រាប់លក់\n'}
📥 <b>ប្រាក់ដាក់ចូលសរុប (Note):</b> $${deposits.total.toFixed(2)} (${deposits.count} ដង)
━━━━━━━━━━━━━━━━━━━━
💡 <i>ដើម្បីកត់ត្រាការដាក់លុយចូល Balance វាយ:</i>
<code>/deposit &lt;ចំនួនលុយ&gt; [កំណត់ចំណាំ]</code>
<i>ឧទាហរណ៍:</i> <code>/deposit 50.00 ដាក់តាម ABA</code>`;
    return await sendMessage(chatId, balanceMsg, getMainKeyboard());
  }

  // 3. 📊 របាយការណ៍ប្រាក់ចំណេញ ឬ /profit
  if (text === '📊 របាយការណ៍ប្រាក់ចំណេញ' || text === '/profit') {
    const summary = getProfitSummary();
    const msgText = 
`📊 <b>របាយការណ៍ប្រាក់ចំណេញ (Profit & Revenue)</b>
━━━━━━━━━━━━━━━━━━━━
📅 <b>ថ្ងៃនេះ (Today):</b>
• ចំនួន Order: <b>${summary.today.count}</b>
• ចំណូលសរុប: <b>$${summary.today.revenue.toFixed(2)}</b>
• ថ្លៃដើម Provider: $${summary.today.cost.toFixed(2)}
• 💰 <b>ចំណេញសុទ្ធ: +$${summary.today.profit.toFixed(2)}</b>

🗓️ <b>ខែនេះ (This Month):</b>
• ចំនួន Order: <b>${summary.month.count}</b>
• ចំណូលសរុប: <b>$${summary.month.revenue.toFixed(2)}</b>
• ថ្លៃដើម Provider: $${summary.month.cost.toFixed(2)}
• 💰 <b>ចំណេញសុទ្ធ: +$${summary.month.profit.toFixed(2)}</b>

🌟 <b>សរុបតាំងពីដើមមក (All Time):</b>
• ចំនួន Order សរុប: <b>${summary.allTime.count}</b>
• ចំណូលលក់សរុប: <b>$${summary.allTime.revenue.toFixed(2)}</b>
• ថ្លៃដើមសរុប: $${summary.allTime.cost.toFixed(2)}
• 💰 <b>ចំណេញសរុប: +$${summary.allTime.profit.toFixed(2)}</b>
━━━━━━━━━━━━━━━━━━━━
👉 ចុច <b>📈 សរុបប្រាក់ចំណេញសុទ្ធ</b> ដើម្បីកាត់កងថ្លៃ Hosting និង Domain!`;
    return await sendMessage(chatId, msgText, getMainKeyboard());
  }

  // 4. 💸 ចំណាយ Hosting/Domain ឬ /expenses
  if (text === '💸 ចំណាយ Hosting/Domain' || text === '/expenses') {
    const expData = getTotalExpenses();
    const expenses = getExpenses().slice(0, 10);

    let recentList = '';
    if (expenses.length === 0) {
      recentList = '<i>មិនទាន់មានទិន្នន័យចំណាយនៅឡើយទេ។</i>';
    } else {
      recentList = expenses.map((e, idx) => 
        `${idx + 1}. <b>$${Number(e.amount).toFixed(2)}</b> - <b>${escapeHtml(e.category)}</b>\n   └ <i>${escapeHtml(e.note || 'គ្មានកំណត់ចំណាំ')}</i> (${e.formattedDate})`
      ).join('\n');
    }

    const expMsg = 
`💸 <b>របាយការណ៍ចំណាយលើ Hosting & Domain</b>
━━━━━━━━━━━━━━━━━━━━
🌐 <b>Apsara Hosting:</b> <b>$${expData.byCategory['Apsara Hosting'].toFixed(2)}</b>
🔗 <b>Domain:</b> <b>$${expData.byCategory['Domain'].toFixed(2)}</b>
🖥️ <b>Server ផ្សេងៗ:</b> $${expData.byCategory['Server'].toFixed(2)}
📦 <b>ចំណាយផ្សេងៗ:</b> $${expData.byCategory['Other'].toFixed(2)}
━━━━━━━━━━━━━━━━━━━━
🔴 <b>ចំណាយសរុបទាំងអស់:</b> <b>$${expData.total.toFixed(2)}</b> (${expData.count} កំណត់ត្រា)

📋 <b>ប្រវត្តិចំណាយ ១០ ចុងក្រោយ:</b>
${recentList}

━━━━━━━━━━━━━━━━━━━━
💡 <b>របៀបកត់ត្រាចំណាយថ្មី:</b>
<code>/expense &lt;ចំនួនលុយ&gt; &lt;ប្រភេទ&gt; [កំណត់ចំណាំ]</code>
<i>ឧទាហរណ៍:</i>
<code>/expense 12.00 Apsara hosting ប្រចាំខែ</code>
<code>/expense 9.50 Domain r1ckkytopup.xyz</code>`;
    return await sendMessage(chatId, expMsg, getMainKeyboard());
  }

  // 5. 📥 ប្រវត្តិដាក់លុយ Balance ឬ /deposits
  if (text === '📥 ប្រវត្តិដាក់លុយ Balance' || text === '/deposits') {
    const depData = getTotalDeposits();
    const deposits = getDeposits().slice(0, 10);
    const wallet = await fetchProviderBalance();

    let recentList = '';
    if (deposits.length === 0) {
      recentList = '<i>មិនទាន់មានកំណត់ត្រាដាក់ប្រាក់នៅឡើយទេ។</i>';
    } else {
      recentList = deposits.map((d, idx) => 
        `${idx + 1}. <b>+$${Number(d.amount).toFixed(2)}</b> (${escapeHtml(d.method)})\n   └ <i>${escapeHtml(d.note || 'គ្មានកំណត់ចំណាំ')}</i> (${d.formattedDate})`
      ).join('\n');
    }

    const depMsg = 
`📥 <b>កំណត់ត្រាដាក់ប្រាក់ចូល Khmer Top Up Balance</b>
━━━━━━━━━━━━━━━━━━━━
💰 <b>សមតុល្យ Balance បច្ចុប្បន្ន:</b> <b>$${wallet.success ? wallet.balance.toFixed(2) : 'N/A'} USD</b>
📥 <b>ប្រាក់ដាក់ចូលសរុបទាំងអស់:</b> <b>$${depData.total.toFixed(2)}</b> (${depData.count} ដង)

📋 <b>ប្រវត្តិដាក់ប្រាក់ ១០ ចុងក្រោយ:</b>
${recentList}

━━━━━━━━━━━━━━━━━━━━
💡 <b>របៀបកត់ត្រាពេលដាក់លុយរួច:</b>
<code>/deposit &lt;ចំនួនលុយ&gt; [កំណត់ចំណាំ]</code>
<i>ឧទាហរណ៍:</i>
<code>/deposit 50.00 ដាក់តាម ABA Bank</code>
<code>/deposit 20.00 ថ្ងៃ ២៧/០៩</code>`;
    return await sendMessage(chatId, depMsg, getMainKeyboard());
  }

  // 6. 📈 សរុបប្រាក់ចំណេញសុទ្ធ ឬ /net
  if (text === '📈 សរុបប្រាក់ចំណេញសុទ្ធ' || text === '/net') {
    const summary = getProfitSummary();
    const expData = getTotalExpenses();
    const depData = getTotalDeposits();
    const wallet = await fetchProviderBalance();

    const grossProfit = summary.allTime.profit;
    const totalExpenses = expData.total;
    const netProfit = Number((grossProfit - totalExpenses).toFixed(2));
    const isNetPositive = netProfit >= 0;

    const netMsg = 
`📈 <b>គណនាប្រាក់ចំណេញសុទ្ធ (Net Profit Breakdown)</b>
━━━━━━━━━━━━━━━━━━━━
💵 <b>ចំណូលលក់សរុប (Revenue):</b> $${summary.allTime.revenue.toFixed(2)}
💎 <b>ថ្លៃដើមទិញពេជ្រ (Cost):</b> $${summary.allTime.cost.toFixed(2)}
💰 <b>ចំណេញដុលពីការលក់ (Gross Profit):</b> <b>+$${grossProfit.toFixed(2)}</b>

━━━━━━━━━━━━━━━━━━━━
💸 <b>ចំណាយទូទៅ (Total Expenses):</b> <b>-$${totalExpenses.toFixed(2)}</b>
  • Apsara Hosting: -$${expData.byCategory['Apsara Hosting'].toFixed(2)}
  • Domain Name: -$${expData.byCategory['Domain'].toFixed(2)}
  • ផ្សេងៗ: -$${(expData.byCategory['Server'] + expData.byCategory['Other']).toFixed(2)}

━━━━━━━━━━━━━━━━━━━━
🏆 <b>ប្រាក់ចំណេញសុទ្ធពិតប្រាកដ (NET PROFIT):</b>
<b>${isNetPositive ? '🟢 +' : '🔴 '}$${netProfit.toFixed(2)} USD</b>

🏦 <b>ស្ថានភាព Balance Provider:</b>
  • ដាក់ចូលសរុប: $${depData.total.toFixed(2)}
  • សល់ក្នុង Wallet ជាក់ស្តែង: $${wallet.success ? wallet.balance.toFixed(2) : 'N/A'}`;
    return await sendMessage(chatId, netMsg, getMainKeyboard());
  }

  // 7. 📋 Order ចុងក្រោយ ឬ /orders
  if (text === '📋 Order ចុងក្រោយ' || text === '/orders') {
    const orders = getOrders().slice(0, 8);
    if (orders.length === 0) {
      return await sendMessage(chatId, '📋 <b>មិនទាន់មាន Order នៅក្នុងប្រវត្តិនៅឡើយទេ។</b>', getMainKeyboard());
    }

    const list = orders.map((o, idx) => 
`<b>#${idx + 1} ${escapeHtml(o.game)}</b> (${escapeHtml(o.packageName)})
👤 Player: <code>${escapeHtml(o.playerId)}${o.zoneId ? ` (${escapeHtml(o.zoneId)})` : ''}</code>
💵 បង់: $${Number(o.sellPrice).toFixed(2)} | ថ្លៃដើម: $${Number(o.baseCost).toFixed(2)} | 💰 ចំណេញ: <b>+$${Number(o.profit).toFixed(2)}</b>
⏰ <i>${o.formattedDate || o.createdAt}</i>`
    ).join('\n\n');

    const msgText = 
`📋 <b>ប្រវត្តិនៃការបញ្ជាទិញ ៨ ចុងក្រោយ</b>
━━━━━━━━━━━━━━━━━━━━
${list}`;
    return await sendMessage(chatId, msgText, getMainKeyboard());
  }

  // 8. Command: /expense <amount> <category> [note]
  if (text.startsWith('/expense')) {
    const parts = text.split(/\s+/);
    if (parts.length < 3) {
      return await sendMessage(chatId, 
`⚠️ <b>សូមបញ្ជាក់ទិន្នន័យឱ្យបានត្រឹមត្រូវ:</b>
<code>/expense &lt;ចំនួនលុយ&gt; &lt;ប្រភេទ&gt; [កំណត់ចំណាំ]</code>

<i>ឧទាហរណ៍:</i>
• <code>/expense 12.00 Apsara hosting ប្រចាំខែ</code>
• <code>/expense 9.50 Domain r1ckkytopup.xyz</code>
• <code>/expense 5.00 Server ថ្លៃថែទាំ</code>`, getMainKeyboard());
    }

    const amount = parseFloat(parts[1]);
    if (isNaN(amount) || amount <= 0) {
      return await sendMessage(chatId, '❌ សូមបញ្ចូលចំនួនលុយជាលេខវិជ្ជមាន (ឧទាហរណ៍ 12.00)', getMainKeyboard());
    }

    let category = parts[2];
    const catLower = category.toLowerCase();
    if (catLower.includes('apsara') || catLower.includes('host')) {
      category = 'Apsara Hosting';
    } else if (catLower.includes('domain') || catLower.includes('ដូម៉េន')) {
      category = 'Domain';
    } else if (catLower.includes('server')) {
      category = 'Server';
    }

    const note = parts.slice(3).join(' ');
    const added = addExpense(amount, category, note);

    return await sendMessage(chatId, 
`✅ <b>បានកត់ត្រាចំណាយដោយជោគជ័យ!</b>
━━━━━━━━━━━━━━━━━━━━
💵 <b>ចំនួនទឹកប្រាក់:</b> <b>$${added.amount.toFixed(2)} USD</b>
🏷️ <b>ប្រភេទ:</b> <b>${added.category}</b>
📝 <b>កំណត់ចំណាំ:</b> ${added.note || 'គ្មាន'}
⏰ <b>កាលបរិច្ឆេទ:</b> ${added.formattedDate}

👉 ចុច <b>💸 ចំណាយ Hosting/Domain</b> ដើម្បីមើលតារាងសរុប`, getMainKeyboard());
  }

  // 9. Command: /deposit <amount> [note]
  if (text.startsWith('/deposit')) {
    const parts = text.split(/\s+/);
    if (parts.length < 2) {
      return await sendMessage(chatId, 
`⚠️ <b>សូមបញ្ជាក់ចំនួនលុយ:</b>
<code>/deposit &lt;ចំនួនលុយ&gt; [កំណត់ចំណាំ]</code>

<i>ឧទាហរណ៍:</i>
• <code>/deposit 50.00 ដាក់តាម ABA Bank</code>
• <code>/deposit 20.00 បញ្ចូលទិញពេជ្រ MLBB</code>`, getMainKeyboard());
    }

    const amount = parseFloat(parts[1]);
    if (isNaN(amount) || amount <= 0) {
      return await sendMessage(chatId, '❌ សូមបញ្ចូលចំនួនលុយជាលេខវិជ្ជមាន (ឧទាហរណ៍ 50.00)', getMainKeyboard());
    }

    const note = parts.slice(2).join(' ') || 'ដាក់តាមធនាគារ';
    const added = addDeposit(amount, note, 'ABA / Bank');

    return await sendMessage(chatId, 
`✅ <b>បានកត់ត្រាការដាក់ប្រាក់ចូល Balance រួចរាល់!</b>
━━━━━━━━━━━━━━━━━━━━
💵 <b>ចំនួនទឹកប្រាក់:</b> <b>+$${added.amount.toFixed(2)} USD</b>
📝 <b>កំណត់ចំណាំ:</b> ${added.note}
⏰ <b>កាលបរិច្ឆេទ:</b> ${added.formattedDate}

👉 ចុច <b>💰 ពិនិត្យ Balance</b> ដើម្បីផ្ទៀងផ្ទាត់សមតុល្យជាក់ស្តែង`, getMainKeyboard());
  }

  // 10. Help command
  if (text === 'ℹ️ របៀបប្រើ Bot (Help)' || text === '/help') {
    const helpMsg = 
`📖 <b>សេចក្តីណែនាំអំពីការប្រើប្រាស់ R1ckky Admin Bot</b>
━━━━━━━━━━━━━━━━━━━━
<b>ប៊ូតុងចុចលឿន:</b>
• 📊 <b>របាយការណ៍ប្រាក់ចំណេញ:</b> មើលចំណូល និងចំណេញ (ថ្ងៃនេះ / ខែនេះ / សរុប)
• 💰 <b>ពិនិត្យ Balance:</b> ពិនិត្យសមតុល្យ Live ក្នុង Khmer Top Up
• 💸 <b>ចំណាយ Hosting/Domain:</b> មើលចំណាយ Apsara hosting & Domain
• 📥 <b>ប្រវត្តិដាក់លុយ Balance:</b> មើលប្រាក់ដែលបានដាក់ចូល Wallet
• 📈 <b>សរុបប្រាក់ចំណេញសុទ្ធ:</b> គណនាប្រាក់ចំណេញដកចំណាយ (Net Profit)
• 📋 <b>Order ចុងក្រោយ:</b> មើលការកម្ម៉ង់ និងប្រាក់ចំណេញតាម Order

<b>បញ្ជា Command:</b>
• <code>/expense &lt;ចំនួន&gt; &lt;ប្រភេទ&gt; [note]</code> : កត់ត្រាចំណាយ
• <code>/deposit &lt;ចំនួន&gt; [note]</code> : កត់ត្រាដាក់លុយចូល Balance
• <code>/balance</code> : ឆែកសមតុល្យ
• <code>/profit</code> : ឆែកប្រាក់ចំណេញ
• <code>/net</code> : ឆែកប្រាក់ចំណេញសុទ្ធ`;
    return await sendMessage(chatId, helpMsg, getMainKeyboard());
  }

  // Default fallback response
  return await sendMessage(chatId, 
`🤖 ខ្ញុំមិនស្គាល់ពាក្យបញ្ជានេះទេ។ សូមជ្រើសរើសជម្រើសខាងក្រោម ឬវាយ /help`, getMainKeyboard());
}

// ── Long-Polling Telegram Updates Loop ───────────────────
async function pollUpdates() {
  if (!BOT_TOKEN) {
    console.log('[TelegramBot] No TELEGRAM_BOT_TOKEN found in environment. Bot polling inactive.');
    return;
  }

  isPolling = true;
  console.log('[TelegramBot] Starting Telegram bot long-polling...');

  while (isPolling) {
    try {
      pollingAbortCtrl = new AbortController();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Poll timeout')), 35000)
      );

      const fetchPromise = callTelegram('getUpdates', {
        offset: lastUpdateId + 1,
        timeout: 30,
        allowed_updates: ['message', 'callback_query']
      });

      const res = await Promise.race([fetchPromise, timeoutPromise]);
      if (res && res.ok && Array.isArray(res.result)) {
        for (const update of res.result) {
          lastUpdateId = Math.max(lastUpdateId, update.update_id);
          if (update.message) {
            await handleMessage(update.message);
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        // Quiet pause before retrying on network hiccup
        await new Promise(r => setTimeout(r, 4000));
      }
    }
  }
}

// Initialize Bot
function initTelegramBot() {
  BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
  ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || '';

  if (!BOT_TOKEN) {
    console.log('[TelegramBot] Notice: TELEGRAM_BOT_TOKEN not configured yet. Add it to .env to activate Telegram alerts.');
    return;
  }

  // Pre-seed initial deposit if deposits file is empty so admin has initial reference
  try {
    const existing = getDeposits();
    if (existing.length === 0) {
      addDeposit(10.81, 'សមតុល្យដើម Khmer Top Up Balance', 'Initial Balance');
    }
  } catch (e) {}

  pollUpdates().catch(err => {
    console.error('[TelegramBot] Polling loop error:', err.message);
  });
}

function stopTelegramBot() {
  isPolling = false;
  if (pollingAbortCtrl) {
    try { pollingAbortCtrl.abort(); } catch (e) {}
  }
}

module.exports = {
  initTelegramBot,
  stopTelegramBot,
  notifyNewOrder,
  recordOrder,
  addExpense,
  addDeposit,
  fetchProviderBalance,
  getProfitSummary,
  getTotalExpenses,
  getTotalDeposits
};
