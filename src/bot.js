import {legalMoves,legalCaptures,searchPosition,inCheck,hasLegalMove,dimensions,xyz,index,other,positionKey} from './engine.js';

export const DIFFICULTIES={
  easy:{label:'Easy',depth:1,ms:250,qdepth:2,description:'Basic tactics with varied play; looks for safe captures instead of random moves.'},
  medium:{label:'Medium',depth:3,ms:1000,qdepth:4,description:'Checks exchanges, develops pieces and looks for tactical replies.'},
  hard:{label:'Hard',depth:4,ms:2400,qdepth:5,description:'Deeper tactical search, king safety and capture-chain analysis.'},
  expert:{label:'Expert',depth:6,ms:3800,qdepth:6,description:'The deepest time-bounded search, with move ordering and position caching. No claimed Elo rating.'}
};
const VALUE={p:100,n:360,b:390,r:550,q:1050,k:20000},MATE=100000;
export function botSettings(value){return value&&Object.hasOwn(DIFFICULTIES,value.difficulty)&&['w','b'].includes(value.human)?{difficulty:value.difficulty,human:value.human}:null;}
const kingDirs=[],rookDirs=[],bishopDirs=[],knightDirs=[];
for(let l=-2;l<=2;l++)for(let f=-2;f<=2;f++)for(let r=-2;r<=2;r++){
  const d=[l,f,r],a=d.map(Math.abs),nz=a.filter(Boolean);
  if(Math.max(...a)===1)kingDirs.push(d);
  if(nz.length===1&&nz[0]===1)rookDirs.push(d);
  if(nz.length===2&&nz.every(x=>x===1))bishopDirs.push(d);
  if(a.slice().sort().join()==='0,1,2')knightDirs.push(d);
}
const dirs={k:kingDirs,r:rookDirs,b:bishopDirs,q:[...rookDirs,...bishopDirs],n:knightDirs};
function inside(pos,c){return pos[0]>=0&&pos[0]<c.layers&&pos[1]>=0&&pos[1]<c.files&&pos[2]>=0&&pos[2]<c.ranks;}
// Attack maps include friendly occupied squares (defenders) and stop at blockers.
// They are a heuristic only: the engine still validates every searched/played move.
function attacks(s){
  const c=dimensions(s),map={w:new Uint16Array(512),b:new Uint16Array(512)},least={w:new Uint16Array(512).fill(30000),b:new Uint16Array(512).fill(30000)};
  s.board.forEach((p,i)=>{if(!p)return;const pos=xyz(i),mark=to=>{map[p.color][to]++;least[p.color][to]=Math.min(least[p.color][to],VALUE[p.type]);};
    if(p.type==='p'){for(const f of [-1,1]){const to=[pos[0],pos[1]+f,pos[2]+(p.color==='w'?1:-1)];if(inside(to,c))mark(index(...to));}return;}
    const sliding=['q','r','b'].includes(p.type);
    for(const d of dirs[p.type])for(let n=1;n<=(sliding?7:1);n++){const to=pos.map((x,j)=>x+d[j]*n);if(!inside(to,c))break;const square=index(...to);mark(square);if(s.board[square])break;}
  });return {map,least};
}
function evaluate(s){
  const c=dimensions(s),{map,least}=attacks(s),score={w:0,b:0},risk={w:[],b:[]};
  const nonPawns=s.board.filter(p=>p&&p.type!=='p'&&p.type!=='k').length,endgame=nonPawns<=4;
  s.board.forEach((p,i)=>{
    if(!p)return;const [l,f,r]=xyz(i),enemy=other(p.color),advance=p.color==='w'?r:c.ranks-1-r;
    const center=(c.files-1)/2-Math.abs(f-(c.files-1)/2)+(c.ranks-1)/2-Math.abs(r-(c.ranks-1)/2);
    let v=p.type==='k'?0:VALUE[p.type];
    if(p.type==='p')v+=advance*6+Math.max(0,center)*3;
    else if(p.type==='k'){
      if(endgame)v+=center*5;
      else{v-=Math.max(0,advance-1)*20+l*16;if(!p.moved)v+=12;}
      let danger=0;
      for(const d of kingDirs){const at=[l+d[0],f+d[1],r+d[2]];if(inside(at,c)){const to=index(...at);if(map[enemy][to])danger+=map[p.color][to]?7:16;}}
      v-=danger;if(map[enemy][i])v-=55;
    }else{
      v+=center*(p.type==='n'?9:5);
      // Development matters in 3D too; moving away from the army indefinitely does not.
      if(['n','b'].includes(p.type)){if(p.moved)v+=24;else if(s.ply<30)v-=18;v+=Math.min(l,2)*4;}
      if(p.type==='q'&&p.moved&&s.ply<12)v-=22;
      if(l>2)v-=(l-2)*5;
    }
    if(p.type!=='k'&&map[enemy][i]){
      const loss=!map[p.color][i]?VALUE[p.type]:Math.max(0,VALUE[p.type]-least[enemy][i]);
      if(loss)risk[p.color].push(loss);
    }
    score[p.color]+=v;
  });
  // Only one piece can be captured per turn. Weight the largest liability most.
  for(const color of ['w','b']){risk[color].sort((a,b)=>b-a);score[color]-=(risk[color][0]||0)*(color===s.turn?.18:.72)+(risk[color][1]||0)*.08;}
  let mobility=0;for(let i=0;i<512;i++)mobility+=(map[s.turn][i]>0?1:0)-(map[other(s.turn)][i]>0?1:0);
  return score[s.turn]-score[other(s.turn)]+mobility*.7;
}
const moveId=m=>m?`${m.from}:${m.to}:${m.promote}`:'';
function priority(s,m){const victim=s.board[m.epCapture??m.to];return (victim?VALUE[victim.type]*16-VALUE[s.board[m.from].type]:0)+(m.promotion?VALUE[m.promote]*12:0)+(m.castle?80:0);}
function moves(s,check=()=>{},captures=false){const out=[];for(let i=0;i<512;i++){if(s.board[i]?.color!==s.turn)continue;check();for(const m of (captures?legalCaptures:legalMoves)(s,i))for(const promote of m.promotion?['q','n','r','b']:['q'])out.push({...m,promote});}return out.sort((a,b)=>priority(s,b)-priority(s,a));}

