import { useEffect, useRef, useState } from 'react';
import { Rocket, ShieldCheck } from 'lucide-react';
import type { CrashRound, State } from '../lib/models';
import { api } from '../lib/api';
import { money, mult, parseAmount, pct, requireAmount } from '../lib/format';
import { useGameAction } from '../lib/use-game';
import { CRASH_GROWTH, CRASH_MAX, crashChance, crashMultiplierAt, crashTimeFor } from '../lib/verify-games';
import BetAmount from './bet-amount';
import { Facts, GameError, PlayButton, Rules, StageTop } from './ui';

const W = 640, H = 300;
function Chart({ elapsed, end, busted, cashout }: { elapsed: number; end: number; busted: boolean; cashout: number | null }) {
  const tMax = Math.max(8000, elapsed * 1.15);
  const mMax = Math.max(2, Math.exp(CRASH_GROWTH * elapsed) * 1.2);
  const x = (t: number) => 40 + (t / tMax) * (W - 60);
  const y = (m: number) => H - 30 - ((m - 1) / (mMax - 1)) * (H - 60);
  const points = Array.from({ length: 61 }, (_, i) => {
    const t = (elapsed * i) / 60;
    return `${x(t).toFixed(1)},${y(Math.exp(CRASH_GROWTH * t)).toFixed(1)}`;
  });
  const ticks = [1, 1 + (mMax - 1) / 3, 1 + (2 * (mMax - 1)) / 3, mMax];
  const cash = cashout ? crashTimeFor(cashout) : null;
  return (
    <svg className={'crash-chart' + (busted ? ' busted' : '')} viewBox={`0 0 ${W} ${H}`}>
      <title>{`График множителя до ×${mult(end / 100)}`}</title>
      {ticks.map((m) => (
        <g key={m}>
          <line x1="40" x2={W - 20} y1={y(m)} y2={y(m)} className="grid" />
          <text x="34" y={y(m) + 4} textAnchor="end">×{m.toFixed(m < 10 ? 1 : 0)}</text>
        </g>
      ))}
      <polygon points={`${x(0)},${y(1)} ${points.join(' ')} ${x(elapsed)},${y(1)}`} className="area" />
      <polyline points={points.join(' ')} className="curve" />
      {cash !== null && cash <= elapsed && <circle cx={x(cash)} cy={y(cashout! / 100)} r="7" className="cash-dot" />}
      <circle cx={x(elapsed)} cy={y(Math.exp(CRASH_GROWTH * elapsed))} r="6" className="head" />
    </svg>
  );
}

