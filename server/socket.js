// Each connection reads PostgreSQL, so separate instances see the same state.
export function liveSocket(socket,{initial,read,interval=500},{lifetime=45000}={}) {
  let stopped=false,running=false,last=JSON.stringify(initial),lastSent=Date.now();
  const send=(event,data)=>{if(socket.readyState===1)socket.send(JSON.stringify({event,data,serverTime:Date.now()}));};
  const stop=()=>{if(stopped)return;stopped=true;clearInterval(timer);clearTimeout(expiry);if(socket.readyState===1)socket.close(1000,'Renewing live connection');};
  const timer=setInterval(async()=>{
    if(stopped||running)return;running=true;
    try {
      if(socket.bufferedAmount>262144){stop();return;}
      const next=await read(),serialized=JSON.stringify(next);
      if(serialized!==last){last=serialized;lastSent=Date.now();send('snapshot',next);}
      else if(Date.now()-lastSent>=3000){lastSent=Date.now();send('heartbeat',{time:lastSent});}
    } catch(e){send('problem',{error:e.status?e.message:'Live connection interrupted.',status:e.status||503});stop();}
    finally{running=false;}
  },interval);
  const expiry=setTimeout(stop,lifetime);
  socket.on('close',stop);socket.on('error',stop);
  // Commands only use the validated HTTP API. Incoming socket frames aren't commands.
  socket.on('message',()=>{socket.close(1008,'Use the game API for commands.');});
  send('snapshot',initial);
}
