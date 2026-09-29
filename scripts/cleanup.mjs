import { database } from '../server/database.js';
const db=database(process.env.DATABASE_URL);
try {
  await db.ready();const now=Date.now();
  for(const [table,column]of [['rooms','expires_at'],['live_tickets','expires_at'],['login_attempts','resets_at']]){
    const r=await db.prepare(`DELETE FROM ${table} WHERE ${column}<=?`).bind(now).run();
    console.log(`${table}: removed ${r.meta.changes} expired rows.`);
  }
}finally{await db.close();}
