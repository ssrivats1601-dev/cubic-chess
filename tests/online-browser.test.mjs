import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {runtime} from './test-runtime.mjs';
import {parse} from '../src/engine.js';
const {chromium}=await import('@playwright/test');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const mf=await runtime({socketLifetime:3000});const origin=String(await mf.ready).replace(/\/$/,'');
const a=await browser.newContext({viewport:{width:1440,height:1050}}),b=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const host=await a.newPage(),guest=await b.newPage(),errors=[],requests=[];
for(const page of [host,guest])page.on('request',r=>{if(r.url().includes('/api/'))requests.push(new URL(r.url()).pathname);});
for(const page of [host,guest])page.on('pageerror',e=>errors.push(e.message));
async function contains(page,id,value){await page.waitForFunction(({id,value})=>document.getElementById(id)?.textContent.includes(value),{id,value},{timeout:20000});}
async function move(page,from,to){await page.locator(`[data-layer="${+from[0]-1}"]`).click();await page.locator(`[data-square="${parse(from)}"]`).click();await page.locator(`[data-layer="${+to[0]-1}"]`).click();await page.locator(`[data-square="${parse(to)}"]`).click();}
try{
  const [name,value]=mf.cookie.split('=');for(const context of [a,b])await context.addCookies([{name,value,url:origin,httpOnly:true,sameSite:'Strict'}]);
  await mkdir('test-results',{recursive:true});await host.goto(origin);await contains(host,'lobby-connection','connected');
  for(const width of [1440,1024,768,390,320]){await host.setViewportSize({width,height:950});assert.ok(await host.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`lobby fits ${width}`);}
  await host.setViewportSize({width:1440,height:1050});await host.screenshot({path:'test-results/lobby-desktop.png',fullPage:true});
  await guest.route('**/api/socket-ticket',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'WebSocket unavailable in fallback test.'})}));
  await guest.goto(origin);await contains(guest,'lobby-connection','connected');await guest.screenshot({path:'test-results/lobby-mobile.png',fullPage:true});
  await host.locator('[data-page-link=setup]').click();await host.locator('#player-name').fill('Player One');await host.locator('#create-room').click();await host.locator('#game-view').waitFor({state:'visible'});
  const pub=new URL(host.url()).hash.split('=')[1];assert.equal(pub.length,10);await contains(host,'feedback','ready');
  await host.locator('[data-square="1"]').click();await contains(host,'feedback','wait for your opponent');
  await guest.locator('[data-page-link=rooms]').click();await guest.locator('#player-name').fill('Player Two');await guest.locator(`[data-join-code="${pub}"]`).waitFor();await guest.locator(`[data-join-code="${pub}"]`).tap();
  await contains(host,'online-match','Player Two');await contains(guest,'online-match','Player One');
  assert.equal(await guest.locator('#undo').isDisabled(),true);
  await guest.locator(`[data-square="${parse('1b8')}"]`).tap();await contains(guest,'feedback','opponent’s turn');
  let releaseMove,finishedMove;const delayedMove=new Promise(resolve=>{releaseMove=resolve;}),moveFinished=new Promise(resolve=>{finishedMove=resolve;});
  const delayRoute=async route=>{const response=await route.fetch();await delayedMove;await route.fulfill({response});finishedMove();};
  await host.route('**/api/rooms/*/move',delayRoute);
  const firstMoveAt=Date.now();await move(host,'1b1','3b2');await contains(guest,'history','1b1 → 3b2');await contains(guest,'turn-status','Your move');console.log('Move visible in second browser after',Date.now()-firstMoveAt,'ms');
  await move(guest,'1b8','3b7');await contains(host,'history','1b8 → 3b7');
  releaseMove();await moveFinished;await host.unroute('**/api/rooms/*/move',delayRoute);
  await contains(host,'history','1b8 → 3b7');assert.equal(await host.locator('#history-total').textContent(),'2 plies','late POST response must not roll back a newer live position');
  await guest.reload();await contains(guest,'history','1b8 → 3b7');await contains(guest,'online-match','You');
  await host.screenshot({path:'test-results/online-match-desktop.png',fullPage:true});await guest.screenshot({path:'test-results/online-match-mobile.png',fullPage:true});
  const connectionsBefore=requests.filter(x=>x==='/api/socket-ticket').length;
  await host.waitForTimeout(16000);
  assert.ok(requests.filter(x=>x==='/api/socket-ticket').length>connectionsBefore,'WebSocket renews without manual refresh');
  await contains(host,'online-match','Live');
  await contains(guest,'online-match','Auto-updating');
  await host.locator('#draw').click();await guest.locator('#accept-draw').waitFor();await guest.locator('#accept-draw').tap();await contains(host,'turn-status','Game drawn');
  await host.locator('#back-to-lobby').click();await host.locator('[data-page-link=setup]').click();await host.locator('input[name="visibility"][value="private"]').check();await host.locator('#create-room').click();await host.locator('#game-view').waitFor({state:'visible'});
  const priv=new URL(host.url()).hash.split('=')[1];await guest.locator('#back-to-lobby').tap();await contains(guest,'lobby-connection','connected');assert.equal(await guest.locator(`[data-join-code="${priv}"]`).count(),0);
  await guest.locator('#room-code-input').fill(priv);await guest.locator('#join-room').tap();await contains(host,'online-match','Player Two');
  await b.setOffline(true);await move(host,'1e2','1e4');await contains(host,'history','1e2 → 1e4');await contains(guest,'save-status','Reconnecting');await contains(host,'online-match','Disconnected');
  await b.setOffline(false);await contains(guest,'history','1e2 → 1e4');await contains(guest,'save-status','saved online');await contains(host,'online-match','Connected');
  assert.equal(await guest.locator('[data-drop]').count(),0);assert.equal(await guest.locator('#pockets').count(),0);
  await guest.locator('#resign').tap();await guest.locator('#confirm-action').tap();await contains(host,'turn-status','White wins');
  assert.deepEqual(errors,[]);
  console.log('PASS: two independent browsers create/join public and private rooms, validate player turns, synchronize 3D moves over WebSocket and long-poll fallback, reject stale responses, renew live connections, reload, show presence and reconnect after network loss, agree draws and resign. Desktop/mobile layouts verified; no page errors.');
}finally{await browser.close();await mf.dispose();}
