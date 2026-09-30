import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {createServer} from '../server/http.js';
import {initialState,parse} from '../src/engine.js';

// Bot games require no database, account, or network opponent.
const server=createServer({env:{}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('cubehouse.game.v2')));
const waitPly=n=>page.waitForFunction(n=>JSON.parse(localStorage.getItem('cubehouse.game.v2')).state.ply===n,n);
async function start(difficulty='medium',human='w',variant='8,8,8'){
  await page.locator('#new-game').click();await page.locator('#setup-opponent').selectOption('bot');
  await page.locator('#bot-difficulty').selectOption(difficulty);await page.locator('#bot-color').selectOption(human);
  await page.locator('#variant').selectOption(variant);await page.locator('#start-configured').click();
}
async function humanMove(){
  await page.locator('[data-layer="0"]').click();await page.locator(`[data-square="${parse('1b1')}"]`).click();
  await page.locator('[data-layer="2"]').click();await page.locator(`[data-square="${parse('3b2')}"]`).click();
}
try{
  await page.goto(origin+'/#local');await page.waitForSelector('[data-square]');
  assert.equal(await page.getByRole('button',{name:'Sign out',exact:true}).count(),0);
  for(const difficulty of ['easy','medium','hard','expert']){
    await start(difficulty);await humanMove();await waitPly(2);assert.equal((await saved()).state.turn,'w');assert.doesNotMatch(await page.locator('#feedback').textContent(),/background search/);
    assert.equal(await page.locator('#draw').isVisible(),false);
    await page.locator('#undo').click();await waitPly(0);assert.equal((await saved()).state.turn,'w');
  }
  // Cancellation cannot allow a delayed worker to play into an undone position.
  await start('expert');await humanMove();await page.locator('#undo').click();await waitPly(0);
  await page.waitForTimeout(4200);assert.equal((await saved()).state.ply,0);
  // Black-side games open with a real bot move and survive a browser reload.
  await start('medium','b','4,4,4');await waitPly(1);assert.equal((await saved()).state.turn,'b');
  await page.reload();await page.waitForSelector('[data-square]');assert.equal((await saved()).bot.human,'b');
  assert.match(await page.locator('#game-kind').textContent(),/MEDIUM BOT/);
  await page.locator('#resign').click();await page.locator('#confirm-action').click();
  assert.equal((await saved()).state.result.winner,'w');
  await page.locator('#local-rematch').click();await waitPly(1);assert.equal((await saved()).bot.human,'b');
  // Actual module worker promotion and a clock expiring during a pending turn.
  const promotion=initialState({files:8,ranks:8,layers:1});promotion.board.fill(null);
  for(const [c,type,color]of [['1a1','k','w'],['1h6','k','b'],['1e7','p','w']])promotion.board[parse(c)]={type,color,moved:true};
  await page.evaluate(state=>localStorage.setItem('cubehouse.game.v2',JSON.stringify({version:2,state,undo:[],layer:0,flipped:true,bot:{difficulty:'medium',human:'b'}})),promotion);
  await page.reload();await waitPly(1);assert.equal((await saved()).state.board[parse('1e8')].type,'q');
  // The shipped worker must save a hanging queen, not chase a small capture.
  const tactical=initialState();tactical.board.fill(null);
  for(const [c,type,color]of [['1a1','k','w'],['8h8','k','b'],['2d3','q','w'],['5d3','r','b'],['5e4','p','b'],['1b1','n','w'],['1c3','p','b']])tactical.board[parse(c)]={type,color,moved:true};
  await page.evaluate(state=>localStorage.setItem('cubehouse.game.v2',JSON.stringify({version:2,state,undo:[],layer:1,bot:{difficulty:'medium',human:'b'}})),tactical);
  await page.reload();await waitPly(1);assert.equal((await saved()).state.lastMove.from,parse('2d3'));
  const expired=initialState({minutes:1});expired.clock={w:1,b:60000,increment:0,startedAt:Date.now()-1000};
  await page.evaluate(state=>localStorage.setItem('cubehouse.game.v2',JSON.stringify({version:2,state,undo:[],layer:0,bot:{difficulty:'expert',human:'b'}})),expired);
  await page.reload();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('cubehouse.game.v2')).state.result?.kind==='timeout');
  assert.equal((await saved()).state.ply,0);
  // If a worker fails after publishing progress, use that move, not a new guess.
  const failContext=await browser.newContext();
  await failContext.addInitScript(({from,to})=>{window.Worker=class{postMessage(){queueMicrotask(()=>{this.onmessage({data:{progress:true,move:{from,to,promote:'q'}}});this.onerror(new Event('error'));});}terminate(){}};},{from:parse('1b1'),to:parse('1a3')});
  const failPage=await failContext.newPage();await failPage.goto(origin+'/#local');
  await failPage.evaluate(state=>localStorage.setItem('cubehouse.game.v2',JSON.stringify({version:2,state,undo:[],layer:0,bot:{difficulty:'expert',human:'b'}})),initialState());
  await failPage.reload();await failPage.waitForFunction(()=>JSON.parse(localStorage.getItem('cubehouse.game.v2')).state.ply===1);
  assert.equal(await failPage.evaluate(()=>JSON.parse(localStorage.getItem('cubehouse.game.v2')).state.lastMove.to),parse('1a3'));await failContext.close();
  // Sizing checks include portrait/landscape and rectangular custom variants.
  for(const [files,ranks]of [[8,8],[4,8],[8,4]]){
    await page.evaluate(state=>localStorage.setItem('cubehouse.game.v2',JSON.stringify({version:2,state,undo:[],layer:0})),initialState({files,ranks,layers:4}));
    await page.reload();await page.waitForSelector('[data-square]');
    for(const [width,height]of [[320,650],[390,844],[844,390],[768,1024],[1024,768],[1440,1000],[1920,1080]]){
      await page.setViewportSize({width,height});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${files}x${ranks} at ${width}`);
      await page.waitForTimeout(50);const box=await page.locator('#board').boundingBox(),cell=await page.locator('[data-square]').first().boundingBox();
      assert.ok(Math.abs(cell.width-cell.height)<2,`square cells ${files}x${ranks} at ${width}`);
      if(width>=1101)assert.ok(box.y+box.height<=height,`full board visible on desktop ${width}x${height}`);
      assert.ok(box.width<=width&&box.height<=height,`board fits ${files}x${ranks} at ${width}x${height}`);
    }
  }
  await start('medium','w');await page.setViewportSize({width:390,height:844});
  await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/bot-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'test-results/bot-desktop.png',fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS: public bot games at all difficulties, actual worker replies, paired undo, cancellation, black side, restore, resign, rematch, promotion, timeout and responsive rectangular boards.');
}finally{await browser.close();await server.shutdown();}
