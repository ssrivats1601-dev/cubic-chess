import test from 'node:test';import assert from 'node:assert/strict';
import {initialState} from '../src/engine.js';import {matchReport,matchScore,filterRooms} from '../src/match-end.js';
test('match records include board, clock, names, score and reason for every ending',()=>{
 for(const kind of ['checkmate','resignation','timeout','stalemate','repetition','kings','agreement']){const s=initialState({files:4,ranks:4,layers:4,minutes:3,increment:2});s.result={kind,...(['checkmate','resignation','timeout'].includes(kind)?{winner:'b'}:{})};const report=matchReport(s,{w:{name:'Alice'},b:{name:'Bob'}});assert.match(report,/4 × 4 × 4/);assert.match(report,/3 minutes \+ 2 seconds/);assert.match(report,/Black: Bob/);assert.ok(report.includes(matchScore(s)));assert.ok(!report.includes('undefined'));}
});
test('room discovery supports normalized names, codes, dimensions and clock filters',()=>{
 const rooms=[{code:'ABCDE12345',hostName:'Alice',config:{files:8,ranks:8,layers:4,minutes:3}},{code:'FGHIJ67890',hostName:'Bob',config:{files:4,ranks:4,layers:4,minutes:0}}];
 assert.equal(filterRooms(rooms,'8 × 8 × 4').length,1);assert.equal(filterRooms(rooms,'abcde-12345')[0].hostName,'Alice');assert.equal(filterRooms(rooms,'BOB','untimed').length,1);assert.equal(filterRooms(rooms,'Alice','untimed').length,0);assert.equal(filterRooms(rooms,'unknown').length,0);
});
