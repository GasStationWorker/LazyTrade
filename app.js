// ── Config ────────────────────────────────────────────────────────────────────
const PROXY = 'http://localhost:3456';
const DIRECT = {
  poe1: 'https://www.pathofexile.com/api/trade',
  poe2: 'https://www.pathofexile.com/api/trade2',
};

let game      = 'poe1';
let useProxy  = false;
// Listing type dropdown → status option for API queries
function getListingFilter() {
  const val = document.getElementById('listing-type')?.value || 'securable';
  // Dropdown values map directly to the trade API status options
  return { status: val };
}
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
const loadMoreBtn    = $('load-more-btn');
const tradeLink      = $('trade-link');
const placeholder    = $('results-placeholder');

// ── Init ──────────────────────────────────────────────────────────────────────
detectProxy().then(() => { loadStatsDb(); fetchLeagues(); loadStaticData(); });

itemInput.addEventListener('paste', () => setTimeout(handleParse, 50));
parseBtn.addEventListener('click', handleParse);
clearBtn.addEventListener('click', handleClear);
searchBtn.addEventListener('click', handleSearch);
loadMoreBtn.addEventListener('click', handleLoadMore);
$('open-trade-btn').addEventListener('click', openInTradeSite);
$('dismiss-cors').addEventListener('click', () => corsWarning.style.display = 'none');
$('poe1-btn').addEventListener('click', () => switchGame('poe1'));
$('poe2-btn').addEventListener('click', () => switchGame('poe2'));
$('mode-search').addEventListener('click', () => switchMode('search'));
$('mode-exchange').addEventListener('click', () => switchMode('exchange'));
$('mode-stash').addEventListener('click', () => switchMode('stash'));
$('exchange-search-btn').addEventListener('click', handleExchangeSearch);

let staticData = []; // [{id, label, entries: [{id, text, image}]}]
const currencyIcons = {}; // populated from staticData: { currencyId: imageUrl }

function switchMode(mode) {
  $('mode-search').classList.toggle('active', mode === 'search');
  $('mode-exchange').classList.toggle('active', mode === 'exchange');
  $('mode-stash').classList.toggle('active', mode === 'stash');
  $('item-search-panel').style.display = mode === 'search' ? 'block' : 'none';
  $('exchange-panel').style.display    = mode === 'exchange' ? 'block' : 'none';
  $('stash-panel').style.display       = mode === 'stash' ? 'block' : 'none';
  parsedSection.style.display = 'none';
  if (mode === 'exchange' && !staticData.length) loadStaticData();
}

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
          statsDb.push({ id: e.id, text: e.text, type: e.type, options: e.option?.options || null });
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
      const seen = new Set();
      for (const l of data.result) {
        if (seen.has(l.id)) continue;
        seen.add(l.id);
        const o = document.createElement('option');
        o.value = l.id; o.textContent = l.id;
        leagueSelect.appendChild(o);
      }
    }
  } catch { /* use defaults */ }
}

// ── Static Data (for exchange) ────────────────────────────────────────────
async function loadStaticData() {
  try {
    const res  = await apiFetch('/data/static');
    const data = await res.json();
    if (data.result) {
      staticData = data.result;
      for (const group of staticData) {
        for (const entry of (group.entries || [])) {
          if (entry.image) {
            // API returns relative paths — make them absolute
            currencyIcons[entry.id] = entry.image.startsWith('http')
              ? entry.image
              : 'https://web.poecdn.com' + entry.image;
          }
        }
      }
      populateExchangeDropdowns();
    }
  } catch (e) { console.warn('Static data failed:', e.message); }
}

function populateExchangeDropdowns() {
  const want = $('exchange-want');
  const have = $('exchange-have');
  if (!want || !have) return;
  want.innerHTML = '';
  have.innerHTML = '';
  for (const group of staticData) {
    const optWant = document.createElement('optgroup');
    optWant.label = group.label || group.id;
    const optHave = document.createElement('optgroup');
    optHave.label = group.label || group.id;
    for (const entry of (group.entries || [])) {
      const oW = document.createElement('option');
      oW.value = entry.id; oW.textContent = entry.text;
      optWant.appendChild(oW);
      const oH = document.createElement('option');
      oH.value = entry.id; oH.textContent = entry.text;
      optHave.appendChild(oH);
    }
    want.appendChild(optWant);
    have.appendChild(optHave);
  }
}

