import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { WebSocketServer } from 'ws';
import { database } from './database.js';
import { accessControl, loginPage } from './auth.js';
import { gameApi, socketGrant } from './game-api.js';
import { liveSocket } from './socket.js';

// All assets pass the same gate; no protected file is placed in public/.
const files=['index.html','style.css','app.js','engine.js','online.js','themes.js','pieces.js','setup.js','match-end.js','favicon.svg'];
const assets=new Map(files.map(name=>['/'+name,new URL('../src/'+name,import.meta.url)]));
const mime={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',svg:'image/svg+xml'};
const common={
  'Cache-Control':'private, no-store',
  'X-Content-Type-Options':'nosniff',
  'X-Frame-Options':'DENY',
  'Referrer-Policy':'no-referrer',
  'X-Robots-Tag':'noindex, nofollow, noarchive',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
};
function fail(status,message){const e=Error(message);e.status=status;throw e;}
async function readBody(req) {
  if(Number(req.headers['content-length'])>8192)fail(413,'Request is too large.');
  let size=0;const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>8192)fail(413,'Request is too large.');chunks.push(chunk);}
  return Buffer.concat(chunks);
}
export function createServer({env=process.env,db:providedDb,socketLifetime=45000}={}) {
  const auth=accessControl(env);
  let db=providedDb;
  const getDb=()=>db||(db=database(env.DATABASE_URL,{vercel:env.VERCEL==='1'}));
  const wss=new WebSocketServer({noServer:true,maxPayload:1024,perMessageDeflate:false});
  function requestUrl(req) {
    const host=req.headers.host;
    if(!host||!/^[a-zA-Z0-9.:[\]-]+$/.test(host))fail(400,'Invalid host.');
    // Only trust the platform proxy protocol on Vercel. Local startup is loopback HTTP.
    const protocol=env.VERCEL==='1'?'https':req.socket.encrypted?'https':'http';
    return new URL(req.url,protocol+'://'+host);
  }
  function checkOrigin(req,url){if(req.headers.origin&&req.headers.origin!==url.origin)fail(403,'Use the Cubic Chess page to connect.');}
  const server=http.createServer(async(req,res)=>{
    for(const [key,value]of Object.entries(common))res.setHeader(key,value);
    const send=(status,body,type='text/html; charset=utf-8',headers={})=>{res.writeHead(status,{'Content-Type':type,...headers});res.end(req.method==='HEAD'?undefined:body);};
    const json=(status,body)=>send(status,JSON.stringify({...body,serverTime:Date.now()}),'application/json; charset=utf-8');
    try {
      const url=requestUrl(req),path=url.pathname;
      if(!auth.configured)return send(503,'<!doctype html><title>Cubic Chess setup</title><h1>Private site setup required</h1><p>The owner must configure SITE_PASSWORD and SESSION_SECRET.</p>');
      if(req.method!=='GET'&&req.method!=='HEAD')checkOrigin(req,url);
      if(auth.public&&(path==='/auth/login'||path==='/auth/logout'))return send(303,'','text/html',{'Location':'/'});
      if(path==='/auth/login'){
        if(req.method==='GET')return send(200,loginPage());
        if(req.method!=='POST')return json(405,{error:'Use the sign-in form.'});
        if(!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded'))return json(415,{error:'Use the sign-in form.'});
        const data=new URLSearchParams((await readBody(req)).toString());
        const database=getDb();await database.ready();
        const ip=env.VERCEL==='1'?String(req.headers['x-vercel-forwarded-for']||'unknown').split(',')[0]:req.socket.remoteAddress;
        const key=auth.rateKey(ip),now=Date.now();
        const attempts=await database.prepare(`INSERT INTO login_attempts (key,attempts,resets_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN login_attempts.resets_at<=? THEN 1 ELSE login_attempts.attempts+1 END, resets_at=CASE WHEN login_attempts.resets_at<=? THEN EXCLUDED.resets_at ELSE login_attempts.resets_at END RETURNING attempts`).bind(key,now+15*60000,now,now).first();
        if(attempts.attempts>10)return send(429,loginPage('Too many attempts. Try again in 15 minutes.'),'text/html; charset=utf-8',{'Retry-After':'900'});
        if(!auth.verify(data.get('password')))return send(401,loginPage('That password was not accepted.'));
        await database.prepare('DELETE FROM login_attempts WHERE key=?').bind(key).run();
        return send(303,'','text/html',{'Location':'/','Set-Cookie':auth.cookie(url.protocol==='https:')});
      }
      if(!auth.authorized(req.headers.cookie)){
        if(path.startsWith('/api/'))return json(401,{error:'Site access expired. Sign in again.',loginRequired:true});
        return send(303,'','text/html',{'Location':'/auth/login'});
      }
      if(path==='/auth/logout'&&req.method==='POST')return send(303,'','text/html',{'Location':'/auth/login','Set-Cookie':auth.cookie(url.protocol==='https:',true)});
      if(path.startsWith('/api/')){
        const buffer=['GET','HEAD'].includes(req.method)?undefined:await readBody(req);
        const request=new Request(url,{method:req.method,headers:req.headers,...(buffer?{body:buffer}:{})});
        const response=await gameApi(request,getDb());
        return send(response.status,Buffer.from(await response.arrayBuffer()),response.headers.get('content-type')||'application/json');
      }
      if(!['GET','HEAD'].includes(req.method))return json(405,{error:'Method not allowed.'});
      const asset=assets.get(path==='/'?'/index.html':path);
      if(!asset)return json(404,{error:'Page not found.'});
      return send(200,await readFile(asset),mime[asset.pathname.split('.').pop()]);
    }catch(e){if(!e.status)console.error('Cubic Chess HTTP request failed:',e.code||'internal');return json(e.status||503,{error:e.status?e.message:'The service is temporarily unavailable. Please retry.'});}
  });
  server.on('upgrade',async(req,socket,head)=>{
    socket.on('error',()=>{});
    try {
      const url=requestUrl(req);
      if(!auth.configured)fail(503,'Site configuration required.');
      checkOrigin(req,url);
      if(!auth.authorized(req.headers.cookie))fail(401,'Sign in again.');
      if(url.pathname!=='/api/socket')fail(404,'Not found.');
      const grant=await socketGrant(new Request(url,{headers:req.headers}),getDb());
      if(socket.destroyed)return;
      wss.handleUpgrade(req,socket,head,ws=>liveSocket(ws,grant,{lifetime:socketLifetime}));
    }catch(e){const status=e.status||503;socket.end(`HTTP/1.1 ${status} ${http.STATUS_CODES[status]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);}
  });
  server.requestTimeout=15000;
  server.headersTimeout=10000;
  server.shutdown=async()=>{
    for(const client of wss.clients)client.terminate();
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
    if(db&&!providedDb)await db.close();
  };
  return server;
}
