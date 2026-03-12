// ── Config ────────────────────────────────────────────────────────────────────
const PROXY = 'http://localhost:3456';
const DIRECT = {
  poe1: 'https://www.pathofexile.com/api/trade',
  poe2: 'https://www.pathofexile.com/api/trade2',
};

let game      = 'poe1';
let useProxy  = false;
const buyoutOnly = () => document.getElementById('buyout-only')?.checked;
let statsDb   = [];          // [{id, text, type}]
let parsedData = null;
let lastSearchId  = null;
let lastResultIds = [];
let lastTotal     = 0;

// ── DOM ───────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const itemInput      = $('item-input');
const parseBtn       = $('parse-btn');
const clearBtn       = $('clear-btn');
const parsedSection  = $('parsed-section');
const parsedItemEl   = $('parsed-item');
const searchBtn      = $('search-btn');
const searchStatus   = $('search-status');
const resultsSection = $('results-section');
const resultsList    = $('results-list');
const resultCount    = $('result-count');
const leagueSelect   = $('league');
const corsWarning    = $('cors-warning');
const onlineOnly     = $('online-only');
const loadMoreBtn    = $('load-more-btn');
const tradeLink      = $('trade-link');
const placeholder    = $('results-placeholder');

// ── Init ──────────────────────────────────────────────────────────────────────
detectProxy().then(() => { loadStatsDb(); fetchLeagues(); });

itemInput.addEventListener('paste', () => setTimeout(handleParse, 50));
parseBtn.addEventListener('click', handleParse);
clearBtn.addEventListener('click', handleClear);
searchBtn.addEventListener('click', handleSearch);
loadMoreBtn.addEventListener('click', handleLoadMore);
$('open-trade-btn').addEventListener('click', openInTradeSite);
$('dismiss-cors').addEventListener('click', () => corsWarning.style.display = 'none');
$('poe1-btn').addEventListener('click', () => switchGame('poe1'));
$('poe2-btn').addEventListener('click', () => switchGame('poe2'));

function switchGame(g) {
  game = g;
  $('poe1-btn').classList.toggle('active', g === 'poe1');
  $('poe2-btn').classList.toggle('active', g === 'poe2');
  statsDb = [];
  loadStatsDb();
  fetchLeagues();
  handleClear();
}

// ── Proxy / API ───────────────────────────────────────────────────────────────
async function detectProxy() {
  try {
    const res = await fetch(`${PROXY}/api/trade/data/leagues`);
    if (res.ok) { useProxy = true; console.log('Using proxy'); }
  } catch { /* proxy not running */ }
}

function apiPath() {
  return game === 'poe1' ? '/api/trade' : '/api/trade2';
}

async function apiFetch(path, opts = {}) {
  const base = useProxy ? PROXY + apiPath() : DIRECT[game];
  try {
    return await fetch(base + path, opts);
  } catch (e) {
    if (!useProxy) {
      useProxy = true;
      corsWarning.style.display = 'flex';
      return fetch(PROXY + apiPath() + path, opts);
    }
    throw e;
  }
}

// ── Stats DB ──────────────────────────────────────────────────────────────────
async function loadStatsDb() {
  try {
    const res  = await apiFetch('/data/stats');
    const data = await res.json();
    if (data.result) {
      statsDb = [];
      for (const group of data.result) {
        for (const e of (group.entries || [])) {
          statsDb.push({ id: e.id, text: e.text, type: e.type });
        }
      }
      console.log(`Stats DB: ${statsDb.length} entries`);
    }
  } catch (e) { console.warn('Stats DB failed:', e.message); }
}

// ── Leagues ───────────────────────────────────────────────────────────────────
async function fetchLeagues() {
  try {
    const res  = await apiFetch('/data/leagues');
    const data = await res.json();
    if (data.result) {
      leagueSelect.innerHTML = '';
      for (const l of data.result) {
        const o = document.createElement('option');
        o.value = l.id; o.textContent = l.id;
        leagueSelect.appendChild(o);
      }
    }
  } catch { /* use defaults */ }
}

// ── Item Parsing ──────────────────────────────────────────────────────────────
// Tags appended to mod lines by the game client
const MOD_TYPE_RE = /\s*\((implicit|crafted|fractured|enchant(?:ment)?|scourge|mutated)\)\s*$/i;

