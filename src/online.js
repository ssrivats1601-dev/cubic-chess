// A browser owns its seat through a random secret. The server stores only its hash.
export class OnlineClient {
  constructor(){
    this.storageAvailable=true;
    try {this.token=localStorage.getItem('cubehouse.player.v2');}catch{this.storageAvailable=false;}
    if(!/^[a-f0-9]{64}$/.test(this.token||'')){
      this.token=[...crypto.getRandomValues(new Uint8Array(32))].map(n=>n.toString(16).padStart(2,'0')).join('');
      try{localStorage.setItem('cubehouse.player.v2',this.token);}catch{this.storageAvailable=false;}
    }
    this.room=null;this.busy=false;this.timer=null;this.generation=0;this.connected=false;
    this.subscription=null;this.controller=null;this.socket=null;this.transport='socket';this.fallbackUntil=0;
    window.addEventListener('online',()=>{this.fallbackUntil=0;this.reconnect();});
    window.addEventListener('offline',()=>{
      this.controller?.abort();this.socket?.close();this.connected=false;
      this.subscription?.onConnection(false,Error('You are offline. Your last saved position is safe.'));
    });
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)this.reconnect();});
  }
  async request(path,data,signal){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
    const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    try{
      const r=await fetch('/api'+path,{method:data?'POST':'GET',cache:'no-store',credentials:'same-origin',headers:{'X-Player-Token':this.token,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{}),signal:controller.signal});
      let body;try{body=await r.json();if(Number.isFinite(body.serverTime))this.clockOffset=body.serverTime-Date.now();}catch{throw Error(r.status===401?'Sign in again to reconnect to Cubic Chess.':'The lobby is unavailable. Please retry.');}
      if(body.loginRequired){location.assign('/auth/login');}
      if(!r.ok){const error=Error(body.error||'That action could not be completed.');error.status=r.status;throw error;}
      return body;
    }catch(e){if(e.name==='AbortError')throw Error('Connection timed out. Your last saved position is safe.');throw e;}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  remember(room){
    if(this.room?.code===room.code){
      if(room.revision<this.room.revision)return this.room;
      for(const color of ['w','b'])if(room.players[color]&&this.room.players[color])room.players[color].lastSeen=Math.max(room.players[color].lastSeen,this.room.players[color].lastSeen);
    }
    this.room=room;try{localStorage.setItem('cubehouse.room.v2',room.code);}catch{}return room;
  }
  async create(data){return this.remember((await this.request('/rooms',data)).room);}
  async join(code,name){return this.remember((await this.request('/rooms/'+this.normalize(code)+'/join',{name})).room);}
  normalize(code){return String(code).toUpperCase().replace(/[\s-]/g,'');}
  async get(code){return (await this.request('/rooms/'+code)).room;}
  async action(type,data={}){
    if(this.busy||!this.room)throw Error('Wait for the current action to finish.');
    this.busy=true;
    const room=this.room,payload={...data,revision:room.revision,actionId:crypto.randomUUID()};
    try{
      const result=await this.request('/rooms/'+room.code+'/'+(type==='move'?'move':'action'),type==='move'?payload:{...payload,type});
      if(result.room)result.room=this.remember(result.room);return result;
    }finally{this.busy=false;}
  }
  stop(){
    this.generation++;clearTimeout(this.timer);this.controller?.abort();this.socket?.close();this.controller=null;this.socket=null;this.subscription=null;this.connected=false;
  }
  reconnect(){
    const target=this.subscription;
    if(target)this.subscribe(target.path,target.onSnapshot,target.onConnection);
  }
  watch(code,onRoom,onConnection){
    this.subscribe('room:'+code,data=>onRoom(this.remember(data.room)),onConnection);
  }
  watchLobby(onLobby,onConnection){this.subscribe('lobby',onLobby,onConnection);}
  subscribe(target,onSnapshot,onConnection){
    this.stop();const generation=this.generation;
    this.subscription={path:target,onSnapshot,onConnection};
    let failures=0;
    let cursor='';
    const fallback=async()=>{
      if(generation!==this.generation)return;
      this.transport='refresh';const controller=new AbortController();this.controller=controller;
      let terminal=false;
      try{
        const data=await this.request('/live?target='+encodeURIComponent(target)+'&cursor='+cursor,undefined,controller.signal);
        if(generation!==this.generation)return;
        cursor=data.cursor;this.connected=true;failures=0;onSnapshot(data);onConnection(true);
      }catch(error){
        if(generation!==this.generation)return;
        this.connected=false;failures++;terminal=[401,403,404].includes(error.status);onConnection(false,error);
      }
      if(generation===this.generation&&!terminal)this.timer=setTimeout(fallback,failures?Math.min(5000,300*2**Math.min(failures,4)):0);
    };
    const connect=async()=>{
      if(generation!==this.generation)return;
      if(Date.now()<this.fallbackUntil){fallback();return;}
      if(!navigator.onLine){
        this.connected=false;onConnection(false,Error('You are offline. Reconnecting when your connection returns.'));
        this.timer=setTimeout(connect,2000);return;
      }
      this.transport='socket';let socket,opened=false,received=false,watchdog;
      const failToRefresh=error=>{
        if(generation!==this.generation)return;
        clearTimeout(watchdog);this.connected=false;failures++;
        this.fallbackUntil=Infinity;onConnection(false,error);fallback();
      };
      try{
        const {ticket}=await this.request('/socket-ticket',{target});
        if(generation!==this.generation)return;
        const protocol=location.protocol==='https:'?'wss:':'ws:';
        socket=new WebSocket(`${protocol}//${location.host}/api/socket?ticket=${encodeURIComponent(ticket)}`);this.socket=socket;
        watchdog=setTimeout(()=>{if(!received)socket.close();},4500);
        socket.onopen=()=>{opened=true;};
        socket.onmessage=event=>{
          if(generation!==this.generation)return;
          let message;try{message=JSON.parse(event.data);if(Number.isFinite(message.serverTime))this.clockOffset=message.serverTime-Date.now();}catch{return;}
          if(message.event==='problem'){socket.close();return;}
          if(message.event==='snapshot')onSnapshot(message.data);
          if(message.event==='snapshot'||message.event==='heartbeat'){
            received=true;clearTimeout(watchdog);watchdog=setTimeout(()=>socket.close(),10000);this.connected=true;failures=0;onConnection(true);
          }
        };
        socket.onerror=()=>{};
        socket.onclose=()=>{
          clearTimeout(watchdog);
          if(generation!==this.generation)return;
          this.socket=null;
          if(!received){failToRefresh(Error(opened?'Live channel closed before it was ready.':'Live channel unavailable. Using automatic updates.'));return;}
          this.connected=false;onConnection(false,Error('Live connection interrupted. Reconnecting automatically.'));
          this.timer=setTimeout(connect,Math.min(3000,300*2**Math.min(++failures,3)));
        };
      }catch(error){
        if(generation!==this.generation)return;
        if([401,403,404].includes(error.status)){this.connected=false;onConnection(false,error);return;}
        failToRefresh(error);
      }
    };
    connect();
  }
}
export const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const prettyCode=code=>code.slice(0,5)+'-'+code.slice(5);
