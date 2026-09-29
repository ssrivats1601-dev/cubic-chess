import { spawnSync } from 'node:child_process';
const r=spawnSync(process.execPath,['--test','tests/server.test.mjs'],{stdio:'inherit',env:{...process.env,CUBIC_CHESS_PORTABLE_TEST:'1'}});
process.exit(r.status??1);
