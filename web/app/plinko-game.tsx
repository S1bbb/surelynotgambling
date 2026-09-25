import { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { PlinkoRound, State } from '../lib/models';
import { api, ApiError } from '../lib/api';
import { money, mult, requireAmount } from '../lib/format';
import { binomial, plinkoMultipliers, type PlinkoRisk } from '../lib/verify-games';
import BetAmount from './bet-amount';
import { GameError, PlayButton, Rules, Segmented, StageTop } from './ui';

const W = 640, H = 560, DROP_MS = 1800;
type Ball = { id: string; path: number[]; born: number; round: PlinkoRound };
// Bucket colours from the centre (calm) to the edges (hot).
const heat = (i: number, rows: number) => {
  const d = Math.abs(i - rows / 2) / (rows / 2);
  return `hsl(${Math.round(130 - 130 * d)} 85% ${55 - 8 * d}%)`;
};

export default function PlinkoGame({
  state,
  update,
  clientSeed,
  verify,
}: {
  state: State;
  update: (s: State) => void;
  clientSeed: string;
  verify: (r: PlinkoRound) => void;
}) {
  const [amount, setAmount] = useState('1');
  const [rows, setRows] = useState(8);
  const [risk, setRisk] = useState<PlinkoRisk>('medium');
  const [balls, setBalls] = useState<Ball[]>([]);
  const [landed, setLanded] = useState<PlinkoRound[]>([]);
  const [now, setNow] = useState(0);
  const [error, setError] = useState('');
  const inFlight = useRef(0);
  const flying = balls.length > 0;
  useEffect(() => {
    if (!flying) return;
    let frame = 0;
    const tick = () => {
      setNow(performance.now());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [flying]);
  const multipliers = plinkoMultipliers(rows, risk, state.rtpBps);
  const gap = (W - 80) / (rows + 2);
  // Row r has r + 3 pegs; after j bounces with s rights the ball is at (s − j/2)·gap from centre.
  const pegX = (row: number, k: number) => W / 2 + (k - (row + 2) / 2) * gap;
  const pegY = (row: number) => 50 + row * ((H - 140) / Math.max(1, rows - 1));
  // Several balls may fly at once; every drop is its own idempotent request.
  async function drop() {
    if (inFlight.current >= 10) return;
    let body;
    try {
      body = { requestId: crypto.randomUUID(), amount: requireAmount(amount, state.balance), rows, risk, clientSeed, version: state.version, commitment: state.commitment };
    } catch (e) {
      return setError(e instanceof Error ? e.message : 'Ошибка');
    }
    inFlight.current++;
    setError('');
    try {
      const response = await api<{ round: PlinkoRound; state: State }>('plinko', body);
      update(response.state);
      const round = response.round;
      setBalls((b) => [...b, { id: round.id, path: round.path, born: performance.now(), round }]);
      // The ball lands after its flight: move it from the board to the feed.
      setTimeout(() => {
        setBalls((b) => b.filter((x) => x.id !== round.id));
        setLanded((l) => [round, ...l].slice(0, 12));
      }, DROP_MS);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Связь прервалась: шарик не брошен или уже учтён — проверьте историю.');
      if (e instanceof ApiError) update(await api('state'));
    } finally {
      inFlight.current--;
    }
  }
  // Ball position along its recorded path: top, each peg row in turn, then the bucket.
  function position(ball: Ball) {
    const n = ball.path.length;
    const t = Math.min(1, (now - ball.born) / DROP_MS) * (n + 1);
    const stage = Math.min(Math.floor(t), n), frac = Math.min(1, t - stage);
    const at = (j: number) => {
      if (j === 0) return { x: W / 2, y: 14 };
      const bounces = j - 1, rights = ball.path.slice(0, bounces).reduce((a, b) => a + b, 0);
      return { x: W / 2 + (rights - bounces / 2) * gap, y: bounces < n ? pegY(bounces) - 12 : H - 60 };
    };
    const p = at(stage), q = at(Math.min(stage + 1, n + 1));
    return { x: p.x + (q.x - p.x) * frac, y: p.y + (q.y - p.y) * frac - Math.sin(frac * Math.PI) * 8 };
  }
  const ballRound = balls.length ? null : landed[0];
  return (
    <>
      <section className="game-panel">
        <div className="bet-panel">
          <BetAmount id="plinko-amount" value={amount} onChange={setAmount} balance={state.balance} />
          <Segmented label="Риск" value={risk} disabled={balls.length > 0} onChange={setRisk} options={[{ value: 'low', label: 'Низкий' }, { value: 'medium', label: 'Средний' }, { value: 'high', label: 'Высокий' }]} />
          <div className="field">
            <label htmlFor="plinko-rows">
              Рядов <span>{rows}</span>
            </label>
            <input id="plinko-rows" className="range" type="range" min="8" max="16" value={rows} disabled={balls.length > 0} onChange={(e) => setRows(Number(e.target.value))} />
          </div>
          <PlayButton onClick={() => void drop()}>Бросить шарик</PlayButton>
          <p className="bet-footnote">Можно бросать несколько шариков подряд</p>
          <Rules>
            На каждом из {rows} рядов шарик отскакивает влево или вправо с шансом
            50/50, поэтому лунка k выпадает с вероятностью C({rows}, k) / 2^{rows}.
            Таблица множителей масштабирована так, что Σ P(k) × множитель(k) =
            RTP {state.rtpBps / 100}% в точности; выплата округляется вниз до 0.01 CR.
          </Rules>
        </div>
        <div className="stage stage-plinko">
          <StageTop title="ПЛИНКО" right={<span className="muted">{risk === 'low' ? 'низкий' : risk === 'medium' ? 'средний' : 'высокий'} риск</span>} />
          <svg className="plinko-board" viewBox={`0 0 ${W} ${H}`} aria-label={`Плинко, ${rows} рядов`}>
            {Array.from({ length: rows }, (_, row) =>
              Array.from({ length: row + 3 }, (_, k) => <circle key={`${row}-${k}`} cx={pegX(row, k)} cy={pegY(row)} r={Math.max(4, 9 - rows / 3)} className="peg" />),
            )}
            {multipliers.map((m, i) => {
              const x = W / 2 + (i - rows / 2) * gap;
              const lit = landed[0]?.bucket === i && landed[0]?.rows === rows && !balls.length;
              return (
                <g key={i} className={'bucket' + (lit ? ' lit' : '')}>
                  <title>{`Шанс ${((binomial(rows, i) / 2 ** rows) * 100).toFixed(4)}%`}</title>
                  <rect x={x - gap / 2 + 2} y={H - 46} width={gap - 4} height={34} rx="6" style={{ fill: heat(i, rows) }} />
                  <text x={x} y={H - 24} textAnchor="middle" style={{ fontSize: Math.min(14, gap / 3.3) }}>
                    {m >= 100 ? Math.floor(m) : m >= 10 ? mult(m).replace(/,d+$/, '') : mult(m)}
                  </text>
                </g>
              );
            })}
            {balls.map((b) => {
              const p = position(b);
              return <circle key={b.id} cx={p.x} cy={p.y} r={Math.max(6, 11 - rows / 3)} className="ball" />;
            })}
          </svg>
          <div className="plinko-feed">
            {landed.map((r) => (
              <span key={r.id} className={r.payout >= r.amount ? 'win' : 'lose'}>×{mult(r.multiplier)} · {money(r.payout)}</span>
            ))}
          </div>
          {ballRound && (
            <button className="text-button stage-verify" onClick={() => verify(ballRound)}>
              <ShieldCheck size={16} /> Проверить последний шарик
            </button>
          )}
        </div>
      </section>
      <GameError error={error} />
    </>
  );
}
