import { createHmac, timingSafeEqual, randomBytes, createHash } from 'node:crypto';

const COOKIE='cubehouse_access', TTL=12*60*60;
const hash=v=>createHash('sha256').update(v).digest();
const same=(a,b)=>timingSafeEqual(hash(a),hash(b));
const sign=(data,key)=>createHmac('sha256',key).update(data).digest('base64url');
export function accessControl(env={}) {
  const password=env.SITE_PASSWORD||'',secret=env.SESSION_SECRET||'';
  const configured=password.length>=12&&secret.length>=32;
  // Rotating either secret or password invalidates previously issued cookies.
  const key=configured?sign(password,secret):'';
  return {
    configured,
    authorized(cookie='') {
      if(!configured)return false;
      const value=cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
      if(!value||value.length>256)return false;
      const [expires,nonce,signature,...rest]=value.split('.');
      if(rest.length||!/^\d{10,13}$/.test(expires||'')||!nonce||!signature)return false;
      return Number(expires)>Date.now()&&Number(expires)<=Date.now()+TTL*1000+1000&&same(signature,sign(expires+'.'+nonce,key));
    },
    verify(value){return configured&&typeof value==='string'&&same(value,password);},
    cookie(secure,clear=false){
      const data=(Date.now()+TTL*1000)+'.'+randomBytes(16).toString('base64url');
      const value=clear?'':data+'.'+sign(data,key);
      return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear?0:TTL}${secure?'; Secure':''}`;
    },
    rateKey(ip){return sign('login:'+ip,key);}
  };
}

export function loginPage(message='') {
  // No user-provided text is interpolated into this document.
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Private Cubic Chess</title><style>
  :root{color-scheme:dark;font-family:system-ui,sans-serif;background:#102d25;color:#f5f1e7}*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px}main{width:min(100%,420px);padding:32px;border:1px solid #537669;border-radius:18px;background:#193c31}h1{font-size:2.5rem;margin:0 0 12px}p{line-height:1.6}label{display:block;margin-top:26px}input,button{font:inherit;width:100%;padding:14px;border:1px solid #85a391;border-radius:8px;margin:10px 0;background:#102d25;color:inherit}button{background:#e4edc2;color:#132b22;font-weight:700;cursor:pointer}:focus-visible{outline:3px solid #f2c465;outline-offset:3px}.note{font-size:.85rem;color:#c4d8cb}.error{color:#ffd3c7}
  </style></head><body><main><h1>Cubic Chess.</h1><p>A private place to play chess in another dimension.</p>${message?`<p class="error" role="alert">${message}</p>`:''}<form method="post" action="/auth/login"><label for="password">Site password</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="512" autofocus><button type="submit">Enter Cubic Chess →</button></form><p class="note">Access lasts 12 hours. Ask the site owner for the password.</p></main></body></html>`;
}
