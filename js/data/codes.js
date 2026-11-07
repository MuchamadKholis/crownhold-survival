/* =====================================================================
 * Crownhold — data/codes.js
 * REDEEM CODES. Each entry stores a HASH of the code, not the code itself,
 * so players can't simply read valid codes from the page source.
 *
 * To add a code:  node tools/codegen.js MYCODE2026
 * then paste the printed line into CH.REDEEM_CODES below and rebuild.
 *
 * reward: gold, wood, stone, gems, runes, xp, and/or troops: { swordsman: 10 }
 *         (redeem rewards may exceed storage limits; they are a gift)
 * start / expires: optional 'YYYY-MM-DD' dates (expires = last valid day)
 * minCastle: optional minimum castle level
 * Each code can be redeemed once per save.
 * ===================================================================== */

/** Small, fast non-cryptographic hash (cyrb53). Obfuscation, not security. */
CH.hashCode = function (code) {
  const str = 'crownhold:' + String(code).trim().toUpperCase().replace(/\s+/g, '');
  let h1 = 0xdeadbeef ^ 7, h2 = 0x41c6ce57 ^ 7;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
};

CH.REDEEM_CODES = [
  // WELCOME2026
  { hash: 'f538d090b1b89', label: 'Welcome gift', reward: { gold: 1500, wood: 1500, stone: 800, gems: 25 } },
  // CROWNHOLD
  { hash: '931a36aa09960', label: 'Crownhold launch chest', reward: { gems: 50, runes: 3, troops: { swordsman: 10, archer: 10 } }, expires: '2027-12-31' },
  // ROYALARMY
  { hash: '1267e687b472ef', label: 'Royal army', reward: { gold: 3000, troops: { knight: 4 } }, minCastle: 3 },
  // DEVELOPER2026
  {hash: "1728247c1aa8e3", label: "Hadiah Developer", reward: {gold: 10000, gems: 1000, troops: {swordsman: 1000}}, expires: "2026-11-07"},
];
