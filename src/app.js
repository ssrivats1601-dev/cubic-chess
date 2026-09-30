import { DIFFICULTIES, botSettings, chooseBotMove } from './bot.js';
import { matchScore, matchReport, filterRooms } from './match-end.js';
import { themes, themeStyle, applyTheme } from './themes.js';
import { initialState, legalMoves, playMove, coord, index, xyz, FILES, NAMES, sideName, other, inCheck, resultText } from './engine.js';
import { setupHTML, wireSetup, readSetup, readOpponent } from './setup.js';
import { dimensions, startClock, remaining, expireClock, stopClock } from './engine.js';
import { pieceSVG } from './pieces.js';
import { OnlineClient, escapeHTML, prettyCode } from './online.js';

const $ = id => document.getElementById(id);
const STORE = 'cubehouse.game.v2';
const online=new OnlineClient();
let mode='lobby',room=null,lobbyTab='public',lobbyData={rooms:[],mine:[]},appliedRevision=-1;
const movement = {k:'One step in any direction, including between layers.',q:'Any distance along an axis or a face diagonal.',r:'Any distance along one axis: file, rank or layer.',b:'Any distance along a face diagonal: change two axes equally.',n:'Two steps along one axis, one along another. Jumps over pieces.',p:'Forward along the rank on its own layer. Captures diagonally on that layer.'};
let state = initialState(), undoStack = [], layer = 0, flipped = false, selection = null, options = [], focusedSquare = index(0,0,0), message = '', messageError = false;
let storageOK = true,announcedResult='';
let bot=null,botTask=null;
function cancelBot(){if(botTask){botTask.worker?.terminate();clearTimeout(botTask.timer);clearTimeout(botTask.watchdog);botTask=null;}}
function scheduleBot(){
  if(mode!=='local'||!bot||state.result||state.turn===bot.human){cancelBot();return;}
  if(botTask)return;
  const snapshot=state,task={};botTask=task;
  feedback(`${DIFFICULTIES[bot.difficulty].label} bot is thinking… You can explore the layers.`);
  const finish=(move,fallback=false)=>{
    if(botTask!==task||mode!=='local'||state!==snapshot)return;
    cancelBot();
    if(move){commit(move,move.promote||'q');if(fallback&&!state.result)feedback('Bot kept its best available move after background search stopped. Your turn.');}
    else feedback('No legal bot move is available.',true);
  };
  const fallback=()=>{if(botTask!==task)return;try{finish(task.best||chooseBotMove(snapshot,'easy',{budgetMs:100}),true);}catch{cancelBot();feedback('Bot could not move. Undo or start a new game to retry.',true);}};
  task.timer=setTimeout(()=>{
    if(botTask!==task)return;
    try{task.worker=new Worker(new URL('./bot-worker.js',import.meta.url),{type:'module'});task.worker.onmessage=({data})=>{if(botTask!==task)return;if(data.progress){task.best=data.move;return;}data.error?fallback():finish(data.move);};task.worker.onerror=fallback;
      const left=state.clock?remaining(state,state.turn):Infinity;
      task.worker.postMessage({state:snapshot,difficulty:bot.difficulty,budgetMs:Math.max(20,Math.min(DIFFICULTIES[bot.difficulty].ms,left/4))});
      task.watchdog=setTimeout(fallback,5000);
    }catch{fallback();}
  },120);
}

