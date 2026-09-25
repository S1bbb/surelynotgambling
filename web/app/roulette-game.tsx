import { useLayoutEffect, useRef, useState } from 'react';
import { ShieldCheck, Trash2 } from 'lucide-react';
import type { RouletteRound, State } from '../lib/models';
import { money, mult, parseAmount, pct, requireAmount } from '../lib/format';
import { useGameAction } from '../lib/use-game';
import { ROULETTE_ORDER, rouletteColor, rouletteMultiplier, rouletteWinners, type RouletteTarget } from '../lib/verify-games';
import BetAmount from './bet-amount';
import { GameError, PlayButton, Rules, StageTop } from './ui';

const SPIN_MS = 4200, TILE = 72, COPIES = 8;
const tiles = Array.from({ length: COPIES }, () => ROULETTE_ORDER).flat();
const label = (t: RouletteTarget) => (t === 'red' ? 'Красное' : t === 'black' ? 'Чёрное' : t === 0 ? 'Зелёное 0' : `Число ${t}`);

export default function RouletteGame({
  state,
  update,
  clientSeed,
  verify,
}: {
  state: State;
  update: (s: State) => void;
  clientSeed: string;
  verify: (r: RouletteRound) => void;
}) {
  const [chip, setChip] = useState('10');
  const [bets, setBets] = useState<Map<RouletteTarget, number>>(new Map());
  const [last, setLast] = useState<RouletteRound | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [shift, setShift] = useState<{ x: number; animate: boolean }>({ x: 0, animate: false });
  const track = useRef<HTMLDivElement>(null);
  const stoppedAt = useRef(state.rounds.find((r): r is RouletteRound => r.game === 'roulette')?.result ?? 0);
  // The balance changes when the wheel stops, not when the server answers.
  const { busy, error, retry, send, setError } = useGameAction((s) => setTimeout(() => update(s), SPIN_MS));
  const locked = busy || retry || spinning;
  const total = [...bets.values()].reduce((a, v) => a + v, 0);
  const center = (index: number, jitter = 0) => {
    const width = track.current?.clientWidth ?? 600;
    return -(index * TILE - width / 2 + TILE / 2 + jitter);
  };
  // Open on the most recent result so the pointer matches the history strip.
  useLayoutEffect(() => {
    setShift({ x: center(ROULETTE_ORDER.indexOf(stoppedAt.current) + ROULETTE_ORDER.length), animate: false });
  }, []);
  function add(target: RouletteTarget) {
    const value = parseAmount(chip);
    if (value === null || value < 100 || value > 100000) return setError('Фишка: от 1 до 1 000 CR');
    if (total + value > 100000) return setError('Сумма фишек за спин: до 1 000 CR');
    setError('');
    setBets(new Map(bets).set(target, (bets.get(target) ?? 0) + value));
  }
  async function spin() {
    const round = await send<RouletteRound>('roulette/spin', () => {
      if (!bets.size) throw Error('Поставьте фишку на цвет или число');
      requireAmount(String(total / 100), state.balance);
      return { requestId: crypto.randomUUID(), bets: [...bets].map(([target, amount]) => ({ target, amount })), clientSeed, version: state.version, commitment: state.commitment };
    });
    if (!round) return;
    const from = ROULETTE_ORDER.indexOf(stoppedAt.current) + ROULETTE_ORDER.length;
    stoppedAt.current = round.result;
    const to = ROULETTE_ORDER.indexOf(round.result) + ROULETTE_ORDER.length * (COPIES - 2);
    setSpinning(true);
    setShift({ x: center(from), animate: false });
    requestAnimationFrame(() => requestAnimationFrame(() => setShift({ x: center(to, (Math.random() - 0.5) * TILE * 0.7), animate: true })));
    setTimeout(() => { setSpinning(false); setLast(round); }, SPIN_MS);
  }
  const recent = state.rounds.filter((r): r is RouletteRound => r.game === 'roulette').slice(0, 14);
  const board: RouletteTarget[] = ['red', 0, 'black'];
  return (
    <>
      <section className="game-panel">
        <div className="bet-panel">
          <BetAmount id="roulette-chip" label="Номинал фишки" value={chip} onChange={setChip} balance={state.balance} disabled={locked} />
          <div className="placed">
            <div className="placed-head">
              <span>Ваши фишки</span>
              <button type="button" className="text-button" disabled={locked || !bets.size} onClick={() => setBets(new Map())}>
                <Trash2 size={14} /> Очистить
              </button>
            </div>
            {bets.size ? (
              [...bets].map(([t, v]) => (
                <div key={String(t)} className="placed-row">
                  <span className={'dot ' + (typeof t === 'number' ? rouletteColor(t) : t)} />
                  {label(t)}
                  <strong>{money(v)}</strong>
                </div>
              ))
            ) : (
              <p className="muted">Нажмите на цвет или число на поле</p>
            )}
            <div className="placed-row total">
              Всего <strong>{money(total)} CR</strong>
            </div>
          </div>
          <PlayButton disabled={busy || spinning} onClick={() => void spin()}>
            {retry ? 'Повторить запрос' : spinning ? 'Крутится…' : `Крутить · ${money(total)} CR`}
          </PlayButton>
          <Rules>
            Выпадает число от 0 до 14, все 15 равновероятны. 1–7 — красные, 8–14
            — чёрные, 0 — зелёное. Цвет: шанс 7/15, выплата ставка × RTP × 15/7.
            Число: шанс 1/15, выплата ставка × RTP × 15. Можно ставить на
            несколько полей за один спин.
          </Rules>
        </div>
        <div className="stage stage-roulette">
          <StageTop title="РУЛЕТКА 0–14" right={<span className="muted">RTP {state.rtpBps / 100}%</span>} />
          <div className="recent-results">
            {recent.map((r) => (
              <span key={r.id} className={'ball ' + rouletteColor(r.result)}>{r.result}</span>
            ))}
          </div>
          <div className="wheel" ref={track}>
            <div className="wheel-pointer" />
            <div className="wheel-track" style={{ transform: `translateX(${shift.x}px)`, transition: shift.animate ? `transform ${SPIN_MS - 200}ms cubic-bezier(0.1, 0.75, 0.15, 1)` : 'none' }}>
              {tiles.map((n, i) => (
                <span key={i} className={'wheel-tile ' + rouletteColor(n)} style={{ width: TILE - 6 }}>{n}</span>
              ))}
            </div>
          </div>
          <output className="stage-status" aria-live="polite">
            {spinning ? 'Крутим…' : last ? `Выпало ${last.result} · ${last.payout ? `выплата ${money(last.payout)} CR` : 'ставки не сыграли'}` : 'Сделайте ставки'}
          </output>
          <div className="color-bets">
            {board.map((t) => (
              <button key={String(t)} type="button" className={'color-bet ' + (t === 0 ? 'green' : t)} disabled={locked} onClick={() => add(t)}>
                <strong>{label(t)}</strong>
                <span>×{mult(rouletteMultiplier(t, state.rtpBps))} · шанс {pct(rouletteWinners(t) / 15)}</span>
                {bets.get(t) ? <em>{money(bets.get(t)!)}</em> : null}
              </button>
            ))}
          </div>
          <div className="number-bets">
            {Array.from({ length: 15 }, (_, n) => (
              <button key={n} type="button" className={'number-bet ' + rouletteColor(n) + (last?.result === n && !spinning ? ' hit' : '')} disabled={locked} onClick={() => add(n)} aria-label={`Ставка на число ${n}, ×${mult(rouletteMultiplier(n, state.rtpBps))}`}>
                {n}
                {bets.get(n) ? <em>{money(bets.get(n)!)}</em> : null}
              </button>
            ))}
          </div>
          {last && !spinning && (
            <button className="text-button stage-verify" onClick={() => verify(last)}>
              <ShieldCheck size={16} /> Проверить спин
            </button>
          )}
        </div>
      </section>
      <GameError error={error} />
    </>
  );
}
