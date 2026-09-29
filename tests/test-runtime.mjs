import { createServer } from '../server/http.js';
import { database, databaseFromPool } from '../server/database.js';
import { WebSocket } from 'ws';

export const testEnv={SITE_ACCESS:'private',SITE_PASSWORD:'test-only-password-123',SESSION_SECRET:'test-only-secret-'.repeat(4)};
export async function runtime(options={}) {
  const url=process.env.TEST_DATABASE_URL;
  const portable=process.env.CUBIC_CHESS_PORTABLE_TEST==='1';
  if(!portable&&(!url||!new URL(url).pathname.endsWith('_test')))throw Error('Set TEST_DATABASE_URL to a disposable PostgreSQL database with a name ending in _test. Tests delete its game data.');
  const pool=portable?await (await import('./portable-pg.mjs')).portablePool():null;
  const a=portable?databaseFromPool(pool):database(url),b=portable?databaseFromPool(pool):database(url);
  await Promise.all([a.ready(),b.ready()]);
  await a.pool.query('TRUNCATE rooms, live_tickets, login_attempts');
  const servers=[a,b].map(db=>createServer({env:testEnv,db,socketLifetime:options.socketLifetime??15000}));
  await Promise.all(servers.map(server=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))));
  const origins=servers.map(s=>'http://127.0.0.1:'+s.address().port);
  const logged=await fetch(origins[0]+'/auth/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password:testEnv.SITE_PASSWORD}),redirect:'manual'});
  if(logged.status!==303)throw Error('Test sign-in failed: '+await logged.text());
  const cookie=logged.headers.get('set-cookie').split(';')[0];let turn=0;
  return {
    db:a,origins,cookie,ready:origins[0],
    async dispatchFetch(url,init={}){
      const origin=origins[turn++%2],address=new URL(url);const headers=new Headers(init.headers);headers.set('cookie',cookie);
      if(headers.get('origin')==='https://cubic-chess.test')headers.set('origin',origin);
      const actual=origin+address.pathname+address.search;
      if(headers.get('upgrade')==='websocket'){
        // Capture frames immediately, before the test attaches its listeners.
        const socket=new WebSocket(actual.replace('http:','ws:'),{headers:Object.fromEntries(headers)});
        const target=new EventTarget(),queued=[];let accepted=false;
        socket.on('message',data=>{const event=new MessageEvent('message',{data:data.toString()});if(accepted)target.dispatchEvent(event);else queued.push(event);});
        const status=await new Promise(resolve=>{
          socket.once('open',()=>resolve(101));socket.once('unexpected-response',(_,res)=>{res.resume();resolve(res.statusCode);});socket.on('error',()=>resolve(503));
        });
        return {status,webSocket:{accept(){queueMicrotask(()=>{accepted=true;for(const e of queued)target.dispatchEvent(e);});},addEventListener:(...args)=>target.addEventListener(...args),close:(...args)=>socket.close(...args)}};
      }
      return fetch(actual,{...init,headers});
    },
    async dispose(){await Promise.all(servers.map(s=>s.shutdown()));await a.close();if(!portable)await b.close();}
  };
}
