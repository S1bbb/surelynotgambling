import { useEffect, useRef, useState } from 'react';
import { Bomb, Gem, Shuffle, ShieldCheck, Zap } from 'lucide-react';
import type { MinesRound, State } from '../lib/models';
import { money, mult, parseAmount, pct, requireAmount } from '../lib/format';
import { useGameAction } from '../lib/use-game';
import { MINES_CELLS, minesMultiplier, minesPayout, minesStepChance } from '../lib/verify-games';
import BetAmount from './bet-amount';
import { Facts, GameError, PlayButton, Rules, StageTop } from './ui';

export default function MinesGame({
  state,
  update,
  clientSeed,
  verify,
}: {
  state: State;
  update: (s: State) => void;
  clientSeed: string;
  verify: (r: MinesRound) => void;
}) {
  const [amount, setAmount] = useState('10');
  const [bombs, setBombs] = useState(3);
  const [last, setLast] = useState<MinesRound | null>(null);
  const { busy, error, retry, send } = useGameAction(update);
  const active = state.activeMines;
  const shown = active ?? last;
  const count = shown?.bombs ?? bombs;
  const rtpBps = shown?.rtpBps ?? state.rtpBps;
  const hits = active?.hits ?? 0;
  const stake = active?.amount ?? parseAmount(amount) ?? 0;
  const locked = busy || retry;
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = strip.current, chip = box?.children[hits] as HTMLElement | undefined;
    if (box && chip) box.scrollTo({ left: chip.offsetLeft - box.clientWidth / 2 + chip.clientWidth / 2, behavior: 'smooth' });
  }, [hits, count]);
  async function act(path: string, body: object | (() => object)) {
    const round = await send<MinesRound>(path, body);
    if (round) setLast(round.status === 'active' ? null : round);
  }
  const open = (cell: number) =>
    active && void act('mines/step', { roundId: active.id, step: active.moves.length, cell });
  const closed = active ? [...Array(MINES_CELLS).keys()].filter((c) => !active.moves.includes(c)) : [];
  const cashout = active ? minesPayout(active.amount, active.rtpBps, active.bombs, active.hits) : 0;
  const maxHits = MINES_CELLS - count;
  return (
    <>
      <section className="game-panel">
        <div className="bet-panel">
          <BetAmount id="mines-amount" value={active ? String(active.amount / 100) : amount} onChange={setAmount} balance={state.balance} disabled={Boolean(active) || locked} />
          <div className="field">
            <label htmlFor="mines-bombs">
              Бомб на поле <span>{count}</span>
            </label>
            <input id="mines-bombs" className="range" type="range" min="1" max="24" value={count} disabled={Boolean(active) || locked} onChange={(e) => { setBombs(Number(e.target.value)); setLast(null); }} />
            <div className="chips">
              {[1, 3, 5, 10, 24].map((n) => (
                <button type="button" key={n} className={n === count ? 'chosen' : ''} disabled={Boolean(active) || locked} onClick={() => { setBombs(n); setLast(null); }}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <Facts
            items={[
              ['Шанс следующего алмаза', hits < maxHits ? pct(minesStepChance(count, hits)) : '—'],
              ['Сейчас', hits ? '×' + mult(minesMultiplier(rtpBps, count, hits)) : '—'],
              ['Следующий', hits < maxHits ? money(minesPayout(stake, rtpBps, count, hits + 1)) + ' CR' : '—'],
            ]}
          />
          {active ? (
            <>
              <PlayButton tone="cashout" disabled={busy || active.hits === 0} onClick={() => void act('mines/cashout', { roundId: active.id, hits: active.hits })}>
                {retry ? 'Повторить запрос' : busy ? 'Считаем…' : `Забрать ${money(cashout)} CR`}
              </PlayButton>
              <button type="button" className="secondary-button" disabled={locked} onClick={() => open(closed[Math.floor(Math.random() * closed.length)])}>
                <Shuffle size={16} /> Случайная клетка
              </button>
            </>
          ) : (
            <PlayButton disabled={busy} onClick={() => { setLast(null); void act('mines/start', () => ({ requestId: crypto.randomUUID(), amount: requireAmount(amount, state.balance), bombs, clientSeed, commitment: state.commitment, version: state.version })); }}>
              {retry ? 'Повторить запрос' : busy ? 'Начинаем…' : 'Начать игру'}
            </PlayButton>
          )}
          <Rules>
            На поле 25 клеток, из них выбранное число — бомбы; все расклады
            равновероятны. Открывайте клетки: после n алмазов шанс следующего =
            (25 − бомбы − n) / (25 − n). Множитель = RTP × C(25, n) / C(25 −
            бомбы, n). Забрать выигрыш можно после любого алмаза.
          </Rules>
        </div>
        <div className="stage stage-mines">
          <StageTop title="МИНЁР" right={<span className="muted">{active ? `${active.hits} / ${maxHits} алмазов` : `${maxHits} алмазов`}</span>} />
          <div className="mines-layout">
            <div className="mines-side gems">
              <span>АЛМАЗЫ</span>
              <Gem size={30} />
              <strong>{maxHits - hits}</strong>
            </div>
            <div className="mines-grid" aria-label="Поле 5 на 5">
              {Array.from({ length: MINES_CELLS }, (_, cell) => {
                const picked = shown?.moves.includes(cell);
                const bomb = shown?.board?.includes(cell);
                const known = picked || Boolean(shown?.board);
                const cls = 'mine-cell' + (known ? (bomb ? ' bomb' : ' gem') : '') + (picked ? ' picked' : '') + (picked && bomb ? ' hit' : '') + (active && !picked ? ' live' : '');
                return (
                  <button key={cell} type="button" className={cls} disabled={!active || picked || locked} aria-label={`Клетка ${cell + 1}${known ? (bomb ? ', бомба' : ', алмаз') : ''}`} onClick={() => open(cell)}>
                    {known && (bomb ? <Bomb size={26} /> : <Gem size={26} />)}
                  </button>
                );
              })}
            </div>
            <div className="mines-side bombs">
              <span>БОМБЫ</span>
              <Bomb size={30} />
              <strong>{count}</strong>
            </div>
          </div>
          <div className="hit-strip" ref={strip}>
            {Array.from({ length: maxHits }, (_, i) => (
              <div key={i} className={'hit-chip' + (i === hits && active ? ' current' : '') + (i < hits ? ' done' : '')}>
                <Zap size={14} />
                <strong>x{mult(minesMultiplier(rtpBps, count, i + 1))}</strong>
                <small>{i + 1} Hit</small>
              </div>
            ))}
          </div>
          <output className="stage-status" aria-live="polite">
            {last ? (last.status === 'lost' ? 'Бомба! Раунд окончен' : `Выплата ${money(last.payout)} CR · ×${mult(last.multiplier)}`) : active ? 'Открывайте клетки' : ' '}
          </output>
          {last && (
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
