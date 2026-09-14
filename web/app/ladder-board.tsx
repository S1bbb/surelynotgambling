import { Mountain, Footprints, LockKeyhole } from 'lucide-react';

export default function LadderBoard({
  rocks,
  moves,
  board,
  activeStep,
  disabled,
  onPick,
  multiplier,
}: {
  rocks: number;
  moves: number[];
  board: number[][];
  activeStep?: number;
  disabled?: boolean;
  onPick?: (column: number) => void;
  multiplier?: (step: number) => string;
}) {
  return (
    <div
      className="ladder-board"
      aria-label={`Лестница: 8 ступеней, ${rocks} камней на ступени`}
    >
      {Array.from({ length: 8 }, (_, i) => 7 - i).map((row) => (
        <div
          key={row}
          className={'ladder-row ' + (activeStep === row ? 'current-step' : '')}
        >
          <span className="ladder-row-number">{row + 1}</span>
          <div className="ladder-cells">
            {[0, 1, 2, 3, 4].map((column) => {
              const known = Boolean(board[row]);
              const rock = known && board[row].includes(column);
              const picked = moves[row] === column;
              const className =
                'ladder-cell ' +
                (known ? (rock ? 'rock-cell' : 'safe-cell') : 'hidden-cell') +
                (picked ? ' picked-cell' : '');
              const label = `Ступень ${row + 1}, клетка ${column + 1}${known ? (rock ? ', камень' : ', безопасно') : ''}${picked ? ', ваш выбор' : ''}`;
              const content = rock ? (
                <Mountain className={picked ? 'falling-rock' : ''} size={22} />
              ) : picked ? (
                <Footprints size={22} />
              ) : activeStep === row ? (
                <span>↑</span>
              ) : known ? (
                <span>·</span>
              ) : (
                <LockKeyhole size={14} />
              );
              return onPick ? (
                <button
                  key={column}
                  className={className}
                  aria-label={label}
                  disabled={disabled || activeStep !== row}
                  onClick={() => onPick(column)}
                >
                  {content}
                </button>
              ) : (
                <span key={column} className={className} aria-label={label}>
                  {content}
                </span>
              );
            })}
          </div>
          <span className="ladder-row-multiplier">
            {multiplier ? '×' + multiplier(row + 1) : ''}
          </span>
        </div>
      ))}
      <div className="ladder-column-labels">
        <span />
        {[1, 2, 3, 4, 5].map((col) => (
          <span key={col}>{col}</span>
        ))}
        <span />
      </div>
    </div>
  );
}
