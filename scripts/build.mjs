import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
for(const dir of ['src','server','api','scripts']){
  for(const file of await readdir(dir)){
    if(!/\.m?js$/.test(file))continue;
    const checked=spawnSync(process.execPath,['--check',`${dir}/${file}`],{stdio:'inherit'});
    if(checked.status)process.exit(checked.status);
  }
}
const configuration=JSON.parse(await readFile('vercel.json','utf8'));
if(configuration.outputDirectory!=='public'||configuration.framework!==null)throw Error('Keep protected assets behind the HTTP handler.');
await mkdir('public',{recursive:true});
// Vercel rejects an empty output directory. Only this non-sensitive crawler
// policy may be static; application assets remain behind the HTTP handler.
if((await readdir('public')).some(file=>file!=='robots.txt'))throw Error('public/ may only contain robots.txt: application assets must remain behind authentication.');
await writeFile('public/robots.txt','User-agent: *\nDisallow: /\n');
await import('../api/server.js');
console.log('Build checked: server entry, frontend syntax, private asset routing. No credentials or database connection needed at build time.');
