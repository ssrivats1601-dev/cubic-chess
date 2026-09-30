import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseBotMove,botSettings,DIFFICULTIES} from '../src/bot.js';
import {initialState,emptyState,parse,playMove,positionKey} from '../src/engine.js';
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
