// The drape swatchbook's logic: colors, the fan, and the visitor's mix.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as M from '../src/lib/drape-model.js';

const DATA = {
  colors: { White: '#F6F5F1', Ivory: '#F0E7D3', Champagne: '#E2CCA6', Black: '#151515', Navy: '#1B2545', Sage: '#A1AE8B', Gold: '#C8A046' },
  families: [
    { name: 'Whites', colors: ['White', 'Ivory', 'Champagne'] },
    { name: 'Darks', colors: ['Black', 'Navy'] },
    { name: 'Greens', colors: ['Sage'] },
    { name: 'Golds', colors: ['Gold'] },
  ],
  fabrics: [
    { id: 'sheer', name: 'Sheer', sheer: true, colors: ['Champagne', 'White', 'Ivory'] },
    { id: 'premier', name: 'Poly-Premier', sheer: false, colors: ['Black', 'Ivory', 'Navy'] },
    { id: 'velvet', name: 'Velvet', sheer: false, colors: ['Sage', 'Champagne'] },
  ],
};

test('lum weighs red, green and blue as 0.299, 0.587, 0.114', () => {
  assert.equal(M.lum('#000000'), 0);
  assert.equal(Math.round(M.lum('#FFFFFF')), 255);
  assert.equal(Math.round(M.lum('#FF0000') * 1000) / 1000, 76.245);
  assert.equal(Math.round(M.lum('#00ff00')), 150);
});

test('ink is navy on light colors and white on dark ones', () => {
  assert.equal(M.ink('#F6F5F1'), '#141C40');
  assert.equal(M.ink('#151515'), '#FFFFFF');
  assert.equal(M.ink('#969696'), '#FFFFFF'); // lum 150 exactly is not above 150
  assert.equal(M.ink('#979797'), '#141C40');
});

test('pairs lists every fabric and color in data order with a stable key', () => {
  const p = M.pairs(DATA);
  assert.equal(p.length, 8);
  assert.deepEqual(p[0], { key: 'sheer|Champagne', color: 'Champagne', hex: '#E2CCA6', fabric: 'sheer', fabricName: 'Sheer', sheer: true });
  assert.deepEqual(p.map((x) => x.key), ['sheer|Champagne', 'sheer|White', 'sheer|Ivory', 'premier|Black', 'premier|Ivory', 'premier|Navy', 'velvet|Sage', 'velvet|Champagne']);
  assert.equal(p[3].sheer, false);
});

test('familyIndexOf finds the family a color belongs to, or -1', () => {
  assert.equal(M.familyIndexOf(DATA, 'Navy'), 1);
  assert.equal(M.familyIndexOf(DATA, 'White'), 0);
  assert.equal(M.familyIndexOf(DATA, 'Purple'), -1);
});

test('fan sorts a family light to dark, across fabrics or for one fabric', () => {
  assert.deepEqual(M.fan(DATA, 0).map((x) => x.key), ['sheer|White', 'sheer|Ivory', 'premier|Ivory', 'sheer|Champagne', 'velvet|Champagne']);
  assert.deepEqual(M.fan(DATA, 0, 'all').map((x) => x.key), ['sheer|White', 'sheer|Ivory', 'premier|Ivory', 'sheer|Champagne', 'velvet|Champagne']);
  assert.deepEqual(M.fan(DATA, 0, 'premier').map((x) => x.key), ['premier|Ivory']);
  assert.deepEqual(M.fan(DATA, 1).map((x) => x.key), ['premier|Navy', 'premier|Black']);
  assert.deepEqual(M.fan(DATA, 3), []);
  assert.deepEqual(M.fan(DATA, 2, 'sheer'), []);
});

test('fabricCount counts a fabric within a family', () => {
  assert.equal(M.fabricCount(DATA, 0, 'sheer'), 3);
  assert.equal(M.fabricCount(DATA, 0, 'all'), 5);
  assert.equal(M.fabricCount(DATA, 1, 'velvet'), 0);
});

test('fanAngles spreads chips evenly, 12 degrees each, at most 124 in all', () => {
  assert.deepEqual(M.fanAngles(0), []);
  assert.deepEqual(M.fanAngles(1), [0]);
  assert.deepEqual(M.fanAngles(2), [-12, 12]);
  assert.deepEqual(M.fanAngles(3), [-18, 0, 18]);
  const a = M.fanAngles(16);
  assert.equal(a.length, 16);
  assert.equal(a[0], -62);
  assert.equal(a[15], 62);
  assert.deepEqual(M.fanAngles(3, { per: 20, max: 30 }), [-15, 0, 15]);
});

