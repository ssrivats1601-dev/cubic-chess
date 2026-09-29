import {dimensions,resultText,sideName} from './engine.js';
export function matchScore(state){return state.result?.winner==='w'?'1–0':state.result?.winner==='b'?'0–1':'½–½';}
export function matchReport(state,players={w:{name:'White'},b:{name:'Black'}}){
 const c=dimensions(state);return ['CUBIC CHESS MATCH RECORD','Coordinates: layer + file + rank (Cubic Chess notation, not standard PGN)',`Board: ${c.files} × ${c.ranks} × ${c.layers}`,`Clock: ${c.minutes?`${c.minutes} minutes + ${c.increment} seconds per move`:'Untimed'}`,`White: ${players.w?.name||'White'}`,`Black: ${players.b?.name||'Black'}`,`Result: ${matchScore(state)} · ${resultText(state)}`,`Plies: ${state.ply}`,'',...state.log.map((m,i)=>`${Math.floor(i/2)+1}${m.color==='w'?'.':'...'} ${sideName(m.color)} ${m.notation}`),'',`Final result: ${resultText(state)}`].join('\n');
}
export function filterRooms(rooms,query='',clock='all'){
 const q=query.trim().toLowerCase().replace(/[×*]/g,'x').replace(/[\s-]/g,'');
 return rooms.filter(r=>{const c=r.config||{files:8,ranks:8,layers:8};const text=`${r.hostName||''} ${r.code} ${c.files}x${c.ranks}x${c.layers}`.toLowerCase().replace(/[\s-]/g,'');return text.includes(q)&&(clock==='all'||(clock==='timed')===!!c.minutes);});
}
