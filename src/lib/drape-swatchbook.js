// The drape swatchbook on /drapery (vault decision D-016): fabric samples on a line, color
// families, a fan of chips sorted light to dark, and "Your mix" with a rough backdrop preview.
// The server renders the first state; a small inline script re-renders it on each tap with
// the same model and view code, inlined here so there is one copy of each.
import fs from 'node:fs';
import path from 'node:path';
import * as M from './drape-model.js';
import { START, swatchbookInner } from './drape-view.js';

const read = (f) => fs.readFileSync(path.resolve(process.cwd(), f), 'utf8');
export const DRAPES = JSON.parse(read('content/drapes.json'));
const inlined = (f) => read(f).replace(/^export /gm, '');
// JSON inside <script> must not be able to close the tag.
const json = (x) => JSON.stringify(x).replace(/</g, '\\u003c');

const NAMES = Object.keys(M).filter((k) => typeof M[k] === 'function');

const CONTROLLER = `
const M={${NAMES.join(',')}};
const root=document.getElementById('dsw'),D=JSON.parse(document.getElementById('dsw-data').textContent);
let st={...START};
root.addEventListener('click',(e)=>{
  const b=e.target.closest('[data-act]');if(!b||!root.contains(b))return;
  const a=b.dataset.act,v=b.dataset.v;
  if(a==='fab')st={...st,fab:v};
  else if(a==='fam')st={...st,fam:Number(v)};
  else if(a==='sel')st={...st,sel:v};
  else if(a==='add')st={...st,mix:M.addToMix(st.mix,v)};
  else if(a==='rm')st={...st,mix:M.removeFromMix(st.mix,v)};
  else if(a==='lead')st={...st,mix:M.leadMix(st.mix,v)};
  else if(a==='light')st={...st,light:Number(v)};
  else return;
  root.innerHTML=swatchbookInner(M,D,st);
  // Keep keyboard focus on the control that was used, or the nearest sensible one.
  const same=root.querySelector('[data-act="'+a+'"][data-v="'+CSS.escape(v)+'"]')||root.querySelector('[data-act="'+a+'"]')||root.querySelector('.dsw-send');
  if(same)same.focus({preventScroll:true});
});`;

export function drapeSwatchbook() {
  const script = `(()=>{${inlined('src/lib/drape-model.js')}\n${inlined('src/lib/drape-view.js')}\n${CONTROLLER}})()`;
  return `<section class="dsw" id="dsw" aria-label="Drape swatchbook">${swatchbookInner(M, DRAPES, START)}</section><script type="application/json" id="dsw-data">${json(DRAPES)}</script><script>${script}</script>`;
}

// On /get-a-quote: a link from the swatchbook (?drapes=…) fills in the details box, if it is
// still empty, and ticks Drapes.
export function quotePrefill() {
  const slim = { colors: DRAPES.colors, families: DRAPES.families, fabrics: DRAPES.fabrics.map(({ id, name, sheer, colors }) => ({ id, name, sheer, colors })) };
  return `<script>(()=>{${inlined('src/lib/drape-model.js')}
const q=new URLSearchParams(location.search).get('drapes');if(!q)return;
const D=${json(slim)},mix=parseDrapes(D,q);if(!mix.length)return;
const t=document.querySelector('textarea[name="details"]');if(t&&!t.value.trim())t.value=quoteText(D,mix);
const c=document.querySelector('input[name="services"][value="Drapes"]');if(c)c.checked=true;})()</script>`;
}
