import { initialState, playMove, other, startClock, expireClock, settings, stopClock } from '../src/engine.js';

const DAY=86400000, CODE=/^[A-HJ-NP-Z2-9]{10}$/;
const response=(data,status=200)=>Response.json({...data,serverTime:Date.now()},{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
const fail=(status,message)=>{throw new HttpError(status,message);};
const digest=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
function roomCode(){const bytes=crypto.getRandomValues(new Uint8Array(10)),alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return [...bytes].map(n=>alphabet[n%alphabet.length]).join('');}
function cleanName(n){if(typeof n!=='string')fail(400,'Enter a player name.');const v=n.trim().replace(/\s+/g,' ');if(v.length<1||v.length>24||/[\u0000-\u001f\u007f]/.test(v))fail(400,'Use a name between 1 and 24 characters.');return v;}
const seat=(r,h)=>r.white_hash===h?'w':r.black_hash===h?'b':null;
function summary(r,h){return {result:r.game?JSON.parse(r.game).result:null,config:r.game?JSON.parse(r.game).config:null,code:r.code,visibility:r.visibility,status:r.status,revision:r.revision,myColor:seat(r,h),hostName:r.white_hash===r.host_hash?r.white_name:r.black_name,createdAt:r.created_at,updatedAt:r.updated_at,expiresAt:r.expires_at};}
function view(r,h){return {...summary(r,h),state:JSON.parse(r.game),drawOffer:r.draw_offer,players:{w:r.white_hash?{name:r.white_name,lastSeen:r.white_seen,connected:Date.now()-r.white_seen<15000}:null,b:r.black_hash?{name:r.black_name,lastSeen:r.black_seen,connected:Date.now()-r.black_seen<15000}:null}};}
async function body(request){
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))fail(415,'Send JSON.');
  if(Number(request.headers.get('Content-Length'))>4096)fail(413,'Request is too large.');
  const text=await request.text();if(text.length>4096)fail(413,'Request is too large.');
  try{const data=JSON.parse(text);if(!data||typeof data!=='object'||Array.isArray(data))throw Error();return data;}catch{fail(400,'Invalid request.');}
}
async function getRoom(db,code){const r=await db.prepare('SELECT * FROM rooms WHERE code = ? AND expires_at > ?').bind(code,Date.now()).first();if(!r||r.status==='cancelled')fail(404,'Room not found or expired. Check the code.');return r;}
async function updateRoom(db,r,patch){
  const keys=Object.keys(patch);
  const result=await db.prepare(`UPDATE rooms SET ${keys.map(k=>k+' = ?').join(', ')}, revision = revision + 1, updated_at = ? WHERE code = ? AND revision = ?`).bind(...Object.values(patch),Date.now(),r.code,r.revision).run();
  if(!result.meta.changes)fail(409,'The game changed while you were acting. It is being refreshed; try again.');
  return getRoom(db,r.code);
}
async function lobby(db,hash){
  const now=Date.now();
    const [listed,mine]=await Promise.all([
      db.prepare("SELECT game,code,visibility,status,revision,white_hash,black_hash,host_hash,white_name,black_name,created_at,updated_at,expires_at FROM rooms WHERE visibility='public' AND status='waiting' AND expires_at>? ORDER BY created_at DESC LIMIT 40").bind(now).all(),
      db.prepare("SELECT game,code,visibility,status,revision,white_hash,black_hash,host_hash,white_name,black_name,created_at,updated_at,expires_at FROM rooms WHERE (white_hash=? OR black_hash=?) AND status!='cancelled' AND expires_at>? ORDER BY updated_at DESC LIMIT 8").bind(hash,hash,now).all()
    ]);
    return {rooms:listed.results.map(r=>summary(r,hash)),mine:mine.results.map(r=>summary(r,hash))};
}
async function settleRoom(db,r){
  if(r.status!=='active')return r;
  const game=JSON.parse(r.game),next=expireClock(game);
  if(next===game)return r;
  try{return await updateRoom(db,r,{game:JSON.stringify(next),status:'finished',draw_offer:null});}catch(e){if(e.status===409)return getRoom(db,r.code);throw e;}
}
async function roomSnapshot(db,code,hash){
  let r=await getRoom(db,code);const color=seat(r,hash);
  if(!color)fail(403,'Join this room to view its match.');
  r=await settleRoom(db,r);
  const field=color==='w'?'white_seen':'black_seen',now=Date.now();
  if(now-r[field]>=5000){await db.prepare(`UPDATE rooms SET ${field}=? WHERE code=?`).bind(now,code).run();r[field]=now;}
  return {room:view(r,hash)};
}
function readerFor(db,target,hash){
  if(target==='lobby')return ()=>lobby(db,hash);
  if(typeof target==='string'&&target.startsWith('room:')&&CODE.test(target.slice(5)))return ()=>roomSnapshot(db,target.slice(5),hash);
  fail(400,'That live update target is invalid.');
}
async function liveUpdate(db,target,hash,cursor){
  const read=readerFor(db,target,hash),deadline=Date.now()+5000;
  let snapshot,signature;
  do{
    snapshot=await read();signature=await digest(JSON.stringify(snapshot));
    if(signature!==cursor)return {...snapshot,cursor:signature};
    await new Promise(resolve=>setTimeout(resolve,250));
  }while(Date.now()<deadline);
  return {...snapshot,cursor:signature};
}
async function api(request,env){
  const url=new URL(request.url),path=url.pathname;
  if(!env.DB)fail(503,'The online lobby is not ready yet. Local play is available.');
  await env.DB.ready();
  if(path==='/api/health'&&request.method==='GET'){await env.DB.prepare('SELECT 1').first();return response({ok:true,version:3});}
  if(path==='/api/socket')fail(426,'A WebSocket upgrade is required.');
  const raw=request.headers.get('X-Player-Token');
  if(!raw||!/^[a-f0-9]{64}$/.test(raw))fail(401,'Your player session is missing. Reload this page.');
  const hash=await digest(raw),db=env.DB,now=Date.now();
  const origin=request.headers.get('Origin');
  if(origin&&origin!==url.origin)fail(403,'Use the Cubic Chess page to make changes.');
  if(path==='/api/live'&&request.method==='GET'){
    const target=url.searchParams.get('target'),cursor=url.searchParams.get('cursor')||'';
    if(cursor&&!/^[a-f0-9]{64}$/.test(cursor))fail(400,'That live update cursor is invalid.');
    return response(await liveUpdate(db,target,hash,cursor));
  }
  if(path==='/api/socket-ticket'&&request.method==='POST'){
    const data=await body(request),target=data.target;
    const read=readerFor(db,target,hash);await read();
    const ticket=[...crypto.getRandomValues(new Uint8Array(32))].map(n=>n.toString(16).padStart(2,'0')).join('');
    await db.batch([
      db.prepare('DELETE FROM live_tickets WHERE expires_at<=?').bind(now),
      db.prepare('INSERT INTO live_tickets (ticket_hash,player_hash,target,expires_at) VALUES (?,?,?,?)').bind(await digest(ticket),hash,target,now+30000)
    ]);
    return response({ticket});
  }
  if(path==='/api/lobby'&&request.method==='GET')return response(await lobby(db,hash));
  if(path==='/api/rooms'&&request.method==='POST'){
    const data=await body(request),name=cleanName(data.name);
    if(!['public','private'].includes(data.visibility)||!['w','b'].includes(data.color))fail(400,'Choose room visibility and a side.');
    const count=await db.prepare("SELECT COUNT(*) AS n FROM rooms WHERE host_hash=? AND status='waiting' AND expires_at>?").bind(hash,now).first();
    if(count.n>=3)fail(429,'You already have three waiting rooms. Cancel one before creating another.');
    let config;try{config=settings(data.config);}catch(e){fail(400,e.message);}
    const code=roomCode(),w=data.color==='w';
    const created=await db.batch([db.prepare("INSERT INTO rooms (code,visibility,status,host_hash,white_hash,black_hash,white_name,black_name,white_seen,black_seen,game,created_at,updated_at,expires_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM rooms WHERE host_hash=? AND status='waiting' AND expires_at>?)<3").bind(code,data.visibility,'waiting',hash,w?hash:null,w?null:hash,w?name:null,w?null:name,w?now:0,w?0:now,JSON.stringify(initialState(config)),now,now,now+30*60000,hash,now)]);
    if(!created[0].meta.changes)fail(429,'You already have three waiting rooms. Cancel one before creating another.');
    return response({room:view(await getRoom(db,code),hash)},201);
  }
  const match=path.match(/^\/api\/rooms\/([^/]+)(?:\/(join|move|action))?$/);
  if(!match||!CODE.test(match[1]))fail(404,'That room address is not valid.');
  const code=match[1],operation=match[2];let r=await getRoom(db,code);const myColor=seat(r,hash);
  if(!operation&&request.method==='GET')return response(await roomSnapshot(db,code,hash));
  if(request.method!=='POST')fail(405,'That action is not available.');
  const data=await body(request);
  if(operation==='join'){
    if(myColor)return response({room:view(r,hash)});
    if(r.status!=='waiting'||r.white_hash&&r.black_hash)fail(409,'This room is full or has already finished.');
    const name=cleanName(data.name),color=r.white_hash?'black':'white';
    r=await updateRoom(db,r,{[color+'_hash']:hash,[color+'_name']:name,[color+'_seen']:now,game:JSON.stringify(startClock(JSON.parse(r.game),now)),status:'active',expires_at:now+7*DAY});
    return response({room:view(r,hash)});
  }
  if(!myColor)fail(403,'Only seated players can change this match.');
  r=await settleRoom(db,r);
  if(typeof data.actionId!=='string'||!/^[a-zA-Z0-9-]{16,64}$/.test(data.actionId))fail(400,'Missing action identifier.');
  const action=await digest(hash+':'+data.actionId);
  if(r.last_action===action)return response({room:view(r,hash)});
  if(!Number.isInteger(data.revision)||data.revision!==r.revision)fail(409,'Your board is out of date. Refreshing the match.');
  let game=JSON.parse(r.game);
  if(operation==='move'){
    if(r.status!=='active'||game.result)fail(409,r.status==='waiting'?'Wait for your opponent to join.':'This match has ended.');
    if(game.turn!==myColor)fail(403,'It is your opponent’s turn.');
    if(Object.hasOwn(data,'drop'))fail(400,'Drops are not part of Cubic Chess.');
    const result=playMove(game,{from:data.from,to:data.to},data.promotion??'q');
    if(result.error)fail(400,result.error);
    r=await updateRoom(db,r,{game:JSON.stringify(result.state),status:result.state.result?'finished':'active',draw_offer:null,last_action:action,expires_at:now+7*DAY});
    return response({room:view(r,hash)});
  }
  if(operation==='action'){
    if(data.type==='cancel'){
      if(r.host_hash!==hash||r.status!=='waiting')fail(409,'Only the host can cancel an empty waiting room.');
      await updateRoom(db,r,{status:'cancelled',last_action:action}).catch(e=>{if(e.status!==404)throw e;});
      return response({cancelled:true});
    }
    if(['offer-rematch','cancel-rematch','decline-rematch','accept-rematch'].includes(data.type)){
      if(r.status!=='finished'||!game.result)fail(409,'Finish this match before arranging a rematch.');
      if(game.rematch?.code)fail(409,'A rematch already exists. Open it from the result screen.');
      const offer=game.rematch?.offeredBy;
      if(data.type==='offer-rematch'){if(offer)fail(409,'A rematch offer is already pending.');game.rematch={offeredBy:myColor};}
      else if(data.type==='cancel-rematch'){if(offer!==myColor)fail(409,'Only the offering player can cancel.');game.rematch=null;}
      else if(data.type==='decline-rematch'){if(offer!==other(myColor))fail(409,'There is no opponent rematch offer.');game.rematch=null;}
      else {
        if(offer!==other(myColor))fail(409,'Only the opponent can accept a rematch.');
        const nextCode=roomCode(),next=startClock(initialState(game.config),now);next.previousRoom=r.code;
        game.rematch={code:nextCode};
        // PostgreSQL serializable transaction: reserve swapped seats and link the
        // completed match only if its revision still matches this acceptance.
        const results=await db.batch([
          db.prepare("INSERT INTO rooms (code,visibility,status,host_hash,white_hash,black_hash,white_name,black_name,white_seen,black_seen,game,created_at,updated_at,expires_at) SELECT ?,visibility,'active',host_hash,black_hash,white_hash,black_name,white_name,black_seen,white_seen,?,?,?,? FROM rooms WHERE code=? AND revision=?").bind(nextCode,JSON.stringify(next),now,now,now+7*DAY,r.code,r.revision),
          db.prepare('UPDATE rooms SET game=?,revision=revision+1,updated_at=?,last_action=?,expires_at=? WHERE code=? AND revision=?').bind(JSON.stringify(game),now,action,now+7*DAY,r.code,r.revision)
        ]);
        if(!results[0].meta.changes)fail(409,'The rematch changed. Refresh and try again.');
        return response({room:view(await getRoom(db,code),hash)});
      }
      r=await updateRoom(db,r,{game:JSON.stringify(game),last_action:action,expires_at:now+7*DAY});return response({room:view(r,hash)});
    }
    if(r.status!=='active'||game.result)fail(409,'This action needs an active match.');
    let patch={last_action:action};
    if(data.type==='resign'){game=stopClock(game);game.result={kind:'resignation',winner:other(myColor)};patch={...patch,game:JSON.stringify(game),status:'finished',draw_offer:null};}
    else if(data.type==='offer-draw'){if(r.draw_offer)fail(409,'A draw offer is already pending.');patch.draw_offer=myColor;}
    else if(data.type==='accept-draw'){if(r.draw_offer!==other(myColor))fail(409,'There is no draw offer from your opponent.');game=stopClock(game);game.result={kind:'agreement'};patch={...patch,game:JSON.stringify(game),status:'finished',draw_offer:null};}
    else if(data.type==='decline-draw'){if(r.draw_offer!==other(myColor))fail(409,'There is no draw offer from your opponent.');patch.draw_offer=null;}
    else fail(400,'Unknown match action.');
    r=await updateRoom(db,r,patch);return response({room:view(r,hash)});
  }
  fail(404,'Not found.');
}
export async function gameApi(request,db){
  try {return await api(request,{DB:db});}
  catch(e){
    if(e instanceof HttpError)return response({error:e.message},e.status);
    if(['40001','40P01','23505'].includes(e.code))return response({error:'The game changed while you were acting. Refresh and try again.'},409);
    console.error('Cubic Chess API request failed:',e.code||'internal');
    return response({error:'The server could not complete that action. Please retry.'},503);
  }
}
export async function socketGrant(request,db){
  await db.ready();
  const ticket=new URL(request.url).searchParams.get('ticket');
  if(!/^[a-f0-9]{64}$/.test(ticket||''))fail(401,'The live connection ticket is missing or expired.');
  const grant=await db.prepare('DELETE FROM live_tickets WHERE ticket_hash=? AND expires_at>? RETURNING player_hash,target').bind(await digest(ticket),Date.now()).first();
  if(!grant)fail(401,'The live connection ticket is missing or expired.');
  const read=readerFor(db,grant.target,grant.player_hash);
  return {initial:await read(),read,interval:grant.target==='lobby'?1000:500};
}