export function chooseBotMove(state,difficulty='medium',{budgetMs,random=Math.random,now=()=>performance.now(),onProgress=()=>{},stats={}}={}){
  const level=DIFFICULTIES[difficulty]||DIFFICULTIES.medium;
  if(state.result)return null;
  const started=now(),deadline=started+Math.max(0,budgetMs??level.ms),TIMEOUT=Symbol('timeout');
  const check=()=>{if(now()>=deadline)throw TIMEOUT;};
  const root={...state,clock:null},choices=moves(root);
  if(!choices.length)return null;
  Object.assign(stats,{nodes:0,completedDepth:0,timedOut:false});
  let best=choices[0],bestScore=-Infinity;
  const publish=()=>onProgress(best);
  // Rank every root move for safety before deepening. An interrupted search keeps
  // the best fully evaluated candidate, never resets to the first listed capture.
  const ranked=[];
  for(const m of choices){
    if(ranked.length&&now()>=deadline)break;
    const next=searchPosition(root,m,m.promote);let score=-evaluate(next);
    if(!hasLegalMove(next))score=inCheck(next)?MATE-1:0;
    const key=positionKey(next);if(state.positions.filter(k=>k===key).length>=2)score=0;
    ranked.push({move:m,score});
    if(score>bestScore){best=m;bestScore=score;}
  }
  ranked.sort((a,b)=>b.score-a.score);publish();
  if(bestScore>=MATE-1)return best;
  const table=new Map(),history=new Map(),killers=new Map();
  const counts=new Map();for(const key of state.positions)counts.set(key,(counts.get(key)||0)+1);
  const rootKey=positionKey(root);if(!counts.has(rootKey))counts.set(rootKey,1);
  // Intern position keys so history-aware cache entries remain small.
  const ids=new Map();const id=key=>{if(!ids.has(key))ids.set(key,ids.size);return ids.get(key);};
  function ordered(s,list,ply,preferred){return list.sort((a,b)=>{
    const rank=m=>(moveId(m)===preferred?1000000:0)+priority(s,m)+(killers.get(ply)===moveId(m)?2000:0)+(history.get(s.turn+moveId(m))||0);
    return rank(b)-rank(a);
  });}
  function descend(s,m,fn){const child=searchPosition(s,m,m.promote),key=positionKey(child),previous=counts.get(key)||0;counts.set(key,previous+1);try{return previous>=2?0:fn(child);}finally{if(previous)counts.set(key,previous);else counts.delete(key);}}
  function quiet(s,alpha,beta,ply,left){
    check();stats.nodes++;
    const checked=inCheck(s),list=ordered(s,moves(s,check,!checked),ply);
    if(!list.length&&(checked||!hasLegalMove(s)))return checked?-MATE+ply:0;
    // At the safety cap, still score every legal check evasion: never stand pat in check.
    if(left<=0){if(!checked)return evaluate(s);let best=-Infinity;for(const m of list){check();best=Math.max(best,descend(s,m,child=>-evaluate(child)));}return best;}
    if(!checked){const stand=evaluate(s);if(stand>=beta)return stand;alpha=Math.max(alpha,stand);}
    for(const m of list){const value=descend(s,m,child=>-quiet(child,-beta,-alpha,ply+1,left-1));if(value>=beta)return value;alpha=Math.max(alpha,value);}
    return alpha;
  }
  function search(s,depth,alpha,beta,ply){
    check();stats.nodes++;
    if(s.board.every(p=>!p||p.type==='k'))return 0;
    if(depth<=0)return quiet(s,alpha,beta,ply,level.qdepth);
    // Include occurrence history: transpositions with different repetition rights
    // must never reuse a draw score from another line.
    const key=id(positionKey(s))+'|'+[...counts].map(([k,n])=>[id(k),n]).sort((a,b)=>a[0]-b[0]).map(([k,n])=>k+':'+n).join(';');
    const cached=table.get(key),originalAlpha=alpha;
    if(cached?.depth>=depth){const value=cached.score>MATE-1000?cached.score-ply:cached.score<-MATE+1000?cached.score+ply:cached.score;if(cached.flag==='exact')return value;if(cached.flag==='lower')alpha=Math.max(alpha,value);else beta=Math.min(beta,value);if(alpha>=beta)return value;}
    const list=ordered(s,moves(s,check),ply,cached?.move);
    if(!list.length)return inCheck(s)?-MATE+ply:0;
    let score=-Infinity,chosen=list[0];
    for(const m of list){const value=descend(s,m,child=>-search(child,depth-1,-beta,-alpha,ply+1));if(value>score){score=value;chosen=m;}alpha=Math.max(alpha,value);if(alpha>=beta){if(!s.board[m.to]&&m.epCapture===undefined){killers.set(ply,moveId(m));history.set(s.turn+moveId(m),Math.min(1500,(history.get(s.turn+moveId(m))||0)+depth*depth*8));}break;}}
    if(table.size<12000)table.set(key,{depth,score:score>MATE-1000?score+ply:score<-MATE+1000?score-ply:score,move:moveId(chosen),flag:score<=originalAlpha?'upper':score>=beta?'lower':'exact'});
    return score;
  }
  let order=[...ranked.map(x=>x.move),...choices.filter(m=>!ranked.some(x=>x.move===m))];
  for(let depth=1;depth<=level.depth;depth++){
    let candidate=best,score=-Infinity,alpha=-Infinity;const scores=[];
    try{
      order=[best,...order.filter(m=>m!==best)];
      for(const m of order){check();const value=descend(root,m,child=>-search(child,depth-1,-Infinity,difficulty==='easy'?Infinity:-alpha,1));scores.push({move:m,score:value});if(value>score){score=value;candidate=m;}alpha=Math.max(alpha,value);
        if(depth===1){best=candidate;publish();} // valid partial first depth survives timeout
      }
      best=candidate;bestScore=score;stats.completedDepth=depth;
      scores.sort((a,b)=>b.score-a.score);order=scores.map(x=>x.move);publish();
      if(score>=MATE-1000)break;
      if(difficulty==='easy'){
        // Variety only among near-equal moves, never arbitrary losing choices.
        const near=scores.filter(x=>x.score>=score-25);best=near[Math.min(near.length-1,Math.floor(random()*near.length))].move;
      }
    }catch(e){if(e!==TIMEOUT)throw e;stats.timedOut=true;break;}
  }
  stats.elapsedMs=now()-started;return best;
}
