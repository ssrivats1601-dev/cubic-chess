import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const template=await readFile(new URL('../.env.example',import.meta.url),'utf8');
const content=template.replace('SITE_PASSWORD=\n','SITE_PASSWORD='+randomBytes(18).toString('base64url')+'\n').replace('SESSION_SECRET=\n','SESSION_SECRET='+randomBytes(32).toString('hex')+'\n');
try{await writeFile('.env',content,{flag:'wx',mode:0o600});console.log('Created .env with unique secrets. Read SITE_PASSWORD in that file to sign in locally. See README.md for PostgreSQL and Vercel setup.');}
catch(e){if(e.code==='EEXIST')console.log('.env already exists; kept your settings.');else throw e;}
