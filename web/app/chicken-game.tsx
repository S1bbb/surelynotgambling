import { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { MinesRound, State } from '../lib/models';
import { money, mult, parseAmount, pct, requireAmount } from '../lib/format';
import { useGameAction } from '../lib/use-game';
import { CHICKEN_DIFFICULTY, MINES_CELLS, minesMultiplier, minesPayout, minesStepChance, type ChickenDifficulty } from '../lib/verify-games';
import BetAmount from './bet-amount';
import { Facts, GameError, PlayButton, Rules, Segmented, StageTop } from './ui';

const LEVELS: { value: ChickenDifficulty; label: string }[] = [
  { value: 'easy', label: 'Лёгкая' },
  { value: 'medium', label: 'Средняя' },
  { value: 'hard', label: 'Сложная' },
  { value: 'daredevil', label: 'Безумная' },
];
const CARS = ['🚕', '🚙', '🚗', '🚐'];

export default function ChickenGame({
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
  const [difficulty, setDifficulty] = useState<ChickenDifficulty>('medium');
  const [last, setLast] = useState<MinesRound | null>(null);
  const { busy, error, retry, send } = useGameAction(update);
  const active = state.activeChicken;
  const shown = active ?? last;
  const level = shown?.difficulty ?? difficulty;
  const cars = CHICKEN_DIFFICULTY[level];
  const lanes = MINES_CELLS - cars;
  const rtpBps = shown?.rtpBps ?? state.rtpBps;
  const hits = shown?.hits ?? 0;
  const lost = shown?.status === 'lost';
  const stake = active?.amount ?? parseAmount(amount) ?? 0;
  const locked = busy || retry;
  const road = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = road.current, lane = box?.children[Math.max(0, hits - 1)] as HTMLElement | undefined;
    if (box && lane) box.scrollTo({ left: lane.offsetLeft - box.clientWidth / 3, behavior: 'smooth' });
  }, [hits, shown?.id]);
  async function act(path: string, body: object | (() => object)) {
    const round = await send<MinesRound>(path, body);
    if (round) setLast(round.status === 'active' ? null : round);
  }
  const cashout = active ? minesPayout(active.amount, active.rtpBps, active.bombs, active.hits) : 0;
  // Where the chicken stands: 0 is the sidewalk, n is lane n; after a hit it lies on the hit lane.
  const position = lost ? hits + 1 : hits;
  return (
    <>
      <section className="game-panel">
        <div className="bet-panel">
          <BetAmount id="chicken-amount" value={active ? String(active.amount / 100) : amount} onChange={setAmount} balance={state.balance} disabled={Boolean(active) || locked} />
          <Segmented label="Сложность" value={level} disabled={Boolean(active) || locked} onChange={(d) => { setDifficulty(d); setLast(null); }} options={LEVELS.map((l) => ({ ...l, hint: `${CHICKEN_DIFFICULTY[l.value]} машин на 25 слотов` }))} />
          <Facts
            items={[
              ['Шанс перейти полосу', hits < lanes && !lost ? pct(minesStepChance(cars, hits)) : '—'],
              ['Сейчас', active?.hits ? '×' + mult(minesMultiplier(rtpBps, cars, active.hits)) : '—'],
              ['Следующая полоса', hits < lanes ? money(minesPayout(stake, rtpBps, cars, (active?.hits ?? 0) + 1)) + ' CR' : '—'],
            ]}
          />
          {active ? (
            <>
              <PlayButton disabled={busy} onClick={() => void act('chicken/step', { roundId: active.id, step: active.moves.length })}>
                {retry ? 'Повторить запрос' : busy ? 'Идём…' : `Перейти полосу ${active.hits + 1}`}
              </PlayButton>
              <button type="button" className="secondary-button cash" disabled={locked || active.hits === 0} onClick={() => void act('chicken/cashout', { roundId: active.id, hits: active.hits })}>
                Забрать {money(cashout)} CR
              </button>
            </>
          ) : (
            <PlayButton disabled={busy} onClick={() => { setLast(null); void act('chicken/start', () => ({ requestId: crypto.randomUUID(), amount: requireAmount(amount, state.balance), difficulty, clientSeed, commitment: state.commitment, version: state.version })); }}>
              {retry ? 'Повторить запрос' : busy ? 'Начинаем…' : 'Начать игру'}
            </PlayButton>
          )}
          <Rules>
            Перед стартом 25 «слотов» дороги получают машины: 1, 3, 5 или 10 по
            сложности, все расклады равновероятны. Курица переходит полосы по
            порядку; полос столько, сколько свободных слотов. Шанс перейти полосу
            n = (25 − машины − n + 1) / (25 − n + 1). Множитель = RTP / шанс
            дойти до полосы, забрать можно после любой полосы.
          </Rules>
        </div>
        <div className="stage stage-chicken">
          <StageTop title="КУРОЧКА" right={<span className="muted">{active ? `${active.hits} / ${lanes}` : `${lanes} полос`}</span>} />
          <div className="road-wrap">
            <div className="sidewalk">
              {position === 0 && <span className="chicken">🐔</span>}
            </div>
            <div className="road" ref={road}>
              {Array.from({ length: lanes }, (_, i) => {
                const lane = i + 1;
                const passed = lane <= hits;
                const crashed = lost && lane === hits + 1;
                return (
                  <div key={lane} className={'lane' + (passed ? ' passed' : '') + (lane === hits + 1 && active ? ' next' : '') + (crashed ? ' crashed' : '')}>
                    {crashed && <span className="car">{CARS[i % CARS.length]}</span>}
                    <span className="manhole">x{mult(minesMultiplier(rtpBps, cars, lane))}</span>
                    {position === lane && <span className={'chicken' + (crashed ? ' flat' : '')}>{crashed ? '💥' : '🐔'}</span>}
                    {passed && position !== lane && <span className="barrier" />}
                  </div>
                );
              })}
              <div className="finish">🏁</div>
            </div>
          </div>
          <output className="stage-status" aria-live="polite">
            {last
              ? last.status === 'lost'
                ? `Курицу сбили на полосе ${last.hits + 1}`
                : `Выплата ${money(last.payout)} CR · ×${mult(last.multiplier)}`
              : active
                ? `Шанс пройти следующую полосу — ${pct(minesStepChance(cars, hits))}`
                : 'Выберите сложность и начните'}
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
