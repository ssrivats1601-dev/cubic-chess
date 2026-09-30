import {legalMoves,searchPosition,inCheck,dimensions,xyz,isAttacked,other,positionKey} from './engine.js';

export const DIFFICULTIES={
  easy:{label:'Easy',depth:0,ms:100,description:'Exploratory play; chooses random legal moves.'},
  medium:{label:'Medium',depth:1,ms:350,description:'Looks for captures, promotion and safer squares.'},
  hard:{label:'Hard',depth:2,ms:1200,description:'Searches replies and avoids simple tactical losses.'},
  expert:{label:'Expert',depth:3,ms:2500,description:'Searches deeper within a time budget. No claimed Elo rating.'}
};
const VALUE={p:100,n:340,b:350,r:530,q:950,k:0},MATE=100000;
export function botSettings(value){return value&&Object.hasOwn(DIFFICULTIES,value.difficulty)&&['w','b'].includes(value.human)?{difficulty:value.difficulty,human:value.human}:null;}
function material(s){
  const c=dimensions(s);let score=0;
  s.board.forEach((p,i)=>{if(!p)return;const [l,f,r]=xyz(i),center=(c.files-1)/2-Math.abs(f-(c.files-1)/2)+(c.ranks-1)/2-Math.abs(r-(c.ranks-1)/2);
    const position=p.type==='p'?(p.color==='w'?r:c.ranks-1-r)*9:p.type==='k'?0:center*3+Math.min(l,2)*2;
    score+=(p.color===s.turn?1:-1)*(VALUE[p.type]+position);
  });return score;
}
function priority(s,m){return (VALUE[s.board[m.epCapture??m.to]?.type]||0)*10-(s.board[m.to]?VALUE[s.board[m.from].type]:0)+(m.promotion?9000:0)+(m.castle?50:0);}
function moves(s,check=()=>{}){const out=[];for(let i=0;i<512;i++){if(s.board[i]?.color!==s.turn)continue;check();for(const m of legalMoves(s,i))for(const promote of m.promotion?['q','n','r','b']:['q'])out.push({...m,promote});}return out.sort((a,b)=>priority(s,b)-priority(s,a));}

export function chooseBotMove(state,difficulty='medium',{budgetMs,random=Math.random,now=()=>performance.now()}={}){
  const level=DIFFICULTIES[difficulty]||DIFFICULTIES.medium;
  if(state.result)return null;
  const root={...state,clock:null},choices=moves(root);
  if(!choices.length)return null;
  if(level.depth===0)return choices[Math.min(choices.length-1,Math.floor(random()*choices.length))];
  const deadline=now()+(budgetMs??level.ms),TIMEOUT=Symbol('timeout');
  const check=()=>{if(now()>=deadline)throw TIMEOUT;};
  let best=choices[0];
  // Complete iterative depths replace the previous result. Interrupted searches
  // keep a valid result, so even very large 3D boards have bounded thinking time.
  function search(s,depth,alpha,beta,ply){
    check();const list=moves(s,check);
    if(!list.length)return inCheck(s)?-MATE+ply:0;
    if(s.board.every(p=>!p||p.type==='k'))return 0;
    if(!depth)return material(s);
    let score=-Infinity;
    for(const m of list){const value=-search(searchPosition(s,m,m.promote),depth-1,-beta,-alpha,ply+1);score=Math.max(score,value);alpha=Math.max(alpha,value);if(alpha>=beta)break;}
    return score;
  }
  for(let depth=1;depth<=level.depth;depth++){
    let candidate=best,score=-Infinity,alpha=-Infinity;
    try{
      const ordered=[best,...choices.filter(m=>m!==best)];
      for(const m of ordered){check();const next=searchPosition(root,m,m.promote);
        let value=-search(next,depth-1,-Infinity,-alpha,1);
        if(depth===1&&Math.abs(value)<MATE-100&&isAttacked(next,m.to,next.turn))value-=VALUE[next.board[m.to].type]*.65;
        if(state.positions.filter(k=>k===positionKey(next)).length>=2)value=0;
        if(value>score){score=value;candidate=m;}alpha=Math.max(alpha,value);
      }
      best=candidate;
    }catch(e){if(e!==TIMEOUT)throw e;break;}
  }
  return best;
}