export default function CrashGame({
  state,
  update,
  clientSeed,
  verify,
}: {
  state: State;
  update: (s: State) => void;
  clientSeed: string;
  verify: (r: CrashRound) => void;
}) {
  const [amount, setAmount] = useState('10');
  const [auto, setAuto] = useState(true);
  const [target, setTarget] = useState('2.00');
  const [last, setLast] = useState<CrashRound | null>(() => (state.rounds.find((r) => r.game === 'crash') as CrashRound | undefined) ?? null);
  // Estimated server clock, advanced every animation frame while the rocket flies.
  const [serverTime, setServerTime] = useState(0);
  const { busy, error, retry, send, setError } = useGameAction(update);
  const offset = useRef(0);
  useEffect(() => { offset.current = state.serverNow - Date.now(); }, [state.serverNow]);
  const active = state.activeCrash;
  const activeId = active?.id;
  // Animation frame + polling: the server decides when the round ends.
  useEffect(() => {
    if (!activeId) return;
    let frame = 0, stopped = false;
    const tick = () => { setServerTime(Date.now() + offset.current); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    const poll = setInterval(async () => {
      try {
        const view = await api<{ serverNow: number; activeCrash: CrashRound | null; last: CrashRound | null }>('crash');
        offset.current = view.serverNow - Date.now();
        if (!view.activeCrash && !stopped) {
          stopped = true;
          setLast(view.last);
          update(await api('state'));
        }
      } catch {
        /* Temporary network errors: the next poll retries. */
      }
    }, 250);
    return () => { cancelAnimationFrame(frame); clearInterval(poll); };
  }, [activeId, update]);
  const targetCents = Math.round(Number(target.replace(',', '.')) * 100);
  const targetValid = Number.isInteger(targetCents) && targetCents >= 101 && targetCents <= CRASH_MAX;
  const stake = active?.amount ?? parseAmount(amount) ?? 0;
  const elapsed = active ? Math.max(0, serverTime - active.startedAt) : 0;
  const live = active ? crashMultiplierAt(elapsed) : 0;
  const locked = busy || retry;
  async function start() {
    const round = await send<CrashRound>('crash/start', () => {
      if (auto && !targetValid) throw Error('Автовывод: от ×1.01 до ×1000');
      return { requestId: crypto.randomUUID(), amount: requireAmount(amount, state.balance), target: auto ? targetCents : null, clientSeed, version: state.version, commitment: state.commitment };
    });
    if (round?.status === 'active') setLast(null);
  }
  async function cashout() {
    if (!active) return;
    if (live < 101) return setError('Вывод доступен с ×1.01');
    const round = await send<CrashRound>('crash/cashout', { roundId: active.id });
    if (round) setLast(round);
  }
  const history = state.rounds.filter((r): r is CrashRound => r.game === 'crash').slice(0, 12);
  const endpoint = last?.crashPoint ?? 100;
  const finishedElapsed = last ? crashTimeFor(Math.min(endpoint, CRASH_MAX)) : 0;
  return (
    <>
      <section className="game-panel">
        <div className="bet-panel">
          <BetAmount id="crash-amount" value={active ? String(active.amount / 100) : amount} onChange={setAmount} balance={state.balance} disabled={Boolean(active) || locked} />
          <div className="field">
            <label className="toggle">
              <input type="checkbox" checked={auto} disabled={Boolean(active) || locked} onChange={(e) => setAuto(e.target.checked)} />
              Автовывод на множителе
            </label>
            <div className="amount-input">
              <span className="prefix">×</span>
              <input aria-label="Множитель автовывода" inputMode="decimal" value={target} disabled={!auto || Boolean(active) || locked} onChange={(e) => setTarget(e.target.value)} />
            </div>
            <div className="chips">
              {['1.50', '2.00', '3.00', '5.00', '10.00'].map((t) => (
                <button type="button" key={t} className={t === target ? 'chosen' : ''} disabled={!auto || Boolean(active) || locked} onClick={() => setTarget(t)}>
                  ×{Number(t)}
                </button>
              ))}
            </div>
          </div>
          <Facts
            items={
              auto && targetValid
                ? [
                    ['Шанс дойти до ×' + mult(targetCents / 100), pct(crashChance(active?.rtpBps ?? state.rtpBps, targetCents))],
                    ['Выплата', money(Math.floor((stake * targetCents) / 100)) + ' CR'],
                    ['Мгновенный краш ×1.00', pct(1 - crashChance(state.rtpBps, 101))],
                  ]
                : [
                    ['Шанс дойти до ×2', pct(crashChance(state.rtpBps, 200))],
                    ['Шанс дойти до ×10', pct(crashChance(state.rtpBps, 1000))],
                    ['Мгновенный краш ×1.00', pct(1 - crashChance(state.rtpBps, 101))],
                  ]
            }
          />
          {active ? (
            <PlayButton tone="cashout" disabled={busy} onClick={() => void cashout()}>
              {retry ? 'Повторить запрос' : live < 101 ? 'Взлёт…' : `Забрать ×${mult(live / 100)} · ${money(Math.floor((active.amount * live) / 100))} CR`}
            </PlayButton>
          ) : (
            <PlayButton disabled={busy} onClick={() => void start()}>
              {retry ? 'Повторить запрос' : busy ? 'Запуск…' : 'Сделать ставку'}
            </PlayButton>
          )}
          <Rules>
            Точка краша определяется до старта: P(краш ≥ m) = RTP / m для любого
            m от ×1.01, с вероятностью 1 − RTP/1.01 раунд падает сразу на ×1.00.
            Множитель растёт как e^(0.00006·t), время считает сервер. Вывод на
            множителе m выигрывает, если краш ≥ m; выплата = ставка × m. Любая
            стратегия вывода даёт матожидание RTP.
          </Rules>
        </div>
        <div className="stage stage-crash">
          <StageTop title="КРАШ" right={<Rocket size={16} />} />
          <div className="crash-history">
            {history.map((r) => (
              <span key={r.id} className={(r.crashPoint ?? 0) >= 200 ? 'high' : 'low'}>×{mult((r.crashPoint ?? 100) / 100)}</span>
            ))}
          </div>
          <div className="crash-screen">
            <Chart elapsed={active ? elapsed : finishedElapsed} end={active ? live : endpoint} busted={!active && Boolean(last)} cashout={active ? null : (last?.cashout ?? null)} />
            <div className="crash-value" aria-live="polite">
              {active ? (
                <strong>×{mult(live / 100)}</strong>
              ) : last ? (
                <>
                  <strong className="lose">×{mult(endpoint / 100)}</strong>
                  <span className={last.won ? 'win' : 'lose'}>
                    {last.won ? `Вы забрали ×${mult((last.cashout ?? 0) / 100)} · +${money(last.payout)} CR` : 'Улетел! Ставка сгорела'}
                  </span>
                </>
              ) : (
                <span>Сделайте ставку — ракета стартует сразу</span>
              )}
            </div>
          </div>
          {last && !active && (
            <button className="text-button stage-verify" onClick={() => verify(last)}>
              <ShieldCheck size={16} /> Проверить раунд
            </button>
          )}
        </div>
      </section>
      <GameError error={error} />
    </>
  );
}