function validState(s) {
  return s && Array.isArray(s.board) && s.board.length===512 && ['w','b'].includes(s.turn) && Array.isArray(s.log) && Array.isArray(s.positions) && Number.isInteger(s.ply) && s.ply>=0 &&
    s.board.every(p=>!p || ['w','b'].includes(p.color) && Object.hasOwn(NAMES,p.type)) && ['w','b'].every(c=>s.board.filter(p=>p?.type==='k' && p.color===c).length===1);
}
try {
  const saved=JSON.parse(localStorage.getItem(STORE));
  if(saved?.version===2 && validState(saved.state)) {
    state=saved.state;undoStack=Array.isArray(saved.undo)?saved.undo.filter(validState).slice(-40):[];
    layer=Number.isInteger(saved.layer) && saved.layer>=0 && saved.layer<8?saved.layer:0;flipped=!!saved.flipped;
    message=state.ply?'Game restored. Pick up where you left off.':'';
  }
  if(localStorage.getItem('cubehouse.tip.dismissed')) $('board-tip').hidden=true;
} catch { storageOK=false; }
function save() {
  if(mode==='online'){$('save-status').textContent=online.connected?'✓ Match saved online':'Reconnecting · last saved position shown';return;}
  try { localStorage.setItem(STORE,JSON.stringify({version:2,state,undo:undoStack.slice(-40),layer,flipped,bot}));storageOK=true; }
  catch { storageOK=false; }
  $('save-status').innerHTML=mode==='online'?(online.connected?'✓ Match saved online':'Reconnecting · last saved position shown'):storageOK?'<span aria-hidden="true">✓</span> Saved on this browser':'Saving unavailable · keep this tab open';
}
function feedback(text,error=false) {message=text;messageError=error;$('feedback').textContent=text;$('feedback').classList.toggle('error',error);$('mobile-feedback').textContent=text;$('mobile-feedback').classList.toggle('error',error);}
function clearSelection() {selection=null;options=[];}
function setLayer(n) {
  layer=Math.max(0,Math.min(dimensions(state).layers-1,n));focusedSquare=index(layer,...xyz(focusedSquare).slice(1));
  render();save();
  const nMoves=options.filter(m=>xyz(m.to)[0]===layer).length;
  if(selection) feedback(`Layer ${layer+1}: ${nMoves} legal destination${nMoves===1?'':'s'}${nMoves?' highlighted.':'. Look for a numbered layer badge.'}`);
  else feedback(`Layer ${layer+1} · ${state.board.slice(layer*64,layer*64+64).filter(Boolean).length} pieces. ${resultText(state)}.`);
}
function layerMini(l) {
  let shapes='';
  for(let r=0;r<dimensions(state).ranks;r++) for(let f=0;f<dimensions(state).files;f++) {
    const p=state.board[index(l,f,dimensions(state).ranks-1-r)];
    shapes+=`<rect x="${f*4}" y="${r*4}" width="4" height="4" fill="currentColor" opacity="${(f+r)%2?.08:.2}"/>`;
    if(p) shapes+=`<circle cx="${f*4+2}" cy="${r*4+2}" r="1.4" fill="${p.color==='w'?'var(--piece-white)':'var(--piece-black)'}" stroke="currentColor" stroke-width=".35"/>`;
  }
  return `<svg viewBox="0 0 ${dimensions(state).files*4} ${dimensions(state).ranks*4}" class="layer-thumb" aria-hidden="true">${shapes}</svg>`;
}
function renderLayers() {
  $('layers').innerHTML=Array.from({length:dimensions(state).layers},(_,i)=>dimensions(state).layers-1-i).map(l=>{
    const count=state.board.slice(l*64,l*64+64).filter(Boolean).length,moves=options.filter(m=>xyz(m.to)[0]===l).length;
    return `<button class="layer-button ${layer===l?'active':''} ${moves?'has-moves':''}" data-layer="${l}" aria-pressed="${layer===l}" aria-label="Layer ${l+1}, ${count} pieces${selection?`, ${moves} legal moves`:''}" style="order:${l}">${layerMini(l)}<span class="layer-description"><strong><span class="layer-word">Layer </span>${l+1}</strong><small data-short="${count?count+' pcs':'—'}">${count?`${count} piece${count===1?'':'s'}`:'Empty'}</small></span>${moves?`<span class="move-badge">${moves}</span>`:''}</button>`;
  }).join('');
  // In the desktop stack, the uppermost layer is at the top. The compact row reads 1–8.
  if(matchMedia('(min-width: 1101px)').matches) for(const button of $('layers').children) button.style.order=dimensions(state).layers-1-Number(button.dataset.layer);
}
function playerLabel(c) {return `<i class="player-dot ${c}"></i><span>${sideName(c).toUpperCase()}</span>${state.turn===c&&!state.result?'<span class="playing">to move</span>':''}`;}
function renderBoard() {
  $('layer-title').innerHTML=`Layer ${layer+1} <span>/ ${dimensions(state).layers}</span>`;
  $('layer-eyebrow').textContent=layer===0?'THE STARTING FLOOR':`A DIFFERENT PERSPECTIVE · ${layer+1}a1–${layer+1}${FILES[dimensions(state).files-1]}${dimensions(state).ranks}`;
  $('previous-layer').disabled=layer===0;$('next-layer').disabled=layer===dimensions(state).layers-1;
  $('board').setAttribute('aria-label',`Layer ${layer+1} chessboard`);
  const files=Array.from({length:dimensions(state).files},(_,i)=>flipped?dimensions(state).files-1-i:i),ranks=Array.from({length:dimensions(state).ranks},(_,i)=>flipped?i:dimensions(state).ranks-1-i);
  const checkColor=inCheck(state)?state.turn:null;
  const highlighted=new Map(options.map(m=>[m.to,m]));
  $('board').innerHTML=ranks.map(r=>'<div class="board-row" role="row">'+files.map(f=>{
    const i=index(layer,f,r),p=state.board[i],move=highlighted.get(i),selected=selection?.from===i,last=state.lastMove && [state.lastMove.from,state.lastMove.to,state.lastMove.castle?.from,state.lastMove.castle?.to].includes(i);
    const label=`${coord(i)}${p?`, ${sideName(p.color)} ${NAMES[p.type].toLowerCase()}`:', empty'}${selected?', selected':''}${move?', legal '+(p?'capture':'destination'):''}`;
    return `<button role="gridcell" class="square ${(f+r)%2===0?'dark':''} ${selected?'selected':''} ${last?'last':''} ${move?'legal':''} ${move&&(p||move.epCapture!==undefined)?'capture':''} ${p?.type==='k'&&p.color===checkColor?'check':''}" data-square="${i}" aria-label="${label}" aria-selected="${selected}" tabindex="${i===focusedSquare?0:-1}" title="${label}">${p?pieceSVG(p.type,p.color):''}${selected?`<span class="square-coordinate">${coord(i)}</span>`:''}</button>`;
  }).join('')+'</div>').join('');
  $('file-labels').innerHTML=files.map(f=>`<span>${FILES[f]}</span>`).join('');$('rank-labels').innerHTML=ranks.map(r=>`<span>${r+1}</span>`).join('');
  $('top-player').innerHTML=playerLabel(flipped?'w':'b');$('bottom-player').innerHTML=playerLabel(flipped?'b':'w');
  $('clear-selection').hidden=!selection;
}
function renderMatch() {
  const check=inCheck(state),turn=sideName(state.turn),ended=!!state.result;
  $('move-count').textContent=`MOVE ${String(Math.floor(state.ply/2)+1).padStart(2,'0')}`;
  $('turn-status').innerHTML=`<div class="turn-token ${state.turn==='b'?'black':''}">${pieceSVG('k',state.turn)}</div><div class="turn-copy"><strong class="${check&&!ended?'toast-check':''}">${ended?(state.result.winner?`${sideName(state.result.winner)} wins`:'Game drawn'):`${turn} to move`}</strong><small>${ended?resultText(state):check?'Check — protect your king.':mode==='online'?`${room.status==='waiting'?'Waiting for an opponent':room.myColor===state.turn?'Your move':'Opponent’s turn'} · You are ${sideName(room.myColor)}`:bot?`${DIFFICULTIES[bot.difficulty].label} bot · You are ${sideName(bot.human)}`:'Pass & play · on this device'}</small></div>`;
  $('feedback').textContent=message || (ended?resultText(state):'Select a white piece to begin.');$('feedback').classList.toggle('error',messageError);
  $('mobile-turn').textContent=resultText(state);$('mobile-feedback').textContent=$('feedback').textContent;$('mobile-feedback').classList.toggle('error',messageError);
  if(selection) {
    const p=state.board[selection.from],layers=[...new Set(options.map(m=>xyz(m.to)[0]+1))].sort((a,b)=>a-b);
    $('selection-card').innerHTML=`<div class="selected-detail">${pieceSVG(p.type,p.color)}<strong>${sideName(p.color)} ${NAMES[p.type].toLowerCase()}</strong><code>${coord(selection.from)}</code></div><p>${movement[p.type]}</p><p class="destination-note">${options.length} legal move${options.length===1?'':'s'}${layers.length?' · layer'+(layers.length===1?' ':'s ')+layers.join(', '):' · this piece is blocked'}</p>`;
  } else $('selection-card').innerHTML=`<div class="selection-empty"><span aria-hidden="true">⌁</span><div><strong>${ended?'Another round?':'Pick a piece. Find a new angle.'}</strong><p>${ended?'Start a fresh game, or undo to explore a different line.':'Legal squares light up. Layer badges show where you can go.'}</p></div></div>`;
  const captures=state.log.filter(m=>m.captured).map(m=>m.captured);
  $('capture-total').textContent=`${captures.length} captured`;
  $('captured-pieces').innerHTML=captures.length?captures.map(p=>`<span title="Captured ${sideName(p.color)} ${NAMES[p.type].toLowerCase()}">${pieceSVG(p.type,p.color)}</span>`).join(''):'<span class="no-captures">All pieces are still in play.</span>';
  renderOnlineMatch();renderResult();
  $('history-total').textContent=`${state.ply} ${state.ply===1?'ply':'plies'}`;
  const history=$('history'),nearBottom=history.scrollHeight-history.scrollTop-history.clientHeight<40;
  history.innerHTML=state.log.length?Array.from({length:Math.ceil(state.log.length/2)},(_,i)=>`<div class="history-row"><span class="history-number">${i+1}.</span>${[state.log[i*2],state.log[i*2+1]].map(m=>`<span class="history-move">${m?.notation||'—'}</span>`).join('')}</div>`).join(''):'<div class="history-empty">A clean slate.<span>Your moves will appear here.</span></div>';
  if(nearBottom) history.scrollTop=history.scrollHeight;
  $('undo').disabled=mode==='online'||!undoStack.length||!!bot&&!undoStack.some(s=>s.turn===bot.human);$('undo').title=mode==='online'?'Undo is available in local games.':'';
  $('draw').hidden=!!bot&&mode==='local';document.querySelector('.match-secondary>span').hidden=$('draw').hidden;
  $('resign').disabled=ended||mode==='online'&&(room.status!=='active'||online.busy);$('draw').disabled=ended||mode==='online'&&(room.status!=='active'||!!room.drawOffer||online.busy);
  $('new-game').innerHTML=mode==='online'?'← Lobby':'<span aria-hidden="true">+</span> New game';$('draw').textContent=mode==='online'?'Offer draw':'Agree a draw';
  $('save-status').innerHTML=mode==='online'?(online.connected?'✓ Match saved online':'Reconnecting · last saved position shown'):storageOK?'<span aria-hidden="true">✓</span> Saved on this browser':'Saving unavailable · keep this tab open';
}
function renderResult(){
  const panel=$('match-result');panel.hidden=!state.result;if(!state.result){announcedResult='';panel.innerHTML='';return;}
  const c=dimensions(state),players=mode==='online'?room.players:bot?Object.fromEntries(['w','b'].map(c=>[c,{name:c===bot.human?'You':DIFFICULTIES[bot.difficulty].label+' bot'}])):{w:{name:'White'},b:{name:'Black'}};
  const winner=state.result.winner,rematch=state.rematch;
  panel.innerHTML=`<div class="result-summary"><span class="result-score">${matchScore(state)}</span><div><div class="eyebrow">MATCH COMPLETE</div><h2 id="result-heading" tabindex="-1" role="status">${escapeHTML(resultText(state))}</h2><p>${winner?escapeHTML(players[winner]?.name||sideName(winner))+' takes the match.':'Neither side wins this match.'} ${state.ply} plies · ${c.files} × ${c.ranks} × ${c.layers} · ${c.minutes?`${c.minutes}+${c.increment}`:'Untimed'}</p></div></div><p>Explore the final position on any layer or read the move history below.</p><div class="result-actions"><button id="export-match" class="secondary-button">Download move record</button><button id="inspect-result" class="secondary-button">Inspect final board</button><button id="result-new" class="secondary-button">New game setup</button><button id="result-lobby" class="text-button">Back to lobby</button></div><div id="rematch-controls"></div>`;
  const noticeKey=(room?.code||'local')+state.ply+state.result.kind+(state.result.winner||'');if(announcedResult!==noticeKey&&!$('game-view').hidden){announcedResult=noticeKey;panel.scrollIntoView?.({behavior:'smooth',block:'start'});$('result-heading').focus({preventScroll:true});}
  $('export-match').onclick=()=>{const blob=new Blob([matchReport(state,players)],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`cubic-chess-${mode==='online'?room.code:'local'}-moves.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  $('inspect-result').onclick=()=>{$('board').scrollIntoView({behavior:'smooth',block:'center'});document.querySelector('[data-square][tabindex="0"]')?.focus({preventScroll:true});};
  $('result-new').onclick=()=>navigate('setup');$('result-lobby').onclick=()=>navigate('lobby');
  const controls=$('rematch-controls');
  if(mode!=='online'){controls.innerHTML='<button id="local-rematch" class="primary-button">Play again · same settings</button><p>The completed local match is kept in your browser’s last 10 results.</p>';$('local-rematch').onclick=()=>{newGame(c);if(!bot)flipped=!flipped;render();save();};return;}
  if(rematch?.code){controls.innerHTML=`<a class="primary-button" href="#room=${rematch.code}">Open rematch</a><p>Colors swapped. Same board and clock. The new clock started when the rematch was accepted. This result stays available.</p>`;return;}
  const offered=rematch?.offeredBy;
  controls.innerHTML=offered===room.myColor?'<p role="status">Rematch offered. Waiting for your opponent.</p><button class="secondary-button" data-rematch="cancel-rematch">Cancel offer</button>':offered?'<p role="status">Your opponent offers a rematch with colors swapped.</p><button class="primary-button" data-rematch="accept-rematch">Accept rematch</button> <button class="secondary-button" data-rematch="decline-rematch">Decline</button>':'<button class="primary-button" data-rematch="offer-rematch">Offer rematch · swap colors</button><p>Both players must agree. Board dimensions and clock settings stay the same.</p>';
  controls.querySelectorAll('[data-rematch]').forEach(b=>{b.disabled=online.busy||!online.connected;b.onclick=()=>sendOnline(b.dataset.rematch);});
}
function sizeBoard(){if($('game-view').hidden)return;const c=dimensions(state),top=document.querySelector('.board-wrap').getBoundingClientRect().top+window.scrollY,height=Math.max(c.ranks*32,Math.min(760,(window.visualViewport?.height||window.innerHeight)-top-50));document.documentElement.style.setProperty('--board-fit',`${Math.round(height*c.files/c.ranks+20)}px`);}
window.addEventListener('resize',sizeBoard);window.visualViewport?.addEventListener('resize',sizeBoard);
function render() {
  sizeBoard();
  if(mode==='local'){$('mode-label').innerHTML=bot?'<i></i> COMPUTER OPPONENT':'<i></i> LOCAL TWO-PLAYER';$('game-kind').textContent=bot?`${DIFFICULTIES[bot.difficulty].label.toUpperCase()} BOT · YOU ARE ${sideName(bot.human).toUpperCase()}`:'LOCAL MATCH';}
  const c=dimensions(state);layer=Math.min(layer,c.layers-1);
  document.documentElement.style.setProperty('--files',c.files);document.documentElement.style.setProperty('--ranks',c.ranks);
  document.querySelector('.dimension-mark>span').textContent=`${c.files} × ${c.ranks} × ${c.layers}`;
  document.querySelector('.dimension-mark').setAttribute('aria-label',`${c.files} by ${c.ranks} by ${c.layers}`);
  document.querySelector('.intro p').textContent=`${c.layers} layers. ${c.files*c.ranks*c.layers} squares. Your move.`;
  document.querySelector('.panel-heading span').textContent=`${c.layers} layers`;
  document.querySelector('.layer-explainer p').textContent=`One board, ${c.layers} floors. Pieces can travel between them.`;
  document.querySelector('.site-footer>span').textContent=`${c.files*c.ranks} squares per layer · ${c.files*c.ranks*c.layers} in this board`;
  const active=document.activeElement;
  const focusKind=active?.dataset.square!==undefined?'square':active?.dataset.layer!==undefined?'layer':null;
  const focusValue=focusKind==='layer'?active.dataset.layer:null;
  renderLayers();renderBoard();renderMatch();renderClocks();
  const restore=focusKind==='square'?document.querySelector(`[data-square="${focusedSquare}"]`):focusKind==='layer'?document.querySelector(`[data-layer="${focusValue}"]`):null;
  restore?.focus({preventScroll:true});
  sizeBoard();window.requestAnimationFrame(sizeBoard);
  scheduleBot();
}
function selectSquare(i) {
  focusedSquare=i;
  if(state.result) {feedback(`${resultText(state)}. ${mode==='online'?'Return to the lobby for another game.':'Start a new game or undo a move.'}`);return;}
  if(mode==='online'&&(room.status!=='active'||room.myColor!==state.turn||online.busy||!online.connected)){feedback(room.status==='waiting'?'Share the room code and wait for your opponent.':!online.connected?'Reconnecting. Wait for the board to sync.':online.busy?'Sending your move…':'It is your opponent’s turn.',true);return;}
  if(mode==='local'&&bot&&state.turn!==bot.human){feedback('The bot is thinking. Wait for your turn.');return;}
  if(selection && options.some(m=>m.to===i)) {
    const request=options.find(m=>m.to===i);
    if(request.promotion) choosePromotion(request);else commit(request);
    return;
  }
  const p=state.board[i];
  if(p?.color===state.turn) {
    if(selection?.from===i) {clearSelection();message='Selection cleared. Choose a piece.';}
    else {selection={from:i};options=legalMoves(state,i);message=`${sideName(p.color)} ${NAMES[p.type].toLowerCase()} at ${coord(i)} · ${options.length} legal moves across ${new Set(options.map(m=>xyz(m.to)[0])).size} layers.`;}
    messageError=false;render();return;
  }
  feedback(selection?'That square is not a legal destination. Use the highlighted squares or choose another piece.':p?`It is ${sideName(state.turn)}’s turn. Select one of their pieces.`:'Choose one of your pieces first.',true);
}
function commit(request,promotion='q') {
  if(mode==='local'){const expired=expireClock(state);if(expired!==state){state=expired;render();save();return;}}
  if(mode==='online'){sendOnline('move',{from:request.from,to:request.to,promotion});return;}
  const result=playMove(state,request,promotion);
  if(result.error) {feedback(result.error,true);return;}
  undoStack.push(stopClock(state));if(undoStack.length>40)undoStack.shift();state=result.state;
  layer=xyz(request.to)[0];focusedSquare=request.to;clearSelection();
  message=`${sideName(result.entry.color)}: ${result.entry.notation}. ${resultText(state)}.`;messageError=false;
  render();$('history').scrollTop=$('history').scrollHeight;save();
}
function showModal(html) { $('modal-content').innerHTML=html; if(!$('modal').open)$('modal').showModal(); }
function confirmAction(title,body,label,fn) {
  showModal(`<h2 id="modal-title">${title}</h2><p>${body}</p><div class="modal-actions"><button class="secondary-button" id="cancel-action">Keep playing</button><button class="primary-button" id="confirm-action">${label}</button></div>`);
  $('cancel-action').onclick=()=>$('modal').close();$('confirm-action').onclick=()=>{$('modal').close();fn();};$('cancel-action').focus();
}
function choosePromotion(move) {
  showModal(`<h2 id="modal-title">A pawn with potential.</h2><p>Your pawn reached ${coord(move.to)}. Choose its new piece to complete the move.</p><div class="promotion-options">${['q','r','b','n'].map(t=>`<button class="promotion-option" data-promotion="${t}">${pieceSVG(t,state.turn)}${NAMES[t]}</button>`).join('')}</div><p>Close this window to cancel the move.</p>`);
  for(const b of document.querySelectorAll('[data-promotion]')) b.onclick=()=>{$('modal').close();commit(move,b.dataset.promotion);};
}
function rulesHTML() {
  return `<h2 id="modal-title">Welcome to the third dimension.</h2><p>Play across the internet in an online room, or share one device in local mode. White goes first. All pieces start on layer 1; the army size depends on the number of files. Select a piece, choose a highlighted layer, then tap a highlighted destination. Protect your king on every layer.</p><div class="guide-steps"><h3>Play the computer</h3><p>On New game, choose Computer opponent under On-device game, select Easy, Medium, Hard or Expert and your side, then Start bot game. Easy uses basic tactics with varied play. Higher levels search exchanges and replies, evaluate king safety and development, and keep their best evaluated move if time runs out. Strength depends on board size and your device; levels have no Elo rating. Bots support every variant, promotion, clocks, resignation and rematches. Undo takes back your move and the bot reply; while it is thinking, undo cancels the pending reply. Bot games save on this browser. Draw offers are only available against people; normal automatic draw rules still apply.</p><h3>Your first game</h3><ol><li>Open the New game page to choose board dimensions and a clock, then create an online room or start locally. The Lobby is for joining rooms; My matches lists your online games.</li><li>White starts. Select a piece on the visible layer. Dots are legal destinations; rings indicate captures.</li><li>Keep the piece selected and choose a numbered layer badge to see destinations on another floor. Tap a highlighted square to complete the move.</li><li>Watch the turn label, move history and clocks. The board follows the last move, but you can explore any layer.</li></ol></div><div class="rules-grid">${['k','q','r','b','n','p'].map(t=>`<div class="rule-item">${pieceSVG(t,'w')}<div><strong>${NAMES[t]}</strong><p>${movement[t]}</p></div></div>`).join('')}</div><div class="rule-notes"><h3>Variants & starting armies</h3><p>Dimensions are <strong>files × ranks × layers</strong>. Choose 4–8 files, 4–8 ranks and 1–8 layers. Both sides use the same back rank from file a, with a pawn in front of every piece. White begins on ranks 1 and 2; Black on the last two ranks. Narrow armies: 4 files R K N R; 5 R N K Q R; 6 R N B K N R; 7 R N B K Q N R; 8 R N B Q K B N R. R=rook, N=knight, B=bishop, Q=queen, K=king. No Jester or Count.</p><p>4×4×4 is close combat: the pawn lines begin adjacent. Pawns cannot take a two-rank first move on boards with four or five ranks. On eight-file boards, castling uses the usual c/g king destinations on the home rank. Other widths have no castling. Promotion is on the opposite final rank.</p><h3>Clocks & connection</h3><p>Each player gets the selected time. Increment is added after each legal completed move. Online clocks begin when the second player joins; local clocks begin when you start a new game. Clocks keep running while a tab is hidden, a dialog is open, or a player disconnects. Promotion must be chosen before time runs out. A player whose time reaches zero loses. Untimed games have no deadline.</p><p>Online timeouts are decided by the server. The display counts down between updates; during disconnection, it is an estimate until the match reconnects. Online undo is disabled. Local undo restores the preceding position and its clock balance, then restarts the clock. Local games continue counting down after closing the browser.</p><h3>Movement examples</h3><p>From 3d4: a rook may go to 6d4 (layers only); a bishop to 5f4 (two layers and two files); a knight to 5e4 (two layers and one file); a king to 4e5 (one step on all three axes). Examples require the coordinates to exist on your board. Sliding pieces cannot jump; knights can. No move may expose your king.</p><p><strong>Coordinates:</strong> layer + file + rank. <code>1e1</code> is layer 1, file e, rank 1. <code>3e1</code> is directly two layers above it.</p><p><strong>Face diagonals:</strong> two coordinates change by the same amount; the third stays fixed. Queens and bishops cannot travel along a three-axis space diagonal.</p><p><strong>Castling:</strong> eight-file boards on layer 1 only, from file e on the home rank. King and original rook must be unmoved, with a clear path. The king cannot start in, cross, or finish in check, including attacks from other layers.</p><p><strong>Pawn defaults:</strong> ordinary chess moves on its own layer; one rank forward, or two from its starting rank if clear on boards with at least six ranks. Captures one file diagonally forward. En passant lasts one turn. Promote to queen, rook, bishop or knight on the final rank.</p><p><strong>Captures:</strong> captured pieces leave the game permanently.</p><p><strong>Winning:</strong> checkmate. Kings are never captured. Stalemate, threefold repetition and kings-only positions are automatic draws; players may also agree a draw. Local undo keeps the last 40 actions. Online moves are final; a draw needs both players’ agreement.</p><p><strong>Controls:</strong> tap or click to select and move. Use <kbd>[</kbd> / <kbd>]</kbd> to switch layers, arrow keys within the board, <kbd>Enter</kbd> to select, and <kbd>Esc</kbd> to clear a selection.</p><p><strong>Your game:</strong> online matches are saved on the server and refresh automatically. Your seat reconnects from the same browser. Local matches save in this browser. Public rooms are listed for site visitors; private rooms require a code. The site’s access settings still apply to both kinds of room. Waiting rooms expire after 30 minutes, matches after 7 days without a game action.</p></div><div class="modal-actions"><button class="primary-button" id="back-to-game">Back to the cube</button></div>`;
}
$('layers').onclick=e=>{const b=e.target.closest('[data-layer]');if(b)setLayer(+b.dataset.layer);};
$('board').onclick=e=>{const b=e.target.closest('[data-square]');if(b)selectSquare(+b.dataset.square);};
$('board').onkeydown=e=>{
  const button=e.target.closest('[data-square]');if(!button)return;
  const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}[e.key];
  if(!delta)return;e.preventDefault();
  const [l,f,r]=xyz(+button.dataset.square),sign=flipped?-1:1,nf=f+delta[0]*sign,nr=r+delta[1]*sign;
  if(nf<0||nf>=dimensions(state).files||nr<0||nr>=dimensions(state).ranks)return;
  focusedSquare=index(l,nf,nr);for(const b of $('board').querySelectorAll('[data-square]'))b.tabIndex=+b.dataset.square===focusedSquare?0:-1;
  $('board').querySelector(`[data-square="${focusedSquare}"]`).focus();
};
$('previous-layer').onclick=()=>setLayer(layer-1);$('next-layer').onclick=()=>setLayer(layer+1);
$('flip').onclick=()=>{flipped=!flipped;render();save();feedback(`Board flipped. ${flipped?'Black':'White'} is closest to you.`);};
$('clear-selection').onclick=()=>{clearSelection();message='Selection cleared. Choose a piece.';messageError=false;render();};
$('undo').onclick=()=>{if(mode==='online'||!undoStack.length||bot&&!undoStack.some(s=>s.turn===bot.human))return;cancelBot();const previous=state.lastMove;do{state=undoStack.pop();}while(bot&&state.turn!==bot.human&&undoStack.length);if(state.clock)state={...state,clock:{...state.clock,startedAt:Date.now()}};clearSelection();layer=previous?xyz(previous.from??previous.to)[0]:0;focusedSquare=layer*64;message=`Last action undone. ${resultText(state)}.`;messageError=false;render();save();};
function newGame(config=dimensions(state)){cancelBot();if(bot)flipped=bot.human==='b';if(mode==='local'&&state.result){try{const archive=JSON.parse(localStorage.getItem('cubehouse.completed')||'[]');archive.unshift({finishedAt:Date.now(),state});localStorage.setItem('cubehouse.completed',JSON.stringify(archive.slice(0,10)));}catch{}}state=startClock(initialState(config));undoStack=[];layer=0;focusedSquare=0;clearSelection();message='New game. White moves first.';messageError=false;render();save();}
$('new-game').onclick=()=>{if(mode==='online'){showLobby();return;}openSetup();};
$('resign').onclick=()=>{
  const color=mode==='online'?room.myColor:bot?bot.human:state.turn;
  confirmAction(`${sideName(color)} resigns?`,`${sideName(other(color))} will win this game.`,`Resign as ${sideName(color)}`,()=>{
    if(mode==='online'){sendOnline('resign');return;}
    if(state.result)return;
    undoStack.push(state);state={...stopClock(state),result:{kind:'resignation',winner:other(color)}};clearSelection();message=resultText(state);messageError=false;render();save();
  });
};
$('draw').onclick=()=>{
  if(mode==='online'){sendOnline('offer-draw');return;}
  confirmAction('Agree to a draw?','Both players should agree before ending the game.','We both agree',()=>{if(state.result)return;undoStack.push(state);state={...stopClock(state),result:{kind:'agreement'}};clearSelection();message=resultText(state);messageError=false;render();save();});
};
$('rules-button').onclick=()=>navigate('rules');$('coordinates-button').onclick=()=>navigate('rules');
$('close-modal').onclick=()=>$('modal').close();
$('modal').onclick=e=>{if(e.target===$('modal')){const r=$('modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('modal').close();}};
$('dismiss-tip').onclick=()=>{$('board-tip').hidden=true;try{localStorage.setItem('cubehouse.tip.dismissed','1');}catch{}};
document.addEventListener('keydown',e=>{
  if($('game-view').hidden||mode==='lobby'||$('modal').open||e.ctrlKey||e.metaKey||e.altKey||['INPUT','TEXTAREA'].includes(e.target.tagName))return;
  if(e.key==='['||e.key===']'){e.preventDefault();setLayer(layer+(e.key===']'?1:-1));}
  if(e.key==='Escape'){clearSelection();message='Selection cleared.';messageError=false;render();}
});
function renderOnlineMatch(){
  const panel=$('online-match');panel.hidden=mode!=='online';
  $('draw-offer').hidden=true;
  if(mode!=='online')return;
  const waiting=room.status==='waiting';
  panel.innerHTML=`<div class="room-code-card"><div class="room-code-top"><span>${room.visibility==='public'?'◎ Public room':'Private room'}</span><span class="sync-label ${online.connected?'':'offline'}">${online.connected?(online.transport==='socket'?'● Live':'↻ Auto-updating'):'○ Reconnecting'}</span></div><button class="room-code-copy" id="copy-room" title="Copy invite link"><strong>${prettyCode(room.code)}</strong><span>Copy invite ↗</span></button><div class="room-seats">${['w','b'].map(c=>`<div><i class="side-circle ${c==='w'?'white':'black'}"></i><span>${room.players[c]?escapeHTML(room.players[c].name):'Waiting for player…'}</span>${c===room.myColor?'<small>You</small>':room.players[c]?`<small>${!online.connected?'Unknown':room.players[c].connected?'Connected':'Disconnected'}</small>`:''}</div>`).join('')}</div>${waiting?'<p>Share the code or invite link. Your match begins when someone joins.</p><button class="text-button" id="cancel-room">Cancel waiting room</button>':''}</div>`;
  $('copy-room').onclick=copyInvite;
  if(waiting)$('cancel-room').onclick=()=>confirmAction('Cancel this room?','The room code will stop accepting players.','Cancel room',()=>sendOnline('cancel'));
  if(room.drawOffer&&room.status==='active'){
    $('draw-offer').hidden=false;
    $('draw-offer').innerHTML=room.drawOffer===room.myColor?'<p>Draw offered. Waiting for your opponent.</p>':'<p>Your opponent offers a draw.</p><div><button class="primary-button" id="accept-draw">Accept</button><button class="secondary-button" id="decline-draw">Keep playing</button></div>';
    if($('accept-draw')){$('accept-draw').onclick=()=>sendOnline('accept-draw');$('decline-draw').onclick=()=>sendOnline('decline-draw');}
  }
}
function receiveRoom(next){
  if(mode!=='online'||room&&room.code!==next.code||next.revision<appliedRevision)return;
  const changed=next.revision!==appliedRevision,positionChanged=next.state.ply!==state.ply||!!next.state.result!==!!state.result;
  room=next;
  if(changed){
    const oldPly=state.ply;state=next.state;appliedRevision=next.revision;
    if(positionChanged){clearSelection();if(state.lastMove&&state.ply!==oldPly){layer=xyz(state.lastMove.to)[0];focusedSquare=state.lastMove.to;}}
    message=next.status==='waiting'?'Your room is ready. Share the code to invite an opponent.':state.result?resultText(state):positionChanged&&state.log.length?`${sideName(state.log.at(-1).color)}: ${state.log.at(-1).notation}. ${resultText(state)}.`:next.myColor===state.turn?'Your turn. Choose a piece.':'Your opponent is thinking. Explore the layers while you wait.';
    messageError=false;render();
    if(positionChanged)$('board').classList.add('move-arrived');
    setTimeout(()=>$('board').classList.remove('move-arrived'),550);
  }else{renderOnlineMatch();renderResult();save();}
}
async function sendOnline(type,data={}){
  if(online.busy)return;
  feedback(type==='move'?'Sending your move…':'Updating match…');
  try{
    const result=await online.action(type,data);
    if(result.cancelled){showLobby();lobbyMessage('Room cancelled.');return;}
    receiveRoom(result.room);
  }catch(e){feedback(e.message,true);try{receiveRoom(await online.get(room.code));feedback(e.message,true);}catch{online.connected=false;renderOnlineMatch();save();}}
  finally{if(mode==='online')renderMatch();}
}
async function copyInvite(){
  const link=location.origin+location.pathname+'#room='+room.code;
  try{await navigator.clipboard.writeText(link);feedback('Invite link copied. Your opponent needs access to this site.');}
  catch{showModal(`<h2 id="modal-title">Invite your opponent.</h2><p>Copy this link and share it with someone who has access to the site.</p><input class="text-input" id="invite-link" readonly value="${escapeHTML(link)}"><p>Room code: <strong>${prettyCode(room.code)}</strong></p>`);$('invite-link').select();}
}
function enterOnline(next){
  cancelBot();bot=null;
  setScreen('game');online.stop();online.busy=false;mode='online';room=next;state=next.state;online.remember(next);appliedRevision=-1;clearSelection();undoStack=[];
  layer=state.lastMove?xyz(state.lastMove.to)[0]:0;focusedSquare=layer*64;flipped=next.myColor==='b';
  $('lobby-view').hidden=true;$('game-view').hidden=false;$('mode-label').innerHTML='<i></i> ONLINE MATCH';$('game-kind').textContent=`${next.visibility.toUpperCase()} ROOM · ${prettyCode(next.code)}`;
  history.replaceState(null,'','#room='+next.code);$('resume-match').href='#room='+next.code;
  receiveRoom(next);
  let connectionLost=false;
  online.watch(next.code,receiveRoom,(connected,error)=>{if(mode!=='online')return;renderOnlineMatch();renderResult();save();if(!connected){connectionLost=true;feedback(error.message+([401,403,404].includes(error.status)?' Return to the lobby.':' Reconnecting automatically.'),true);}else if(connectionLost){connectionLost=false;feedback('Reconnected. '+resultText(state)+'.');}});
  scrollTo({top:0,behavior:'instant'});
}
function startLocal(){
  cancelBot();bot=null;
  setScreen('game');  online.stop();room=null;mode='local';state=initialState();undoStack=[];layer=0;flipped=false;clearSelection();
  try{const s=JSON.parse(localStorage.getItem(STORE));if(s?.version===2&&validState(s.state)){state=s.state;bot=botSettings(s.bot);undoStack=(s.undo||[]).filter(validState).slice(-40);layer=Number.isInteger(s.layer)&&s.layer>=0&&s.layer<8?s.layer:0;flipped=!!s.flipped;}}catch{}
  focusedSquare=layer*64;message=state.ply?'Local game restored. Pick up where you left off.':'White moves first. Choose a piece.';messageError=false;
  $('lobby-view').hidden=true;$('game-view').hidden=false;$('mode-label').innerHTML='<i></i> LOCAL TWO-PLAYER';$('game-kind').textContent='LOCAL MATCH';history.replaceState(null,'','#local');$('resume-match').href='#local';render();save();scrollTo({top:0,behavior:'instant'});
}
function lobbyMessage(text,error=false){$('lobby-feedback').hidden=!text;$('lobby-feedback').textContent=text;$('lobby-feedback').classList.toggle('is-error',error);}
function renderRoomList(){
  $('room-total').textContent=lobbyData.rooms.length;$('my-room-total').textContent=lobbyData.mine.length;
  $('public-tab').setAttribute('aria-selected',String(lobbyTab==='public'));$('mine-tab').setAttribute('aria-selected',String(lobbyTab==='mine'));
  const list=lobbyTab==='public'?filterRooms(lobbyData.rooms,$('room-query').value,$('room-clock').value):lobbyData.mine;
  $('room-search-count').textContent=`${list.length} matches in the latest ${lobbyData.rooms.length} open rooms (up to 40). Updates automatically.`;
  $('room-list').setAttribute('aria-labelledby',lobbyTab==='public'?'public-tab':'mine-tab');
  $('room-list').innerHTML=list.length?list.map(r=>`<div class="room-row"><span class="room-avatar">${escapeHTML(r.hostName?.slice(0,1).toUpperCase()||'C')}</span><div class="room-row-name"><strong>${escapeHTML(r.hostName)}’s room</strong><small>${r.config?`${r.config.files}×${r.config.ranks}×${r.config.layers} · ${r.config.minutes?`${r.config.minutes}+${r.config.increment}`:'Untimed'} · `:''}${r.visibility==='public'?'Public':'Private'} · ${r.status==='waiting'?'Waiting for an opponent':r.status==='active'?'Match in progress':r.result?escapeHTML(resultText({result:r.result})):'Match finished'}</small></div><code>${prettyCode(r.code)}</code><button class="secondary-button" data-join-code="${r.code}">${r.myColor?(r.status==='finished'?'View result':'Resume'):'Join room'} <span>↗</span></button></div>`).join(''):`<div class="room-empty"><span class="empty-orbit">◇</span><strong>${lobbyTab==='public'?'The next rivalry starts with you.':'Your seat is waiting.'}</strong><p>${lobbyTab==='public'?'No rooms match. Clear the filters or create a new room.':'Create or join a room. Your recent matches will appear here.'}</p></div>`;
}
function refreshLobby(){
  if(mode!=='lobby')return;
  let last='';
  online.watchLobby(data=>{
    if(mode!=='lobby')return;
    const serialized=JSON.stringify(data);
    if(serialized!==last){last=serialized;lobbyData=data;renderRoomList();}
  },(connected,error)=>{
    if(mode!=='lobby')return;
    if(connected){
      if($('lobby-connection').classList.contains('offline'))lobbyMessage('');
      $('lobby-connection').innerHTML='<i></i> Lobby connected · '+(online.transport==='socket'?'Live':'Auto-updating');$('lobby-connection').classList.remove('offline');
    }else{
      $('lobby-connection').textContent='Reconnecting…';$('lobby-connection').classList.add('offline');lobbyMessage(error.message,true);
    }
  });
}
function showLobby(page='lobby'){
  cancelBot();
  if(typeof page!=='string')page='lobby';setScreen(page);
  online.stop();mode='lobby';room=null;clearSelection();$('game-view').hidden=true;$('lobby-view').hidden=false;$('mode-label').innerHTML='<i></i> ONLINE CHESS';history.replaceState(null,'','#/'+page);lobbyTab=page==='matches'?'mine':'public';lobbyMessage('');renderRoomList();refreshLobby();scrollTo({top:0,behavior:'instant'});
}
function playerName(){const name=$('player-name').value.trim();if(!name||name.length>24){$('player-name').focus();throw Error('Enter your player name, up to 24 characters.');}try{localStorage.setItem('cubehouse.name.v2',name);}catch{}return name;}
async function joinRoom(code){
  if(online.busy)return;online.busy=true;
  try{const name=playerName();lobbyMessage('Joining your match…');const next=await online.join(code,name);enterOnline(next);}
  catch(e){lobbyMessage(e.message,true);}finally{online.busy=false;}
}
$('create-room-form').onsubmit=async e=>{
  e.preventDefault();if(online.busy)return;online.busy=true;$('create-room').disabled=true;
  try{const name=playerName(),form=new FormData(e.target);lobbyMessage('Creating your room…');enterOnline(await online.create({name,visibility:form.get('visibility'),color:form.get('color'),config:readSetup()}));}
  catch(err){lobbyMessage(err.message,true);}finally{online.busy=false;$('create-room').disabled=false;}
};
$('join-room-form').onsubmit=e=>{e.preventDefault();joinRoom($('room-code-input').value);};
$('room-list').onclick=e=>{const button=e.target.closest('[data-join-code]');if(button)joinRoom(button.dataset.joinCode);};
$('public-tab').onclick=()=>navigate('rooms');$('mine-tab').onclick=()=>navigate('matches');
$('room-query').oninput=renderRoomList;$('room-clock').onchange=renderRoomList;$('clear-room-search').onclick=()=>{$('room-query').value='';$('room-clock').value='all';renderRoomList();};
$('refresh-lobby').onclick=refreshLobby;$('local-play').onclick=startLocal;$('back-to-lobby').onclick=showLobby;$('lobby-nav').onclick=showLobby;
async function boot(){
  try{const name=localStorage.getItem('cubehouse.name.v2');if(name)$('player-name').value=name;}catch{}
  if(location.hash.startsWith('#/')){route();return;}
  if(location.hash==='#local'){startLocal();return;}
  const code=online.normalize(new URLSearchParams(location.hash.slice(1)).get('room')||'');
  if(code){
    try{enterOnline(await online.get(code));return;}
    catch{$('room-code-input').value=prettyCode(code);lobbyMessage('You have an invitation. Choose your player name, then join the room.');}
  }
  setScreen('lobby');refreshLobby();
  if(!online.storageAvailable)lobbyMessage('Browser storage is unavailable. Keep this tab open so you can retain your seat.',true);
}
matchMedia('(min-width: 1101px)').addEventListener('change',renderLayers);
$('lobby-setup').innerHTML=setupHTML();wireSetup();
$('new-local-setup').onclick=()=>{try{const config=readSetup(),opponent=readOpponent();const begin=()=>{startLocal();cancelBot();bot=opponent;newGame(config);};if(localStorage.getItem(STORE))confirmAction('Replace the local game?','This starts a new on-device match with the selected opponent, board and clock.','Start game',begin);else begin();}catch(e){lobbyMessage(e.message,true);}};
let themeId='forest';try{themeId=localStorage.getItem('cubehouse.theme')||'forest';}catch{}applyTheme(themeId);
function openSetup(){
  $('lobby-setup').innerHTML='';
  showModal(`<h2 id="modal-title">Make this game yours.</h2><p>Start a new local game. This replaces the saved local match.</p>${setupHTML(bot)}<p id="setup-error" role="alert"></p><button id="start-configured" class="primary-button">Start new game</button>`);wireSetup();
  $('start-configured').onclick=()=>{try{const c=readSetup(),opponent=readOpponent();$('modal').close();cancelBot();bot=opponent;newGame(c);}catch(e){$('setup-error').textContent=e.message;}};
}
$('modal').addEventListener('close',()=>{if(!$('lobby-setup').children.length){$('modal-content').innerHTML='';$('lobby-setup').innerHTML=setupHTML();wireSetup();}});
function renderClocks(){
  const el=$('clocks');if(!state.clock){el.innerHTML='<span class="untimed">∞ Untimed game</span>';return;}
  el.innerHTML=['w','b'].map(c=>{const ms=remaining(state,c,Date.now()+(mode==='online'?(online.clockOffset||0):0)),seconds=Math.ceil(ms/1000);return `<div class="clock ${state.turn===c&&!state.result?'ticking':''} ${ms<20000?'low-time':''}"><span>${sideName(c)} ${state.turn===c&&!state.result?'●':''}</span><strong>${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}</strong><small>+${state.clock.increment/1000}s${!state.clock.startedAt&&!state.result?' · waiting':''}</small></div>`;}).join('');
}
setInterval(()=>{if(mode==='lobby')return;if(mode==='local'){const next=expireClock(state);if(next!==state){state=next;clearSelection();message=resultText(state);render();save();}}renderClocks();},200);
const pageTitles={rooms:'Open rooms',lobby:'Lobby',setup:'New game',matches:'My matches',rules:'How to play',variants:'Variants & clocks',appearance:'Appearance',game:'Your match'};
function setScreen(page){
  document.body.dataset.page=page;document.title=`${pageTitles[page]||'Cubic Chess'} · Cubic Chess`;
  $('feature-view').hidden=!['rules','variants','appearance'].includes(page);$('game-view').hidden=page!=='game';$('lobby-view').hidden=!['lobby','rooms','setup','matches'].includes(page);
  document.querySelectorAll('[data-page-link]').forEach(a=>{if(a.dataset.pageLink===page)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  document.querySelector('.lobby-toolbar h2').textContent=pageTitles[page]||'Lobby';
  $('room-search').hidden=page!=='rooms';$('lobby-actions').hidden=page==='setup';$('player-profile').hidden=page==='matches';$('local-results').hidden=page!=='matches';if(page==='matches')renderLocalResults();
}
function renderLocalResults(){
  let archive=[],current;try{archive=JSON.parse(localStorage.getItem('cubehouse.completed')||'[]');current=JSON.parse(localStorage.getItem(STORE))?.state;}catch{}
  const entries=[...(current?.result?[{state:current,current:true}]:[]),...archive].filter(x=>validState(x.state));
  $('local-results').innerHTML='<h2>Local results</h2><p>Current completed game and the last 10 replaced results on this browser.</p>'+(entries.length?entries.map(x=>`<article><details><summary>${escapeHTML(resultText(x.state))} · ${x.state.ply} plies ${x.current?'· current game':''}</summary><pre>${escapeHTML(matchReport(x.state))}</pre></details></article>`).join(''):'<p>No completed local matches yet.</p>');
}
function navigate(page){if(location.hash==='#/'+page)route();else {history.pushState(null,'','#/'+page);route();}}
function appearance(){
  $('feature-content').innerHTML=`<div class="appearance-toolbar"><label for="theme">Theme</label><select id="theme">${themes.map(t=>`<option value="${t.id}">${t.name}</option>`).join('')}</select></div><p class="theme-status" id="theme-status" role="status"></p><div class="theme-gallery">${themes.map(t=>`<button class="theme-card" data-theme-choice="${t.id}" style="${themeStyle(t)}" aria-pressed="false"><span class="theme-preview" aria-hidden="true"><span class="preview-board">${Array.from({length:16},(_,i)=>`<span class="preview-square ${(i+Math.floor(i/4))%2?'dark':''}">${i===1?pieceSVG('n','b'):i===14?pieceSVG('k','w'):''}</span>`).join('')}</span><span class="preview-ui">WHITE TO MOVE<strong>04:32</strong><span class="preview-chip">Your move</span><span class="preview-line"></span><span class="preview-line"></span></span></span><span class="theme-copy"><strong>${t.name}</strong><small>${t.description}</small></span></button>`).join('')}</div>`;
  const select=id=>{const t=applyTheme(id);$('theme').value=t.id;$('theme-status').textContent=`${t.name} selected · saved for every page and match on this browser`;document.querySelectorAll('[data-theme-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeChoice===t.id)));};
  $('theme').onchange=()=>select($('theme').value);document.querySelectorAll('[data-theme-choice]').forEach(b=>b.onclick=()=>select(b.dataset.themeChoice));select(document.documentElement.dataset.theme);
}
function feature(page){
  setScreen(page);$('feature-title').textContent=pageTitles[page];
  $('feature-description').textContent=page==='appearance'?'Choose a complete palette for every page, piece, board, clock, and control. Your opponent keeps their own theme.':page==='rules'?'Learn the coordinates, move through the layers, and protect your king.':'Choose the shape of your game and the pace of each move.';
  if(page==='appearance')appearance();
  else if(page==='rules'){$('feature-content').innerHTML='<article class="guide-content">'+rulesHTML().replace('id="modal-title"','')+'</article>';$('back-to-game').onclick=()=>{$('resume-match').click();};}
  else $('feature-content').innerHTML=`<div class="rules-grid"><div class="feature-card"><h2>Choose your board</h2><p>Dimensions always mean <strong>files × ranks × layers</strong>. Pocket 4×4×4, compact 6×6×6, half-height 8×8×4, classic 8×8×8, or a single 8×8 floor.</p><p>Custom boards support 4–8 files, 4–8 ranks, and 1–8 layers. Smaller boards use reduced armies. All pieces start on layer 1.</p><p>Castling needs eight files and stays on layer 1. Pawn double moves need at least six ranks. Promotion uses the opposite final rank.</p><a class="primary-button" href="#/setup">Configure a game</a></div><div class="feature-card"><h2>Set the pace</h2><p>Play untimed, choose a preset, or set 1–180 minutes per player with 0–60 seconds added after each legal move.</p><p>Online clocks start when the second player joins. Local clocks start with the new game. Clocks keep running during dialogs, disconnections, and time away from the site.</p><p>The server decides online timeouts. If time runs out, that player loses. Local undo restores the previous position and clock balance.</p><a class="secondary-button" href="#/rules">Read the complete rules</a></div></div>`;
  $('feature-title').focus({preventScroll:true});scrollTo({top:0,behavior:'instant'});
}
async function route(){
  const hash=location.hash;
  if(hash==='#local'){if(mode==='local'){setScreen('game');render();}else startLocal();return;}
  if(hash.startsWith('#room=')){const code=online.normalize(hash.slice(6));if(mode==='online'&&room?.code===code){setScreen('game');render();return;}try{enterOnline(await online.get(code));}catch{showLobby();$('room-code-input').value=prettyCode(code);lobbyMessage('Enter your name and join this room.');}return;}
  const page=hash.slice(2)||'lobby';if(['appearance','rules','variants'].includes(page)){feature(page);return;}
  showLobby(['lobby','rooms','setup','matches'].includes(page)?page:'lobby');
}
window.addEventListener('hashchange',route);
render();
boot();
