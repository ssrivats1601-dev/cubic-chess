# Retained rules and interface

## Coordinates and movement

Coordinates are written as layer, file, rank: `1e2`, `3b2`, `8h8`. All starting armies are on layer 1. On custom boards only configured files, ranks and layers exist.

| Piece | Rule |
| --- | --- |
| King | One square in any combination of dimensions: up to 26 adjacent squares; cannot move into check |
| Rook | Any distance on one axis, with no intervening piece |
| Bishop | Any distance on a face diagonal: equal displacement on exactly two axes |
| Queen | Rook plus bishop movement; three-axis space diagonals are not included |
| Knight | Two squares on one axis and one on another, in any orientation; jumps blockers |
| Pawn | Moves/captures within its current layer, toward the opposite rank; promotion to queen, rook, bishop or knight |

Pawn double steps are allowed only from home, through a clear square, on boards with at least six ranks. En passant is supported on the immediately following turn and cannot expose the king. Castling requires eight files, remains on layer 1, and validates the unmoved king/rook, blockers, current check and attacks along the king's path, including attacks from other layers.

Legal moves cannot leave your king in check. Kings are never captured. Captured pieces leave the game permanently. Jester, Count, reserves and drops are absent.

## Dimensions and starting armies

Files and ranks can each be 4–8; layers can be 1–8. Standard chess uses `R N B Q K B N R`. Narrower back ranks are:

| Files | Back rank, from file a |
| --- | --- |
| 4 | R K N R |
| 5 | R N K Q R |
| 6 | R N B K N R |
| 7 | R N B K Q N R |
| 8 | R N B Q K B N R |

Each side also has one pawn per file on its second rank. Black mirrors the starting ranks. These variants preserve the earlier site rules; they are not claimed to be official FIDE chess variants.

## Results and clocks

Endings include checkmate, stalemate, threefold repetition, only kings remaining, agreed draw, resignation and timeout. The result screen displays the score, reason, player names, dimensions, clock and move count. It supports final-board inspection and a downloadable **Cubic Chess text record**, not standard 2D PGN.

Online rematches require agreement by the opponent, preserve settings, swap seats and start fresh clocks upon acceptance. Each player opens the new room from the finished match. Local rematches keep the previous completed match in the browser's last ten results.

Online clocks start when the second player joins. Local clocks start with the configured game. Clocks continue during navigation, dialogs and disconnection. Increment is added after a legal move. Local undo restores the prior position and clock balance; online undo is disabled. Fifty-move adjudication and general insufficient-material inference beyond king-only positions are not implemented in the retained rules.

## Navigation and appearance

Dedicated hash routes retain active games while visiting other pages: lobby, open rooms, setup, matches, rules, variants/clocks and appearance. Search matches names, room codes and dimensions, with timed/untimed filters. Each layer has legal-move badges and previews. The board supports selection feedback, flip, keyboard arrows/Enter/Escape and bracket-key layer navigation.

Six themes apply semantic colors across the board, lobby, controls, guides, clocks, dialogs and result screens. Theme selection persists in the browser. The responsive design rearranges side panels and layer navigation for touch-sized screens. The separate private access form uses the default Cubic Chess palette before the app loads.
