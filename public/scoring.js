export const blocks = ['s', 'p', 'd', 'f'];
export const blockPoints = { s: 1, p: 2, d: 3, f: 4 };
export const rowBonuses = { s: 5, p: 10, d: 15, f: 20 };
export const columnBonus = 10;

export function completedLines(board, marked) {
  const owned = new Set(marked);
  return {
    rows: blocks.filter((block) => board[block].every((symbol) => owned.has(symbol))),
    columns: Array.from({ length: 5 }, (_, index) => index)
      .filter((index) => blocks.every((block) => owned.has(board[block][index]))),
  };
}

export function scoreBoard(board, marked) {
  const owned = new Set(marked);
  const base = blocks.reduce((score, block) => score +
    board[block].filter((symbol) => owned.has(symbol)).length * blockPoints[block], 0);
  const lines = completedLines(board, marked);
  return base + lines.rows.reduce((score, block) => score + rowBonuses[block], 0) +
    lines.columns.length * columnBonus;
}
