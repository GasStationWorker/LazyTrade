function parseSockets(item) {
  const raw = item.sockets;
  if (!raw) return;
  const groups = raw.split(/\s+/);
  let totalSockets = 0;
  let maxLink = 0;
  const colors = { r: 0, g: 0, b: 0, w: 0 };
  for (const group of groups) {
    const sockets = group.split('-');
    totalSockets += sockets.length;
    if (sockets.length > maxLink) maxLink = sockets.length;
    for (const s of sockets) {
      const c = s.toUpperCase();
      if (c === 'R') colors.r++;
      else if (c === 'G') colors.g++;
      else if (c === 'B') colors.b++;
      else if (c === 'W') colors.w++;
    }
  }
  item.socketCount = totalSockets;
  item.linkCount = maxLink;
  item.socketColors = colors;
}

function parseItemText(text) {
  const lines = text.trim().split('\n').map(l => l.trim());
  const sections = [];
  let current = [];
  for (const line of lines) {
    if (line === '--------') {
      if (current.length > 0) sections.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) sections.push(current);
  if (sections.length < 2) return null;

  const item = {
    rarity: '', name: '', baseType: '', itemClass: '',
    itemLevel: null, quality: null, sockets: '',
    socketCount: 0, linkCount: 0,
    socketColors: { r: 0, g: 0, b: 0, w: 0 },
    explicitMods: [], implicitMods: [],
    corrupted: false, identified: true,
  };

  const header = sections[0];
  for (const line of header) {
    if (line.startsWith('Item Class:')) item.itemClass = line.replace('Item Class:', '').trim();
    else if (line.startsWith('Rarity:')) item.rarity = line.replace('Rarity:', '').trim().toLowerCase();
  }
  const nameLines = header.filter(l => !l.startsWith('Item Class:') && !l.startsWith('Rarity:'));
  if (nameLines.length >= 2) { item.name = nameLines[0]; item.baseType = nameLines[1]; }
  else if (nameLines.length === 1) { item.baseType = nameLines[0]; }

  const standaloneKeywords = ['Corrupted','Unidentified','Mirrored','Shaper Item','Elder Item','Crusader Item','Hunter Item','Redeemer Item','Warlord Item'];

  function isPropertyLine(line) {
    return /^(Item Level|Quality|Sockets|Level|Physical Damage|Elemental Damage|Chaos Damage|Critical Strike Chance|Attacks per Second|Weapon Range|Armour|Energy Shield|Evasion Rating|Chance to Block|Requirements|Str|Dex|Int|Map Tier|Stack Size|Experience)\b/.test(line);
  }

  function classifySection(sec) {
    if (sec.length === 1) {
      if (standaloneKeywords.includes(sec[0])) return 'skip';
      if (sec[0].startsWith('Note:')) return 'skip';
    }
    if (sec.some(l => isPropertyLine(l))) return 'property';
    if (sec.some(l => l.includes('(implicit)'))) return 'implicit';
    if (sec.some(l => /^[+-]?\d/.test(l) || /\b(increased|reduced|more|less|adds|to)\b/i.test(l) || /\bcannot\b/i.test(l) || /\bgain\b/i.test(l)))
      return 'explicit';
    return 'skip';
  }

  for (let i = 1; i < sections.length; i++) {
    const sec = sections[i];
    const type = classifySection(sec);
    if (type === 'property') {
      for (const line of sec) {
        if (line.startsWith('Item Level:')) item.itemLevel = parseInt(line.replace('Item Level:', '').trim());
        else if (/^Quality/.test(line)) { const m = line.match(/\+?(\d+)%/); if (m) item.quality = parseInt(m[1]); }
        else if (line.startsWith('Sockets:')) { item.sockets = line.replace('Sockets:', '').trim(); parseSockets(item); }
      }
    } else if (type === 'implicit') {
      item.implicitMods = sec.map(l => l.replace(/\s*\(implicit\)\s*$/, ''));
    } else if (type === 'explicit') {
      item.explicitMods.push(...sec);
    }
    // Handle corrupted in any section
    for (const line of sec) {
      if (line === 'Corrupted') item.corrupted = true;
      if (line === 'Unidentified') item.identified = false;
    }
  }

  item.explicitMods = item.explicitMods.filter(m => m && !m.startsWith('Note:') && !standaloneKeywords.includes(m));
  return item;
}

// TEST
const text = `Item Class: Belts
Rarity: Unique
Mageblood
Heavy Belt
--------
Quality (Critical Modifiers): +8% (augmented)
--------
Requirements:
Level: 48
--------
Item Level: 80
--------
38% increased Critical Strike Chance during any Flask Effect (implicit)
+27% to Critical Strike Multiplier during any Flask Effect (implicit)
--------
+41 to Dexterity
+17% to Fire Resistance
+16% to Cold Resistance
Magic Utility Flasks cannot be Used
Leftmost 4 Magic Utility Flasks constantly apply their Flask Effects to you
Magic Utility Flask Effects cannot be removed
--------
Rivers of power course through your veins.
--------
Corrupted
--------
Note: ~b/o 5 mirror`;

const item = parseItemText(text);
console.log('name:', item.name);
console.log('baseType:', item.baseType);
console.log('rarity:', item.rarity);
console.log('ilvl:', item.itemLevel);
console.log('quality:', item.quality);
console.log('corrupted:', item.corrupted);
console.log('implicits:', item.implicitMods);
console.log('explicits:', item.explicitMods);
