import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {runtime,testEnv} from './test-runtime.mjs';
import {parse} from '../src/engine.js';
import {createServer} from '../server/http.js';
import {accessControl} from '../server/auth.js';
import {WebSocket} from 'ws';
let mf;
before(async()=>{mf=await runtime();});after(async()=>{await mf.dispose();});
const token=()=>crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
async function call(path,who,data,headers={}){
  const r=await mf.dispatchFetch('https://cubic-chess.test/api'+path,{method:data?'POST':'GET',headers:{...(who?{'X-Player-Token':who}:{}),...(data?{'Content-Type':'application/json'}:{}),...headers},...(data?{body:JSON.stringify(data)}:{})});return {status:r.status,body:await r.json()};
}
async function create(who,visibility='private',color='w',name='Test host'){
  const r=await call('/rooms',who,{name,visibility,color});assert.equal(r.status,201,JSON.stringify(r));return r.body.room;
}
async function join(code,who,name='Test guest'){const r=await call('/rooms/'+code+'/join',who,{name});assert.equal(r.status,200,JSON.stringify(r));return r.body.room;}
const command=(revision,more)=>({revision,actionId:crypto.randomUUID(),...more});
test('private gate protects every asset and API; login, logout, rotation and CSRF are enforced',async()=>{
  const origin=mf.origins[0];
  for(const path of ['/','/index.html','/app.js','/style.css','/engine.js','/favicon.svg','/server/http.js','/.env']){
    const r=await fetch(origin+path,{redirect:'manual'});assert.equal(r.status,303,path);assert.equal(r.headers.get('location'),'/auth/login');
  }
  const unauthorized=await fetch(origin+'/api/health');assert.equal(unauthorized.status,401);assert.equal((await unauthorized.json()).loginRequired,true);
  const signin=await fetch(origin+'/auth/login');assert.equal(signin.status,200);assert.match(await signin.text(),/Site password/);
  const login=async(password,headers={})=>fetch(origin+'/auth/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',...headers},body:new URLSearchParams({password}),redirect:'manual'});
  assert.equal((await login('incorrect')).status,401);
  assert.equal((await login(testEnv.SITE_PASSWORD,{Origin:'https://evil.test'})).status,403);
  const signed=await login(testEnv.SITE_PASSWORD);assert.equal(signed.status,303);assert.match(signed.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
  const gate=accessControl(testEnv);assert.equal(gate.authorized(mf.cookie),true);assert.equal(gate.authorized(mf.cookie+'tampered'),false);
  assert.equal(accessControl({...testEnv,SITE_PASSWORD:'rotated-password-123'}).authorized(mf.cookie),false);
  const logout=await fetch(origin+'/auth/logout',{method:'POST',headers:{Cookie:mf.cookie,Origin:origin},redirect:'manual'});assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
  const protectedAsset=await fetch(origin+'/app.js',{headers:{Cookie:mf.cookie}});assert.equal(protectedAsset.status,200);assert.match(protectedAsset.headers.get('cache-control'),/no-store/);
  assert.equal((await fetch(origin+'/server/http.js',{headers:{Cookie:mf.cookie}})).status,404);
});
test('missing secrets fail closed instead of exposing the website',async()=>{
  const server=createServer({env:{}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{assert.equal((await fetch('http://127.0.0.1:'+server.address().port+'/')).status,503);}finally{await server.shutdown();}
});
test('password throttling persists across separate instances',async()=>{
  await mf.db.pool.query('TRUNCATE login_attempts');
  for(let i=0;i<11;i++){
    const r=await fetch(mf.origins[i%2]+'/auth/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'password=incorrect',redirect:'manual'});
    assert.equal(r.status,i===10?429:401);
  }
  await mf.db.pool.query('TRUNCATE login_attempts');
});
test('health, session validation and origin checks',async()=>{
  assert.equal((await call('/health')).status,200);assert.equal((await call('/lobby')).status,401);
  assert.equal((await call('/rooms',token(),{name:'Test',visibility:'public',color:'w'},{Origin:'https://evil.test'})).status,403);
});
test('public rooms are listed; private rooms and seat credentials stay hidden',async()=>{
  const a=token(),b=token(),c=token();const pub=await create(a,'public'),priv=await create(b);
  const listing=await call('/lobby',c);assert.ok(listing.body.rooms.some(r=>r.code===pub.code));assert.ok(!listing.body.rooms.some(r=>r.code===priv.code));
  assert.equal((await call('/rooms/'+priv.code,c)).status,403);
  const serialized=JSON.stringify(listing.body);for(const secret of [a,b,'white_hash','black_hash','host_hash'])assert.ok(!serialized.includes(secret));
  assert.equal(pub.myColor,'w');assert.equal(pub.state.board.filter(Boolean).length,32);assert.ok(!Object.hasOwn(pub.state,'pockets'));
});
test('join is exclusive, idempotent for a returning player and rejects a third seat',async()=>{
  const a=token(),b=token(),c=token(),r=await create(a);
  const results=await Promise.all([call('/rooms/'+r.code+'/join',b,{name:'Guest B'}),call('/rooms/'+r.code+'/join',c,{name:'Guest C'})]);
  assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);const winner=results[0].status===200?b:c,loser=winner===b?c:b;
  const returned=await join(r.code,winner);assert.equal(returned.myColor,'b');assert.equal(returned.status,'active');
  assert.equal((await call('/rooms/'+r.code+'/join',loser,{name:'Third'})).status,409);
  assert.equal((await call('/rooms/'+r.code,a)).body.room.players.b.name,returned.players.b.name);
});
test('server enforces turns, legal moves and revisions; retrying a move does not duplicate it',async()=>{
  const a=token(),b=token(),r=await create(a);let room=await join(r.code,b),rev=room.revision;
  assert.equal((await call('/rooms/'+r.code+'/move',b,command(rev,{from:parse('1e7'),to:parse('1e5')}))).status,403);
  assert.equal((await call('/rooms/'+r.code+'/move',a,command(rev,{from:parse('1b1'),to:parse('8h8')}))).status,400);
  assert.equal((await call('/rooms/'+r.code+'/move',a,command(rev,{drop:'q',to:parse('2e4')}))).status,400);
  const payload=command(rev,{from:parse('1b1'),to:parse('3b2')});
  const moved=await call('/rooms/'+r.code+'/move',a,payload);assert.equal(moved.status,200);room=moved.body.room;assert.equal(room.state.ply,1);assert.equal(room.state.turn,'b');
  const retry=await call('/rooms/'+r.code+'/move',a,payload);assert.equal(retry.status,200);assert.equal(retry.body.room.state.ply,1);
  assert.equal((await call('/rooms/'+r.code+'/move',b,command(rev,{from:parse('1b8'),to:parse('3b7')}))).status,409);
  const black=await call('/rooms/'+r.code+'/move',b,command(room.revision,{from:parse('1b8'),to:parse('3b7')}));assert.equal(black.status,200);assert.equal(black.body.room.state.ply,2);
  const reload=await call('/rooms/'+r.code,a);assert.equal(reload.body.room.state.log.at(-1).notation,'1b8 → 3b7');
});
test('simultaneous moves apply exactly once',async()=>{
  const a=token(),b=token(),r=await create(a),joined=await join(r.code,b);
  const results=await Promise.all(['1e4','1e3'].map(to=>call('/rooms/'+r.code+'/move',a,command(joined.revision,{from:parse('1e2'),to:parse(to)}))));
  assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);assert.equal((await call('/rooms/'+r.code,a)).body.room.state.ply,1);
});
test('draw requires the other player; resignation records the correct winner',async()=>{
  const a=token(),b=token(),r=await create(a,'private','b');let room=await join(r.code,b);
  const offer=await call('/rooms/'+r.code+'/action',a,command(room.revision,{type:'offer-draw'}));room=offer.body.room;assert.equal(room.drawOffer,'b');
  assert.equal((await call('/rooms/'+r.code+'/action',a,command(room.revision,{type:'accept-draw'}))).status,409);
  const draw=await call('/rooms/'+r.code+'/action',b,command(room.revision,{type:'accept-draw'}));assert.equal(draw.body.room.state.result.kind,'agreement');assert.equal(draw.body.room.status,'finished');
  const next=await create(a);room=await join(next.code,b);const resign=await call('/rooms/'+next.code+'/action',b,command(room.revision,{type:'resign'}));assert.equal(resign.body.room.state.result.winner,'w');assert.equal(resign.body.room.status,'finished');
});
test('cancel waiting room, reject invalid input, and enforce expiry',async()=>{
  const a=token(),r=await create(a);const cancelled=await call('/rooms/'+r.code+'/action',a,command(r.revision,{type:'cancel'}));assert.equal(cancelled.status,200);assert.equal((await call('/rooms/'+r.code,a)).status,404);
  assert.equal((await call('/rooms',a,{name:'x'.repeat(25),color:'w',visibility:'public'})).status,400);
  assert.equal((await call('/rooms',a,{name:'Test',color:'k',visibility:'hidden'})).status,400);
  const expired=await create(a);const db=mf.db;await db.prepare('UPDATE rooms SET expires_at=0 WHERE code=?').bind(expired.code).run();assert.equal((await call('/rooms/'+expired.code,a)).status,404);
});

async function ticket(target,who,headers={}){
  const result=await call('/socket-ticket',who,{target},headers);return result;
}
async function openSocket(target,who){
  const issued=await ticket(target,who);assert.equal(issued.status,200,JSON.stringify(issued));
  const res=await mf.dispatchFetch('https://cubic-chess.test/api/socket?ticket='+issued.body.ticket,{headers:{Upgrade:'websocket',Origin:'https://cubic-chess.test'}});
  assert.equal(res.status,101);const socket=res.webSocket;socket.accept();const queue=[],waiters=[];
  socket.addEventListener('message',event=>{const message=JSON.parse(event.data);const waiter=waiters.shift();if(waiter)waiter(message);else queue.push(message);});
  return {
    async next(predicate=()=>true){
      const deadline=Date.now()+5000;
      while(Date.now()<deadline){
        const message=queue.length?queue.shift():await Promise.race([new Promise(resolve=>waiters.push(resolve)),new Promise((_,reject)=>setTimeout(()=>reject(Error('socket event timeout')),deadline-Date.now()))]);
        if(predicate(message))return message;
      }
      throw Error('socket event timeout');
    },close:()=>socket.close(1000,'test complete'),ticket:issued.body.ticket
  };
}
test('socket tickets enforce sessions, origins, target access, expiry, and one-time use',async()=>{
  assert.equal((await ticket('lobby',null)).status,401);
  const a=token(),r=await create(a);
  assert.equal((await ticket('room:'+r.code,token())).status,403);
  assert.equal((await ticket('lobby',a,{Origin:'https://evil.test'})).status,403);
  assert.equal((await ticket('hidden',a)).status,400);
  const issued=await ticket('lobby',a);assert.equal(issued.status,200);assert.match(issued.body.ticket,/^[a-f0-9]{64}$/);
  const first=await mf.dispatchFetch('https://cubic-chess.test/api/socket?ticket='+issued.body.ticket,{headers:{Upgrade:'websocket',Origin:'https://cubic-chess.test'}});assert.equal(first.status,101);first.webSocket.accept();
  const reused=await mf.dispatchFetch('https://cubic-chess.test/api/socket?ticket='+issued.body.ticket,{headers:{Upgrade:'websocket',Origin:'https://cubic-chess.test'}});assert.equal(reused.status,401);
  first.webSocket.close();
  const expired=await ticket('lobby',a),db=mf.db;await db.prepare('UPDATE live_tickets SET expires_at=0').run();
  assert.equal((await mf.dispatchFetch('https://cubic-chess.test/api/socket?ticket='+expired.body.ticket,{headers:{Upgrade:'websocket'}})).status,401);
});
test('one lobby socket receives creation and cancellation; private rooms stay hidden',async()=>{
  const a=token(),observer=token(),socket=await openSocket('lobby',observer);
  try{
    await socket.next();const hidden=await create(a),start=performance.now(),pub=await create(a,'public');
    const listed=await socket.next(m=>m.event==='snapshot'&&m.data.rooms.some(r=>r.code===pub.code));
    assert.ok(performance.now()-start<2000,'lobby update arrives within two seconds');
    assert.ok(!listed.data.rooms.some(r=>r.code===hidden.code));
    await call('/rooms/'+pub.code+'/action',a,command(pub.revision,{type:'cancel'}));
    await socket.next(m=>m.event==='snapshot'&&!m.data.rooms.some(r=>r.code===pub.code));
  }finally{socket.close();}
});
test('one match socket receives joins, moves, draw actions and resignation; reconnect gets latest state',async()=>{
  const a=token(),b=token(),r=await create(a),socket=await openSocket('room:'+r.code,a);
  try{
    assert.equal((await socket.next()).data.room.status,'waiting');
    let room=await join(r.code,b);await socket.next(m=>m.event==='snapshot'&&m.data.room.status==='active');
    const start=performance.now();await call('/rooms/'+r.code+'/move',a,command(room.revision,{from:parse('1b1'),to:parse('3b2')}));
    room=(await socket.next(m=>m.event==='snapshot'&&m.data.room.state.ply===1)).data.room;
    assert.ok(performance.now()-start<1500,'move arrives within 1.5 seconds');
    await call('/rooms/'+r.code+'/action',b,command(room.revision,{type:'offer-draw'}));
    room=(await socket.next(m=>m.event==='snapshot'&&m.data.room.drawOffer==='b')).data.room;
    await call('/rooms/'+r.code+'/action',a,command(room.revision,{type:'decline-draw'}));
    room=(await socket.next(m=>m.event==='snapshot'&&m.data.room.drawOffer===null)).data.room;
    await call('/rooms/'+r.code+'/action',b,command(room.revision,{type:'resign'}));
    room=(await socket.next(m=>m.event==='snapshot'&&m.data.room.status==='finished')).data.room;assert.equal(room.state.result.winner,'w');
    const resumed=await openSocket('room:'+r.code,b);try{assert.deepEqual((await resumed.next()).data.room.state,room.state);}finally{resumed.close();}
  }finally{socket.close();}
});
test('match socket notices authoritative DB changes and reports expiry',async()=>{
  const a=token(),r=await create(a),socket=await openSocket('room:'+r.code,a);
  try{
    await socket.next();const db=mf.db;
    await db.prepare('UPDATE rooms SET revision=revision+1 WHERE code=?').bind(r.code).run();
    await socket.next(m=>m.event==='snapshot'&&m.data.room.revision===r.revision+1);
    await db.prepare('UPDATE rooms SET expires_at=0 WHERE code=?').bind(r.code).run();
    assert.equal((await socket.next(m=>m.event==='problem')).data.status,404);
  }finally{socket.close();}
});
test('long-poll fallback returns immediately when shared room state changes',async()=>{
  const a=token(),b=token(),outsider=token(),r=await create(a),room=await join(r.code,b);
  assert.equal((await call('/live?target=room:'+r.code,outsider)).status,403);
  const first=await call('/live?target=room:'+r.code,b);assert.match(first.body.cursor,/^[a-f0-9]{64}$/);
  const started=performance.now(),waiting=call('/live?target=room:'+r.code+'&cursor='+first.body.cursor,b);
  await new Promise(resolve=>setTimeout(resolve,80));
  await call('/rooms/'+r.code+'/move',a,command(room.revision,{from:parse('1b1'),to:parse('3b2')}));
  const changed=await waiting;assert.equal(changed.status,200);assert.equal(changed.body.room.state.ply,1);
  assert.ok(performance.now()-started<1500,'long poll releases within 1.5 seconds of a move');
});

test('online variants, validated clocks, increment and shared timeout adjudication',async()=>{
  const a=token(),b=token();
  assert.equal((await call('/rooms',a,{name:'Host',visibility:'private',color:'w',config:{files:99}})).status,400);
  let r=(await call('/rooms',a,{name:'Host',visibility:'private',color:'w',config:{files:4,ranks:4,layers:4,minutes:1,increment:3}})).body.room;
  assert.equal(r.state.board.filter(Boolean).length,16);assert.equal(r.state.clock.startedAt,null);
  r=await join(r.code,b);assert.ok(r.state.clock.startedAt>0);
  const moved=await call('/rooms/'+r.code+'/move',a,command(r.revision,{from:parse('1c1'),to:parse('3c2')}));assert.equal(moved.status,200,JSON.stringify(moved));r=moved.body.room;
  assert.ok(r.state.clock.w>61000);assert.equal(r.state.turn,'b');
  const db=mf.db;r.state.clock.startedAt=Date.now()-61000;
  await db.prepare('UPDATE rooms SET game=? WHERE code=?').bind(JSON.stringify(r.state),r.code).run();
  const reads=await Promise.all([call('/rooms/'+r.code,a),call('/rooms/'+r.code,b)]);
  for(const read of reads){assert.equal(read.body.room.status,'finished');assert.equal(read.body.room.state.result.kind,'timeout');assert.equal(read.body.room.state.result.winner,'w');assert.equal(read.body.room.revision,r.revision+1);}
  assert.equal((await call('/rooms/'+r.code+'/move',b,command(r.revision+1,{from:parse('1c4'),to:parse('3c3')}))).status,409);
});

test('rematches require opponent consent, swap seats, preserve results and resist duplicate accepts',async()=>{
 const a=token(),b=token(),outsider=token();let old=(await call('/rooms',a,{name:'Test host',visibility:'private',color:'w',config:{files:8,ranks:8,layers:4,minutes:1,increment:2}})).body.room;let r=await join(old.code,b);
 assert.equal((await call('/rooms/'+r.code+'/action',a,command(r.revision,{type:'offer-rematch'}))).status,409);
 r=(await call('/rooms/'+r.code+'/action',a,command(r.revision,{type:'resign'}))).body.room;
 r=(await call('/rooms/'+r.code+'/action',a,command(r.revision,{type:'offer-rematch'}))).body.room;
 assert.equal((await call('/rooms/'+r.code+'/action',outsider,command(r.revision,{type:'accept-rematch'}))).status,403);
 assert.equal((await call('/rooms/'+r.code+'/action',a,command(r.revision,{type:'accept-rematch'}))).status,409);
 const payload=command(r.revision,{type:'accept-rematch'});
 const accepts=await Promise.all([call('/rooms/'+r.code+'/action',b,payload),call('/rooms/'+r.code+'/action',b,command(r.revision,{type:'accept-rematch'}))]);
 assert.equal(accepts.filter(x=>x.status===200).length,1);
 const finished=accepts.find(x=>x.status===200).body.room;assert.equal(finished.state.result.kind,'resignation');assert.equal(finished.status,'finished');
 const child=(await call('/rooms/'+finished.state.rematch.code,a)).body.room;assert.ok(child.state.clock.startedAt>0);assert.equal(child.state.clock.w,60000);assert.equal(child.state.clock.increment,2000);
 assert.equal(child.myColor,'b');assert.equal(child.players.b.name,'Test host');assert.equal(child.status,'active');assert.equal(child.state.ply,0);assert.equal(child.state.previousRoom,old.code);assert.deepEqual(child.state.config,finished.state.config);
 const db=mf.db;const count=await db.prepare("SELECT COUNT(*) AS n FROM rooms WHERE (game::jsonb ->> 'previousRoom')=?").bind(old.code).first();assert.equal(count.n,1);
 const retry=await call('/rooms/'+r.code+'/action',b,accepts[0].status===200?payload:command(finished.revision,{type:'accept-rematch'}));assert.ok([200,409].includes(retry.status));
});
test('a declined or cancelled rematch does not reset the finished game',async()=>{
 const a=token(),b=token();let r=await create(a);r=await join(r.code,b);r=(await call('/rooms/'+r.code+'/action',b,command(r.revision,{type:'resign'}))).body.room;
 for(const [type,who] of [['offer-rematch',a],['decline-rematch',b],['offer-rematch',b],['cancel-rematch',b]]){const response=await call('/rooms/'+r.code+'/action',who,command(r.revision,{type}));assert.equal(response.status,200);r=response.body.room;assert.equal(r.state.result.winner,'w');}
 assert.equal(r.state.rematch,null);
});

test('waiting-room quota survives concurrent creation',async()=>{
  const who=token();
  const results=await Promise.all(Array.from({length:8},()=>call('/rooms',who,{name:'Quota host',visibility:'private',color:'w'})));
  assert.ok(results.filter(r=>r.status===201).length<=3);
  assert.ok(results.every(r=>[201,409,429].includes(r.status)),JSON.stringify(results));
  const lobby=await call('/lobby',who);assert.ok(lobby.body.mine.length<=3);
});

test('socket renewal can reconnect to a fresh server without losing a match',async()=>{
  const a=token(),b=token(),waiting=await create(a),room=await join(waiting.code,b);
  const server=createServer({env:testEnv,db:mf.db,socketLifetime:200});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const issued=await ticket('room:'+room.code,a);
    const url='ws://127.0.0.1:'+server.address().port+'/api/socket?ticket='+issued.body.ticket;
    const ws=new WebSocket(url,{headers:{Cookie:mf.cookie}});
    const initial=new Promise(resolve=>ws.once('message',data=>resolve(JSON.parse(data))));
    const closed=new Promise(resolve=>ws.once('close',code=>resolve(code)));
    assert.equal((await initial).data.room.code,room.code);assert.equal(await closed,1000);
  }finally{await server.shutdown();}
  await call('/rooms/'+room.code+'/move',a,command(room.revision,{from:parse('1b1'),to:parse('3b2')}));
  const resumed=await openSocket('room:'+room.code,b);
  try{assert.equal((await resumed.next()).data.room.state.ply,1);}finally{resumed.close();}
});

test('WebSocket upgrade cannot bypass the private cookie or same-origin check',async()=>{
  const who=token(),issued=await ticket('lobby',who),url=mf.origins[0].replace('http:','ws:')+'/api/socket?ticket='+issued.body.ticket;
  for(const [headers,expected]of [[{},401],[{Cookie:mf.cookie,Origin:'https://evil.test'},403]]){
    const status=await new Promise(resolve=>{const ws=new WebSocket(url,{headers});ws.on('unexpected-response',(_,r)=>{r.resume();resolve(r.statusCode);});ws.on('error',()=>resolve(503));});
    assert.equal(status,expected);
  }
});
