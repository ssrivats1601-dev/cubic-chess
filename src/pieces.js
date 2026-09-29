const shapes = {
 p: '<circle cx="24" cy="12" r="6"/><path d="M19 20h10l-1 6 5 10H15l5-10z"/><path d="M14 36h20l2 5H12z"/>',
 r: '<path d="M13 8h6v5h4V8h4v5h4V8h6v11l-5 4v12H16V23l-3-4z"/><path d="M13 35h22l2 6H11z"/><path d="M16 22h16"/>',
 b: '<path d="M24 5c-4 5-11 9-9 16 1 4 5 6 9 6s8-2 9-6c2-7-5-11-9-16Z"/><path d="m26 10-5 10"/><path d="m19 27-4 9h18l-4-9zM13 36h22l2 5H11z"/>',
 n: '<path d="m15 8 8 3 7-3 4 8c4 5 3 12-2 20H15c1-6 5-11 10-16l-8 4-7-4 5-8z"/><path d="m20 10 3-5 3 5M13 36h22l2 5H11z"/><circle cx="20" cy="16" r="1.3" fill="currentColor" stroke="none"/><path d="M30 17c1 6-2 10-5 13"/>',
 q: '<path d="m11 15 8 6 5-10 5 10 8-6-6 19H17z"/><circle cx="10" cy="12" r="3"/><circle cx="24" cy="7" r="3"/><circle cx="38" cy="12" r="3"/><path d="M16 30h16M14 35h20l3 6H11z"/>',
 k: '<path d="M24 4v12M19 9h10"/><path d="M24 19c-4-8-15-3-13 4l6 11h14l6-11c2-7-9-12-13-4Z"/><path d="M17 29h14M14 35h20l3 6H11z"/>'
};
export function pieceSVG(type,color,extra='') {
  return `<svg viewBox="0 0 48 48" class="piece ${color==='w'?'white-piece':'black-piece'} ${extra}" aria-hidden="true"><g stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round">${shapes[type]||''}</g></svg>`;
}
