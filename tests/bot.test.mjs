import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseBotMove,botSettings,DIFFICULTIES} from '../src/bot.js';
import {initialState,emptyState,parse,playMove,positionKey,legalMoves,legalCaptures,isAttacked} from '../src/engine.js';
function fixture(pieces){const s=emptyState();s.config={files:8,ranks:8,layers:1,minutes:0,increment:0};for(const [square,type,color]of pieces)s.board[parse(square)]={type,color,moved:true};s.positions=[positionKey(s)];return s;}
test('every bot difficulty returns engine-legal moves on all preset and rectangular boards without mutation',()=>{
  for(const [files,ranks,layers]of [[4,4,4],[6,6,6],[8,8,4],[8,8,8],[8,8,1],[4,8,2],[8,4,2]])for(const difficulty of Object.keys(DIFFICULTIES)){
    const s=initialState({files,ranks,layers}),copy=JSON.stringify(s),m=chooseBotMove(s,difficulty,{budgetMs:40,random:()=>.4});
    assert.ok(m);assert.equal(playMove(s,m,m.promote).error,undefined);assert.equal(JSON.stringify(s),copy);
  }
});
test('medium bot takes a free queen and promotes; search handles mate and ended games',()=>{
  const s=fixture([['1a1','k','w'],['1h8','k','b'],['1d3','r','w'],['1d5','q','b']]);
  const m=chooseBotMove(s,'medium',{budgetMs:2000});assert.equal(m.to,parse('1d5'));
  const promotion=fixture([['1a1','k','w'],['1h6','k','b'],['1e7','p','w']]);
  const p=chooseBotMove(promotion,'medium',{budgetMs:2000});assert.equal(p.to,parse('1e8'));assert.equal(p.promote,'q');
  const mate=fixture([['1f6','k','w'],['1h8','k','b'],['1g6','q','w']]);
  const win=chooseBotMove(mate,'hard',{budgetMs:2000});assert.equal(playMove(mate,win,win.promote).state.result?.kind,'checkmate');
  assert.equal(chooseBotMove({...s,result:{kind:'agreement'}}),null);
});
test('search returns a legal fallback with an exhausted budget and validates restored bot settings',()=>{
  assert.ok(chooseBotMove(initialState(),'expert',{budgetMs:0}));
  assert.equal(botSettings({difficulty:'impossible',human:'w'}),null);
  assert.deepEqual(botSettings({difficulty:'hard',human:'b'}),{difficulty:'hard',human:'b'});
});
test('medium saves its threatened queen instead of grabbing a pawn, including vertical attacks',()=>{
  for(const [layers,pieces,queen]of [
    [1,[['1a1','k','w'],['1e8','k','b'],['1d3','q','w'],['1d8','r','b'],['1b1','n','w'],['1c3','p','b']],'1d3'],
    [8,[['1a1','k','w'],['8h8','k','b'],['2d3','q','w'],['5d3','r','b'],['5e4','p','b'],['1b1','n','w'],['1c3','p','b']],'2d3']
  ]){
    const s=fixture(pieces);s.config.layers=layers;s.positions=[positionKey(s)];
    const move=chooseBotMove(s,'medium'),next=playMove(s,move,move.promote).state;
    assert.equal(move.from,parse(queen),'save the queen, not knight takes pawn');
    assert.equal(isAttacked(next,move.to,'b'),false,'queen escapes the attack');
  }
});
test('medium prevents mate in one instead of taking a free rook',()=>{
  const s=fixture([['1g1','k','w'],['1f1','r','w'],['1b1','q','w'],['1f2','p','w'],['1g2','p','w'],['1h2','p','w'],['1g8','k','b'],['1h4','q','b'],['1d6','b','b'],['1b7','r','b']]);
  const move=chooseBotMove(s,'medium'),next=playMove(s,move,move.promote).state;
  for(let i=0;i<512;i++)for(const reply of legalMoves(next,i))assert.notEqual(playMove(next,reply).state.result?.kind,'checkmate','do not allow Qxh2 mate');
});
test('easy uses tactics instead of random moves; best search progress survives its deadline',()=>{
  const s=fixture([['1a1','k','w'],['1h8','k','b'],['1d3','r','w'],['1d5','q','b']]);
  for(const random of [()=>0,()=>.5,()=>.999])assert.equal(chooseBotMove(s,'easy',{random}).to,parse('1d5'));
  const initial=initialState(),stats={},updates=[];
  const m=chooseBotMove(initial,'expert',{budgetMs:25,stats,onProgress:move=>updates.push(move)});
  assert.ok(updates.length);assert.deepEqual(m,updates.at(-1));assert.equal(playMove(initial,m,m.promote).error,undefined);
  assert.ok(stats.elapsedMs<1000,'deadline must keep the search bounded');
});
test('capture-only search uses engine legality, including promotion and en passant',()=>{
  const s=fixture([['1a1','k','w'],['1h8','k','b'],['1d5','p','w'],['1e5','p','b'],['1b7','p','w']]);
  s.ep={target:parse('1e6'),captured:parse('1e5')};
  for(let i=0;i<512;i++)assert.deepEqual(legalCaptures(s,i),legalMoves(s,i).filter(m=>s.board[m.to]||m.epCapture!==undefined||m.promotion));
  assert.ok(legalCaptures(s,parse('1d5')).some(m=>m.epCapture===parse('1e5')));
  assert.ok(legalCaptures(s,parse('1b7')).some(m=>m.promotion));
});
