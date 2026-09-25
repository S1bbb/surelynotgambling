import { useState } from 'react';
import { ChevronsUp, ShieldCheck, Wallet } from 'lucide-react';
import type { State, UpgradeRound } from '../lib/models';
import { money, mult, parseAmount, pct, requireAmount } from '../lib/format';
import { useGameAction } from '../lib/use-game';
import { UPGRADE_SPACE, upgradeOutcomes } from '../lib/verify-games';
import BetAmount from './bet-amount';
import { GameError, PlayButton, Rules } from './ui';

const SPIN_MS = 4500, C = 160, R = 128;
const point = (deg: number, r = R) => [C + r * Math.sin((deg * Math.PI) / 180), C - r * Math.cos((deg * Math.PI) / 180)];
function arc(from: number, to: number) {
  if (to - from >= 359.99) return `M ${C} ${C - R} A ${R} ${R} 0 1 1 ${C - 0.01} ${C - R}`;
  const [x1, y1] = point(from), [x2, y2] = point(to);
  return `M ${x1} ${y1} A ${R} ${R} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
}

export default function UpgradeGame({
  state,
  update,
  clientSeed,
  verify,
}: {
  state: State;
  update: (s: State) => void;
  clientSeed: string;
  verify: (r: UpgradeRound) => void;
}) {
  const [amount, setAmount] = useState('10');
  const [factor, setFactor] = useState('2');
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [last, setLast] = useState<UpgradeRound | null>(null);
  const { busy, error, retry, send } = useGameAction((s) => setTimeout(() => update(s), SPIN_MS));
  const stake = parseAmount(amount) ?? 0;
  const m = Number(factor.replace(',', '.'));
  const target = Math.round(stake * m);
  const valid = stake >= 100 && Number.isFinite(m) && target * 10 >= stake * 11 && target <= stake * 1000;
  const outcomes = valid ? upgradeOutcomes(stake, target, state.rtpBps) : 0;
  const chance = outcomes / UPGRADE_SPACE;
  const shownChance = last && !spinning ? last.outcomes / UPGRADE_SPACE : chance;
  const start = 180 - shownChance * 180; // the win zone is centred at the bottom
  const locked = busy || retry || spinning;
  async function play() {
    const round = await send<UpgradeRound>('upgrade', () => {
      const cents = requireAmount(amount, state.balance);
      if (!valid) throw Error('Цель: от ×1.10 до ×1000 от ставки');
      return { requestId: crypto.randomUUID(), amount: cents, target, clientSeed, version: state.version, commitment: state.commitment };
    });
    if (!round) return;
    const zoneStart = 180 - (round.outcomes / UPGRADE_SPACE) * 180;
    const angle = zoneStart + (round.result / UPGRADE_SPACE) * 360;
    setLast(null);
    setSpinning(true);
    setRotation((r) => r - (r % 360) + 360 * 5 + angle);
    setTimeout(() => { setSpinning(false); setLast(round); }, SPIN_MS);
  }
  const result = last && !spinning ? last : null;
  return (
    <>
      <section className="upgrade-panel">
        <div className="upgrade-card">
          <h3>Ставка из баланса</h3>
          <p className="muted">Эта сумма спишется при апгрейде</p>
          <Wallet size={42} className="upgrade-icon" />
          <BetAmount id="upgrade-amount" value={amount} onChange={setAmount} balance={state.balance} disabled={locked} />
        </div>
        <div className="upgrade-wheel">
          <svg viewBox="0 0 320 320" aria-label={`Шанс апгрейда ${pct(shownChance)}`}>
            <defs>
              <linearGradient id="zone" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#ffd93d" />
                <stop offset="1" stopColor="#ff5b3a" />
              </linearGradient>
            </defs>
            {Array.from({ length: 60 }, (_, i) => {
              const [x1, y1] = point(i * 6, 150), [x2, y2] = point(i * 6, i % 5 ? 144 : 138);
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="tick" />;
            })}
            <circle cx={C} cy={C} r={R} className="ring" />
            {shownChance > 0 && <path d={arc(start, start + shownChance * 360)} className="zone" stroke="url(#zone)" />}
            <circle cx={C} cy={C} r={R - 34} className="core" />
            <g className="needle" style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? `transform ${SPIN_MS - 300}ms cubic-bezier(0.12, 0.7, 0.1, 1)` : 'none' }}>
              <path d={`M ${C} ${C - R - 16} l -9 -16 h 18 z`} className="needle-head" />
              <line x1={C} y1={C - R + 14} x2={C} y2={C - R - 14} className="needle-line" />
            </g>
          </svg>
          <div className={'wheel-center' + (result ? (result.won ? ' win' : ' lose') : '')} aria-live="polite">
            {result ? (
              <>
                <strong>{result.won ? 'Успех!' : 'Мимо'}</strong>
                <span>{result.won ? `+${money(result.payout)} CR` : `−${money(result.amount)} CR`}</span>
              </>
            ) : (
              <>
                <ChevronsUp size={40} />
                <strong>{pct(shownChance)}</strong>
                <span>шанс</span>
              </>
            )}
          </div>
        </div>
        <div className="upgrade-card">
          <h3>Цель апгрейда</h3>
          <p className="muted">Получите столько при успехе</p>
          <strong className="upgrade-target">{valid ? money(target) : '—'} <small>CR</small></strong>
          <div className="field">
            <label htmlFor="upgrade-factor">
              Множитель <span>×</span>
            </label>
            <div className="amount-input">
              <span className="prefix">×</span>
              <input id="upgrade-factor" inputMode="decimal" value={factor} disabled={locked} onChange={(e) => setFactor(e.target.value)} />
            </div>
            <div className="chips">
              {['1.5', '2', '3', '5', '10', '50'].map((f) => (
                <button type="button" key={f} className={f === factor ? 'chosen' : ''} disabled={locked} onClick={() => setFactor(f)}>×{f}</button>
              ))}
            </div>
          </div>
        </div>
      </section>
      <div className="upgrade-actions">
        <PlayButton disabled={busy || spinning} onClick={() => void play()}>
          {retry ? 'Повторить запрос' : spinning ? 'Крутим…' : `Прокачать · шанс ${pct(chance)}`}
        </PlayButton>
        {result && (
          <button className="text-button" onClick={() => verify(result)}>
            <ShieldCheck size={16} /> Проверить апгрейд
          </button>
        )}
        <Rules>
          Выпадает целое число от 0 до 999 999. Выигрыш, если оно меньше W =
          ⌊10⁶ × ставка × RTP / цель⌋, то есть шанс = W / 10⁶ ≈ RTP / множитель.
          Матожидание ≤ ставка × RTP при любой цели. Стрелка показывает выпавшее
          число: зона выигрыша — дуга снизу.
        </Rules>
        {valid && <p className="muted">Множитель ×{mult(target / stake)} · RTP {state.rtpBps / 100}%</p>}
      </div>
      <GameError error={error} />
    </>
  );
}