// Cluster jewel mods are always enchants — even when the game client omits the (enchant) tag
const CLUSTER_ENCHANT_RE = /^(?:Adds \d+ Passive Skills?|Added Small Passive Skills?(?:\s+also)?\s+grant:|(?:\d+|\#) Added Passive Skill)/i;

function getModType(line) {
  if (CLUSTER_ENCHANT_RE.test(line)) return 'enchant';
  const m = line.match(MOD_TYPE_RE);
  if (!m) return 'explicit';
  const t = m[1].toLowerCase();
  if (t === 'enchantment') return 'enchant';
  if (t === 'mutated' || t === 'scourge') return 'explicit'; // no separate API type, treated as explicit
  return t;
}
function stripModTag(line) { return line.replace(MOD_TYPE_RE, '').trim(); }

function isPropertyLine(l) {
  return /^(Item Level|Quality|Sockets|Level|Physical Damage|Elemental Damage|Chaos Damage|Fire Damage|Cold Damage|Lightning Damage|Critical Strike Chance|Attacks per Second|Weapon Range|Armour|Energy Shield|Evasion Rating|Ward|Chance to Block|Requirements|Str|Dex|Int|Map Tier|Stack Size|Experience|Movement Speed)\b/.test(l);
}

const STANDALONE = new Set([
  'Corrupted','Mirrored','Unidentified','Fractured Item','Synthesised Item',
  'Shaper Item','Elder Item','Crusader Item','Hunter Item','Redeemer Item','Warlord Item',
  'Searing Exarch Item','Eater of Worlds Item',
]);

function parseItemText(text) {
  const lines    = text.trim().split('\n').map(l => l.trim());
  const sections = [];
  let   cur      = [];
  for (const l of lines) {
    if (l === '--------') { if (cur.length) sections.push(cur); cur = []; }
    else if (l) cur.push(l);
  }
  if (cur.length) sections.push(cur);
  if (sections.length < 2) return null;

  const item = {
    rarity: '', name: '', baseType: '', itemClass: '',
    itemLevel: null, quality: null, qualityType: '',
    sockets: '', socketCount: 0, linkCount: 0,
    explicitMods: [], implicitMods: [], craftedMods: [], fracturedMods: [], enchantMods: [],
    corrupted: false, mirrored: false, identified: true, synthesised: false,
    // Weapon
    physDps: null, eleDps: null, totalDps: null, critChance: null, aps: null,
    // Defence
    armour: null, evasion: null, energyShield: null, ward: null,
  };

  // ── Header ──
  const hdr = sections[0];
  for (const l of hdr) {
    if (l.startsWith('Item Class:')) item.itemClass = l.replace('Item Class:', '').trim();
    else if (l.startsWith('Rarity:'))    item.rarity = l.replace('Rarity:', '').trim().toLowerCase();
  }
  const nameLines = hdr.filter(l => !l.startsWith('Item Class:') && !l.startsWith('Rarity:'));
  if (nameLines.length >= 2) { item.name = nameLines[0]; item.baseType = nameLines[1]; }
  else if (nameLines.length === 1) { item.baseType = nameLines[0]; }

  // Strip "Synthesised " prefix from base type — API expects plain base type + a separate filter
  if (item.baseType.startsWith('Synthesised ')) {
    item.synthesised = true;
    item.baseType = item.baseType.slice('Synthesised '.length);
  }

  // Strip known unique-name prefixes (Affliction "Foulborn", etc.)
  // These are league mechanics that prepend to the canonical unique name
  const UNIQUE_NAME_PREFIXES = ['Foulborn '];
  for (const prefix of UNIQUE_NAME_PREFIXES) {
    if (item.name.startsWith(prefix)) {
      item.name = item.name.slice(prefix.length);
      break;
    }
  }

  // ── Sections ──
  for (let i = 1; i < sections.length; i++) {
    const sec = sections[i];

    // Single-line standalones
    if (sec.length === 1) {
      const l = sec[0];
      if (l === 'Corrupted')   { item.corrupted = true; continue; }
      if (l === 'Mirrored')    { item.mirrored  = true; continue; }
      if (l === 'Unidentified'){ item.identified = false; continue; }
      if (STANDALONE.has(l) || l.startsWith('Note:')) continue;
    }

    // Property section?
    if (sec.some(isPropertyLine)) {
      for (const l of sec) {
        if (l.startsWith('Item Level:')) {
          item.itemLevel = parseInt(l.replace('Item Level:', '').trim());
        } else if (l.startsWith('Quality')) {
          const qt = l.match(/^Quality \(([^)]+)\)/);
          if (qt) item.qualityType = qt[1];
          const qv = l.match(/\+?(\d+)%/);
          if (qv) item.quality = parseInt(qv[1]);
        } else if (l.startsWith('Sockets:')) {
          item.sockets = l.replace('Sockets:', '').trim();
          parseSockets(item);
        } else if (l.startsWith('Physical Damage:')) {
          item._physLine = l.replace('Physical Damage:', '').trim();
        } else if (l.startsWith('Elemental Damage:')) {
          item._eleLine = l.replace('Elemental Damage:', '').trim();
        } else if (l.startsWith('Attacks per Second:')) {
          const m = l.match(/([\d.]+)/);
          if (m) item.aps = parseFloat(m[1]);
        } else if (l.startsWith('Critical Strike Chance:')) {
          const m = l.match(/([\d.]+)%/);
          if (m) item.critChance = parseFloat(m[1]);
        } else if (l.startsWith('Armour:')) {
          const m = l.match(/(\d+)/); if (m) item.armour = parseInt(m[1]);
        } else if (l.startsWith('Evasion Rating:')) {
          const m = l.match(/(\d+)/); if (m) item.evasion = parseInt(m[1]);
        } else if (l.startsWith('Energy Shield:')) {
          const m = l.match(/(\d+)/); if (m) item.energyShield = parseInt(m[1]);
        } else if (l.startsWith('Ward:')) {
          const m = l.match(/(\d+)/); if (m) item.ward = parseInt(m[1]);
        } else if (l === 'Corrupted')  { item.corrupted = true; }
        else if (l === 'Mirrored')     { item.mirrored  = true; }
      }
      continue;
    }

    // Mod section — check each line for type tags
    const looksLikeMods = sec.some(l =>
      /^[+\-]?\d/.test(l) ||
      /\b(increased|reduced|more|less|adds|to|gain|cannot|regenerate|grants)\b/i.test(l) ||
      l.includes('(implicit)') || l.includes('(crafted)') ||
      l.includes('(fractured)') || l.includes('(enchant)')
    );

    if (looksLikeMods) {
      for (const l of sec) {
        if (l === 'Corrupted')   { item.corrupted = true; continue; }
        if (l === 'Mirrored')    { item.mirrored  = true; continue; }
        if (STANDALONE.has(l) || l.startsWith('Note:')) continue;

        const type  = getModType(l);
        const clean = stripModTag(l);
        if (!clean) continue;

        switch (type) {
          case 'crafted':   item.craftedMods.push(clean);  break;
          case 'fractured': item.fracturedMods.push(clean); break;
          case 'enchant':   item.enchantMods.push(clean);  break;
          case 'implicit':  item.implicitMods.push(clean); break;
          default:          item.explicitMods.push(clean); break;
        }
      }
      continue;
    }

    // Otherwise likely flavour text — check for standalone flags anyway
    for (const l of sec) {
      if (l === 'Corrupted')  item.corrupted = true;
      if (l === 'Mirrored')   item.mirrored  = true;
    }
  }

  // ── DPS calculation ──
  if (item.aps) {
    if (item._physLine) {
      const m = item._physLine.match(/(\d+)-(\d+)/);
      if (m) item.physDps = round1((+m[1] + +m[2]) / 2 * item.aps);
    }
    if (item._eleLine) {
      let sum = 0;
      for (const m of item._eleLine.matchAll(/(\d+)-(\d+)/g))
        sum += (+m[1] + +m[2]) / 2;
      if (sum > 0) item.eleDps = round1(sum * item.aps);
    }
    item.totalDps = round1((item.physDps || 0) + (item.eleDps || 0));
  }

  return item;
}

function parseSockets(item) {
  const groups = item.sockets.split(/\s+/);
  let total = 0, maxLink = 0;
  for (const g of groups) {
    const s = g.split('-');
    total += s.length;
    if (s.length > maxLink) maxLink = s.length;
  }
  item.socketCount = total;
  item.linkCount   = maxLink;
}

function round1(n) { return Math.round(n * 10) / 10; }

// ── Stat Matching ─────────────────────────────────────────────────────────────
function normMod(text) {
  return text
    .replace(/[+\-]?\d+(\.\d+)?/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Item classes where defence mods (Armour/Evasion/ES/Ward) are local
const DEFENCE_CLASSES = new Set([
  'Body Armours','Helmets','Gloves','Boots','Shields',
]);
// Item classes where weapon mods (damage/crit/speed) are local
const WEAPON_CLASSES = new Set([
  'Claws','Daggers','Rune Daggers','Wands',
  'One Hand Swords','Thrusting One Hand Swords','One Hand Axes','One Hand Maces',
  'Bows','Staves','Warstaves','Two Hand Swords','Two Hand Axes','Two Hand Maces',
  'Sceptres','Flails','Spears','Crossbows',
]);
// Patterns that become local on defence items (matches APAT's mn object)
const LOCAL_DEFENCE_RE = /increased (Armour|Evasion|Energy Shield|Ward)|\bto Armour$|\bto Evasion Rating$|\bto maximum Energy Shield$|\bto Ward$/i;
// Patterns that become local on weapons (matches APAT's pH set)
const LOCAL_WEAPON_RE = /increased Physical Damage|Adds \d.*(?:Physical|Lightning|Cold|Fire|Chaos) Damage|increased (Critical Strike Chance|Attack Speed)/i;

function isLocalMod(modText, itemClass) {
  if (DEFENCE_CLASSES.has(itemClass) && LOCAL_DEFENCE_RE.test(modText)) return true;
  if (WEAPON_CLASSES.has(itemClass) && LOCAL_WEAPON_RE.test(modText)) return true;
  return false;
}

function findStat(modText, preferType = 'explicit', itemClass = '') {
  if (!statsDb.length) return null;
  const norm       = normMod(modText);
  const normPlus   = '+' + norm;
  const normNoSign = norm.replace(/^[+\-]#?\s*/, '').trim();
  const normLocal  = norm + ' (local)';
  const local      = isLocalMod(modText, itemClass);

  // Search order: preferred type first, then other useful types
  const order = [preferType, 'explicit', 'fractured', 'crafted', 'implicit', 'enchant']
    .filter((v, i, a) => a.indexOf(v) === i);

  // For local mods: try the "(Local)" variant first, then fall back to plain
  if (local) {
    for (const type of order) {
      for (const s of statsDb) {
        if (s.type !== type) continue;
        if (s.text.toLowerCase() === normLocal) return s;
      }
    }
  }

  for (const type of order) {
    for (const s of statsDb) {
      if (s.type !== type) continue;
      const st = s.text.toLowerCase();
      if (st === norm || st === normPlus || st === normNoSign) return s;
    }
  }

  // Fuzzy fallback — only within preferred + explicit, skip (Local) entries for non-local mods
  const words = normNoSign.replace(/[#%]/g, '').trim().split(/\s+/).filter(w => w.length > 2);
  if (!words.length) return null;
  const pool = statsDb.filter(s =>
    (s.type === preferType || s.type === 'explicit') &&
    (local || !s.text.toLowerCase().includes('(local)'))
  );
  let best = null, bestRatio = 0;
  for (const s of pool) {
    const st = s.text.toLowerCase();
    let hits = 0;
    for (const w of words) if (st.includes(w)) hits++;
    const ratio = hits / words.length;
    if (ratio > bestRatio && ratio >= 0.75) { bestRatio = ratio; best = s; }
  }
  return best;
}

// ── Render Parsed Item ────────────────────────────────────────────────────────
function handleClear() {
  itemInput.value   = '';
  parsedData        = null;
  parsedSection.style.display  = 'none';
  resultsSection.style.display = 'none';
  placeholder.style.display    = 'flex';
  searchStatus.textContent     = '';
}

function handleParse() {
  const text = itemInput.value.trim();
  if (!text) return;
  parsedData = parseItemText(text);
  if (!parsedData) {
    searchStatus.textContent = 'Could not parse item text.';
    searchStatus.className   = 'search-status error';
    return;
  }
  renderParsedItem(parsedData);
  parsedSection.style.display  = 'block';
  resultsSection.style.display = 'none';
  placeholder.style.display    = 'flex';
  searchStatus.textContent  = '';
  searchStatus.className    = 'search-status';
}

function renderParsedItem(item) {
  const rc = `rarity-${item.rarity}`;
  let h = '';

  // Header
  h += `<div class="item-header ${rc}">`;
  if (item.name) h += `<div class="item-name">${esc(item.name)}</div>`;
  h += `<div class="item-base">${esc(item.baseType)}</div>`;
  h += `</div>`;

  h += `<div class="filter-list">`;

  // Name (unique only)
  if (item.rarity === 'unique' && item.name) {
    h += toggleRow('toggle-name', `Name: <em>${esc(item.name)}</em>`, true);
    h += sep();
  }

  // Item level
  if (item.itemLevel) {
    h += toggleRowInput('toggle-ilvl', `Item Level: ${item.itemLevel}`, true,
      `<span class="filter-label">min</span><input type="number" id="ilvl-min" value="${item.itemLevel}" class="num-input">`
    );
    h += sep();
  }

  // Weapon DPS
  if (item.totalDps) {
    h += `<div class="stat-row">`;
    if (item.physDps) h += `<span class="stat-badge">pDPS <strong>${item.physDps}</strong></span>`;
    if (item.eleDps)  h += `<span class="stat-badge ele">eDPS <strong>${item.eleDps}</strong></span>`;
    h += `<span class="stat-badge total">DPS <strong>${item.totalDps}</strong></span>`;
    if (item.critChance) h += `<span class="stat-badge">Crit <strong>${item.critChance}%</strong></span>`;
    if (item.aps)        h += `<span class="stat-badge">APS <strong>${item.aps}</strong></span>`;
    h += `</div>`;
    const dpsMin = Math.floor(item.totalDps * 0.9);
    h += toggleRowInput('toggle-dps', 'Min DPS filter', false,
      `<span class="filter-label">min</span><input type="number" id="dps-min" value="${dpsMin}" class="num-input">`
    );
    h += sep();
  }

  // Defences — use armour_filters (final computed value) like APAT does
  if (item.armour || item.evasion || item.energyShield || item.ward) {
    if (item.armour)       h += toggleRowInput('toggle-ar',   `Armour: ${item.armour}`,        false, `<span class="filter-label">min</span><input type="number" id="ar-min"   value="${Math.floor(item.armour       * 0.9)}" class="num-input">`);
    if (item.evasion)      h += toggleRowInput('toggle-ev',   `Evasion: ${item.evasion}`,       false, `<span class="filter-label">min</span><input type="number" id="ev-min"   value="${Math.floor(item.evasion      * 0.9)}" class="num-input">`);
    if (item.energyShield) h += toggleRowInput('toggle-es',   `Energy Shield: ${item.energyShield}`, false, `<span class="filter-label">min</span><input type="number" id="es-min"   value="${Math.floor(item.energyShield * 0.9)}" class="num-input">`);
    if (item.ward)         h += toggleRowInput('toggle-ward', `Ward: ${item.ward}`,             false, `<span class="filter-label">min</span><input type="number" id="ward-min" value="${Math.floor(item.ward         * 0.9)}" class="num-input">`);
    h += sep();
  }

  // Sockets
  if (item.sockets) {
    h += toggleRowInput('toggle-sockets',
      `Sockets: <span class="sock-display">${renderSockets(item.sockets)}</span> — ${item.socketCount}S / ${item.linkCount}L`,
      true,
      `<span class="filter-label">min links</span><input type="number" id="link-min" value="${item.linkCount}" min="1" max="6" class="num-input">`
    );
    h += sep();
  }

  // Enchant mods
  if (item.enchantMods.length) {
    h += `<div class="mod-group">`;
    h += `<div class="mod-group-label enchant-label">Enchant</div>`;
    item.enchantMods.forEach((m, i) => h += modRow(`enc-${i}`, m, findStat(m, 'enchant', item.itemClass), 'enchant'));
    h += `</div>${sep()}`;
  }

  // Implicit mods
  if (item.implicitMods.length) {
    h += `<div class="mod-group">`;
    h += `<div class="mod-group-label implicit-label">Implicit</div>`;
    item.implicitMods.forEach((m, i) => h += modRow(`imp-${i}`, m, findStat(m, 'implicit', item.itemClass), 'implicit'));
    h += `</div>${sep()}`;
  }

  // Fractured mods
  if (item.fracturedMods.length) {
    h += `<div class="mod-group">`;
    h += `<div class="mod-group-label fractured-label">Fractured</div>`;
    item.fracturedMods.forEach((m, i) => h += modRow(`frac-${i}`, m, findStat(m, 'fractured', item.itemClass), 'fractured'));
    h += `</div>${sep()}`;
  }

  // Explicit mods
  if (item.explicitMods.length) {
    h += `<div class="mod-group">`;
    h += `<div class="mod-group-label">Explicit Mods</div>`;
    item.explicitMods.forEach((m, i) => h += modRow(`exp-${i}`, m, findStat(m, 'explicit', item.itemClass), 'explicit'));
    h += `</div>`;
    if (item.craftedMods.length) h += sep();
  }

  // Crafted mods
  if (item.craftedMods.length) {
    h += `<div class="mod-group">`;
    h += `<div class="mod-group-label crafted-label">Crafted</div>`;
    item.craftedMods.forEach((m, i) => h += modRow(`cra-${i}`, m, findStat(m, 'crafted', item.itemClass), 'crafted'));
    h += `</div>`;
  }

  h += sep();

  // Misc filters
  h += `<div class="mod-group misc-filters">`;
  h += `<div class="mod-group-label">Misc Filters</div>`;
  if (item.corrupted) {
    h += toggleRow('filter-corrupted', 'Corrupted', true);
  } else {
    h += toggleRow('filter-corrupted', 'Corrupted only', false);
    h += toggleRow('filter-not-corrupted', 'Non-corrupted only', false);
  }
  if (item.mirrored) {
    h += toggleRow('filter-mirrored', 'Mirrored', true);
  }
  if (item.synthesised) {
    h += toggleRow('filter-synthesised', 'Synthesised', true);
  }
  h += `</div>`;

  h += `</div>`; // .filter-list

  parsedItemEl.innerHTML = h;
}

function toggleRow(id, label, checked) {
  return `<div class="toggle-row">
    <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}>
    <label for="${id}">${label}</label>
  </div>`;
}
function toggleRowInput(id, label, checked, inputHtml) {
  return `<div class="toggle-row">
    <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}>
    <label for="${id}">${label}</label>
    <div class="row-inputs">${inputHtml}</div>
  </div>`;
}
function modRow(id, modText, stat, type) {
  const val  = extractModValue(modText);
  const ok   = !!stat;
  const cls  = `mod-type-${type}`;
  const indicator = ok
    ? `<span class="match-ok" title="${esc(stat.id)}">✓</span>`
    : `<span class="match-fail" title="No stat match — skipped">✗</span>`;
  let h = `<div class="toggle-row ${cls}" data-stat-id="${ok ? esc(stat.id) : ''}">`;
  h += `<input type="checkbox" id="mod-${id}" ${ok ? 'checked' : 'disabled'} data-mod="${esc(modText)}">`;
  h += `<label for="mod-${id}">${esc(modText)}</label>`;
  h += indicator;
  if (val && ok) {
    const prefillMax = val.isRange ? val.max : '';
    h += `<div class="row-inputs">`;
    h += `<span class="filter-label">min</span><input type="number" id="mod-min-${id}" value="${val.min}" step="1" class="num-input" placeholder="—">`;
    h += `<span class="filter-label">max</span><input type="number" id="mod-max-${id}" value="${prefillMax}" step="1" class="num-input" placeholder="∞">`;
    h += `</div>`;
  }
  h += `</div>`;
  return h;
}
function sep() { return `<div class="filter-sep"></div>`; }

function renderSockets(s) {
  return s.split('').map(c => {
    if (c === '-') return `<span class="sock-link">-</span>`;
    const cls = { R:'sock-r', G:'sock-g', B:'sock-b', W:'sock-w' }[c.toUpperCase()] || '';
    return `<span class="sock ${cls}">${c}</span>`;
  }).join('');
}

function extractModValue(text) {
  const rng = text.match(/(\d+)\s+to\s+(\d+)/i);
  if (rng && /^adds\b/i.test(text))
    return { min: +rng[1], max: +rng[2], isRange: true };
  const single = text.match(/[+\-]?(\d+(?:\.\d+)?)/);
  if (single) return { min: parseFloat(single[1]), max: null, isRange: false };
  return null;
}

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ── Build Query ───────────────────────────────────────────────────────────────
function buildQuery(item) {
  const q = {
    status: { option: onlineOnly.checked ? 'online' : 'any' },
    stats:  [{ type: 'and', filters: [] }],
    filters: {},
  };

  // Name / type
  const isUnique = item.rarity === 'unique';
  const isMagic  = item.rarity === 'magic';
  const nameToggle = $('toggle-name');

  if (isUnique && nameToggle?.checked && item.name) {
    q.name = item.name;
    q.type = item.baseType;
  } else if (!isMagic && item.baseType) {
    // Magic items only have the full magic name (prefix + base + suffix) — we can't
    // reliably strip it, so skip type and rely on the rarity filter instead
    q.type = item.baseType;
  }

  if (!isUnique) {
    const rarityOption = isMagic ? 'magic' : (item.rarity === 'normal' ? 'normal' : 'nonunique');
    q.filters.type_filters = {
      disabled: false,
      filters: { rarity: { option: rarityOption } },
    };
  }

  // Buyout only (priced listings)
  if (buyoutOnly()) {
    q.filters.trade_filters = {
      disabled: false,
      filters: { sale_type: { option: 'priced' } },
    };
  }

  // Synthesised
  if ($('filter-synthesised')?.checked) {
    (q.filters.misc_filters = q.filters.misc_filters || { disabled: false, filters: {} })
      .filters.synthesised_item = { option: 'true' };
  }

  // Item level
  if ($('toggle-ilvl')?.checked) {
    const min = parseInt($('ilvl-min')?.value);
    if (!isNaN(min)) {
      q.filters.misc_filters = { disabled: false, filters: { ilvl: { min } } };
    }
  }

  // Sockets / links
  if ($('toggle-sockets')?.checked) {
    const min = parseInt($('link-min')?.value);
    if (!isNaN(min)) {
      q.filters.socket_filters = { disabled: false, filters: { links: { min } } };
    }
  }

  // DPS
  if ($('toggle-dps')?.checked) {
    const min = parseFloat($('dps-min')?.value);
    if (!isNaN(min)) {
      q.filters.weapon_filters = { disabled: false, filters: { dps: { min } } };
    }
  }

  // Armour / defence filters (final computed value, not mod %)
  for (const [toggleId, inputId, field] of [
    ['toggle-ar',   'ar-min',   'ar'],
    ['toggle-ev',   'ev-min',   'ev'],
    ['toggle-es',   'es-min',   'es'],
    ['toggle-ward', 'ward-min', 'ward'],
  ]) {
    if ($(toggleId)?.checked) {
      const min = parseInt($(inputId)?.value);
      if (!isNaN(min)) {
        if (!q.filters.armour_filters) q.filters.armour_filters = { disabled: false, filters: {} };
        q.filters.armour_filters.filters[field] = { min };
      }
    }
  }

  // Corrupted
  const corr    = $('filter-corrupted');
  const notCorr = $('filter-not-corrupted');
  if (corr?.checked) {
    (q.filters.misc_filters = q.filters.misc_filters || { disabled: false, filters: {} })
      .filters.corrupted = { option: 'true' };
  } else if (notCorr?.checked) {
    (q.filters.misc_filters = q.filters.misc_filters || { disabled: false, filters: {} })
      .filters.corrupted = { option: 'false' };
  }

  // Mirrored
  if ($('filter-mirrored')?.checked) {
    (q.filters.misc_filters = q.filters.misc_filters || { disabled: false, filters: {} })
      .filters.mirrored = { option: 'true' };
  }

  // Mods helper
  function addMods(prefix) {
    const container = document.querySelectorAll(`[id^="mod-${prefix}-"]`);
    for (const chk of container) {
      if (!chk.checked) continue;
      const row    = chk.closest('.toggle-row');
      const statId = row?.dataset.statId;
      if (!statId) continue;
      const suffix = chk.id.replace(`mod-${prefix}-`, '');
      const minEl  = $(`mod-min-${prefix}-${suffix}`);
      const maxEl  = $(`mod-max-${prefix}-${suffix}`);
      const filter = { id: statId, value: {}, disabled: false };
      if (minEl && minEl.value !== '') filter.value.min = parseFloat(minEl.value);
      if (maxEl && maxEl.value !== '') filter.value.max = parseFloat(maxEl.value);
      q.stats[0].filters.push(filter);
    }
  }

  addMods('enc');
  addMods('imp');
  addMods('frac');
  addMods('exp');
  addMods('cra');

  return q;
}

// ── Search ────────────────────────────────────────────────────────────────────
async function handleSearch() {
  if (!parsedData) return;
  searchBtn.disabled = true;
  searchStatus.textContent = 'Searching…';
  searchStatus.className   = 'search-status';
  resultsList.innerHTML    = '';
  loadMoreBtn.style.display = 'none';
  lastResultIds = [];

  try {
    const query   = buildQuery(parsedData);
    const league  = leagueSelect.value;
    const payload = { query, sort: { price: 'asc' } };
    console.log('Query:', JSON.stringify(payload, null, 2));

    const res = await apiFetch(`/search/${encodeURIComponent(league)}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    if (res.status === 429) {
      throw new Error(`Rate limited. Retry in ${res.headers.get('Retry-After') || 60}s.`);
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Search failed (${res.status}): ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    lastSearchId  = data.id;
    lastTotal     = data.total;
    lastResultIds = data.result || [];

    searchStatus.textContent = `${data.total} listings found`;

    placeholder.style.display    = 'none';
    resultsSection.style.display = 'block';
    resultCount.textContent      = `${data.total} listings`;

    const gameSlug = game === 'poe1' ? 'trade' : 'trade2';
    tradeLink.href         = `https://www.pathofexile.com/${gameSlug}/search/${encodeURIComponent(league)}/${data.id}`;
    tradeLink.style.display = 'inline';

    if (lastResultIds.length) {
      await loadBatch(0, 20);
    } else {
      resultsList.innerHTML = '<div class="no-results">No results found.</div>';
    }
  } catch (e) {
    searchStatus.textContent = e.message;
    searchStatus.className   = 'search-status error';
  } finally {
    searchBtn.disabled = false;
  }
}

async function openInTradeSite() {
  if (!parsedData) return;
  const btn = $('open-trade-btn');
  btn.disabled = true;
  btn.textContent = 'Opening…';

  try {
    const query   = buildQuery(parsedData);
    const league  = leagueSelect.value;
    const payload = { query, sort: { price: 'asc' } };

    const res = await apiFetch(`/search/${encodeURIComponent(league)}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    if (res.status === 429)
      throw new Error(`Rate limited. Retry in ${res.headers.get('Retry-After') || 60}s.`);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Search failed (${res.status}): ${body.slice(0, 200)}`);
    }

    const data     = await res.json();
    const gameSlug = game === 'poe1' ? 'trade' : 'trade2';
    const url      = `https://www.pathofexile.com/${gameSlug}/search/${encodeURIComponent(league)}/${data.id}`;
    window.open(url, '_blank', 'noopener');
  } catch (e) {
    searchStatus.textContent = e.message;
    searchStatus.className   = 'search-status error';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Open in Trade Site ↗';
  }
}

async function handleLoadMore() {
  const shown = resultsList.querySelectorAll('.result-card').length;
  if (shown >= lastResultIds.length) return;
  loadMoreBtn.disabled = true;
  await loadBatch(shown, 20);
  loadMoreBtn.disabled = false;
}

const FETCH_CHUNK = 10; // PoE trade API hard limit per fetch request

async function loadBatch(offset, count) {
  const ids = lastResultIds.slice(offset, offset + count);
  if (!ids.length) return;
  try {
    // Fetch in chunks of FETCH_CHUNK to respect API limits
    for (let i = 0; i < ids.length; i += FETCH_CHUNK) {
      const chunk = ids.slice(i, i + FETCH_CHUNK);
      const res = await apiFetch(`/fetch/${chunk.join(',')}?query=${lastSearchId}`);
      if (res.status === 429)
        throw new Error(`Rate limited. Retry in ${res.headers.get('Retry-After') || 60}s.`);
      if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
      const data = await res.json();
      appendResults(data.result || []);
    }
    const shown = resultsList.querySelectorAll('.result-card').length;
    loadMoreBtn.style.display = shown < lastResultIds.length ? 'block' : 'none';
  } catch (e) {
    searchStatus.textContent = e.message;
    searchStatus.className   = 'search-status error';
  }
}

// ── Render Results ────────────────────────────────────────────────────────────
const CURRENCY_ABBR = {
  chaos: 'c', divine: 'div', exalted: 'ex', mirror: 'mir',
  ancient: 'anc', blessed: 'bles', chromatic: 'chrom', fusing: 'fuse',
  jewellers: 'jew', alteration: 'alt', augmentation: 'aug', regal: 'regal',
  vaal: 'vaal', annulment: 'ann', alchemy: 'alch', scouring: 'scour',
  transmutation: 'trans', chance: 'chance',
};

function formatCurrency(amount, currency) {
  const abbr = CURRENCY_ABBR[currency] || currency;
  return `${amount} <span class="cur cur-${esc(currency)}">${esc(abbr)}</span>`;
}

function timeAgo(iso) {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d` : `${Math.floor(d / 30)}mo`;
}

const FRAME_RARITY = ['normal','magic','rare','unique','gem','currency','divination'];

function appendResults(results) {
  for (const r of results) {
    if (!r?.listing) continue;
    const { listing, item } = r;
    const price   = listing.price;
    const account = listing.account || {};
    const online  = account.online != null;
    const ign     = account.lastCharacterName || account.name || '?';
    const rarity  = item ? (FRAME_RARITY[item.frameType] || 'normal') : 'normal';

    // Tags
    const tags = [];
    if (item) {
      if (item.ilvl)       tags.push(`<span class="tag">iLvl ${item.ilvl}</span>`);
      if (item.corrupted)  tags.push(`<span class="tag tag-corrupted">Corrupted</span>`);
      if (item.fractured)  tags.push(`<span class="tag tag-fractured">Fractured</span>`);
      if (item.mirrored)   tags.push(`<span class="tag tag-mirrored">Mirrored</span>`);
      if (item.extended?.pdps) tags.push(`<span class="tag tag-pdps">pDPS ${Math.round(item.extended.pdps)}</span>`);
      if (item.extended?.edps && item.extended.edps > 0) tags.push(`<span class="tag tag-edps">eDPS ${Math.round(item.extended.edps)}</span>`);
      if (item.extended?.dps)  tags.push(`<span class="tag tag-dps">DPS ${Math.round(item.extended.dps)}</span>`);
      if (item.extended?.ar)   tags.push(`<span class="tag tag-ar">AR ${item.extended.ar}</span>`);
      if (item.extended?.ev)   tags.push(`<span class="tag tag-ev">EV ${item.extended.ev}</span>`);
      if (item.extended?.es)   tags.push(`<span class="tag tag-es">ES ${item.extended.es}</span>`);
    }

    // Mods
    const allMods = [];
    if (item) {
      for (const m of item.enchantMods  || []) allMods.push(`<span class="mod enchant">${esc(m)}</span>`);
      for (const m of item.implicitMods || []) allMods.push(`<span class="mod implicit">${esc(m)}</span>`);
      for (const m of item.fracturedMods|| []) allMods.push(`<span class="mod fractured">${esc(m)}</span>`);
      for (const m of item.explicitMods || []) allMods.push(`<span class="mod">${esc(m)}</span>`);
      for (const m of item.craftedMods  || []) allMods.push(`<span class="mod crafted">${esc(m)}</span>`);
    }

    const itemLabel = item
      ? (item.name
          ? `${esc(item.name)}<small>${esc(item.typeLine || '')}</small>`
          : esc(item.typeLine || item.baseType || ''))
      : '';

    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `
      <div class="card-main">
        <div class="card-price">${price ? formatCurrency(price.amount, price.currency) : '<span class="no-price">—</span>'}</div>
        <div>
          <div class="card-item rarity-${rarity}">${itemLabel}</div>
          ${tags.length ? `<div class="result-tags">${tags.join('')}</div>` : ''}
        </div>
        <div class="card-right">
          <div class="card-seller">
            <span class="status-dot ${online ? 'online' : 'offline'}"></span>
            ${esc(ign)}
          </div>
          <div class="card-time">${timeAgo(listing.indexed)}</div>
          <div class="card-actions">
            ${allMods.length ? `<button class="btn-expand" title="Toggle mods">▼</button>` : ''}
            <button class="btn-whisper" data-whisper="${esc(listing.whisper || '')}">Whisper</button>
          </div>
        </div>
      </div>
      ${allMods.length ? `<div class="result-mods" style="display:none">${allMods.join('')}</div>` : ''}
    `;

    card.querySelector('.btn-whisper')?.addEventListener('click', function () {
      navigator.clipboard.writeText(this.dataset.whisper).then(() => {
        this.textContent = 'Copied!';
        this.classList.add('copied');
        setTimeout(() => { this.textContent = 'Whisper'; this.classList.remove('copied'); }, 1500);
      });
    });

    const expandBtn  = card.querySelector('.btn-expand');
    const modsPanel  = card.querySelector('.result-mods');
    expandBtn?.addEventListener('click', () => {
      const open = modsPanel.style.display !== 'none';
      modsPanel.style.display = open ? 'none' : 'grid';
      expandBtn.textContent   = open ? '▼' : '▲';
    });

    resultsList.appendChild(card);
  }
}
