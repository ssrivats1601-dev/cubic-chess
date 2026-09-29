import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, emptyState, parse, coord, xyz, legalMoves, playMove, inCheck, positionKey, isAttacked, hasLegalMove, resultText } from '../src/engine.js';

const put=(s,c,type,color='w',extra={})=>s.board[parse(c)]={type,color,moved:true,...extra};
const has=(s,a,b)=>legalMoves(s,parse(a)).some(m=>m.to===parse(b));
function position(pieces,turn='w') {
  const s=emptyState(turn);for(const [c,type,color,extra] of pieces)put(s,c,type,color,extra);
  if(!s.board.some(p=>p?.type==='k'&&p.color==='w'))put(s,'1a1','k','w');
  if(!s.board.some(p=>p?.type==='k'&&p.color==='b'))put(s,'8h8','k','b');
  s.positions=[positionKey(s)];return s;
}
function move(s,a,b,promotion='q') {const out=playMove(s,{from:parse(a),to:parse(b)},promotion);assert.ok(!out.error,out.error);return out.state;}

test('coordinates roundtrip every square and initial setup has exactly 32 pieces on layer 1',()=>{
  for(let i=0;i<512;i++)assert.equal(parse(coord(i)),i);
  for(const bad of ['0a1','9a1','1i1','1a0','1a9','e1','1A1'])assert.equal(parse(bad),-1);
  const s=initialState();assert.equal(s.board.filter(Boolean).length,32);assert.equal(s.board.slice(64).filter(Boolean).length,0);
  assert.equal(s.board[parse('1e1')].type,'k');assert.equal(s.board[parse('1e8')].color,'b');assert.equal(inCheck(s),false);
  assert.ok(s.board.filter(Boolean).every(p=>'kqrbnp'.includes(p.type)));
});
test('rook travels along every axis and cannot pass through a blocker',()=>{
  const s=position([['4d4','r']]);assert.equal(legalMoves(s,parse('4d4')).length,21);
  for(const to of ['8d4','1d4','4h4','4a4','4d8','4d1'])assert.ok(has(s,'4d4',to),to);
  assert.ok(!has(s,'4d4','5e4'));put(s,'6d4','p');assert.ok(!has(s,'4d4','6d4'));assert.ok(!has(s,'4d4','7d4'));
});
test('bishops use the three sets of face diagonals, never space diagonals',()=>{
  const s=position([['4d4','b']]);
  for(const to of ['4e5','5e4','5d5','1a4','1d1'])assert.ok(has(s,'4d4',to),to);
  for(const to of ['5e5','4d5','5f4'])assert.ok(!has(s,'4d4',to),to);
  put(s,'5e4','p','b');assert.ok(has(s,'4d4','5e4'));assert.ok(!has(s,'4d4','6f4'));
});
test('knight has 24 interior jumps with all axis permutations',()=>{
  const s=position([['4d4','n']]);assert.equal(legalMoves(s,parse('4d4')).length,24);
  for(const to of ['6e4','5f4','4f5','4e6','6d5','5d6'])assert.ok(has(s,'4d4',to),to);
  put(s,'5d4','p');assert.ok(has(s,'4d4','6e4'));assert.ok(!has(s,'4d4','5e5'));
});
test('king can step into all 26 neighbors and cannot approach an enemy king',()=>{
  const s=position([['4d4','k','w']]);assert.equal(legalMoves(s,parse('4d4')).length,26);
  assert.ok(has(s,'4d4','5e5'));assert.ok(!has(s,'4d4','6d4'));
  put(s,'6f6','k','b');assert.ok(!has(s,'4d4','5e5'));
});
test('queen is rook plus bishop, excluding a three-axis diagonal',()=>{
  const s=position([['4d4','q']]);assert.ok(has(s,'4d4','8d4'));assert.ok(has(s,'4d4','6f4'));assert.ok(!has(s,'4d4','5e5'));
});
test('turns are enforced and captured pieces leave the board permanently',()=>{
  let s=initialState();assert.ok(playMove(s,{from:parse('1e7'),to:parse('1e5')}).error);
  s=move(s,'1e2','1e4');assert.equal(s.turn,'b');assert.ok(playMove(s,{from:parse('1d2'),to:parse('1d4')}).error);
  s=move(s,'1d7','1d5');s=move(s,'1e4','1d5');assert.equal(Object.hasOwn(s,'pockets'),false);assert.equal(s.board.filter(Boolean).length,31);assert.equal(s.board[parse('1d5')].color,'w');assert.equal(s.log.length,3);
});
test('a pin from another layer cannot be exposed, and check requires a response',()=>{
  const s=position([['1e1','k','w'],['2e1','r','w'],['8e1','r','b']]);
  assert.equal(inCheck(s),false);assert.ok(!has(s,'2e1','2f1'));assert.ok(has(s,'2e1','3e1'));
  s.board[parse('2e1')]=null;assert.ok(inCheck(s));put(s,'1a2','p','w');assert.ok(!has(s,'1a2','1a3'));
});
test('king is never captured and attacked destinations are illegal',()=>{
  const s=position([['4d4','r','w'],['4h4','k','b']]);assert.ok(!has(s,'4d4','4h4'));
  const t=position([['4d4','k','w'],['6f5','n','b']]);assert.ok(isAttacked(t,parse('4e5'),'b'));assert.ok(!has(t,'4d4','4e5'));
});
test('both castling directions move the rook and king on layer 1',()=>{
  for(const [dest,rookFrom,rookTo] of [['1g1','1h1','1f1'],['1c1','1a1','1d1']]) {
    const s=position([['1e1','k','w',{moved:false}],[rookFrom,'r','w',{moved:false}]]);
    assert.ok(has(s,'1e1',dest));const n=move(s,'1e1',dest);assert.equal(n.board[parse(rookTo)].type,'r');assert.equal(n.board[parse(rookFrom)],null);assert.ok(n.board[parse(dest)].moved);
  }
  const s=position([['1e8','k','b',{moved:false}],['1h8','r','b',{moved:false}]],'b');assert.ok(has(s,'1e8','1g8'));
});
test('castling rejects blockers, moved rooks, check and attacks on transit/destination from another layer',()=>{
  for(const [square,type] of [['1f1','p'],['7e1','r'],['7f1','r'],['7g1','r']]) {
    const s=position([['1e1','k','w',{moved:false}],['1h1','r','w',{moved:false}],[square,type,type==='p'?'w':'b']]);assert.ok(!has(s,'1e1','1g1'),square);
  }
  const s=position([['1e1','k','w',{moved:false}],['1h1','r','w',{moved:true}]]);assert.ok(!has(s,'1e1','1g1'));
  const t=position([['2e1','k','w',{moved:false}],['2h1','r','w',{moved:false}]]);assert.ok(!has(t,'2e1','2g1'));
});
test('pawns move within their layer, double only at home, capture forward diagonally and stop at blockers',()=>{
  const s=position([['1e2','p']]);assert.ok(has(s,'1e2','1e4'));assert.ok(!has(s,'1e2','2e3'));assert.ok(!has(s,'1e2','1f3'));
  put(s,'1f3','r','b');assert.ok(has(s,'1e2','1f3'));put(s,'1e3','n','b');assert.ok(!has(s,'1e2','1e3'));assert.ok(!has(s,'1e2','1e4'));
});
test('en passant captures the correct pawn, expires after one turn and cannot expose check',()=>{
  let s=position([['1e5','p','w'],['1d7','p','b']],'b');s=move(s,'1d7','1d5');assert.ok(has(s,'1e5','1d6'));
  const n=move(s,'1e5','1d6');assert.equal(n.board[parse('1d5')],null);assert.equal(n.log.at(-1).captured.type,'p');assert.equal(n.ep,null);
  s=move(s,'1a1','2a1');assert.equal(s.ep,null);
  let pinned=position([['1e1','k','w'],['1e5','p','w'],['1d7','p','b'],['1e8','r','b']],'b');pinned=move(pinned,'1d7','1d5');assert.ok(!has(pinned,'1e5','1d6'));
});
test('promotion allows all four choices and captured promoted pieces stay removed',()=>{
  for(const t of ['q','r','b','n']) {
    const s=position([['1e7','p','w']]);const n=move(s,'1e7','1e8',t);assert.equal(n.board[parse('1e8')].type,t);assert.ok(n.board[parse('1e8')].promoted);
    assert.ok(playMove(s,{from:parse('1e7'),to:parse('1e8')},'k').error);
  }
  const s=position([['4d4','q','w',{promoted:true}],['4d8','r','b']],'b');const n=move(s,'4d8','4d4');assert.equal(n.log.at(-1).captured.type,'q');assert.equal(Object.hasOwn(n,'pockets'),false);
});
test('drop requests are explicitly rejected and no reserves exist',()=>{
  const s=initialState();assert.ok(playMove(s,{drop:'q',to:parse('2e4')}).error);assert.equal(Object.hasOwn(s,'pockets'),false);
});
test('checkmate and stalemate are found across all three dimensions',()=>{
  // A black king in 1a1 has seven neighbors. Two queens cover every escape.
  let s=position([['1a1','k','b'],['3c2','k','w'],['2b3','q','w'],['1c1','q','w']]);
  s=move(s,'2b3','2b2');assert.equal(s.result?.kind,'checkmate');assert.equal(s.result.winner,'w');assert.ok(!hasLegalMove(s));assert.ok(playMove(s,{from:parse('1a1'),to:parse('1a2')}).error);
  let t=position([['1a1','k','b'],['3c2','k','w'],['2b4','q','w'],['1c2','q','w'],['2b1','r','w']]);
  t=move(t,'2b4','2b3');assert.equal(inCheck(t),false);assert.equal(t.result?.kind,'stalemate');
});
test('threefold repetition uses side, castling rights and effective en passant',()=>{
  let s=initialState();for(let round=0;round<2;round++){s=move(s,'1b1','3b2');s=move(s,'1b8','3b7');s=move(s,'3b2','1b1');s=move(s,'3b7','1b8');}
  assert.equal(s.result?.kind,'repetition');
  const a=initialState(),b=initialState();b.turn='b';assert.notEqual(positionKey(a),positionKey(b));b.turn='w';b.board[parse('1h1')].moved=true;assert.notEqual(positionKey(a),positionKey(b));
  const c=initialState();c.ep={target:parse('1e6'),captured:parse('1e5')};assert.equal(positionKey(a),positionKey(c));
});
test('king-only draw and readable game status',()=>{
  let s=position([]);s=move(s,'1a1','2a1');assert.equal(s.result.kind,'kings');assert.equal(resultText(s),'Draw · kings only');assert.equal(resultText(initialState()),'White to move');
});

