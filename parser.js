// ── Item Parser — shared between browser and Node.js ──────────────────────────
// Browser: <script src="parser.js"> exposes window.ItemParser
// Node.js: require('./parser') returns the same exports
(function(exports) {
'use strict';

// ── Constants ────────────────────────────────────────────────────────────────

// Tags appended to mod lines by the game client
const MOD_TYPE_RE = /\s*\((implicit|crafted|fractured|enchant(?:ment)?|scourge|mutated)\)\s*$/i;

// Cluster jewel mods are always enchants — even when the game client omits the (enchant) tag
const CLUSTER_ENCHANT_RE = /^(?:Adds \d+ Passive Skills?|Added Small Passive Skills?(?:\s+also)?\s+grant:|(?:\d+|\#) Added Passive Skill)/i;

const INSTRUCTION_RE = /^(?:Place into|Right click to remove|Right click this item|Can be anointed|Can be used in|Shift click to unstack|Click to add|Currently has \d|Travel to this)/i;

const STANDALONE = new Set([
  'Corrupted','Mirrored','Unidentified','Fractured Item','Synthesised Item',
  'Shaper Item','Elder Item','Crusader Item','Hunter Item','Redeemer Item','Warlord Item',
  'Searing Exarch Item','Eater of Worlds Item',
]);

const CATEGORY_MAP = {
  'Claws': 'weapon.claw', 'Daggers': 'weapon.dagger', 'Rune Daggers': 'weapon.runedagger',
  'Wands': 'weapon.wand', 'One Hand Swords': 'weapon.onesword',
  'Thrusting One Hand Swords': 'weapon.onesword', 'One Hand Axes': 'weapon.oneaxe',
  'One Hand Maces': 'weapon.onemace', 'Bows': 'weapon.bow',
  'Staves': 'weapon.staff', 'Warstaves': 'weapon.warstaff',
  'Two Hand Swords': 'weapon.twosword', 'Two Hand Axes': 'weapon.twoaxe',
  'Two Hand Maces': 'weapon.twomace', 'Sceptres': 'weapon.sceptre',
  'Flails': 'weapon.flail', 'Spears': 'weapon.spear', 'Crossbows': 'weapon.crossbow',
  'Body Armours': 'armour.chest', 'Helmets': 'armour.helmet',
  'Gloves': 'armour.gloves', 'Boots': 'armour.boots',
  'Shields': 'armour.shield', 'Quivers': 'armour.quiver',
  'Belts': 'accessory.belt', 'Rings': 'accessory.ring', 'Amulets': 'accessory.amulet',
  'Jewels': 'jewel', 'Jewel': 'jewel', 'Abyss Jewels': 'jewel.abyss',
  'Maps': 'map', 'Life Flasks': 'flask', 'Utility Flasks': 'flask',
  'Mana Flasks': 'flask', 'Hybrid Flasks': 'flask',
  'Charms': 'charm', 'Tinctures': 'tincture',
};

const INFLUENCE_MAP = {
  'Shaper Item': 'shaper', 'Elder Item': 'elder',
  'Crusader Item': 'crusader', 'Hunter Item': 'hunter',
  'Redeemer Item': 'redeemer', 'Warlord Item': 'warlord',
  'Searing Exarch Item': 'searing_exarch', 'Eater of Worlds Item': 'eater_of_worlds',
};

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

// Patterns that become local on defence items — derived from actual trade API "(Local)" stat entries
const LOCAL_DEFENCE_RE = new RegExp([
  'increased Armour$',
  'increased Evasion Rating$',
  'increased Energy Shield$',
  'increased Block chance$',
  'increased Armour and Evasion(?: Rating)?$',
  'increased Armour and Energy Shield$',
  'increased Evasion and Energy Shield$',
  'increased Evasion(?: Rating)? and Energy Shield$',
  'increased Armour, Evasion(?: Rating)? and Energy Shield$',
  '\\bto Armour$',
  '\\bto Evasion Rating$',
  '\\bto maximum Energy Shield$',
].join('|'), 'i');

// Patterns that become local on weapons — derived from actual trade API "(Local)" stat entries
const LOCAL_WEAPON_RE = new RegExp([
  'increased Attack Speed$',
  'Adds \\d.+(?:Physical|Lightning|Cold|Fire|Chaos) Damage$',
  '\\bto Accuracy Rating$',
  'Physical Attack Damage Leeched as Life',
  'Physical Attack Damage Leeched as Mana',
  'chance to Poison on Hit$',
  '^Culling Strike$',
].join('|'), 'i');

// ~100 stats with reversed sign convention in the trade API (from APAT stats.ndjson).
// The API expects POSITIVE values for "reduced/less" and NEGATIVE for "increased/more".
// Combined with direction swap: shouldNegateAndSwap = negated XOR inverted
const TRADE_INVERTED_STAT_NUMS = new Set([
  // Action Speed
  '2878959938','2251857767','1829486532',
  // Less damage/duration
  '414991155','4181057577','67637087','2733459550','3796523155','3298440988',
  '1715495976','1237693206',
  // Damage Reflection
  '2510655429','603134774','1574578643','2467518140','2255585376','3991837781',
  '3829555156','2173565521','648344494','2195698019','4260371388',
  // Reduced Damage Taken
  '3001376862','2960683632','3762784591','3303114033','1101403182','1425651005',
  '3309607228','1686913105','983989924','3859593448','1276918229','248838155',
  '3158958938','1165847826','1869678332',
  // Reduced Effect of Ailments/Curses
  '1478653032','2434101731','3407849389','4265534424','3801067695','1152934561',
  '433740375','1343931641',
  // Reduced Costs
  '2701327257','644456512','116232170','2859471749','2969128501','262301496',
  '3293275880','73272763','180240697','1274125114','3671920033','1116269888',
  // Reduced Other
  '269590092','4147897060','2102212273','1195367742','76848920','1550221644',
  '2543931078','2576412389','4041805509','1186934478','1912660783',
  // Reservation Efficiency (inverted wording)
  '1471600638','3289633055',
  // Enemy Debuffs
  '3231424461','1773891268','4107150355','3134790305','3903907406','607839150',
  '3169825297','3407071583','2570471069',
  // Golems/Minions
  '478698670','2861397339','3730242558','1583498502',
  // Map/Atlas Mods
  '3737068014','2549889921','2312028586','272758639','4181072906','3729221884',
  '3957379603',
  // Miscellaneous
  '207635700','2443132097','902947445','3281809492','3577248251','2160417795',
  '129035625','68410701','3544527742','1039536123',
]);

// Select strategy: prefer stat by item category (mirrors APAT's StatGroup select)
const ITEM_CATEGORY_MAP = {
  ARMOUR: DEFENCE_CLASSES,
  WEAPON: WEAPON_CLASSES,
};

const DIRECTION_SWAPS = [
  [/\breduced\b/i,    'increased'],
  [/\bless\b/i,       'more'],
];

// ── Helper Functions ─────────────────────────────────────────────────────────

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
  return /^(Item Level|Quality|Sockets|Level|Physical Damage|Elemental Damage|Chaos Damage|Fire Damage|Cold Damage|Lightning Damage|Critical Strike Chance|Attacks per Second|Weapon Range|Armour|Energy Shield|Evasion Rating|Ward|Chance to Block|Requirements|Str|Dex|Int|Map Tier|Stack Size|Experience|Movement Speed|Cost|Cooldown Time|Cast Time|Effectiveness of Added Damage|Mana Multiplier|Mana Cost|Next-level|Reservation|Lasts|Consumes|Recovers)\b/.test(l);
}

// Detect sections that are definitively NOT mods. Everything else → treat as mods.
// False negatives (flavour text entering mod parser) are harmless — findStat() won't match,
// they render as disabled X rows, and buildQuery() skips them.
function isNonModSection(sec, itemClass) {
  // Placement / usage instructions — stable game-client boilerplate
  if (sec.some(l => INSTRUCTION_RE.test(l))) return true;
  // Divination cards — non-property, non-standalone sections are reward/flavour text
  if (itemClass === 'Divination Cards' || itemClass === 'Divination Card') return true;
  // Currency description prose — no mod tags, contains periods (full sentences)
  if (itemClass === 'Stackable Currency' || itemClass === 'Currency') {
    if (!sec.some(l => MOD_TYPE_RE.test(l)) && sec.some(l => l.includes('.'))) return true;
  }
  return false;
}

function round1(n) { return Math.round(n * 10) / 10; }

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

function classifyItemType(item) {
  const ic = item.itemClass;
  if (!ic) return 'unknown';
  if (ic === 'Divination Cards' || ic === 'Divination Card') return 'card';
  if (ic === 'Stackable Currency' || ic === 'Currency') return 'currency';
  if (ic === 'Map Fragments' || ic === 'Misc Map Items') return 'fragment';
  if (ic === 'Maps') return 'map';
  if (ic.includes('Skill Gems') || ic === 'Gems' || ic === 'Support Gems' || ic === 'Active Skill Gems') return 'gem';
  if (/Flask/i.test(ic)) return 'flask';
  if (ic === 'Jewels' || ic === 'Jewel' || ic === 'Abyss Jewels') return 'jewel';
  if (ic === 'Quivers') return 'quiver';
  if (ic === 'Charms') return 'charm';
  if (ic === 'Tinctures') return 'tincture';
  if (ic === 'Trinkets') return 'trinket';
  if (ic === 'Heist Contracts' || ic === 'Blueprints') return 'heist';
  if (ic === 'Logbooks') return 'logbook';
  if (ic === 'Sentinels') return 'sentinel';
  if (ic === 'Memories') return 'memory';
  if (ic === 'Sanctum Relics') return 'sanctumrelic';
  if (WEAPON_CLASSES.has(ic)) return 'weapon';
  if (DEFENCE_CLASSES.has(ic)) return 'armour';
  if (['Rings','Amulets','Belts'].includes(ic)) return 'accessory';
  return 'unknown';
}

// ── Main Parser ──────────────────────────────────────────────────────────────

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
    influences: [],
    // Weapon
    physDps: null, eleDps: null, totalDps: null, critChance: null, aps: null,
    // Defence
    armour: null, evasion: null, energyShield: null, ward: null,
    // Gem
    gemLevel: null, gemExperience: null,
    // Map
    mapTier: null,
    // Misc
    blockChance: null, requiresLevel: null, stackSize: null,
    category: 'unknown',
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
      if (INFLUENCE_MAP[l])    { item.influences.push(INFLUENCE_MAP[l]); continue; }
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
        } else if (l.startsWith('Map Tier:')) {
          const m = l.match(/(\d+)/); if (m) item.mapTier = parseInt(m[1]);
        } else if (l.startsWith('Chance to Block:')) {
          const m = l.match(/(\d+)%/); if (m) item.blockChance = parseInt(m[1]);
        } else if (l.startsWith('Stack Size:')) {
          const m = l.match(/(\d+)\/(\d+)/);
          if (m) item.stackSize = { current: parseInt(m[1]), max: parseInt(m[2]) };
        } else if (l.startsWith('Level:') && !sec.some(s => s === 'Requirements:')) {
          const m = l.match(/Level:\s*(\d+)/); if (m) item.gemLevel = parseInt(m[1]);
        } else if (l.startsWith('Experience:')) {
          item.gemExperience = l.replace('Experience:', '').trim();
        } else if (l === 'Corrupted')  { item.corrupted = true; }
        else if (l === 'Mirrored')     { item.mirrored  = true; }
      }
      continue;
    }

    // Gems: skip mod parsing entirely (APAT/Sidekick approach).
    // Gem "stats" (Deals X damage, Base duration, etc.) are gem-level properties,
    // not searchable explicit mods. Gems are searched by level, quality, corrupted only.
    if (item.rarity === 'gem') {
      for (const l of sec) {
        if (l === 'Corrupted')  item.corrupted = true;
        if (l === 'Mirrored')   item.mirrored  = true;
      }
      continue;
    }

    // Non-mod section? (instructions, div card text, currency prose)
    if (isNonModSection(sec, item.itemClass)) {
      for (const l of sec) {
        if (l === 'Corrupted')  item.corrupted = true;
        if (l === 'Mirrored')   item.mirrored  = true;
      }
      continue;
    }

    // Everything else is treated as a mod section.
    // Pre-pass: join multi-line mods (mirrors APAT's linesToStatStrings).
    const CONTINUATION_RE = /^(?:[a-z]|and\b|or\b|per\b|while\b|when\b|during\b|if\b)/;
    const joined = [];
    for (const l of sec) {
      const stripped = stripModTag(l);
      if (joined.length > 0 && stripped && CONTINUATION_RE.test(stripped)) {
        const prev = joined[joined.length - 1];
        const prevStripped = stripModTag(prev);
        const thisTag = l.match(MOD_TYPE_RE);
        joined[joined.length - 1] = prevStripped + ' ' + stripped + (thisTag ? ' ' + thisTag[0].trim() : '');
      } else {
        joined.push(l);
      }
    }

    for (const l of joined) {
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
  }

  // ── Requires Level (second pass — find Requirements section) ──
  for (let i = 1; i < sections.length; i++) {
    const sec = sections[i];
    if (sec.some(l => l === 'Requirements:')) {
      for (const l of sec) {
        const m = l.match(/^Level:\s*(\d+)/);
        if (m) { item.requiresLevel = parseInt(m[1]); break; }
      }
      break;
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

  item.category = classifyItemType(item);
  return item;
}

// ── Stat Matching ────────────────────────────────────────────────────────────

function normMod(text) {
  return text
    .replace(/\([+\-]?\d+(?:\.\d+)?[-–][+\-]?\d+(?:\.\d+)?\)/g, '#')  // (40-60) → #
    .replace(/[+\-]?\d+(\.\d+)?/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isLocalMod(modText, itemClass) {
  if (DEFENCE_CLASSES.has(itemClass) && LOCAL_DEFENCE_RE.test(modText)) return true;
  if (WEAPON_CLASSES.has(itemClass) && LOCAL_WEAPON_RE.test(modText)) return true;
  return false;
}

function isTradeInverted(statId) {
  if (!statId) return false;
  const m = statId.match(/stat_(\d+)/);
  return m ? TRADE_INVERTED_STAT_NUMS.has(m[1]) : false;
}

// Match an item mod against an option-type stat (where # is a dropdown, not a number).
// Returns the option id (integer) on success, or null.
function matchOptionValue(modText, stat) {
  if (!stat.options || !stat.options.length) return null;
  const hashIdx = stat.text.indexOf('#');
  if (hashIdx === -1) return null;
  const prefix   = stat.text.slice(0, hashIdx).toLowerCase();
  const suffix   = stat.text.slice(hashIdx + 1).toLowerCase();
  const modLower = modText.toLowerCase();
  if (!modLower.startsWith(prefix)) return null;

  // Try each option: construct expected text and compare
  for (const opt of stat.options) {
    const expected = prefix + opt.text.toLowerCase() + suffix;
    if (modLower === expected) return opt.id;
  }
  // Flexible match: normalize articles/whitespace
  const normFlex = s => s.replace(/\b(the|a|an)\b/gi, '').replace(/\s+/g, ' ').trim();
  const modNorm = normFlex(modLower);
  for (const opt of stat.options) {
    const expected = normFlex(prefix + opt.text.toLowerCase() + suffix);
    if (modNorm === expected) return opt.id;
  }
  return null;
}

function swapDirection(text) {
  let swapped = false;
  let out = text;
  for (const [re, replacement] of DIRECTION_SWAPS) {
    if (re.test(out)) {
      out = out.replace(re, replacement);
      swapped = true;
    }
  }
  return swapped ? out : null;
}

function findStat(modText, preferType, itemClass, statsDb) {
  if (!statsDb || !statsDb.length) return null;
  preferType = preferType || 'explicit';
  itemClass  = itemClass  || '';

  const norm       = normMod(modText);
  const normPlus   = '+' + norm;
  const normNoSign = norm.replace(/^[+\-]#?\s*/, '').trim();
  const local      = isLocalMod(modText, itemClass);

  // Build all "(Local)" variants to try
  const localVariants = local ? [
    norm + ' (local)',
    normPlus + ' (local)',
    '+' + normNoSign + ' (local)',
    normNoSign + ' (local)',
  ] : [];

  // Direction-swapped variants (reduced->increased, less->more)
  const swappedMod = swapDirection(modText);
  let swNorm, swNormPlus, swNormNoSign, swLocalVariants;
  if (swappedMod) {
    swNorm       = normMod(swappedMod);
    swNormPlus   = '+' + swNorm;
    swNormNoSign = swNorm.replace(/^[+\-]#?\s*/, '').trim();
    swLocalVariants = local ? [
      swNorm + ' (local)',
      swNormPlus + ' (local)',
      '+' + swNormNoSign + ' (local)',
      swNormNoSign + ' (local)',
    ] : [];
  }

  // Search order: preferred type first, then other useful types
  const order = [preferType, 'explicit', 'fractured', 'crafted', 'implicit', 'enchant']
    .filter((v, i, a) => a.indexOf(v) === i);

  // Helper: collect ALL stats matching a predicate (for duplicate stat IDs with same text).
  // Uses APAT's "select" strategy: when multiple stats match, prefer the one whose
  // trade ID corresponds to the item's category (armour/weapon), fall back to the rest.
  // Returns a shallow copy so we don't mutate statsDb entries.
  function collectAll(matchFn, extraProps) {
    const matches = [];
    for (const type of order) {
      for (const s of statsDb) {
        if (s.type !== type) continue;
        if (matchFn(s)) matches.push(s);
      }
      if (matches.length) break; // stop at first type that has matches
    }
    if (!matches.length) return null;

    // Select strategy: if multiple matches and we know the item category,
    // prefer the local stat for armour/weapon items, non-local for others.
    let primary = matches[0];
    if (matches.length > 1 && itemClass) {
      const isArmour = DEFENCE_CLASSES.has(itemClass);
      const isWeapon = WEAPON_CLASSES.has(itemClass);
      const localMatch    = matches.find(s => s.text.toLowerCase().includes('(local)'));
      const nonLocalMatch = matches.find(s => !s.text.toLowerCase().includes('(local)'));
      if ((isArmour || isWeapon) && localMatch) primary = localMatch;
      else if (nonLocalMatch) primary = nonLocalMatch;
    }

    const result = { ...primary, ...extraProps };
    // Add trade.inverted flag
    if (isTradeInverted(result.id)) result.inverted = true;
    // Store alternates (other matching stat IDs)
    const others = matches.filter(s => s.id !== primary.id);
    if (others.length) {
      result.alternates = others.map(s => s.id);
    }
    return result;
  }

  // For local mods: try the "(Local)" variant first, then fall back to plain
  if (local) {
    const result = collectAll(s => localVariants.some(v => s.text.toLowerCase() === v));
    if (result) return result;
    // Try direction-swapped local variants
    if (swLocalVariants) {
      const swResult = collectAll(s => swLocalVariants.some(v => s.text.toLowerCase() === v), { negated: true });
      if (swResult) return swResult;
    }
  }

  // Exact normalized match — collect all duplicates
  const exactResult = collectAll(s => {
    const st = s.text.toLowerCase();
    return st === norm || st === normPlus || st === normNoSign;
  });
  if (exactResult) return exactResult;

  // Try direction-swapped match (reduced->increased, less->more)
  if (swappedMod) {
    const swResult = collectAll(s => {
      const st = s.text.toLowerCase();
      return st === swNorm || st === swNormPlus || st === swNormNoSign;
    }, { negated: true });
    if (swResult) return swResult;
  }

  // Option-type stat match (e.g. "Added Small Passive Skills grant: #" where # is a dropdown)
  for (const type of order) {
    for (const s of statsDb) {
      if (s.type !== type || !s.options) continue;
      const optId = matchOptionValue(modText, s);
      if (optId !== null) return { ...s, optionId: optId };
    }
  }

  // Fuzzy fallback — only within preferred + explicit, skip (Local) entries for non-local mods
  const words = normNoSign.replace(/[#%]/g, '').trim().split(/\s+/).filter(w => w.length > 2);
  if (!words.length) return null;
  // For cluster jewel enchants, keep "grant:" vs "also grant:" mutually exclusive
  const hasAlsoGrant = normNoSign.includes('also grant:');
  const hasGrantOnly = normNoSign.includes('grant:') && !hasAlsoGrant;
  const pool = statsDb.filter(s => {
    if (s.type !== preferType && s.type !== 'explicit') return false;
    if (!local && s.text.toLowerCase().includes('(local)')) return false;
    const st = s.text.toLowerCase();
    if (hasGrantOnly  && st.includes('also grant:')) return false;
    if (hasAlsoGrant  && st.includes('grant:') && !st.includes('also grant:')) return false;
    return true;
  });
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

// ── Value Extraction ─────────────────────────────────────────────────────────

function extractModValue(text) {
  const rng = text.match(/(\d+)\s+to\s+(\d+)/i);
  if (rng && /^adds\b/i.test(text))
    return { min: +rng[1], max: +rng[2], isRange: true };
  // Capture sign so "-1 to Maximum Power Charges" gives min: -1
  const single = text.match(/([+\-]?\d+(?:\.\d+)?)/);
  if (single) return { min: parseFloat(single[1]), max: null, isRange: false };
  return null;
}

// ── Stash API Item Conversion ─────────────────────────────────────────────────
// Converts a JSON item from the PoE stash API into the same shape as parseItemText() output.
// This lets stash items flow through the same findStat / buildQuery / render pipeline.

const FRAME_TYPE_RARITY = ['normal', 'magic', 'rare', 'unique', 'gem', 'currency',
                           'divination card', 'quest', 'prophecy', 'foil', 'sentinel'];

function convertStashItem(json) {
  const item = {
    rarity: FRAME_TYPE_RARITY[json.frameType] || 'unknown',
    name: json.name ? json.name.replace(/^<<.*?>>/, '') : '',
    baseType: json.typeLine || '',
    itemClass: '',  // stash API doesn't provide item class directly
    itemLevel: json.ilvl || null,
    quality: null, qualityType: '',
    sockets: '', socketCount: 0, linkCount: 0,
    explicitMods: json.explicitMods || [],
    implicitMods: json.implicitMods || [],
    craftedMods: json.craftedMods || [],
    fracturedMods: json.fracturedMods || [],
    enchantMods: json.enchantMods || [],
    corrupted: !!json.corrupted,
    mirrored: !!json.duplicated,
    identified: json.identified !== false,
    synthesised: !!json.synthesised,
    influences: [],
    // Weapon
    physDps: null, eleDps: null, totalDps: null, critChance: null, aps: null,
    // Defence
    armour: null, evasion: null, energyShield: null, ward: null,
    // Gem
    gemLevel: null, gemExperience: null,
    // Map
    mapTier: null,
    // Misc
    blockChance: null, requiresLevel: null, stackSize: null,
    category: 'unknown',
    // Stash-specific
    _stashIcon: json.icon || null,
    _stashX: json.x, _stashY: json.y,
    _stashW: json.w, _stashH: json.h,
    _stashId: json.id || null,
  };

  // ── Strip base type prefixes (trade API expects plain base type) ──
  const BASE_TYPE_PREFIXES = ['Synthesised ', 'Superior ', 'Blighted ', 'Blight-ravaged '];
  for (const prefix of BASE_TYPE_PREFIXES) {
    if (item.baseType.startsWith(prefix)) {
      item.baseType = item.baseType.slice(prefix.length);
      break;
    }
  }

  // ── Influences ──
  if (json.influences) {
    for (const [inf, val] of Object.entries(json.influences)) {
      if (val) item.influences.push(inf); // shaper, elder, etc.
    }
  }

  // ── Sockets ──
  if (json.sockets && json.sockets.length) {
    // Group sockets by their group number to compute links
    const groups = {};
    for (const s of json.sockets) {
      const g = s.group;
      groups[g] = (groups[g] || 0) + 1;
    }
    item.socketCount = json.sockets.length;
    item.linkCount = Math.max(...Object.values(groups));
    // Build socket string for display (e.g. "R-G-B R")
    const groupStrs = [];
    let curGroup = -1, curStr = '';
    for (const s of json.sockets) {
      const c = s.sColour || 'W';
      if (s.group !== curGroup) {
        if (curStr) groupStrs.push(curStr);
        curStr = c;
        curGroup = s.group;
      } else {
        curStr += '-' + c;
      }
    }
    if (curStr) groupStrs.push(curStr);
    item.sockets = groupStrs.join(' ');
  }

  // ── Properties ──
  if (json.properties) {
    for (const prop of json.properties) {
      const name = prop.name;
      const val0 = prop.values && prop.values[0] && prop.values[0][0];
      if (!val0) continue;

      if (name === 'Quality') {
        const m = val0.match(/\+?(\d+)%/);
        if (m) item.quality = parseInt(m[1]);
      } else if (name === 'Armour') {
        item.armour = parseInt(val0);
      } else if (name === 'Evasion Rating') {
        item.evasion = parseInt(val0);
      } else if (name === 'Energy Shield') {
        item.energyShield = parseInt(val0);
      } else if (name === 'Ward') {
        item.ward = parseInt(val0);
      } else if (name === 'Chance to Block') {
        const m = val0.match(/(\d+)%/);
        if (m) item.blockChance = parseInt(m[1]);
      } else if (name === 'Physical Damage') {
        item._physLine = val0;
      } else if (name === 'Elemental Damage') {
        item._eleLine = val0;
      } else if (name === 'Attacks per Second') {
        item.aps = parseFloat(val0);
      } else if (name === 'Critical Strike Chance') {
        const m = val0.match(/([\d.]+)%/);
        if (m) item.critChance = parseFloat(m[1]);
      } else if (name === 'Map Tier') {
        item.mapTier = parseInt(val0);
      } else if (name === 'Level') {
        // Gem level — only if frameType is gem
        if (json.frameType === 4) item.gemLevel = parseInt(val0);
      } else if (name === 'Stack Size') {
        const m = val0.match(/(\d+)\/(\d+)/);
        if (m) item.stackSize = { current: parseInt(m[1]), max: parseInt(m[2]) };
      }
    }
  }

  // ── Requirements ──
  if (json.requirements) {
    for (const req of json.requirements) {
      if (req.name === 'Level' && req.values && req.values[0]) {
        item.requiresLevel = parseInt(req.values[0][0]);
      }
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

  // ── Derive item class from category/icon ──
  // The stash API doesn't provide itemClass directly, so we infer from the icon URL
  // which contains the item category path, or from frameType for special types.
  if (json.frameType === 4) {
    item.itemClass = 'Skill Gems';
  } else if (json.frameType === 5) {
    item.itemClass = 'Stackable Currency';
  } else if (json.frameType === 6) {
    item.itemClass = 'Divination Cards';
  } else if (json.icon) {
    // Icon URLs contain category hints like /2DItems/Weapons/TwoHandWeapons/Bows/
    const ic = json.icon.toLowerCase();
    if (ic.includes('/weapons/')) {
      if (ic.includes('bows'))              item.itemClass = 'Bows';
      else if (ic.includes('claws'))        item.itemClass = 'Claws';
      else if (ic.includes('daggers'))      item.itemClass = 'Daggers';
      else if (ic.includes('wands'))        item.itemClass = 'Wands';
      else if (ic.includes('onehandswords')) item.itemClass = 'One Hand Swords';
      else if (ic.includes('twohandswords')) item.itemClass = 'Two Hand Swords';
      else if (ic.includes('onehandaxes'))  item.itemClass = 'One Hand Axes';
      else if (ic.includes('twohandaxes'))  item.itemClass = 'Two Hand Axes';
      else if (ic.includes('onehandmaces')) item.itemClass = 'One Hand Maces';
      else if (ic.includes('twohandmaces')) item.itemClass = 'Two Hand Maces';
      else if (ic.includes('staves'))       item.itemClass = 'Staves';
      else if (ic.includes('sceptres'))     item.itemClass = 'Sceptres';
    } else if (ic.includes('/armours/')) {
      if (ic.includes('bodyarmours'))     item.itemClass = 'Body Armours';
      else if (ic.includes('helmets'))    item.itemClass = 'Helmets';
      else if (ic.includes('gloves'))     item.itemClass = 'Gloves';
      else if (ic.includes('boots'))      item.itemClass = 'Boots';
      else if (ic.includes('shields'))    item.itemClass = 'Shields';
    } else if (ic.includes('/accessories/')) {
      if (ic.includes('rings'))           item.itemClass = 'Rings';
      else if (ic.includes('amulets'))    item.itemClass = 'Amulets';
      else if (ic.includes('belts'))      item.itemClass = 'Belts';
    } else if (ic.includes('/jewels/')) {
      item.itemClass = ic.includes('abyss') ? 'Abyss Jewels' : 'Jewels';
    } else if (ic.includes('/quivers/')) {
      item.itemClass = 'Quivers';
    } else if (ic.includes('/maps/'))    item.itemClass = 'Maps';
    else if (ic.includes('/flasks/'))    item.itemClass = 'Utility Flasks';
  }

  item.category = classifyItemType(item);
  return item;
}

// ── Exports ──────────────────────────────────────────────────────────────────

exports.parseItemText     = parseItemText;
exports.classifyItemType  = classifyItemType;
exports.convertStashItem  = convertStashItem;
exports.findStat          = findStat;
exports.extractModValue  = extractModValue;
exports.normMod          = normMod;
exports.isLocalMod       = isLocalMod;
exports.swapDirection    = swapDirection;
exports.matchOptionValue = matchOptionValue;
exports.getModType       = getModType;
exports.stripModTag      = stripModTag;
exports.isPropertyLine   = isPropertyLine;
exports.CATEGORY_MAP     = CATEGORY_MAP;
exports.DEFENCE_CLASSES  = DEFENCE_CLASSES;
exports.WEAPON_CLASSES   = WEAPON_CLASSES;
exports.LOCAL_DEFENCE_RE = LOCAL_DEFENCE_RE;
exports.LOCAL_WEAPON_RE  = LOCAL_WEAPON_RE;
exports.MOD_TYPE_RE      = MOD_TYPE_RE;
exports.CLUSTER_ENCHANT_RE = CLUSTER_ENCHANT_RE;
exports.DIRECTION_SWAPS  = DIRECTION_SWAPS;
exports.STANDALONE       = STANDALONE;
exports.INFLUENCE_MAP    = INFLUENCE_MAP;

})(typeof module !== 'undefined' && module.exports ? module.exports : (this.ItemParser = {}));
