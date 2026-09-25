import { useState } from 'react';
import { Shuffle, ShieldCheck } from 'lucide-react';
import type { LadderRound, State } from '../lib/models';
import { money, mult, parseAmount, pct, requireAmount } from '../lib/format';
import { useGameAction } from '../lib/use-game';
import { LADDER_SPECS, ladderMultiplier, ladderPayout, ladderReach } from '../lib/verify-ladder';
import BetAmount from './bet-amount';
import LadderBoard from './ladder-board';
import { Facts, GameError, PlayButton, Rules, Segmented, StageTop } from './ui';

const widthsOf = (r: LadderRound) => r.widths ?? LADDER_SPECS[r.protocol].widths;

export default function LadderGame({
  state,
  update,
  clientSeed,
  verify,
}: {
  state: State;
  update: (s: State) => void;
  clientSeed: string;
  verify: (round: LadderRound) => void;
}) {
  const [amount, setAmount] = useState('10');
  const [rocks, setRocks] = useState(1);
  const [last, setLast] = useState<LadderRound | null>(null);
  const [dropRow, setDropRow] = useState<number | undefined>();
  const { busy, error, retry, send } = useGameAction(update);
  const active = state.activeLadder;
  const shown = active ?? last;
  const widths = shown ? widthsOf(shown) : LADDER_SPECS['stairs-v2'].widths;
  const count = shown?.rocks ?? rocks;
  const rtpBps = shown?.rtpBps ?? state.rtpBps;
  const stake = active?.amount ?? parseAmount(amount) ?? 0;
  const level = active?.steps ?? 0;
  const locked = busy || retry;
  async function act(path: string, body: object | (() => object), row?: number) {
    const round = await send<LadderRound>(path, body);
    if (!round) return;
    setDropRow(row);
    setLast(round.status === 'active' ? null : round);
  }
  function start() {
    setLast(null);
    void act('ladder/start', () => ({
      requestId: crypto.randomUUID(),
      amount: requireAmount(amount, state.balance),
      rocks,
      clientSeed,
      commitment: state.commitment,
      version: state.version,
    }));
  }
  const pick = (column: number) =>
    active && void act('ladder/step', { roundId: active.id, step: active.steps, column }, active.steps);
  const nextChance = level < widths.length ? (widths[level] - count) / widths[level] : 0;
  const cashout = active ? ladderPayout(active.amount, active.rtpBps, active.rocks, active.steps, widths) : 0;
  const status = active
    ? active.steps === 0
      ? 'Выберите клетку на первой ступени'
      : `Ступень ${active.steps} пройдена · можно забрать ${money(cashout)} CR`
    : last
      ? last.status === 'lost'
        ? `Камень на ступени ${last.steps + 1}. Раунд окончен`
        : last.status === 'completed'
          ? `Вершина! Выплата ${money(last.payout)} CR`
          : `Вы забрали ${money(last.payout)} CR`
      : 'Выберите сумму и число камней';
  return (
    <>
      <section className="game-panel">
        <div className="bet-panel">
          <BetAmount id="ladder-amount" value={active ? String(active.amount / 100) : amount} onChange={setAmount} balance={state.balance} disabled={Boolean(active) || locked} />
          <Segmented
            label="Камней на ступень"
            value={count}
            disabled={Boolean(active) || locked}
            onChange={(n) => { setRocks(n); setLast(null); }}
            options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: n }))}
          />
          <Facts
            items={[
              ['Шанс следующей ступени', level < widths.length ? pct(nextChance) : '—'],
              ['Шанс дойти до вершины', pct(ladderReach(count, widths.length, widths), 4)],
              ['Сейчас', active?.steps ? '×' + mult(ladderMultiplier(rtpBps, count, active.steps, widths)) : '—'],
              ['Следующая', level < widths.length ? money(ladderPayout(stake, rtpBps, count, level + 1, widths)) + ' CR' : '—'],
            ]}
          />
          {active ? (
            <>
              <PlayButton tone="cashout" disabled={busy || active.steps === 0} onClick={() => void act('ladder/cashout', { roundId: active.id, steps: active.steps })}>
                {retry ? 'Повторить запрос' : busy ? 'Считаем…' : `Забрать ${money(cashout)} CR`}
              </PlayButton>
              <button
                type="button"
                className="secondary-button"
                disabled={locked}
                onClick={() => pick(Math.floor(Math.random() * widths[active.steps]))}
              >
                <Shuffle size={16} /> Случайная клетка
              </button>
            </>
          ) : (
            <PlayButton disabled={busy} onClick={start}>
              {retry ? 'Повторить запрос' : busy ? 'Начинаем…' : 'Начать подъём'}
            </PlayButton>
          )}
          <Rules>
            12 ступеней, на ступени n всего 20 − n клеток: чем выше, тем уже.
            На каждую ступень падает выбранное число камней, все расклады
            равновероятны. Шанс пройти ступень = (ширина − камни) / ширина.
            Множитель = RTP / шанс дойти до ступени; выигрыш можно забрать после
            любой ступени, на вершине — автоматически.
          </Rules>
        </div>
        <div className="stage stage-ladder">
          <StageTop title="ЛЕСТНИЦА" right={<span className="muted">{active ? `${active.steps} / ${widths.length}` : `${widths.length} ступеней`}</span>} />
          <output className="stage-status" aria-live="polite">{status}</output>
          <div className="ladder-scroll">
            <LadderBoard
              widths={widths}
              rocks={count}
              moves={shown?.moves ?? []}
              board={active ? active.revealed : (last?.board ?? [])}
              activeStep={active?.steps}
              disabled={locked}
              onPick={pick}
              dropRow={dropRow}
              label={(n) => 'x' + mult(n === 0 ? 1 : ladderMultiplier(rtpBps, count, n, widths))}
            />
          </div>
          {last && (
            <button className="text-button stage-verify" onClick={() => verify(last)}>
              <ShieldCheck size={16} /> Проверить эту лестницу
            </button>
          )}
        </div>
      </section>
      <GameError error={error} />
    </>
  );
}
