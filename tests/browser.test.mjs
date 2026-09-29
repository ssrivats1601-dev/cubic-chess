import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { runtime } from './test-runtime.mjs';
import { initialState, emptyState, parse, positionKey } from '../src/engine.js';
const {chromium}=await import('@playwright/test');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true});
const server=await runtime();
const base=server.ready;
await mkdir('test-results',{recursive:true});
const errors=[];
const page=await browser.newPage({viewport:{width:1440,height:1050}});
page.on('pageerror',e=>errors.push(e.message));
const origin=base.replace(/\/$/,'');
const sq=c=>page.locator(`[data-square="${parse(c)}"]`);
const floor=l=>page.locator(`[data-layer="${l-1}"]`);
const text=async(id,expected)=>assert.ok((await page.locator('#'+id).textContent()).includes(expected),`${id} should contain ${expected}`);
async function seed(state,layer=0) {
  await page.evaluate(({state,layer})=>localStorage.setItem('cubehouse.game.v2',JSON.stringify({version:2,state,undo:[],layer,flipped:false})),{state,layer});
  await page.reload();await page.waitForSelector('[data-square]');
}
function fixture(pieces,turn='w'){
  const s=emptyState(turn);for(const [c,type,color,extras] of pieces)s.board[parse(c)]={type,color,moved:true,...extras};
  s.positions=[positionKey(s)];return s;
}
try {
  const [name,value]=server.cookie.split('=');await page.context().addCookies([{name,value,url:origin,httpOnly:true,sameSite:'Strict'}]);
  await page.goto(origin+'/#local');await page.waitForSelector('[data-square]');
  assert.equal(await page.locator('[data-square]').count(),64);assert.equal(await page.locator('[data-layer]').count(),8);
  await text('turn-status','White to move');
  await sq('1e7').click();await text('feedback','White’s turn');assert.equal(await page.locator('.square.selected').count(),0);
  await sq('1b1').click();assert.ok((await floor(3).getAttribute('aria-label')).includes('3 legal moves'));
  await floor(3).click();assert.equal(await page.locator('.square.legal').count(),3);
  await sq('3b2').click();await text('turn-status','Black to move');await text('history','1b1 → 3b2');
  assert.ok((await sq('3b2').getAttribute('aria-label')).includes('White knight'));
  await floor(1).click();await sq('1b8').click();await floor(3).click();await sq('3b7').click();await text('turn-status','White to move');
  await page.reload();await text('history','1b8 → 3b7');await text('feedback','restored');
  await page.locator('#undo').click();await text('turn-status','Black to move');assert.equal(await page.locator('#history-total').textContent(),'1 ply');
  await page.locator('#new-game').click();await text('modal-title','Make this game yours');await page.locator('#close-modal').click();await text('history-total','1 ply');
  await page.locator('#new-game').click();await page.locator('#start-configured').click();await text('history-total','0 plies');
  await sq('1b1').focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.dataset.square),String(parse('1b1')));
  await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>document.activeElement.dataset.square),String(parse('1c1')));
  await page.keyboard.press('Escape');assert.equal(await page.locator('.square.selected').count(),0);
  await page.keyboard.press(']');await text('layer-title','Layer 2');await page.keyboard.press('[');await text('layer-title','Layer 1');
  await page.locator('#flip').click();assert.equal(await page.locator('[data-square]').first().getAttribute('data-square'),String(parse('1h1')));await page.locator('#flip').click();
  await page.locator('#rules-button').click();await text('feature-title','How to play');assert.equal(await page.locator('#modal').evaluate(d=>d.open),false);await page.locator('#resume-match').click();
  await seed(fixture([['1e1','k','w',{moved:false}],['1h1','r','w',{moved:false}],['8h8','k','b']]));
  await sq('1e1').click();await sq('1g1').click();assert.ok((await sq('1f1').getAttribute('aria-label')).includes('White rook'));await text('history','O-O');
  await seed(fixture([['1a1','k','w'],['8h8','k','b'],['1e7','p','w']]));
  await sq('1e7').click();await sq('1e8').click();await text('modal-title','potential');await page.locator('[data-promotion="n"]').click();assert.ok((await sq('1e8').getAttribute('aria-label')).includes('White knight'));await text('history','=N');
  assert.equal(await page.locator('[data-drop]').count(),0);assert.equal(await page.locator('#pockets').count(),0);
  await page.locator('#resign').click();await page.locator('#confirm-action').click();await text('turn-status','White wins');await page.locator('#undo').click();await text('turn-status','Black to move');
  await seed(initialState());
  for(const width of [1440,1024,768,390,320]) {
    await page.setViewportSize({width,height:950});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`no horizontal overflow at ${width}`);
    const bounds=await page.locator('#board').boundingBox();assert.ok(Math.abs(bounds.width-bounds.height)<2,`square board at ${width}`);
  }
  await page.setViewportSize({width:1440,height:1050});await page.screenshot({path:'test-results/desktop.png',fullPage:true});
  await sq('1b1').click();await floor(3).click();await page.screenshot({path:'test-results/layer-moves.png',fullPage:true});
  await seed(initialState());await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/mobile.png',fullPage:true});
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await mobile.addCookies([{name,value,url:origin,httpOnly:true,sameSite:'Strict'}]);
  const touch=await mobile.newPage();touch.on('pageerror',e=>errors.push(e.message));await touch.goto(origin+'/#local');await touch.locator(`[data-square="${parse('1b1')}"]`).tap();await touch.locator('[data-layer="2"]').tap();await touch.locator(`[data-square="${parse('3b2')}"]`).tap();assert.ok((await touch.locator('#turn-status').textContent()).includes('Black to move'));await mobile.close();
  assert.deepEqual(errors,[]);console.log('PASS: desktop + touch/mobile play, layers, turn rejection, persistence, undo, keyboard, flip, rules, castling, promotion, capture removal, resignation, and responsive layouts. No browser errors.');
} finally { await browser.close();await server?.dispose(); }
