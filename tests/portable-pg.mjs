import { PGlite } from '@electric-sql/pglite';

// PostgreSQL compiled to WASM. This exercises real SQL, but serializes database
// connections. CI also runs against native PostgreSQL for transaction contention.
export async function portablePool() {
  const pg=new PGlite();await pg.waitReady;
  let tail=Promise.resolve();
  async function acquire(){const previous=tail;let release;tail=new Promise(r=>{release=r;});await previous;return release;}
  async function query(sql,values){
    const r=values?.length?await pg.query(sql,values):(await pg.exec(sql)).at(-1);
    return {rows:r?.rows||[],rowCount:r?.affectedRows||0};
  }
  return {
    async connect(){const release=await acquire();return {query,release};},
    async query(sql,values){const release=await acquire();try{return await query(sql,values);}finally{release();}},
    async end(){await pg.close();}
  };
}