async function handleExchangeSearch() {
  const want   = $('exchange-want')?.value;
  const have   = $('exchange-have')?.value;
  const status = $('exchange-status');
  if (!want || !have) { status.textContent = 'Select both currencies.'; return; }

  $('exchange-search-btn').disabled = true;
  status.textContent = 'Searching…';
  status.className   = 'search-status';
  resultsList.innerHTML = '';
  loadMoreBtn.style.display = 'none';

  try {
    const league  = leagueSelect.value;
    const payload = {
      exchange: {
        status: { option: getListingFilter().status },
        have: [have],
        want: [want],
      }
    };
    const minStock = parseInt($('exchange-min')?.value);
    if (!isNaN(minStock) && minStock > 0) payload.exchange.minimum = minStock;

    console.log('Exchange query:', JSON.stringify(payload, null, 2));

    const res = await apiFetch(`/exchange/${encodeURIComponent(league)}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    if (res.status === 429)
      throw new Error(`Rate limited. Retry in ${res.headers.get('Retry-After') || 60}s.`);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Exchange search failed (${res.status}): ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    lastSearchId  = data.id;
    lastTotal     = data.total || 0;
    lastResultIds = Object.keys(data.result || {});

    status.textContent = `${lastTotal} offers found`;
    placeholder.style.display    = 'none';
    resultsSection.style.display = 'block';
    resultCount.textContent      = `${lastTotal} offers`;

    const gameSlug = game === 'poe1' ? 'trade' : 'trade2';
    tradeLink.href         = `https://www.pathofexile.com/${gameSlug}/exchange/${encodeURIComponent(league)}/${data.id}`;
    tradeLink.style.display = 'inline';

    if (lastResultIds.length) {
      await loadExchangeBatch(0, 20);
    } else {
      resultsList.innerHTML = '<div class="no-results">No offers found.</div>';
    }
  } catch (e) {
    status.textContent = e.message;
    status.className   = 'search-status error';
  } finally {
    $('exchange-search-btn').disabled = false;
  }
}

async function loadExchangeBatch(offset, count) {
  const ids = lastResultIds.slice(offset, offset + count);
  if (!ids.length) return;
  try {
    for (let i = 0; i < ids.length; i += FETCH_CHUNK) {
      const chunk = ids.slice(i, i + FETCH_CHUNK);
      const res = await apiFetch(`/fetch/${chunk.join(',')}?query=${lastSearchId}&exchange`);
      if (res.status === 429)
        throw new Error(`Rate limited. Retry in ${res.headers.get('Retry-After') || 60}s.`);
      if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
      const data = await res.json();
      appendExchangeResults(data.result || []);
    }
    const shown = resultsList.querySelectorAll('.result-card').length;
    loadMoreBtn.style.display = shown < lastResultIds.length ? 'block' : 'none';
  } catch (e) {
    const status = $('exchange-status');
    status.textContent = e.message;
    status.className   = 'search-status error';
  }
}

function appendExchangeResults(results) {
  for (const r of results) {
    if (!r?.listing) continue;
    const { listing } = r;
    const account = listing.account || {};
    const online  = account.online != null;
    const ign     = account.lastCharacterName || account.name || '?';

    // Exchange offers have listing.offers array
    const offers = listing.offers || [];
    let offerHtml = '';
    for (const offer of offers) {
      const exchange = offer.exchange || {};
      const item     = offer.item || {};
      const ratio    = `${exchange.amount || '?'} : ${item.amount || '?'}`;
      const cur1     = exchange.currency || '';
      const cur2     = item.currency || '';
      const stock    = item.stock != null ? ` (stock: ${item.stock})` : '';
      offerHtml += `<div class="exchange-offer">${esc(ratio)} — ${esc(cur1)} for ${esc(cur2)}${stock}</div>`;
    }

    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `
      <div class="card-main">
        <div class="card-price">${offerHtml || '<span class="no-price">—</span>'}</div>
        <div class="card-right">
          <div class="card-seller">
            <span class="status-dot ${online ? 'online' : 'offline'}"></span>
            ${esc(ign)}
          </div>
          <div class="card-time">${listing.indexed ? timeAgo(listing.indexed) : ''}</div>
          <div class="card-actions">
            <button class="btn-whisper" data-whisper="${esc(listing.whisper || '')}">Whisper</button>
          </div>
        </div>
      </div>
    `;
    card.querySelector('.btn-whisper')?.addEventListener('click', function () {
      navigator.clipboard.writeText(this.dataset.whisper).then(() => {
        this.textContent = 'Copied!';
        this.classList.add('copied');
        setTimeout(() => { this.textContent = 'Whisper'; this.classList.remove('copied'); }, 1500);
      });
    });
    resultsList.appendChild(card);
  }
}

// ── Parser (loaded from parser.js) ────────────────────────────────────────────
const { parseItemText, findStat: _findStat, extractModValue,
        convertStashItem, CATEGORY_MAP } = window.ItemParser;
// Wrap findStat to inject statsDb automatically
function findStat(modText, preferType, itemClass) {
  return _findStat(modText, preferType, itemClass, statsDb);
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
  attachDynamicListeners();
  parsedSection.style.display  = 'block';
  resultsSection.style.display = 'none';
  placeholder.style.display    = 'flex';
  searchStatus.textContent  = '';
  searchStatus.className    = 'search-status';
}

let pseudoCounter = 0;
function attachDynamicListeners() {
  // Stat group type toggle — show/hide COUNT min input
  const groupSelect = $('stat-group-type');
  const countRow    = $('count-value-row');
  if (groupSelect && countRow) {
    groupSelect.addEventListener('change', () => {
      countRow.style.display = groupSelect.value === 'count' ? 'inline-flex' : 'none';
    });
  }

  // Pseudo stat dropdown — add rows dynamically
  const pseudoSelect = $('pseudo-stat-select');
  const pseudoList   = $('pseudo-stat-list');
  if (pseudoSelect && pseudoList) {
    pseudoSelect.addEventListener('change', () => {
      const statId = pseudoSelect.value;
      if (!statId) return;
      const stat = statsDb.find(s => s.id === statId);
      if (!stat) return;
      pseudoCounter++;
      const id = `pseudo-${pseudoCounter}`;
      const row = document.createElement('div');
      row.className = 'toggle-row mod-type-pseudo';
      row.dataset.statId = statId;
      row.innerHTML = `
        <input type="checkbox" id="mod-${id}" checked>
        <label for="mod-${id}">${esc(stat.text)}</label>
        <span class="match-ok" title="${esc(stat.id)}">✓</span>
        <div class="row-inputs">
          <span class="filter-label">min</span><input type="number" id="mod-min-${id}" value="" step="1" class="num-input" placeholder="—">
          <span class="filter-label">max</span><input type="number" id="mod-max-${id}" value="" step="1" class="num-input" placeholder="∞">
        </div>
        <button class="btn-remove-pseudo" title="Remove">&times;</button>
      `;
      row.querySelector('.btn-remove-pseudo').addEventListener('click', () => row.remove());
      pseudoList.appendChild(row);
      pseudoSelect.value = '';
    });
  }
}

function renderParsedItem(item) {
  const rc = `rarity-${item.rarity}`;
  let h = '';

  // Header
  h += `<div class="item-header ${rc}">`;
  if (item.name) h += `<div class="item-name">${esc(item.name)}</div>`;
  h += `<div class="item-base">${esc(item.baseType)}</div>`;
  h += `</div>`;

  // Influence badges
  if (item.influences.length) {
    h += `<div class="influence-badges">`;
    for (const inf of item.influences) {
      const label = inf.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      h += `<span class="influence-badge inf-${inf}">${esc(label)}</span>`;
    }
    h += `</div>`;
  }

  h += `<div class="filter-list">`;

  // Name (unique only)
  if (item.rarity === 'unique' && item.name) {
    h += toggleRow('toggle-name', `Name: <em>${esc(item.name)}</em>`, true);
    h += sep();
  }

  // Category filter (any base of this type)
  if (item.rarity !== 'unique' && CATEGORY_MAP[item.itemClass]) {
    h += toggleRow('toggle-category', `Category: ${esc(item.itemClass)} (any base)`, false);
    h += sep();
  }

  // Gem-specific filters
  if (item.category === 'gem') {
    h += `<div class="mod-group">`;
    h += `<div class="mod-group-label gem-label">Gem Properties</div>`;
    if (item.gemLevel) {
      h += toggleRowInput('toggle-gem-level', `Gem Level: ${item.gemLevel}`, true,
        `<span class="filter-label">min</span><input type="number" id="gem-level-min" value="${item.gemLevel}" class="num-input">` +
        `<span class="filter-label">max</span><input type="number" id="gem-level-max" value="" class="num-input">`
      );
    }
    if (item.quality) {
      h += toggleRowInput('toggle-gem-quality', `Quality: +${item.quality}%`, false,
        `<span class="filter-label">min</span><input type="number" id="gem-quality-min" value="${item.quality}" class="num-input">` +
        `<span class="filter-label">max</span><input type="number" id="gem-quality-max" value="" class="num-input">`
      );
    }
    h += `</div>${sep()}`;
  }

  // Map-specific filters
  if (item.category === 'map' && item.mapTier) {
    h += `<div class="mod-group">`;
    h += `<div class="mod-group-label">Map Properties</div>`;
    h += toggleRowInput('toggle-map-tier', `Map Tier: ${item.mapTier}`, true,
      `<span class="filter-label">min</span><input type="number" id="map-tier-min" value="${item.mapTier}" class="num-input">` +
      `<span class="filter-label">max</span><input type="number" id="map-tier-max" value="" class="num-input">`
    );
    h += `</div>${sep()}`;
  }

  // Quality (non-gem items — gems handled above)
  if (item.quality && item.category !== 'gem') {
    h += toggleRowInput('toggle-quality', `Quality: +${item.quality}%${item.qualityType ? ` (${item.qualityType})` : ''}`, false,
      `<span class="filter-label">min</span><input type="number" id="quality-min" value="${item.quality}" class="num-input">`
    );
    h += sep();
  }

  // Item level
  if (item.itemLevel) {
    h += toggleRowInput('toggle-ilvl', `Item Level: ${item.itemLevel}`, true,
      `<span class="filter-label">min</span><input type="number" id="ilvl-min" value="${item.itemLevel}" class="num-input">`
    );
    h += sep();
  }

  // Requires Level
  if (item.requiresLevel) {
    h += toggleRowInput('toggle-req-level', `Requires Level: ${item.requiresLevel}`, false,
      `<span class="filter-label">max</span><input type="number" id="req-level-max" value="${item.requiresLevel}" class="num-input">`
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

  // Stat group operator
  h += `<div class="stat-group-controls">`;
  h += `<label class="filter-label">Stat filter mode</label>`;
  h += `<select id="stat-group-type" class="stat-group-select">`;
  h += `<option value="and">AND (all must match)</option>`;
  h += `<option value="count">COUNT (N must match)</option>`;
  h += `<option value="not">NOT (none must match)</option>`;
  h += `</select>`;
  h += `<div id="count-value-row" style="display:none">`;
  h += `<span class="filter-label">min</span><input type="number" id="count-min" value="1" class="num-input" min="1">`;
  h += `</div>`;
  h += `</div>${sep()}`;

  // For Foulborn items: non-mutated mods are unchecked (one was replaced and may
  // match the wrong stat). Mutated mods stay checked — they define the variant.
  const isFoulborn = !!item.isFoulborn;
  const mutatedSet = new Set(item.mutatedMods || []);

  // Enchant mods
  if (item.enchantMods.length) {
    h += `<div class="mod-group">`;
    h += `<div class="mod-group-label enchant-label">Enchant</div>`;
    item.enchantMods.forEach((m, i) => h += modRow(`enc-${i}`, m, findStat(m, 'enchant', item.itemClass), 'enchant', { defaultOff: isFoulborn }));
    h += `</div>${sep()}`;
  }

  // Implicit mods
  if (item.implicitMods.length) {
    h += `<div class="mod-group">`;
    h += `<div class="mod-group-label implicit-label">Implicit</div>`;
    item.implicitMods.forEach((m, i) => h += modRow(`imp-${i}`, m, findStat(m, 'implicit', item.itemClass), 'implicit', { defaultOff: isFoulborn }));
    h += `</div>${sep()}`;
  }

  // Fractured mods
  if (item.fracturedMods.length) {
    h += `<div class="mod-group">`;
    h += `<div class="mod-group-label fractured-label">Fractured</div>`;
    item.fracturedMods.forEach((m, i) => h += modRow(`frac-${i}`, m, findStat(m, 'fractured', item.itemClass), 'fractured', { defaultOff: isFoulborn }));
    h += `</div>${sep()}`;
  }

  // Explicit mods
  if (item.explicitMods.length) {
    h += `<div class="mod-group">`;
    h += `<div class="mod-group-label">Explicit Mods${isFoulborn ? ' <span class="tag tag-corrupted">Foulborn</span>' : ''}</div>`;
    item.explicitMods.forEach((m, i) => {
      const isMutated = mutatedSet.has(m);
      // Mutated mods stay checked — they define the Foulborn variant
      h += modRow(`exp-${i}`, m, findStat(m, 'explicit', item.itemClass), 'explicit', { defaultOff: isFoulborn && !isMutated });
    });
    h += `</div>`;
    if (item.craftedMods.length) h += sep();
  }

  // Crafted mods
  if (item.craftedMods.length) {
    h += `<div class="mod-group">`;
    h += `<div class="mod-group-label crafted-label">Crafted</div>`;
    item.craftedMods.forEach((m, i) => h += modRow(`cra-${i}`, m, findStat(m, 'crafted', item.itemClass), 'crafted', { defaultOff: isFoulborn }));
    h += `</div>`;
  }

  h += sep();

  // Pseudo stats
  h += `<div class="mod-group pseudo-stats">`;
  h += `<div class="mod-group-label pseudo-label">Pseudo Stats</div>`;
  h += `<div class="pseudo-add-row">`;
  h += `<select id="pseudo-stat-select" class="pseudo-select">`;
  h += `<option value="">+ Add pseudo stat…</option>`;
  const COMMON_PSEUDO_PREFIXES = [
    'pseudo.pseudo_total_life',
    'pseudo.pseudo_total_elemental_resistance',
    'pseudo.pseudo_total_resistance',
    'pseudo.pseudo_total_strength',
    'pseudo.pseudo_total_dexterity',
    'pseudo.pseudo_total_intelligence',
    'pseudo.pseudo_count_fractured',
    'pseudo.pseudo_total_attack_speed',
    'pseudo.pseudo_adds_physical_damage',
    'pseudo.pseudo_adds_fire_damage',
    'pseudo.pseudo_adds_cold_damage',
    'pseudo.pseudo_adds_lightning_damage',
    'pseudo.pseudo_increased_movement_speed',
  ];
  // Show common pseudos first, then all others
  const pseudoStats = statsDb.filter(s => s.type === 'pseudo');
  const commonPseudos = COMMON_PSEUDO_PREFIXES.map(id => pseudoStats.find(s => s.id === id)).filter(Boolean);
  const otherPseudos = pseudoStats.filter(s => !COMMON_PSEUDO_PREFIXES.includes(s.id));
  if (commonPseudos.length) {
    h += `<optgroup label="Common">`;
    for (const s of commonPseudos) h += `<option value="${esc(s.id)}">${esc(s.text)}</option>`;
    h += `</optgroup>`;
  }
  if (otherPseudos.length) {
    h += `<optgroup label="All Pseudo Stats">`;
    for (const s of otherPseudos) h += `<option value="${esc(s.id)}">${esc(s.text)}</option>`;
    h += `</optgroup>`;
  }
  h += `</select></div>`;
  h += `<div id="pseudo-stat-list"></div>`;
  h += `</div>`;

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
  if (!item.identified) {
    h += toggleRow('filter-unidentified', 'Unidentified', true);
  }
  // Veiled / Fractured / Enchanted / Crafted toggles
  h += toggleRow('filter-veiled', 'Veiled', false);
  if (item.fracturedMods.length) {
    h += toggleRow('filter-fractured-item', 'Fractured Item', true);
  } else {
    h += toggleRow('filter-fractured-item', 'Fractured', false);
  }
  h += toggleRow('filter-enchanted', 'Enchanted', false);
  h += toggleRow('filter-crafted', 'Crafted', false);

  for (const inf of item.influences) {
    const label = inf.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    h += toggleRow(`filter-inf-${inf}`, `${label} Item`, true);
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
function modRow(id, modText, stat, type, { defaultOff = false } = {}) {
  const isOption = stat?.optionId !== undefined;
  const val  = isOption ? null : extractModValue(modText);
  const ok   = !!stat;
  const cls  = `mod-type-${type}`;
  const altIds = stat?.alternates || [];
  const negated  = !!stat?.negated;  // "reduced"→"increased" direction swap
  const inverted = !!stat?.inverted; // trade API uses reversed sign convention
  // APAT's tradeInvert logic: shouldNegate = negated XOR inverted
  // When both are true they cancel out; when only one is true, negate and swap.
  const shouldNegate = negated !== inverted;
  const flags = [negated ? 'negated' : '', inverted ? 'inverted' : ''].filter(Boolean).join(', ');
  const indicator = ok
    ? `<span class="match-ok" title="${esc(stat.id)}${altIds.length ? ' (+' + altIds.length + ' alt)' : ''}${flags ? ' (' + flags + ')' : ''}">✓</span>`
    : `<span class="match-fail" title="No stat match — skipped">✗</span>`;
  const optAttr = isOption ? ` data-option-id="${esc(String(stat.optionId))}"` : '';
  const altAttr = altIds.length ? ` data-alt-ids="${esc(altIds.join(','))}"` : '';
  const negAttr = shouldNegate ? ' data-negated="1"' : '';
  let h = `<div class="toggle-row ${cls}" data-stat-id="${ok ? esc(stat.id) : ''}"${optAttr}${altAttr}${negAttr}>`;
  // For unique items: default mods unchecked (name is sufficient). Mutated mods stay checked.
  const checked = ok && !defaultOff;
  h += `<input type="checkbox" id="mod-${id}" ${checked ? 'checked' : (ok ? '' : 'disabled')} data-mod="${esc(modText)}">`;
  h += `<label for="mod-${id}">${esc(modText)}</label>`;
  h += indicator;
  if (val && ok) {
    let minVal, maxVal;
    if (shouldNegate) {
      // Negate AND swap min/max (APAT's filterAdjustmentForNegate + getMinMax).
      // "50% reduced X" → API stat "#% increased X" with value -50.
      // We want max=-50 (meaning "at most -50 increased" = "at least 50% reduced").
      // For range mods: original [min, max] → negated [-max, -min].
      if (val.isRange) {
        minVal = -Math.abs(val.max);
        maxVal = -Math.abs(val.min);
      } else {
        minVal = '';  // leave min open
        maxVal = -Math.abs(val.min);  // cap at the negated value
      }
    } else {
      minVal = val.min;
      maxVal = val.isRange ? val.max : '';
    }
    h += `<div class="row-inputs">`;
    h += `<span class="filter-label">min</span><input type="number" id="mod-min-${id}" value="${minVal}" step="1" class="num-input" placeholder="—">`;
    h += `<span class="filter-label">max</span><input type="number" id="mod-max-${id}" value="${maxVal}" step="1" class="num-input" placeholder="∞">`;
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

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ── Build Query ───────────────────────────────────────────────────────────────
function buildQuery(item) {
  const groupType = $('stat-group-type')?.value || 'and';
  const mainGroup = { type: groupType, filters: [] };
  if (groupType === 'count') {
    const min = parseInt($('count-min')?.value);
    if (!isNaN(min)) mainGroup.value = { min };
  }
  const listing = getListingFilter();
  const q = {
    status: { option: listing.status },
    stats:  [mainGroup],
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

  // Category filter — search by item class instead of specific base type
  if ($('toggle-category')?.checked) {
    const cat = CATEGORY_MAP[item.itemClass];
    if (cat) {
      q.filters.type_filters = q.filters.type_filters || { disabled: false, filters: {} };
      q.filters.type_filters.filters.category = { option: cat };
      delete q.type; // Don't filter by specific base type
    }
  }

  if (!isUnique) {
    const rarityOption = isMagic ? 'magic' : (item.rarity === 'normal' ? 'normal' : 'nonunique');
    q.filters.type_filters = q.filters.type_filters || { disabled: false, filters: {} };
    q.filters.type_filters.filters.rarity = { option: rarityOption };
  }

  // Synthesised
  if ($('filter-synthesised')?.checked) {
    (q.filters.misc_filters = q.filters.misc_filters || { disabled: false, filters: {} })
      .filters.synthesised_item = { option: 'true' };
  }

  // Gem level & quality
  if ($('toggle-gem-level')?.checked) {
    const min = parseInt($('gem-level-min')?.value);
    const max = parseInt($('gem-level-max')?.value);
    const f = {};
    if (!isNaN(min)) f.min = min;
    if (!isNaN(max)) f.max = max;
    if (Object.keys(f).length) {
      (q.filters.misc_filters = q.filters.misc_filters || { disabled: false, filters: {} })
        .filters.gem_level = f;
    }
  }
  if ($('toggle-gem-quality')?.checked) {
    const min = parseInt($('gem-quality-min')?.value);
    const max = parseInt($('gem-quality-max')?.value);
    const f = {};
    if (!isNaN(min)) f.min = min;
    if (!isNaN(max)) f.max = max;
    if (Object.keys(f).length) {
      (q.filters.misc_filters = q.filters.misc_filters || { disabled: false, filters: {} })
        .filters.quality = f;
    }
  }

  // Map tier
  if ($('toggle-map-tier')?.checked) {
    const min = parseInt($('map-tier-min')?.value);
    const max = parseInt($('map-tier-max')?.value);
    const f = {};
    if (!isNaN(min)) f.min = min;
    if (!isNaN(max)) f.max = max;
    if (Object.keys(f).length) {
      q.filters.map_filters = { disabled: false, filters: { map_tier: f } };
    }
  }

  // Item level
  if ($('toggle-ilvl')?.checked) {
    const min = parseInt($('ilvl-min')?.value);
    if (!isNaN(min)) {
      (q.filters.misc_filters = q.filters.misc_filters || { disabled: false, filters: {} })
        .filters.ilvl = { min };
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

  // Unidentified
  if ($('filter-unidentified')?.checked) {
    (q.filters.misc_filters = q.filters.misc_filters || { disabled: false, filters: {} })
      .filters.identified = { option: 'false' };
  }

  // Quality (non-gem)
  if ($('toggle-quality')?.checked) {
    const min = parseInt($('quality-min')?.value);
    if (!isNaN(min)) {
      (q.filters.misc_filters = q.filters.misc_filters || { disabled: false, filters: {} })
        .filters.quality = { min };
    }
  }

  // Requires Level
  if ($('toggle-req-level')?.checked) {
    const max = parseInt($('req-level-max')?.value);
    if (!isNaN(max)) {
      q.filters.req_filters = { disabled: false, filters: { lvl: { max } } };
    }
  }

  // Veiled / Fractured / Enchanted / Crafted misc toggles
  if ($('filter-veiled')?.checked) {
    (q.filters.misc_filters = q.filters.misc_filters || { disabled: false, filters: {} })
      .filters.veiled = { option: 'true' };
  }
  if ($('filter-fractured-item')?.checked) {
    (q.filters.misc_filters = q.filters.misc_filters || { disabled: false, filters: {} })
      .filters.fractured_item = { option: 'true' };
  }
  if ($('filter-enchanted')?.checked) {
    (q.filters.misc_filters = q.filters.misc_filters || { disabled: false, filters: {} })
      .filters.enchanted = { option: 'true' };
  }
  if ($('filter-crafted')?.checked) {
    (q.filters.misc_filters = q.filters.misc_filters || { disabled: false, filters: {} })
      .filters.crafted = { option: 'true' };
  }

  // Influences
  for (const inf of ['shaper','elder','crusader','hunter','redeemer','warlord','searing_exarch','eater_of_worlds']) {
    if ($(`filter-inf-${inf}`)?.checked) {
      (q.filters.misc_filters = q.filters.misc_filters || { disabled: false, filters: {} })
        .filters[`${inf}_item`] = { option: 'true' };
    }
  }

  // Mods helper — handles duplicate stat IDs by creating count groups
  function addMods(prefix) {
    const container = document.querySelectorAll(`[id^="mod-${prefix}-"]`);
    for (const chk of container) {
      const row    = chk.closest('.toggle-row');
      const statId = row?.dataset.statId;
      if (!statId) continue;
      const isDisabled = !chk.checked;
      const suffix   = chk.id.replace(`mod-${prefix}-`, '');
      const value    = {};
      const optionId = row.dataset.optionId;
      if (optionId !== undefined && optionId !== '') {
        value.option = parseInt(optionId);
      } else {
        const minEl = $(`mod-min-${prefix}-${suffix}`);
        const maxEl = $(`mod-max-${prefix}-${suffix}`);
        if (minEl && minEl.value !== '') value.min = parseFloat(minEl.value);
        if (maxEl && maxEl.value !== '') value.max = parseFloat(maxEl.value);
      }
      const altIdsStr = row.dataset.altIds;
      if (altIdsStr) {
        // Multiple stat IDs match this mod — use a count group with min:1
        // so the API tries all of them (only one will be correct)
        const altGroup = { type: 'count', value: { min: 1 }, filters: [], disabled: isDisabled };
        altGroup.filters.push({ id: statId, value: { ...value }, disabled: isDisabled });
        for (const altId of altIdsStr.split(',')) {
          altGroup.filters.push({ id: altId.trim(), value: { ...value }, disabled: isDisabled });
        }
        q.stats.push(altGroup);
      } else {
        mainGroup.filters.push({ id: statId, value, disabled: isDisabled });
      }
    }
  }

  addMods('enc');
  addMods('imp');
  addMods('frac');
  addMods('exp');
  addMods('cra');

  // Pseudo stats (separate AND group)
  const pseudoGroup = { type: 'and', filters: [] };
  const pseudoRows = document.querySelectorAll('#pseudo-stat-list .toggle-row');
  for (const row of pseudoRows) {
    const chk = row.querySelector('input[type="checkbox"]');
    if (!chk?.checked) continue;
    const statId = row.dataset.statId;
    if (!statId) continue;
    const id = chk.id.replace('mod-', '');
    const filter = { id: statId, value: {}, disabled: false };
    const minEl = $(`mod-min-${id}`);
    const maxEl = $(`mod-max-${id}`);
    if (minEl && minEl.value !== '') filter.value.min = parseFloat(minEl.value);
    if (maxEl && maxEl.value !== '') filter.value.max = parseFloat(maxEl.value);
    pseudoGroup.filters.push(filter);
  }
  if (pseudoGroup.filters.length) q.stats.push(pseudoGroup);

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
  const iconUrl = currencyIcons[currency];
  const iconHtml = iconUrl ? `<img class="cur-icon" src="${esc(iconUrl)}" alt="${esc(abbr)}">` : '';
  return `${amount} ${iconHtml}<span class="cur cur-${esc(currency)}">${esc(abbr)}</span>`;
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
      if (item.properties) {
        const lvlProp = item.properties.find(p => p.name === 'Level');
        if (lvlProp?.values?.[0]) tags.push(`<span class="tag tag-gem-lvl">Lvl ${lvlProp.values[0][0]}</span>`);
        const qualProp = item.properties.find(p => p.name === 'Quality');
        if (qualProp?.values?.[0]) tags.push(`<span class="tag tag-gem-q">Q${qualProp.values[0][0]}</span>`);
        const tierProp = item.properties.find(p => p.name === 'Map Tier');
        if (tierProp?.values?.[0]) tags.push(`<span class="tag">T${tierProp.values[0][0]}</span>`);
      }
      if (item.corrupted)  tags.push(`<span class="tag tag-corrupted">Corrupted</span>`);
      if (item.fractured)  tags.push(`<span class="tag tag-fractured">Fractured</span>`);
      if (item.mirrored)   tags.push(`<span class="tag tag-mirrored">Mirrored</span>`);
      if (item.shaper)          tags.push(`<span class="tag tag-influence tag-shaper">Shaper</span>`);
      if (item.elder)           tags.push(`<span class="tag tag-influence tag-elder">Elder</span>`);
      if (item.crusader)        tags.push(`<span class="tag tag-influence tag-crusader">Crusader</span>`);
      if (item.hunter)          tags.push(`<span class="tag tag-influence tag-hunter">Hunter</span>`);
      if (item.redeemer)        tags.push(`<span class="tag tag-influence tag-redeemer">Redeemer</span>`);
      if (item.warlord)         tags.push(`<span class="tag tag-influence tag-warlord">Warlord</span>`);
      if (item.spikedByEaterOfWorlds) tags.push(`<span class="tag tag-influence tag-eater">Eater</span>`);
      if (item.spikedBySearingExarch) tags.push(`<span class="tag tag-influence tag-exarch">Exarch</span>`);
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

    // Item icon
    const iconHtml = item?.icon
      ? `<img class="card-icon" src="${esc(item.icon)}" alt="" loading="lazy">`
      : '';

    // Socket visualization from API response
    let socketsHtml = '';
    if (item?.sockets?.length) {
      const SOCK_ATTR = { S: 'sock-r', D: 'sock-g', I: 'sock-b', G: 'sock-w', A: 'sock-a', DV: 'sock-w' };
      let lastGroup = -1;
      for (const s of item.sockets) {
        if (lastGroup >= 0 && s.group === lastGroup) socketsHtml += `<span class="sock-link">-</span>`;
        else if (lastGroup >= 0) socketsHtml += ' ';
        const cls = SOCK_ATTR[s.attr] || '';
        socketsHtml += `<span class="sock ${cls}">${s.attr || '?'}</span>`;
        lastGroup = s.group;
      }
      socketsHtml = `<div class="card-sockets">${socketsHtml}</div>`;
    }

    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `
      <div class="card-main">
        ${iconHtml}
        <div class="card-price">${price ? formatCurrency(price.amount, price.currency) : '<span class="no-price">—</span>'}</div>
        <div>
          <div class="card-item rarity-${rarity}">${itemLabel}</div>
          ${tags.length ? `<div class="result-tags">${tags.join('')}</div>` : ''}
          ${socketsHtml}
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

// ── Stash Check ──────────────────────────────────────────────────────────────

$('stash-connect-btn').addEventListener('click', handleStashConnect);
$('stash-load-btn').addEventListener('click', handleStashLoad);

let stashAbortController = null;

async function stashFetch(path) {
  const sessId = $('stash-poesessid').value.trim();
  if (!sessId) throw new Error('Enter your POESESSID first');
  const res = await fetch(PROXY + path, {
    headers: { 'X-POESESSID': sessId },
  });
  if (res.status === 403) throw new Error('Invalid POESESSID or session expired');
  if (res.status === 429) throw new Error(`Rate limited. Retry in ${res.headers.get('Retry-After') || 60}s`);
  if (!res.ok) throw new Error(`Stash API error (${res.status})`);
  return res.json();
}

async function handleStashConnect() {
  const status = $('stash-connect-status');
  const tabSection = $('stash-tab-section');
  status.textContent = 'Connecting…';
  status.className = 'search-status';
  tabSection.style.display = 'none';

  try {
    const league = $('league').value;
    const data = await stashFetch(
      `/character-window/get-stash-items?league=${encodeURIComponent(league)}&tabs=1&tabIndex=0`
    );

    if (!data.tabs || !data.tabs.length) {
      status.textContent = 'No stash tabs found';
      status.className = 'search-status error';
      return;
    }

    // Populate tab dropdown
    const select = $('stash-tab-select');
    select.innerHTML = '';
    for (const tab of data.tabs) {
      const opt = document.createElement('option');
      opt.value = tab.i;
      opt.textContent = `${tab.n} (${tab.type})`;
      select.appendChild(opt);
    }

    tabSection.style.display = 'block';
    status.textContent = `Connected — ${data.tabs.length} tabs`;
    status.className = 'search-status';

    // Save to sessionStorage
    sessionStorage.setItem('poesessid', $('stash-poesessid').value.trim());
  } catch (e) {
    status.textContent = e.message;
    status.className = 'search-status error';
  }
}

// Build a simplified trade query for auto-pricing (no DOM dependencies)
function buildStashPriceQuery(item) {
  const listing = getListingFilter();
  const mainGroup = { type: 'and', filters: [] };
  const q = {
    status: { option: listing.status },
    stats:  [mainGroup],
    filters: {},
  };

  // Name / type
  if (item.rarity === 'unique' && item.name) {
    q.name = item.name;
    q.type = item.baseType;
  } else if (item.rarity !== 'magic' && item.baseType) {
    q.type = item.baseType;
  }

  // Rarity filter for non-uniques
  if (item.rarity !== 'unique') {
    const rarityOption = item.rarity === 'magic' ? 'magic' : (item.rarity === 'normal' ? 'normal' : 'nonunique');
    q.filters.type_filters = q.filters.type_filters || { disabled: false, filters: {} };
    q.filters.type_filters.filters.rarity = { option: rarityOption };
  }

  // Synthesised
  if (item.synthesised) {
    (q.filters.misc_filters = q.filters.misc_filters || { disabled: false, filters: {} })
      .filters.synthesised_item = { option: 'true' };
  }

  // Corrupted
  if (item.corrupted) {
    (q.filters.misc_filters = q.filters.misc_filters || { disabled: false, filters: {} })
      .filters.corrupted = { option: 'true' };
  }

  // Item level for rares ilvl 80+
  if (item.rarity === 'rare' && item.itemLevel >= 80) {
    (q.filters.misc_filters = q.filters.misc_filters || { disabled: false, filters: {} })
      .filters.ilvl = { min: item.itemLevel };
  }

  // Links (6-link)
  if (item.linkCount >= 5) {
    q.filters.socket_filters = { disabled: false, filters: { links: { min: item.linkCount } } };
  }

  // All mods — build stat filters from item data directly
  function addModGroup(mods, preferType) {
    for (const modText of mods) {
      const stat = findStat(modText, preferType, item.itemClass);
      if (!stat) continue;
      const val = extractModValue(modText);
      const value = {};
      if (stat.optionId !== undefined) {
        value.option = stat.optionId;
      } else if (val && val.min !== null) {
        // Use the item's actual values as the search filter
        if (stat.negated) {
          // Negated: swap and negate min/max
          if (val.max !== null) value.min = -val.max;
          else value.min = -val.min;
          if (val.min !== null && val.max !== null) value.max = -val.min;
        } else {
          value.min = val.min;
          if (val.max !== null) value.max = val.max;
        }
      }

      if (stat.alternates) {
        // Multiple stat IDs match — use count group with min:1
        const altGroup = { type: 'count', value: { min: 1 }, filters: [] };
        altGroup.filters.push({ id: stat.id, value: { ...value }, disabled: false });
        for (const altId of stat.alternates) {
          altGroup.filters.push({ id: altId, value: { ...value }, disabled: false });
        }
        q.stats.push(altGroup);
      } else {
        mainGroup.filters.push({ id: stat.id, value, disabled: false });
      }
    }
  }

  // For unique items, name+type is sufficient — unique-specific mods often
  // don't have searchable stat IDs and cause zero results (APAT does the same).
  // For Foulborn uniques, include only the mutated mod (defines the variant).
  if (item.rarity === 'unique') {
    if (item.isFoulborn && item.mutatedMods?.length) {
      addModGroup(item.mutatedMods, 'explicit');
    }
  } else {
    addModGroup(item.enchantMods,   'enchant');
    addModGroup(item.implicitMods,  'implicit');
    addModGroup(item.fracturedMods, 'fractured');
    addModGroup(item.explicitMods,  'explicit');
    addModGroup(item.craftedMods,   'crafted');
  }

  return q;
}

function openStashItemInSearch(item) {
  console.log('Stash item (converted):', item);
  console.log('explicitMods:', item.explicitMods);
  console.log('implicitMods:', item.implicitMods);
  // Switch to item search mode and display the stash item with full mods
  switchMode('search');
  parsedData = item;
  renderParsedItem(item);
  attachDynamicListeners();
  parsedSection.style.display  = 'block';
  resultsSection.style.display = 'none';
  placeholder.style.display    = 'flex';
  searchStatus.textContent  = '';
  searchStatus.className    = 'search-status';
  // Reconstruct full item text in the input box
  const lines = [];
  if (item.itemClass) lines.push(`Item Class: ${item.itemClass}`);
  lines.push(`Rarity: ${item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1)}`);
  if (item.name) lines.push(item.name);
  if (item.baseType) lines.push(item.baseType);
  lines.push('--------');
  if (item.quality) lines.push(`Quality: +${item.quality}%`);
  if (item.armour) lines.push(`Armour: ${item.armour}`);
  if (item.evasion) lines.push(`Evasion Rating: ${item.evasion}`);
  if (item.energyShield) lines.push(`Energy Shield: ${item.energyShield}`);
  if (item.ward) lines.push(`Ward: ${item.ward}`);
  if (item._physLine) lines.push(`Physical Damage: ${item._physLine}`);
  if (item._eleLine) lines.push(`Elemental Damage: ${item._eleLine}`);
  if (item.critChance) lines.push(`Critical Strike Chance: ${item.critChance}%`);
  if (item.aps) lines.push(`Attacks per Second: ${item.aps}`);
  if (item.mapTier) lines.push(`Map Tier: ${item.mapTier}`);
  if (item.gemLevel) lines.push(`Level: ${item.gemLevel}`);
  if (item.requiresLevel) { lines.push('--------'); lines.push(`Requirements:`); lines.push(`Level: ${item.requiresLevel}`); }
  if (item.sockets) { lines.push('--------'); lines.push(`Sockets: ${item.sockets}`); }
  if (item.itemLevel) { lines.push('--------'); lines.push(`Item Level: ${item.itemLevel}`); }
  if (item.implicitMods.length) { lines.push('--------'); item.implicitMods.forEach(m => lines.push(`${m} (implicit)`)); }
  if (item.explicitMods.length) { lines.push('--------'); item.explicitMods.forEach(m => lines.push(m)); }
  if (item.craftedMods.length) item.craftedMods.forEach(m => lines.push(`${m} (crafted)`));
  if (item.fracturedMods.length) item.fracturedMods.forEach(m => lines.push(`${m} (fractured)`));
  if (item.corrupted) lines.push('--------\nCorrupted');
  if (item.mirrored) lines.push('Mirrored');
  lines.push('--------\n(loaded from stash)');
  itemInput.value = lines.join('\n');
  // Auto-trigger the search so results appear on the right
  handleSearch();
}

// Fetch with automatic 429 retry + adaptive pacing from rate limit headers.
// The trade API returns headers like: x-rate-limit-ip: 6:5:60,12:30:60
// meaning 6 hits per 5s window OR 12 hits per 30s window (within 60s policy).
// x-rate-limit-ip-state: 4:5:0,8:30:0 = current usage in each window.
// We read the state to compute the safest delay before the next request.
let _stashNextRequestAt = 0;

async function stashRateLimitedFetch(path, opts, progressEl, _retries = 0) {
  // Wait until our pacing allows the next request
  const now = Date.now();
  if (_stashNextRequestAt > now) {
    const waitMs = _stashNextRequestAt - now;
    if (progressEl) progressEl.textContent = progressEl.textContent.replace(/— .*/, '') + `— pacing ${Math.ceil(waitMs / 1000)}s…`;
    await new Promise(r => setTimeout(r, waitMs));
  }

  const res = await apiFetch(path, opts);

  if (res.status === 429) {
    if (_retries >= 3) throw new Error('Rate limited — try again later');
    const retryAfter = res.headers.get('Retry-After');
    console.log('429 Retry-After raw:', retryAfter, 'retry #', _retries + 1);
    const parsed = parseInt(retryAfter);
    // Use actual Retry-After if valid, otherwise escalating backoff: 5s, 15s, 30s
    const fallbacks = [5, 15, 30];
    const wait = (parsed > 0 && parsed <= 120) ? parsed : fallbacks[_retries];
    if (progressEl) progressEl.textContent = `Rate limited — waiting ${wait}s (retry ${_retries + 1}/3)…`;
    await new Promise(r => setTimeout(r, wait * 1000));
    return stashRateLimitedFetch(path, opts, progressEl, _retries + 1);
  }

  // Parse rate limit state per the PoE API spec:
  // X-Rate-Limit-Rules: comma-delimited rule names (e.g. "ip", "account", "client")
  // X-Rate-Limit-{rule}: maxHits:period:restrictTime,...
  // X-Rate-Limit-{rule}-State: curHits:period:activeRestrict,...
  const ruleNames = res.headers.get('x-rate-limit-rules');
  let maxDelay = 1500; // minimum 1.5s between requests (safe for bulk)
  let foundHeaders = false;

  if (ruleNames) {
    for (const ruleName of ruleNames.split(',')) {
      const limits = res.headers.get(`x-rate-limit-${ruleName.trim()}`);
      const state  = res.headers.get(`x-rate-limit-${ruleName.trim()}-state`);
      if (!limits || !state) continue;
      foundHeaders = true;

      const limitParts = limits.split(',');
      const stateParts = state.split(',');

      for (let r = 0; r < limitParts.length; r++) {
        const [maxHits, period] = limitParts[r].split(':').map(Number);
        const [curHits, , activeRestrict]     = (stateParts[r] || '').split(':').map(Number);
        if (!maxHits || !period) continue;

        // If currently restricted, wait the full restriction time
        if (activeRestrict > 0) {
          maxDelay = Math.max(maxDelay, activeRestrict * 1000);
          continue;
        }

        const remaining = maxHits - curHits;
        if (remaining <= 2) {
          // Near the limit — wait enough to avoid hitting it and getting restrictTime penalty
          maxDelay = Math.max(maxDelay, (period / maxHits) * 1000 * 2);
        } else {
          // Pace evenly across the window, leave headroom
          maxDelay = Math.max(maxDelay, (period / (remaining - 1)) * 1000);
        }
      }
    }
  }

  if (!foundHeaders) {
    // No rate limit headers visible — use conservative fixed delay
    maxDelay = 2000;
  }

  console.log('Rate limit pacing:', maxDelay + 'ms', ruleNames || '(no headers)');
  _stashNextRequestAt = Date.now() + maxDelay;

  return res;
}

async function handleStashLoad() {
  const loadStatus = $('stash-load-status');
  const progressDiv = $('stash-progress');
  const progressFill = $('stash-progress-fill');
  const progressText = $('stash-progress-text');
  const resultsDiv = $('stash-results');
  const resultsBody = $('stash-results-body');

  // Cancel previous run if any
  if (stashAbortController) stashAbortController.abort();
  stashAbortController = new AbortController();
  const signal = stashAbortController.signal;

  loadStatus.textContent = 'Loading stash tab…';
  loadStatus.className = 'search-status';
  progressDiv.style.display = 'none';
  resultsDiv.style.display = 'none';
  resultsBody.innerHTML = '';

  try {
    const league = $('league').value;
    const tabIndex = $('stash-tab-select').value;

    const data = await stashFetch(
      `/character-window/get-stash-items?league=${encodeURIComponent(league)}&tabs=0&tabIndex=${tabIndex}`
    );

    const items = data.items || [];
    if (!items.length) {
      loadStatus.textContent = 'Tab is empty';
      return;
    }

    // Convert all items — log raw JSON for debugging
    console.log('Stash raw items:', items);
    const converted = items.map(convertStashItem);

    // Filter to price-checkable items, tag skip reasons
    const priceable = [];
    const skippedItems = [];
    for (const item of converted) {
      if (!item.identified)                              skippedItems.push({ item, reason: 'unidentified' });
      else if (item.category === 'currency')             skippedItems.push({ item, reason: 'currency' });
      else if (item.category === 'gem')                  skippedItems.push({ item, reason: 'gem' });
      else if (item.category === 'card')                 skippedItems.push({ item, reason: 'div card' });
      else if (item.rarity === 'normal' && item.category !== 'map') skippedItems.push({ item, reason: 'normal item' });
      else priceable.push(item);
    }

    loadStatus.textContent = `${priceable.length} items to price check${skippedItems.length ? ` (${skippedItems.length} skipped)` : ''}`;
    progressDiv.style.display = 'block';
    resultsDiv.style.display = 'block';

    // Add skipped items as grey rows with reason
    for (const { item, reason } of skippedItems) {
      const row = document.createElement('tr');
      row.className = 'stash-row-clickable';
      row.innerHTML = `
        <td>${item._stashIcon ? `<img class="stash-item-icon" src="${esc(item._stashIcon)}">` : ''}
            <span class="stash-skip">${esc(item.name || item.baseType)}</span></td>
        <td class="stash-type">${esc(item.category)}</td>
        <td class="stash-ilvl">${item.itemLevel || '—'}</td>
        <td class="stash-price-none">skipped (${esc(reason)})</td>`;
      row.addEventListener('click', () => openStashItemInSearch(item));
      resultsBody.appendChild(row);
    }

    // Price check each item with rate limiting
    for (let i = 0; i < priceable.length; i++) {
      if (signal.aborted) return;

      const item = priceable[i];
      const pct = Math.round(((i + 1) / priceable.length) * 100);
      progressFill.style.width = pct + '%';
      progressText.textContent = `Checking ${i + 1}/${priceable.length}: ${item.name || item.baseType}`;

      const row = document.createElement('tr');
      row.className = 'stash-row-clickable';
      const nameClass = `stash-item-name rarity-${item.rarity}`;
      const displayName = item.name ? `${item.name} — ${item.baseType}` : item.baseType;

      try {
        const query = buildStashPriceQuery(item);
        const payload = { query, sort: { price: 'asc' } };

        const res = await stashRateLimitedFetch(`/search/${encodeURIComponent(league)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal,
        }, progressText);

        const searchData = await res.json();
        let priceHtml = '<span class="stash-price-none">no listings</span>';

        if (searchData.result && searchData.result.length > 0) {
          const fetchIds = searchData.result.slice(0, 1).join(',');
          const fetchRes = await stashRateLimitedFetch(`/fetch/${fetchIds}?query=${searchData.id}`, { signal }, progressText);
          const fetchData = await fetchRes.json();

          if (fetchData.result && fetchData.result[0]?.listing?.price) {
            const p = fetchData.result[0].listing.price;
            priceHtml = `<span class="stash-price">${esc(String(p.amount))} ${esc(p.currency)}</span>`;
          }
        }

        row.innerHTML = `
          <td>${item._stashIcon ? `<img class="stash-item-icon" src="${esc(item._stashIcon)}">` : ''}
              <span class="${nameClass}">${esc(displayName)}</span></td>
          <td class="stash-type">${esc(item.category)}</td>
          <td class="stash-ilvl">${item.itemLevel || '—'}</td>
          <td>${priceHtml}</td>`;
      } catch (e) {
        if (signal.aborted) return;
        row.innerHTML = `
          <td>${item._stashIcon ? `<img class="stash-item-icon" src="${esc(item._stashIcon)}">` : ''}
              <span class="${nameClass}">${esc(displayName)}</span></td>
          <td class="stash-type">${esc(item.category)}</td>
          <td class="stash-ilvl">${item.itemLevel || '—'}</td>
          <td class="stash-price-none">${esc(e.message)}</td>`;
      }

      row.addEventListener('click', () => openStashItemInSearch(item));
      resultsBody.appendChild(row);
    }

    progressText.textContent = `Done — ${priceable.length} items checked`;
    loadStatus.textContent = 'Complete';
  } catch (e) {
    if (e.name === 'AbortError') return;
    loadStatus.textContent = e.message;
    loadStatus.className = 'search-status error';
  }
}

// Restore POESESSID from sessionStorage on load
if (sessionStorage.getItem('poesessid')) {
  $('stash-poesessid').value = sessionStorage.getItem('poesessid');
}
