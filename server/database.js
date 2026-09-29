import { Pool, types } from 'pg';
import { attachDatabasePool } from '@vercel/functions';
import { readFile } from 'node:fs/promises';

// Millisecond timestamps are BIGINT in PostgreSQL (safe within JS date ranges).
types.setTypeParser(20, Number);
const schema = new URL('../migrations/0001_rooms.sql', import.meta.url);
const parameters = sql => { let n=0; return sql.replace(/\?/g, () => '$'+(++n)); };
const result = r => ({results:r.rows,meta:{changes:r.rowCount}});

export function database(connectionString, {vercel=false}={}) {
  if(!connectionString) throw Error('DATABASE_URL is required.');
  const pool = new Pool({connectionString, max:5, min:0, idleTimeoutMillis:5000, connectionTimeoutMillis:8000, statement_timeout:10000});
  pool.on('error', () => console.error('PostgreSQL idle connection interrupted.'));
  if(vercel) attachDatabasePool(pool);
  return databaseFromPool(pool);
}

// Exported for the portable PostgreSQL engine test adapter. Production uses pg.Pool.
export function databaseFromPool(pool) {
  let initialized;
  const db = {
    pool,
    async ready() {
      if(!initialized) initialized=(async()=>{
        const client=await pool.connect();
        try {
          await client.query('BEGIN');
          // Coordinate schema creation across simultaneous cold starts.
          await client.query('SELECT pg_advisory_xact_lock(817364921)');
          await client.query(await readFile(schema,'utf8'));
          await client.query('COMMIT');
        } catch(e) {await client.query('ROLLBACK');throw e;} finally {client.release();}
      })().catch(e=>{initialized=null;throw e;});
      return initialized;
    },
    prepare(sql) {
      const statement={sql:parameters(sql),values:[],bind(...values){return {...this,values};},
        async first(){return (await pool.query(this.sql,this.values)).rows[0]??null;},
        async all(){return result(await pool.query(this.sql,this.values));},
        async run(){return result(await pool.query(this.sql,this.values));}};
      return statement;
    },
    async batch(statements) {
      const client=await pool.connect();
      try {
        // A rematch insert and its parent link must be one serializable change.
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        const results=[];
        for(const s of statements) results.push(result(await client.query(s.sql,s.values)));
        await client.query('COMMIT');return results;
      } catch(e) {await client.query('ROLLBACK');throw e;} finally {client.release();}
    },
    async close(){await pool.end();}
  };
  return db;
}
