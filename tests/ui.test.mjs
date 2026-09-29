import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Window} from 'happy-dom';
import {parse} from '../src/engine.js';

test('local UI setup, custom board, themes, clock, guide and restore',async()=>{
 const window=new Window({url:'https://cubic-chess.test/#local'});
 window.document.write(await readFile('src/index.html','utf8'));
 for(const k of ['window','document','localStorage','location','history','navigator','FormData'])Object.defineProperty(globalThis,k,{value:window[k],configurable:true});
 globalThis.matchMedia=()=>({matches:true,addEventListener(){}});globalThis.addEventListener=()=>{};globalThis.scrollTo=()=>{};
 const intervals=[];const originalInterval=globalThis.setInterval;globalThis.setInterval=f=>{intervals.push(f);return 0;};
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true};window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
 const $=id=>document.getElementById(id),change=(id,v)=>{$(id).value=v;$(id).dispatchEvent(new window.Event('input'));},click=id=>$(id).click();
 try{
 await import('../src/app.js');
 assert.equal(document.querySelectorAll('[data-square]').length,64);
 click('new-game');change('variant','4,4,4');change('time-control','3,2');click('start-configured');
 assert.equal(document.querySelectorAll('[data-square]').length,16);assert.equal(document.querySelectorAll('[data-layer]').length,4);
 assert.match($('clocks').textContent,/3:00/);
 document.querySelector(`[data-square="${parse('1c1')}"]`).click();document.querySelector('[data-layer="2"]').click();document.querySelector(`[data-square="${parse('3c2')}"]`).click();
 assert.match($('turn-status').textContent,/Black to move/);assert.match($('history').textContent,/1c1 → 3c2/);
 const saved=JSON.parse(localStorage.getItem('cubehouse.game.v2'));assert.equal(saved.state.config.files,4);assert.ok(saved.state.clock.w>180000);
 history.replaceState(null,'','#/appearance');window.dispatchEvent(new window.Event('hashchange'));assert.equal(document.body.dataset.page,'appearance');assert.equal(document.querySelectorAll('[data-theme-choice]').length,6);$('theme').value='night';$('theme').dispatchEvent(new window.Event('change'));assert.equal(document.documentElement.dataset.theme,'night');assert.equal(localStorage.getItem('cubehouse.theme'),'night');
 click('rules-button');assert.equal(document.body.dataset.page,'rules');assert.match($('feature-content').textContent,/Clocks & connection/);assert.match($('feature-content').textContent,/Variants & starting armies/);assert.equal($('modal').open,false);history.replaceState(null,'','#local');window.dispatchEvent(new window.Event('hashchange'));assert.equal(document.body.dataset.page,'game');assert.match($('history').textContent,/1c1 → 3c2/);
 click('new-game');change('variant','custom');change('setup-files','5');change('setup-ranks','7');change('setup-layers','2');click('start-configured');
 assert.equal(document.querySelectorAll('[data-square]').length,35);assert.equal(document.querySelectorAll('[data-layer]').length,2);assert.match($('clocks').textContent,/Untimed/);
 assert.equal(document.documentElement.style.getPropertyValue('--files'),'5');click('resign');click('confirm-action');assert.equal($('match-result').hidden,false);assert.match($('result-heading').textContent,/Black wins by resignation/);assert.ok($('export-match'));click('local-rematch');assert.equal($('match-result').hidden,true);assert.equal(document.querySelectorAll('[data-square]').length,35);assert.equal(JSON.parse(localStorage.getItem('cubehouse.completed')).length,1);history.replaceState(null,'','#/variants');window.dispatchEvent(new window.Event('hashchange'));assert.equal(document.body.dataset.page,'variants');assert.match($('feature-content').textContent,/Set the pace/);assert.equal(document.documentElement.dataset.theme,'night');
 }finally{globalThis.setInterval=originalInterval;await window.happyDOM.close();}
});