test('all preset and custom dimensions constrain every legal destination',async()=>{
  const {dimensions,xyz}=await import('../src/engine.js');
  for(const config of [{files:4,ranks:4,layers:4},{files:8,ranks:8,layers:4},{files:5,ranks:7,layers:2},{files:8,ranks:4,layers:1}]){
    const s=initialState(config),c=dimensions(s);assert.equal(s.board.filter(Boolean).length,c.files*4);
    assert.equal(inCheck(s),false);
    for(let i=0;i<512;i++)for(const m of legalMoves(s,i)){const [l,f,r]=xyz(m.to);assert.ok(l<c.layers&&f<c.files&&r<c.ranks);}
  }
});
test('custom settings reject malformed values and clocks expire deterministically',async()=>{
  const {settings,startClock,remaining,expireClock}=await import('../src/engine.js');
  for(const c of [{files:3},{ranks:9},{layers:0},{minutes:-1},{increment:61},{files:4.5}])assert.throws(()=>settings(c));
  let s=startClock(initialState({minutes:1,increment:2}),1000);
  assert.equal(remaining(s,'w',4000),57000);assert.equal(remaining(s,'b',4000),60000);
  const moved=playMove(s,{from:parse('1e2'),to:parse('1e4')},'q',4000);assert.equal(moved.state.clock.w,59000);assert.equal(moved.state.clock.startedAt,4000);
  s=expireClock(moved.state,64000);assert.deepEqual(s.result,{kind:'timeout',winner:'w'});assert.equal(s.clock.b,0);
});
