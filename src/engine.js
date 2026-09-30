export const FILES = 'abcdefgh';
export const NAMES = { k: 'King', q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight', p: 'Pawn' };
export const other = c => c === 'w' ? 'b' : 'w';
export const sideName = c => c === 'w' ? 'White' : 'Black';
export const index = (l, f, r) => l * 64 + r * 8 + f;
export const xyz = i => [Math.floor(i / 64), i % 8, Math.floor(i % 64 / 8)];
export const coord = i => { const [l, f, r] = xyz(i); return `${l + 1}${FILES[f]}${r + 1}`; };
export const parse = s => /^[1-8][a-h][1-8]$/.test(s) ? index(+s[0] - 1, FILES.indexOf(s[1]), +s[2] - 1) : -1;
export const dimensions = s => s.config || {files:8,ranks:8,layers:8,minutes:0,increment:0};
export function settings(input={}) {
  const c={files:8,ranks:8,layers:8,minutes:0,increment:0,...input};
  for(const [key,min,max] of [['files',4,8],['ranks',4,8],['layers',1,8],['minutes',0,180],['increment',0,60]]) if(!Number.isInteger(c[key])||c[key]<min||c[key]>max) throw Error(`Invalid ${key}: use a whole number from ${min} to ${max}.`);
  return c;
}
export const armies={4:'rknr',5:'rnkqr',6:'rnbknr',7:'rnbkqnr',8:'rnbqkbnr'};
const inside = (a,s) => {const c=dimensions(s);return a.every((v,i)=>v>=0&&v<[c.layers,c.files,c.ranks][i]);};
export function startClock(s,now=Date.now()) {return s.clock&&!s.clock.startedAt?{...s,clock:{...s.clock,startedAt:now}}:s;}
export function remaining(s,color,now=Date.now()) {return s.clock?Math.max(0,s.clock[color]-(s.clock.startedAt&&s.turn===color&&!s.result?Math.max(0,now-s.clock.startedAt):0)):null;}
export function stopClock(s,now=Date.now()) {return s.clock?{...s,clock:{...s.clock,[s.turn]:remaining(s,s.turn,now),startedAt:null}}:s;}
export function expireClock(s,now=Date.now()) {
  if(!s.clock||!s.clock.startedAt||s.result||remaining(s,s.turn,now)>0)return s;
  return {...s,clock:{...s.clock,[s.turn]:0,startedAt:null},result:{kind:'timeout',winner:other(s.turn)}};
}
const kingDirs = [], rookDirs = [], bishopDirs = [], knightDirs = [];
for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let c = -2; c <= 2; c++) {
  const d = [a,b,c], abs = d.map(Math.abs), nonzero = abs.filter(Boolean);
  if (Math.max(...abs) === 1) kingDirs.push(d);
  if (nonzero.length === 1 && nonzero[0] === 1) rookDirs.push(d);
  if (nonzero.length === 2 && nonzero.every(v => v === 1)) bishopDirs.push(d);
  if (abs.slice().sort().join() === '0,1,2') knightDirs.push(d);
}
export function emptyState(turn = 'w') {
  return { board: Array(512).fill(null), turn, ep: null, ply: 0, log: [], positions: [], result: null, lastMove: null };
}
export function initialState(config={}) {
  const s = emptyState();s.config=settings(config);
  if(s.config.minutes)s.clock={w:s.config.minutes*60000,b:s.config.minutes*60000,increment:s.config.increment*1000,startedAt:null};
  for (const color of ['w','b']) {
    const r = color === 'w' ? 0 : s.config.ranks-1, pr = color === 'w' ? 1 : s.config.ranks-2;
    [...armies[s.config.files]].forEach((type,f) => {
      s.board[index(0,f,r)] = {type,color,moved:false};
      s.board[index(0,f,pr)] = {type:'p',color,moved:false};
    });
  }
  s.positions = [positionKey(s)];
  return s;
}
export function isAttacked(s, target, by) {
  const end = xyz(target);
  for (let i=0; i<512; i++) {
    const p=s.board[i]; if (!p || p.color !== by) continue;
    const start=xyz(i), d=end.map((v,j)=>v-start[j]), a=d.map(Math.abs), nz=a.filter(Boolean);
    if (!nz.length) continue;
    if (p.type==='p') { if(d[0]===0 && a[1]===1 && d[2]===(by==='w'?1:-1)) return true; continue; }
    if (p.type==='k') { if(Math.max(...a)===1) return true; continue; }
    if (p.type==='n') { if(a.slice().sort().join()==='0,1,2') return true; continue; }
    const axis=nz.length===1, diagonal=nz.length===2 && nz[0]===nz[1];
    if (!(p.type==='r' && axis || p.type==='b' && diagonal || p.type==='q' && (axis||diagonal))) continue;
    const steps=Math.max(...a), step=d.map(v=>Math.sign(v));
    let clear=true;
    for(let k=1;k<steps;k++) if(s.board[index(...start.map((v,j)=>v+step[j]*k))]) {clear=false;break;}
    if(clear) return true;
  }
  return false;
}
export function inCheck(s, color=s.turn) {
  const king=s.board.findIndex(p=>p?.color===color && p.type==='k');
  return king < 0 || isAttacked(s, king, other(color));
}
function basicMoves(s, from) {
  const p=s.board[from]; if(!p) return [];
  const start=xyz(from), moves=[];
  const add=(to,extra={})=>{ const occupant=s.board[to]; if(occupant?.color!==p.color && occupant?.type!=='k') moves.push({from,to,...extra}); };
  if(p.type==='p') {
    const [l,f,r]=start, dr=p.color==='w'?1:-1;
    if(r+dr>=0 && r+dr<dimensions(s).ranks) {
      const to=index(l,f,r+dr);
      if(!s.board[to]) {
        add(to);
        if(r===(p.color==='w'?1:dimensions(s).ranks-2) && dimensions(s).ranks>=6 && !s.board[index(l,f,r+2*dr)]) add(index(l,f,r+2*dr),{double:true});
      }
      for(const df of [-1,1]) if(f+df>=0 && f+df<dimensions(s).files) {
        const dest=index(l,f+df,r+dr);
        if(s.board[dest]?.color===other(p.color)) add(dest);
        else if(s.ep?.target===dest && s.board[s.ep.captured]?.type==='p' && s.board[s.ep.captured]?.color===other(p.color)) add(dest,{epCapture:s.ep.captured});
      }
    }
    return moves.map(m=>({...m,...(xyz(m.to)[2]===(p.color==='w'?dimensions(s).ranks-1:0)?{promotion:true}:{})}));
  }
  const dirs=p.type==='r'?rookDirs:p.type==='b'?bishopDirs:p.type==='q'?[...rookDirs,...bishopDirs]:p.type==='n'?knightDirs:kingDirs;
  const sliding=['r','b','q'].includes(p.type);
  for(const d of dirs) for(let n=1;n<=(sliding?7:1);n++) {
    const pos=start.map((v,j)=>v+d[j]*n); if(!inside(pos,s)) break;
    const to=index(...pos); add(to); if(s.board[to]) break;
  }
  if(dimensions(s).files===8 && p.type==='k' && !p.moved && start[0]===0 && start[1]===4 && start[2]===(p.color==='w'?0:dimensions(s).ranks-1) && !inCheck(s,p.color)) {
    const r=start[2];
    for(const [rf,kf,through] of [[7,6,[5,6]],[0,2,[3,2,1]]]) {
      const ri=index(0,rf,r), rook=s.board[ri];
      if(rook?.type!=='r' || rook.color!==p.color || rook.moved || rook.promoted || through.some(f=>s.board[index(0,f,r)])) continue;
      const transit=index(0,through[0],r), trial=applyRaw(s,{from,to:transit});
      if(!inCheck(trial,p.color)) add(index(0,kf,r),{castle:{from:ri,to:index(0,kf===6?5:3,r)}});
    }
  }
  return moves;
}
function applyRaw(s,m,promotion='q') {
  const next={...s, board:s.board.slice(),ep:null};
  const p=s.board[m.from];
  next.board[m.from]=null;
  if(m.epCapture!==undefined) next.board[m.epCapture]=null;
  next.board[m.to]={...p,moved:true,...(m.promotion?{type:promotion,promoted:true}:{})};
  if(m.castle) {
    next.board[m.castle.to]={...next.board[m.castle.from],moved:true};
    next.board[m.castle.from]=null;
  }
  if(m.double) next.ep={target:(m.from+m.to)/2,captured:m.to};
  return next;
}
// Search only: callers must supply a move from legalMoves. Real moves still
// pass through playMove, including clocks, repetition and terminal adjudication.
export function searchPosition(s,move,promotion='q') {
  return {...applyRaw(s,move,promotion),turn:other(s.turn),ply:s.ply+1,clock:null};
}
export function legalMoves(s, from) {
  if(s.result || !Number.isInteger(from) || from<0 || from>=512 || s.board[from]?.color!==s.turn) return [];
  return basicMoves(s,from).filter(m=>!inCheck(applyRaw(s,m),s.turn));
}
export function hasLegalMove(s) {
  for(let i=0;i<512;i++) if(s.board[i]?.color===s.turn && legalMoves(s,i).length) return true;
  return false;
}
export function positionKey(s) {
  const pieces=s.board.map((p,i)=>p?`${i}${p.color}${p.type}${p.promoted?'~':''}`:'').filter(Boolean).join(',');
  const rights=['w','b'].map(c=>{
    const r=c==='w'?0:dimensions(s).ranks-1,k=s.board[index(0,4,r)];
    return [0,7].map(f=>{const p=s.board[index(0,f,r)]; return k?.type==='k' && k.color===c && !k.moved && p?.type==='r' && p.color===c && !p.moved && !p.promoted ? `${c}${f}`:'';}).join('');
  }).join('');
  // An unusable en-passant target does not distinguish repeated positions.
  const ep=s.ep && s.board.some((p,i)=>p?.color===s.turn && p.type==='p' && basicMoves(s,i).some(m=>m.epCapture!==undefined && !inCheck(applyRaw(s,m),s.turn))) ? s.ep.target : '-';
  return `${pieces}|${s.turn}|${rights}|${ep}`;
}
export function playMove(s,request,promotion='q',now=Date.now()) {
  const expired=expireClock(s,now);if(expired!==s)return {state:expired,error:'Time expired.'};
  if(s.result) return {error:'This game has ended. Start a new game or undo the last move.'};
  if(!request || !Number.isInteger(request.to) || request.to<0 || request.to>=512) return {error:'Choose a square inside the cube.'};
  if(Object.hasOwn(request,'drop')) return {error:'Captured pieces are removed from play. Drops are not part of Cubic Chess.'};
  const moves=legalMoves(s,request.from);
  const move=moves.find(m=>m.to===request.to);
  if(!move) return {error:'That move is not legal. Follow the highlighted squares and keep your king safe.'};
  if(move.promotion && !['q','r','b','n'].includes(promotion)) return {error:'Choose a queen, rook, bishop or knight for promotion.'};
  const piece=s.board[move.from];
  const captured=s.board[move.epCapture??move.to];
  const next=applyRaw(s,move,promotion);
  if(s.clock)next.clock={...s.clock,[s.turn]:remaining(s,s.turn,now)+s.clock.increment,startedAt:now};
  next.turn=other(s.turn);next.ply=s.ply+1;next.lastMove={...move,color:s.turn};
  const check=inCheck(next);
  next.positions=[...s.positions,positionKey(next)];
  if(!hasLegalMove(next)) next.result=check?{kind:'checkmate',winner:s.turn}:{kind:'stalemate'};
  else if(next.positions.filter(k=>k===next.positions.at(-1)).length>=3) next.result={kind:'repetition'};
  else if(next.board.filter(Boolean).every(p=>p.type==='k')) next.result={kind:'kings'};
  if(next.result&&next.clock)next.clock.startedAt=null;
  const notation=move.castle?(xyz(move.to)[1]===6?'O-O':'O-O-O'):`${coord(move.from)} ${captured?'×':'→'} ${coord(move.to)}${move.promotion?'='+promotion.toUpperCase():''}${move.epCapture!==undefined?' e.p.':''}`;
  const entry={color:s.turn,piece:piece.type,notation:notation+(next.result?.kind==='checkmate'?'#':check?'+':''),capture:!!captured,captured:captured?{type:captured.type,color:captured.color}:null,from:move.from,to:move.to};
  next.log=[...s.log,entry];
  return {state:next,move,entry};
}
export function resultText(s) {
  if(!s.result) return inCheck(s)?`${sideName(s.turn)} is in check`:`${sideName(s.turn)} to move`;
  const r=s.result;
  if(r.winner) return `${sideName(r.winner)} wins${r.kind==='checkmate'?' by checkmate':r.kind==='timeout'?' on time':' by resignation'}`;
  return ({stalemate:'Draw by stalemate',repetition:'Draw by threefold repetition',kings:'Draw · kings only',agreement:'Draw by agreement'})[r.kind]||'Game finished';
}
