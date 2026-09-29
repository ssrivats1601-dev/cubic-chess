import { createServer } from '../server/http.js';
import { accessControl } from '../server/auth.js';
if(!process.env.DATABASE_URL||!accessControl(process.env).configured){
  console.error('Set DATABASE_URL, SITE_PASSWORD (12+ characters), and SESSION_SECRET (32+ characters) in .env. See README.md.');process.exit(1);
}
const server=createServer();
server.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log(`Cubic Chess: http://127.0.0.1:${server.address().port} (password protected)`));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await server.shutdown();process.exit(0);});
