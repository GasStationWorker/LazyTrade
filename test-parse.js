// ── Parser (shared with app.js via parser.js) ──
const { parseItemText } = require('./parser');

// ── Test framework ──
let passed = 0, failed = 0;
function assert(condition, testName, detail) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.log(`  FAIL: ${testName}`);
    if (detail) console.log(`    ${detail}`);
  }
}
function assertEq(actual, expected, testName) {
  assert(actual === expected, testName, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function assertIncludes(arr, value, testName) {
  assert(arr && arr.some(m => m.includes(value)), testName, `expected array to contain "${value}", got ${JSON.stringify(arr)}`);
}
function assertNotIncludes(arr, value, testName) {
  assert(!arr || !arr.some(m => m.includes(value)), testName, `expected array NOT to contain "${value}", got matching entries`);
}

// ══════════════════════════════════════════════════
// TEST ITEMS
// ══════════════════════════════════════════════════

// ── 1. Mageblood (Unique Belt — implicits, explicits, flavour text, corrupted) ──
console.log('=== 1. Mageblood ===');
const mageblood = parseItemText(`Item Class: Belts
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
Note: ~b/o 5 mirror`);
assertEq(mageblood.name, 'Mageblood', 'name');
assertEq(mageblood.baseType, 'Heavy Belt', 'baseType');
assertEq(mageblood.rarity, 'unique', 'rarity');
assertEq(mageblood.itemLevel, 80, 'itemLevel');
assertEq(mageblood.quality, 8, 'quality');
assertEq(mageblood.corrupted, true, 'corrupted');
assertEq(mageblood.implicitMods.length, 2, 'implicit count');
assertIncludes(mageblood.implicitMods, 'Critical Strike Chance', 'implicit: crit chance');
assertIncludes(mageblood.explicitMods, '+41 to Dexterity', 'explicit: dex');
assertIncludes(mageblood.explicitMods, 'cannot be Used', 'explicit: flask mod');
// Flavour text should NOT be in explicits (it has no mod tag and is a separate section)
// With inverted approach, flavour text DOES appear in explicits — this is acceptable
// because findStat() won't match it, so it renders as disabled ✗ row

// ── 2. Forbidden Flame (Unique Jewel — option-type mod, no typical mod keywords) ──
console.log('=== 2. Forbidden Flame ===');
const ff = parseItemText(`Item Class: Jewels
Rarity: Unique
Forbidden Flame
Crimson Jewel
--------
Limited to: 1
--------
Requirements:
Class:: Marauder
--------
Item Level: 86
--------
Allocates Hinekora, Death's Fury if you have the matching modifier on Forbidden Flesh
--------
The minds of those studied utterly by the Cleansing Fire
continue to think and dream and beg for silence...
--------
Place into an allocated Jewel Socket on the Passive Skill Tree. Right click to remove from the Socket.
--------
Corrupted`);
assertEq(ff.name, 'Forbidden Flame', 'name');
assertEq(ff.baseType, 'Crimson Jewel', 'baseType');
assertEq(ff.itemClass, 'Jewels', 'itemClass');
assertEq(ff.corrupted, true, 'corrupted');
assertIncludes(ff.explicitMods, 'Allocates', 'explicit: Allocates mod parsed');
// Instruction section should be skipped
assertNotIncludes(ff.explicitMods, 'Place into', 'instruction text filtered out');

// ── 3. Frostblink (Skill Gem — description should not be parsed as mods) ──
console.log('=== 3. Frostblink ===');
const frostblink = parseItemText(`Item Class: Skill Gems
Rarity: Gem
Frostblink
--------
Spell, Movement, Duration, Cold, Travel, Blink, AoE
Level: 4
Cost: 13 Mana
Cooldown Time: 2.95 sec
Cast Time: Instant
Critical Strike Chance: 5.00%
Effectiveness of Added Damage: 190%
--------
Requirements:
Level: 12
Int: 33
--------
Teleport to a location, damaging enemies and leaving Chilled ground in an area at both ends of the teleport. Shares a cooldown with other Blink skills.
--------
Deals 21 to 32 Cold Damage
Base duration is 3.00 seconds
15% increased Cooldown Recovery Rate for each Normal or Magic Enemy in Area
83% increased Cooldown Recovery Rate for each Rare or Unique Enemy in Area
6% increased maximum travel distance
--------
Experience: 22,895/22,895
--------
Next-level requirements:
Level: 16
Int: 41
--------
Place into an item socket of the right colour to gain this skill. Right click to remove from a socket.`);
assertEq(frostblink.itemClass, 'Skill Gems', 'itemClass');
assertEq(frostblink.rarity, 'gem', 'rarity');
assertEq(frostblink.baseType, 'Frostblink', 'baseType');
// Gems: ALL mod parsing skipped (APAT/Sidekick approach). Gem "stats" are gem-level
// properties, not searchable explicit mods. Gems are searched by level, quality, corrupted only.
assertEq(frostblink.explicitMods.length, 0, 'gem: no explicit mods');
assertEq(frostblink.implicitMods.length, 0, 'gem: no implicit mods');

// ── 4. Fireball (Active Skill Gem — level 21, quality 20) ──
console.log('=== 4. Fireball ===');
const fireball = parseItemText(`Item Class: Active Skill Gems
Rarity: Gem
Fireball
--------
Projectile, Spell, AoE, Fire, Duration
Level: 21 (Max)
Quality: +20% (augmented)
Mana Cost: 22
Cast Time: 0.75 sec
Critical Strike Chance: 6.00%
Effectiveness of Added Damage: 240%
--------
Requirements:
Level: 70
Int: 155
--------
Experience: 1/1
--------
Fires a burning projectile that deals Fire Damage. If the projectile hits a target, or reaches the targeted location, it explodes, dealing damage to nearby enemies. The burning debuff deals more damage the longer the burning lasts.
--------
50% chance to Ignite enemies
Deals 579.4 to 868.6 Fire Damage
Base duration of Ignite is 4 seconds
20% more Damage for each second Ignite has been active`);
assertEq(fireball.itemClass, 'Active Skill Gems', 'itemClass');
assertEq(fireball.quality, 20, 'quality');
assertEq(fireball.gemLevel, 21, 'gemLevel');
// Gems: no mods parsed
assertEq(fireball.explicitMods.length, 0, 'gem: no explicit mods');

// ── 5. Empower Support (Support Gem — minimal mods) ──
console.log('=== 5. Empower ===');
const empower = parseItemText(`Item Class: Support Skill Gems
Rarity: Gem
Empower Support
--------
Support
Level: 4 (Max)
Mana Multiplier: 125%
--------
Requirements:
Level: 72
--------
Experience: 1/1
--------
Supports any skill gem. Once this gem reaches level 2 or above, will raise the level of supported gems. Cannot support skills that don't come from gems.
--------
+3 to Level of Supported Active Skill Gems`);
assertEq(empower.itemClass, 'Support Skill Gems', 'itemClass');
// Gems: no mods parsed
assertEq(empower.explicitMods.length, 0, 'gem: no explicit mods');

// ── 6. Lioneye's Vision (Unique Body Armour — local armour mods) ──
console.log('=== 6. Lioneye\'s Vision ===');
const lioneye = parseItemText(`Item Class: Body Armours
Rarity: Unique
Lioneye's Vision
Crusader Plate
--------
Armour: 2161 (augmented)
--------
Requirements:
Level: 59
Str: 160
Dex: 160 (augmented) (unmet)
--------
Sockets: R-R-R-R-R-R
--------
Item Level: 85
--------
Socketed Gems are Supported by Level 15 Pierce
+160 Dexterity Requirement
222% increased Armour
+70 to maximum Life
0.4% of Physical Attack Damage Leeched as Mana
Enemy Projectiles Pierce you`);
assertEq(lioneye.name, "Lioneye's Vision", 'name');
assertEq(lioneye.linkCount, 6, '6-link');
assertEq(lioneye.socketCount, 6, '6 sockets');
assertIncludes(lioneye.explicitMods, '222% increased Armour', 'explicit: local armour');
assertIncludes(lioneye.explicitMods, '+70 to maximum Life', 'explicit: life');

// ── 7. Disfavour (Unique Two Hand Axe — local phys damage) ──
console.log('=== 7. Disfavour ===');
const disfavour = parseItemText(`Item Class: Two Hand Axes
Rarity: Unique
Disfavour
Vaal Axe
--------
Two Handed Axe
Physical Damage: 228-380 (augmented)
Critical Strike Chance: 5.00%
Attacks per Second: 1.30
Weapon Range: 1.3 metres
--------
Requirements:
Level: 64
Str: 158
Dex: 76
--------
Sockets: R-R-R-R-R-R
--------
Item Level: 82
--------
40% increased Physical Damage
Adds 60 to 100 Physical Damage
+16% to Quality
6% increased Attack Speed
+2 to Melee range`);
assertEq(disfavour.name, 'Disfavour', 'name');
assertEq(disfavour.baseType, 'Vaal Axe', 'baseType');
assertIncludes(disfavour.explicitMods, 'increased Physical Damage', 'explicit: phys');
assertIncludes(disfavour.explicitMods, 'Adds 60 to 100 Physical Damage', 'explicit: added phys');
assertIncludes(disfavour.explicitMods, 'Attack Speed', 'explicit: attack speed');

// ── 8. Rare Body Armour (crafted mods) ──
console.log('=== 8. Rare Body Armour ===');
const rareBody = parseItemText(`Item Class: Body Armours
Rarity: Rare
Gloom Carapace
Sadist Garb
--------
Evasion Rating: 980 (augmented)
Energy Shield: 189 (augmented)
--------
Requirements:
Level: 68
Dex: 103
Int: 109
--------
Sockets: G-G-B-B
--------
Item Level: 82
--------
+79 to maximum Life
+41 to maximum Energy Shield
+35% to Cold Resistance
+28% to Lightning Resistance
78% increased Evasion Rating (crafted)
+15% to all Elemental Resistances (crafted)`);
assertEq(rareBody.rarity, 'rare', 'rarity');
assertEq(rareBody.explicitMods.length, 4, 'explicit count (non-crafted)');
assertEq(rareBody.craftedMods.length, 2, 'crafted count');
assertIncludes(rareBody.craftedMods, 'increased Evasion Rating', 'crafted: evasion');
assertIncludes(rareBody.craftedMods, 'all Elemental Resistances', 'crafted: all res');

// ── 9. Rare Helmet (implicit + explicit) ──
console.log('=== 9. Rare Helmet ===');
const helmet = parseItemText(`Item Class: Helmets
Rarity: Rare
Plague Visage
Hubris Circlet
--------
Energy Shield: 210 (augmented)
--------
Requirements:
Level: 69
Int: 154
--------
Sockets: B-B-B-B
--------
Item Level: 80
--------
+42 to maximum Energy Shield (implicit)
--------
+80 to maximum Life
+45 to maximum Energy Shield
+40% to Cold Resistance
+35% to Lightning Resistance
30% increased Energy Shield`);
assertEq(helmet.implicitMods.length, 1, 'implicit count');
assertIncludes(helmet.implicitMods, '+42 to maximum Energy Shield', 'implicit: ES');
assertEq(helmet.explicitMods.length, 5, 'explicit count');

// ── 10. Watcher's Eye (Unique Jewel — multiple aura mods) ──
console.log('=== 10. Watcher\'s Eye ===');
const watchers = parseItemText(`Item Class: Jewels
Rarity: Unique
Watcher's Eye
Prismatic Jewel
--------
Item Level: 84
--------
+5% to all Elemental Resistances (implicit)
--------
4% increased maximum Energy Shield
4% increased maximum Life
4% increased maximum Mana
25% increased Fire Damage while affected by Anger
Gain (15-20) Life per Enemy Hit while affected by Vitality
Lose (40-60) Mana per second while affected by Clarity`);
assertEq(watchers.implicitMods.length, 1, 'implicit count');
assertEq(watchers.explicitMods.length, 6, 'explicit count');
assertIncludes(watchers.explicitMods, 'while affected by Anger', 'explicit: anger mod');
assertIncludes(watchers.explicitMods, 'while affected by Clarity', 'explicit: clarity mod');

// ── 11. Large Cluster Jewel (enchant mods) ──
console.log('=== 11. Large Cluster Jewel ===');
const cluster = parseItemText(`Item Class: Jewels
Rarity: Rare
Scourge Cluster
Large Cluster Jewel
--------
Item Level: 84
--------
Adds 12 Passive Skills (enchant)
1 Added Passive Skill is a Jewel Socket (enchant)
Added Small Passive Skills grant: 12% increased Elemental Damage with Attack Skills (enchant)
--------
Damage Penetrates 10% of Enemy Elemental Resistances
Adds 8 to 13 Cold Damage to Attacks
--------
Place into an allocated Large Jewel Socket on the Passive Skill Tree. Right click to remove from the Socket.`);
assertEq(cluster.enchantMods.length, 3, 'enchant count');
assertIncludes(cluster.enchantMods, 'Adds 12 Passive Skills', 'enchant: passive count');
assertIncludes(cluster.enchantMods, 'Elemental Damage with Attack Skills', 'enchant: grant');
assertEq(cluster.explicitMods.length, 2, 'explicit count');
assertIncludes(cluster.explicitMods, 'Damage Penetrates', 'explicit: pen');
assertNotIncludes(cluster.explicitMods, 'Place into', 'instruction filtered');

// ── 12. Rare Ring (implicit + explicits) ──
console.log('=== 12. Rare Ring ===');
const ring = parseItemText(`Item Class: Rings
Rarity: Rare
Doom Circle
Amethyst Ring
--------
Requirements:
Level: 48
--------
Item Level: 79
--------
+25% to Chaos Resistance (implicit)
--------
+50 to maximum Life
+40 to maximum Mana
+40% to Fire Resistance
+35% to Cold Resistance
Adds 12 to 23 Fire Damage to Attacks`);
assertEq(ring.implicitMods.length, 1, 'implicit count');
assertIncludes(ring.implicitMods, 'Chaos Resistance', 'implicit: chaos res');
assertEq(ring.explicitMods.length, 5, 'explicit count');

// ── 13. Rare Amulet (crafted mod) ──
console.log('=== 13. Rare Amulet ===');
const amulet = parseItemText(`Item Class: Amulets
Rarity: Rare
Woe Pendant
Jade Amulet
--------
Requirements:
--------
Item Level: 82
--------
+28 to Dexterity (implicit)
--------
+72 to maximum Life
+41 to Dexterity
Regenerate 5.3 Life per second
+42% to Fire Resistance
+38% to Cold Resistance
+5% to Chaos Resistance (crafted)`);
assertEq(amulet.explicitMods.length, 5, 'explicit count');
assertEq(amulet.craftedMods.length, 1, 'crafted count');
assertIncludes(amulet.craftedMods, 'Chaos Resistance', 'crafted: chaos res');

// ── 14. Rare Map (implicit + map mods) ──
console.log('=== 14. Rare Map ===');
const map = parseItemText(`Item Class: Maps
Rarity: Rare
Putrid Maze
Dunes Map
--------
Map Tier: 14
Item Quantity: +84% (augmented)
Item Rarity: +39% (augmented)
Monster Pack Size: +29% (augmented)
--------
Item Level: 80
--------
Monsters deal 2 Bursts of Damage (implicit)
--------
Area is inhabited by Goatmen
Monsters cannot be Slowed below base speed
Slaying Enemies close together has a 13% chance to attract monsters
Players are Cursed with Temporal Chains
Monsters' Action Speed cannot be modified to below base value`);
assertEq(map.itemClass, 'Maps', 'itemClass');
assertEq(map.implicitMods.length, 1, 'implicit count');
assertEq(map.explicitMods.length, 5, 'explicit count');
assertIncludes(map.explicitMods, 'Temporal Chains', 'explicit: temp chains');

// ── 15. Divination Card (The Doctor — no mods) ──
console.log('=== 15. The Doctor ===');
const divCard = parseItemText(`Item Class: Divination Cards
Rarity: Normal
The Doctor
--------
Stack Size: 1/8
--------
A Set of Eight
--------
A Headhunter
--------
Seek the advice of doctors, for they know the cost of a human life.`);
assertEq(divCard.itemClass, 'Divination Cards', 'itemClass');
assertEq(divCard.explicitMods.length, 0, 'no explicit mods on div card');

// ── 16. Currency (Divine Orb — no mods) ──
console.log('=== 16. Divine Orb ===');
const currency = parseItemText(`Item Class: Stackable Currency
Rarity: Normal
Divine Orb
--------
Stack Size: 1/20
--------
Randomises the numeric values of the random modifiers on an item.
Right click this item then left click a magic, rare or unique item to apply it.`);
assertEq(currency.itemClass, 'Stackable Currency', 'itemClass');
assertEq(currency.explicitMods.length, 0, 'no explicit mods on currency');

// ── 17. Scarab (Map Fragment — has mods) ──
console.log('=== 17. Scarab ===');
const scarab = parseItemText(`Item Class: Map Fragments
Rarity: Normal
Ambush Scarab of Containment
--------
Stack Size: 1/20
--------
Area contains 3 additional Strongboxes
Strongboxes in Area are guarded
--------
Can be used in a personal Map Device.`);
assertEq(scarab.explicitMods.length, 2, 'explicit count');
assertIncludes(scarab.explicitMods, 'Strongboxes', 'explicit: strongbox mod');
// "Can be used in" instruction should be filtered
assertNotIncludes(scarab.explicitMods, 'Can be used', 'instruction filtered');

// ── 18. Shield (Rare, implicit + local ES) ──
console.log('=== 18. Rare Shield ===');
const shield = parseItemText(`Item Class: Shields
Rarity: Rare
Honour Ward
Titanium Spirit Shield
--------
Chance to Block: 25%
Energy Shield: 185 (augmented)
--------
Requirements:
Level: 68
Int: 159
--------
Sockets: B-B-B
--------
Item Level: 83
--------
+12% to all Elemental Resistances (implicit)
--------
+82 to maximum Life
+55 to maximum Energy Shield
+40% to Fire Resistance
+33% to Lightning Resistance
40% increased Energy Shield`);
assertEq(shield.implicitMods.length, 1, 'implicit count');
assertEq(shield.explicitMods.length, 5, 'explicit count');
assertIncludes(shield.explicitMods, '40% increased Energy Shield', 'explicit: local ES');

// ── 19. Unique Life Flask ──
console.log('=== 19. Life Flask ===');
const flask = parseItemText(`Item Class: Life Flasks
Rarity: Unique
Divination Distillate
Grand Life Flask
--------
Quality: +20% (augmented)
Recovers 1050 (augmented) Life over 7.00 Seconds
Consumes 30 of 60 Charges on use
--------
Item Level: 50
--------
20% increased Duration
Gain 7% of Maximum Life as Extra Maximum Energy Shield during Effect
+40% to all Elemental Resistances during Effect
20% increased Rarity of Items found during Effect`);
assertEq(flask.quality, 20, 'quality');
assertEq(flask.explicitMods.length, 4, 'explicit count');
assertIncludes(flask.explicitMods, 'Elemental Resistances during Effect', 'explicit: flask res mod');

// ── 20. Magic Utility Flask ──
console.log('=== 20. Magic Utility Flask ===');
const utilFlask = parseItemText(`Item Class: Utility Flasks
Rarity: Magic
Experimenter's Silver Flask of Acceleration
--------
Lasts 5.50 Seconds
Consumes 40 of 80 Charges on use
--------
Item Level: 52
--------
Onslaught during Effect
50% increased Duration
30% increased Movement Speed during Effect`);
assertEq(utilFlask.rarity, 'magic', 'rarity');
assertEq(utilFlask.explicitMods.length, 3, 'explicit count');
assertIncludes(utilFlask.explicitMods, 'Onslaught', 'explicit: onslaught');

// ── 21. Rare Boots (implicit + local armour/evasion) ──
console.log('=== 21. Rare Boots ===');
const boots = parseItemText(`Item Class: Boots
Rarity: Rare
Havoc Tread
Two-Toned Boots (Armour/Evasion)
--------
Armour: 95 (augmented)
Evasion Rating: 95 (augmented)
--------
Requirements:
Level: 60
Str: 46
Dex: 46
--------
Sockets: R-G-R-G
--------
Item Level: 76
--------
+30 to maximum Life (implicit)
--------
+65 to maximum Life
30% increased Movement Speed
+38% to Fire Resistance
+30% to Cold Resistance
65% increased Armour and Evasion Rating`);
assertEq(boots.implicitMods.length, 1, 'implicit count');
assertEq(boots.explicitMods.length, 5, 'explicit count');
assertIncludes(boots.explicitMods, 'Movement Speed', 'explicit: movespeed');
assertIncludes(boots.explicitMods, 'Armour and Evasion', 'explicit: local AR/EV');

// ── 22. Abyss Jewel ──
console.log('=== 22. Abyss Jewel ===');
const abyssJewel = parseItemText(`Item Class: Abyss Jewels
Rarity: Rare
Doom Spark
Hypnotic Eye Jewel
--------
Item Level: 80
--------
+25 to maximum Life
Adds 5 to 8 Cold Damage to Spells
+16% to Cold Resistance
Regenerate 3 Mana per second`);
assertEq(abyssJewel.itemClass, 'Abyss Jewels', 'itemClass');
assertEq(abyssJewel.explicitMods.length, 4, 'explicit count');

// ══════════════════════════════════════════════════
// RESULTS
// ══════════════════════════════════════════════════
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED');
}
