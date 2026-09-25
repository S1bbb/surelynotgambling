import { PersonStanding } from 'lucide-react';

// Horizontal placement of stairs-v2 platforms on a 20-column grid (cosmetic, fixed).
const V2_OFFSETS = [0, 2, 3, 0, 2, 6, 7, 8, 0, 0, 0, 0];

export default function LadderBoard({
  widths,
  rocks,
  moves,
  board,
  activeStep,
  disabled,
  onPick,
  label,
  dropRow,
}: {
  widths: number[];
  rocks: number;
  moves: number[];
  board: number[][];
  activeStep?: number;
  disabled?: boolean;
  onPick?: (column: number) => void;
  label?: (level: number) => string;
  dropRow?: number;
}) {
  const legacy = widths.length === 8;
  const columns = legacy ? 5 : 20;
  const offsets = legacy ? widths.map(() => 0) : V2_OFFSETS;
  const lost = moves.length > 0 && board[moves.length - 1]?.includes(moves[moves.length - 1]);
  const standing = moves.length - (lost ? 1 : 0); // level the climber stands on
  const grid = { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` };
  return (
    <div className={'ladder-board' + (legacy ? ' legacy' : '')} aria-label={`Лестница: ${widths.length} ступеней, ${rocks} камн. на ступени`}>
      {widths
        .map((width, row) => ({ width, row }))
        .reverse()
        .map(({ width, row }) => {
          const known = Boolean(board[row]);
          const current = activeStep === row;
          return (
            <div key={row} className={'ladder-row' + (current ? ' current' : '')}>
              <span className="ladder-label">{label ? label(row + 1) : row + 1}</span>
              <div className="ladder-cells" style={grid}>
                {Array.from({ length: width }, (_, column) => {
                  const rock = known && board[row].includes(column);
                  const picked = moves[row] === column;
                  const here = picked && row === (lost ? moves.length - 1 : standing - 1);
                  const cls =
                    'ladder-cell' +
                    (known ? (rock ? ' rock' : ' safe') : current ? ' open' : '') +
                    (picked ? ' picked' : '') +
                    (picked && rock ? ' hit' : '');
                  const text = `Ступень ${row + 1}, клетка ${column + 1}${known ? (rock ? ', камень' : ', свободно') : ''}${picked ? ', ваш шаг' : ''}`;
                  const content = (
                    <>
                      {rock && <span className={'rock-shape' + (dropRow === row ? ' falling' : '')} style={{ animationDelay: `${(column % 5) * 45}ms` }} />}
                      {here && <PersonStanding className="climber" size={18} />}
                    </>
                  );
                  const style = { gridColumn: offsets[row] + column + 1 };
                  return onPick && current ? (
                    <button key={column} className={cls} style={style} aria-label={text} disabled={disabled} onClick={() => onPick(column)}>
                      {content}
                    </button>
                  ) : (
                    <span key={column} className={cls} style={style} aria-label={text}>
                      {content}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      <div className="ladder-row start">
        <span className="ladder-label">{label ? label(0) : 'старт'}</span>
        <div className="ladder-cells" style={grid}>
          <span className="ladder-cell start-cell" style={{ gridColumn: `1 / ${columns + 1}` }}>
            {moves.length === 0 && <PersonStanding className="climber" size={20} />}
          </span>
        </div>
      </div>
    </div>
  );
}
