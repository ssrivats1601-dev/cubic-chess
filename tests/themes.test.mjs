import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {themes} from '../src/themes.js';
const luminance=hex=>{const rgb=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
test('every theme has readable text, buttons and warnings',()=>{
 for(const t of themes){const c=t.colors;for(const [a,b] of [[2,0],[2,1],[3,0],[3,1],[5,6],[13,12]])assert.ok(contrast(c[a],c[b])>=4.5,`${t.name}: ${a}/${b} contrast ${contrast(c[a],c[b])}`);}
});
test('component styling uses theme variables instead of fixed color overrides',async()=>{
 const css=await readFile('src/style.css','utf8');const components=css.slice(css.indexOf('\n')+1);assert.doesNotMatch(components,/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
 assert.match(components,/\.white-piece\{fill:var\(--piece-white\)/);assert.match(components,/dialog::backdrop\{background:color-mix/);
});
