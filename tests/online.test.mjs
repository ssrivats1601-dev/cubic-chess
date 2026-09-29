import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { OnlineClient } from '../src/online.js';

test('browser client keeps newer revisions, stores seat identity and releases failed actions',async()=>{
  const w=new Window({url:'http://localhost'});
  for(const k of ['window','document','localStorage','location','navigator'])Object.defineProperty(globalThis,k,{value:w[k],configurable:true});
  const client=new OnlineClient(),again=new OnlineClient();assert.equal(client.token,again.token);assert.match(client.token,/^[a-f0-9]{64}$/);
  const room={code:'ABCDEFGHIJ',revision:4,players:{w:{lastSeen:100},b:null}};client.remember(room);
  assert.equal(client.remember({...room,revision:3}),room);
  assert.equal(client.remember({...room,players:{w:{lastSeen:80},b:null}}).players.w.lastSeen,100);
  client.request=async()=>{throw Error('network down');};
  await assert.rejects(client.action('resign'),/network down/);assert.equal(client.busy,false);
  client.stop();again.stop();await w.happyDOM.close();
});

test('browser socket reconnect reloads current state and fallback keeps updating',async()=>{
  const w=new Window({url:'http://localhost'});
  for(const k of ['window','document','localStorage','location','navigator'])Object.defineProperty(globalThis,k,{value:w[k],configurable:true});
  const originalSocket=globalThis.WebSocket,sockets=[];
  globalThis.WebSocket=class {constructor(){sockets.push(this);}close(){this.onclose?.();}};
  const client=new OnlineClient(),seen=[],connections=[];
  client.request=async()=>({ticket:'a'.repeat(64)});
  const tick=()=>new Promise(r=>setTimeout(r,0));
  try{
    client.watchLobby(data=>seen.push(data),connected=>connections.push(connected));await tick();
    const first=sockets[0];first.onopen();first.onmessage({data:JSON.stringify({event:'snapshot',data:{rooms:[],mine:[]},serverTime:Date.now()})});
    assert.equal(client.connected,true);assert.equal(client.transport,'socket');first.close();
    await new Promise(r=>setTimeout(r,650));assert.equal(sockets.length,2);
    sockets[1].onopen();sockets[1].onmessage({data:JSON.stringify({event:'snapshot',data:{rooms:[{code:'updated'}],mine:[]}})});
    assert.equal(seen.at(-1).rooms[0].code,'updated');client.stop();
    let polls=0;
    client.request=async(path,data,signal)=>{
      if(path==='/socket-ticket')throw Error('Socket service unavailable');
      if(polls++===0)return {rooms:[{code:'fallback'}],mine:[],cursor:'b'.repeat(64)};
      return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('stopped')),{once:true}));
    };
    client.watchLobby(data=>seen.push(data),()=>{});await tick();await tick();
    assert.equal(client.transport,'refresh');assert.equal(client.connected,true);assert.equal(seen.at(-1).rooms[0].code,'fallback');
    assert.ok(connections.includes(false));
  }finally{client.stop();globalThis.WebSocket=originalSocket;await w.happyDOM.close();}
});
