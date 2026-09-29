import { database } from '../server/database.js';
const db=database(process.env.DATABASE_URL);
try {await db.ready();console.log('Cubic Chess schema is ready.');} finally {await db.close();}