test('the mix holds up to four keys with no repeats, and never changes in place', () => {
  const empty = [];
  const one = M.addToMix(empty, 'a');
  assert.deepEqual(one, ['a']);
  assert.deepEqual(empty, []);
  assert.deepEqual(M.addToMix(one, 'a'), ['a']);
  const full = ['a', 'b', 'c', 'd'];
  assert.deepEqual(M.addToMix(full, 'e'), full);
  assert.notEqual(M.addToMix(full, 'e'), full);
  assert.equal(M.mixFull(full), true);
  assert.equal(M.mixFull(['a']), false);
  assert.deepEqual(M.addToMix(['a', 'b'], 'c', 2), ['a', 'b']);
  assert.equal(M.mixFull(['a', 'b'], 2), true);
});

test('removeFromMix and leadMix', () => {
  const mix = ['a', 'b', 'c'];
  assert.deepEqual(M.removeFromMix(mix, 'b'), ['a', 'c']);
  assert.deepEqual(M.removeFromMix(mix, 'z'), ['a', 'b', 'c']);
  assert.deepEqual(M.leadMix(mix, 'c'), ['c', 'a', 'b']);
  assert.deepEqual(M.leadMix(mix, 'z'), ['a', 'b', 'c']);
  assert.deepEqual(mix, ['a', 'b', 'c']);
});

test('sag hangs samples on a curved line, lowest in the middle', () => {
  assert.deepEqual(M.sag(0), []);
  assert.deepEqual(M.sag(1), [44]);
  assert.deepEqual(M.sag(2), [32, 32]);
  assert.deepEqual(M.sag(3, 10, 0), [5, 10, 5]);
  // The curve is a sine, not a lookup of the cases above.
  assert.deepEqual(M.sag(4, 20, 2), [10, 20, 20, 10]);
  assert.deepEqual(M.sag(5), [16, 36, 44, 36, 16]);
  assert.deepEqual(M.sag(2, 10, 0), [7, 7]);
});

test('the quote link carries the mix and reads back only real keys', () => {
  const href = M.quoteHref(['sheer|Ivory', 'premier|Black']);
  assert.equal(href, '/get-a-quote?drapes=sheer%7CIvory%2Cpremier%7CBlack');
  const back = new URL(href, 'https://x.test').searchParams.get('drapes');
  assert.deepEqual(M.parseDrapes(DATA, back), ['sheer|Ivory', 'premier|Black']);
  assert.deepEqual(M.parseDrapes(DATA, 'sheer|Ivory,nope|X,sheer|Ivory,velvet|Sage,premier|Navy,premier|Black,sheer|White'), ['sheer|Ivory', 'velvet|Sage', 'premier|Navy', 'premier|Black']);
  assert.deepEqual(M.parseDrapes(DATA, 'sheer|Ivory,sheer|White,velvet|Sage', 2), ['sheer|Ivory', 'sheer|White']);
  assert.deepEqual(M.parseDrapes(DATA, ''), []);
  assert.deepEqual(M.parseDrapes(DATA, null), []);
  assert.equal(M.quoteHref([]), '/get-a-quote');
});

test('quoteText says each color, its fabric and its place in the backdrop', () => {
  assert.equal(M.quoteText(DATA, ['sheer|Ivory', 'premier|Black', 'velvet|Sage']), 'Drape mix from the swatchbook: Ivory Sheer (backdrop), Black Poly-Premier (swag), Sage Velvet (swag).');
  assert.equal(M.quoteText(DATA, []), '');
});

test('the real drape data is complete', () => {
  const real = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '..', 'content/drapes.json'), 'utf8'));
  const p = M.pairs(real);
  assert.equal(p.length, 53);
  for (const x of p) {
    assert.match(x.hex, /^#[0-9A-F]{6}$/i, x.key);
    assert.notEqual(M.familyIndexOf(real, x.color), -1, x.key);
  }
  assert.equal(real.families.reduce((n, _, i) => n + M.fan(real, i).length, 0), 53);
});
