// The drape swatchbook's logic: colors, the fan and the visitor's mix. Pure functions with
// no imports, so the page template and the page script can both use it (the page inlines this file
// with its `export` keywords removed). First draft by Glow (glow-autofix), finished by hand.

export function lum(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return r * 0.299 + g * 0.587 + b * 0.114;
}

export function ink(hex) {
  return lum(hex) > 150 ? '#141C40' : '#FFFFFF';
}

export function pairs(data) {
  const out = [];
  for (const f of data.fabrics) {
    for (const c of f.colors) {
      out.push({
        key: `${f.id}|${c}`,
        color: c,
        hex: data.colors[c],
        fabric: f.id,
        fabricName: f.name,
        sheer: f.sheer,
      });
    }
  }
  return out;
}

export function familyIndexOf(data, color) {
  for (let i = 0; i < data.families.length; i++) {
    if (data.families[i].colors.includes(color)) return i;
  }
  return -1;
}

export function fan(data, familyIndex, fabricId) {
  const fam = data.families[familyIndex];
  if (!fam) return [];
  const famColors = fam.colors;
  let allPairs = pairs(data).filter(p => famColors.includes(p.color));
  if (fabricId && fabricId !== 'all') {
    allPairs = allPairs.filter(p => p.fabric === fabricId);
  }
  // stable sort by luminance descending
  return [...allPairs].sort((a, b) => {
    const la = lum(a.hex), lb = lum(b.hex);
    return lb - la;
  });
}

export function fabricCount(data, familyIndex, fabricId) {
  const fam = data.families[familyIndex];
  if (!fam) return 0;
  const famColors = fam.colors;
  let cnt = 0;
  for (const f of data.fabrics) {
    if (fabricId && fabricId !== 'all' && f.id !== fabricId) continue;
    for (const c of f.colors) if (famColors.includes(c)) cnt++;
  }
  return cnt;
}

export function fanAngles(count, opts = {}) {
  if (count <= 1) return count === 1 ? [0] : [];
  const per = opts.per ?? 12;
  const max = opts.max ?? 124;
  const total = Math.min(count * per, max);
  const step = total / (count - 1);
  const start = -total / 2;
  const res = [];
  for (let i = 0; i < count; i++) res.push(Math.round(start + i * step));
  return res;
}

export function addToMix(mix, key, max = 4) {
  if (mix.includes(key) || mix.length >= max) return [...mix];
  return [...mix, key];
}

export function mixFull(mix, max = 4) {
  return mix.length >= max;
}

export function removeFromMix(mix, key) {
  return mix.filter(k => k !== key);
}

export function leadMix(mix, key) {
  if (!mix.includes(key)) return [...mix];
  return [key, ...mix.filter(k => k !== key)];
}

export function sag(count, depth = 40, base = 4) {
  const res = [];
  for (let i = 0; i < count; i++) res.push(Math.round(base + depth * Math.sin(Math.PI * (i + 0.5) / count)));
  return res;
}

export function quoteHref(mix) {
  return mix.length ? `/get-a-quote?drapes=${encodeURIComponent(mix.join(','))}` : '/get-a-quote';
}

export function parseDrapes(data, param, max = 4) {
  if (!param) return [];
  const valid = new Set(pairs(data).map(p => p.key));
  const seen = new Set();
  const result = [];
  for (const raw of String(param).split(',')) {
    if (result.length >= max) break;
    const k = raw.trim();
    if (!k || !valid.has(k) || seen.has(k)) continue;
    seen.add(k);
    result.push(k);
  }
  return result;
}

export function quoteText(data, mix) {
  if (!mix.length) return '';
  const all = pairs(data);
  const parts = mix.map((k, i) => {
    const p = all.find(a => a.key === k);
    if (!p) return null;
    const pos = i === 0 ? 'backdrop' : 'swag';
    return `${p.color} ${p.fabricName} (${pos})`;
  }).filter(Boolean);
  return `Drape mix from the swatchbook: ${parts.join(', ')}.`;
}
