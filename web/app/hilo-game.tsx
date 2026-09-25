import { useState } from 'react';
import { ArrowDown, ArrowUp, ShieldCheck } from 'lucide-react';
import type { HiLoRound, State } from '../lib/models';
import { money, mult, parseAmount, pct, requireAmount } from '../lib/format';
import { useGameAction } from '../lib/use-game';
import BetAmount from './bet-amount';
import { Facts, GameError, PlayButton, Rules, Segmented, StageTop } from './ui';

export default function HiLoGame({
  state,
  update,
  clientSeed,
  verify,
}: {
  state: State;
  update: (s: State) => void;
  clientSeed: string;
  verify: (r: HiLoRound) => void;
}) {
  const [amount, setAmount] = useState('10');
  const [threshold, setThreshold] = useState(50);
  const [direction, setDirection] = useState<'under' | 'over'>('under');
  const [last, setLast] = useState<HiLoRound | null>(null);
  const { busy, error, retry, send } = useGameAction(update);
  const outcomes = direction === 'under' ? threshold * 100 : 10000 - threshold * 100;
  const chance = outcomes / 10000;
  const stake = parseAmount(amount) ?? 0;
  const win = Math.floor((stake * state.rtpBps) / outcomes);
  const locked = busy || retry;
  async function play() {
    const round = await send<HiLoRound>('bets', () => ({
      requestId: crypto.randomUUID(),
      amount: requireAmount(amount, state.balance),
      threshold,
      direction,
      clientSeed,
      version: state.version,
      commitment: state.commitment,
    }));
    if (round) setLast(round);
  }
  const zone = direction === 'under' ? `ниже ${threshold}.00` : `от ${threshold}.00`;
  return (
    <>
      <section className="game-panel">
        <div className="bet-panel">
          <BetAmount id="hilo-amount" value={amount} onChange={setAmount} balance={state.balance} disabled={locked} />
          <Segmented
            label="Ваш прогноз"
            value={direction}
            disabled={locked}
            onChange={setDirection}
            options={[
              { value: 'under', label: <><ArrowDown size={16} /> Меньше</> },
              { value: 'over', label: <><ArrowUp size={16} /> Больше</> },
            ]}
          />
          <div className="field">
            <label htmlFor="hilo-threshold">
              Порог <span>{threshold}</span>
            </label>
            <input
              id="hilo-threshold"
              className="range"
              type="range"
              min="5"
              max="95"
              value={threshold}
              disabled={locked}
              onChange={(e) => setThreshold(Number(e.target.value))}
            />
          </div>
          <Facts
            items={[
              ['Шанс', pct(chance)],
              ['Множитель', '×' + mult(state.rtpBps / outcomes)],
              ['Выплата', money(win) + ' CR'],
            ]}
          />
          <PlayButton onClick={() => void play()} disabled={busy}>
            {busy ? 'Бросаем…' : retry ? 'Повторить запрос' : 'Бросить'}
          </PlayButton>
          <Rules>
            Выпадает число от 0.00 до 99.99, все 10 000 значений равновероятны.
            «Меньше» выигрывает строго ниже порога, «Больше» — на пороге и выше.
            Выплата = ставка × RTP / шанс, с округлением вниз до 0.01 CR.
          </Rules>
        </div>
        <div className="stage stage-hilo">
          <StageTop title="HI-LO" right={<span className="muted">RTP {state.rtpBps / 100}%</span>} />
          <div className="number-display" aria-live="polite">
            <span>{last ? (last.won ? 'ПОБЕДА' : 'НЕ ПОВЕЗЛО') : 'СЛЕДУЮЩЕЕ ЧИСЛО'}</span>
            <div className={'big-number ' + (last ? (last.won ? 'win' : 'lose') : '')}>
              {last ? (last.result / 100).toFixed(2) : '??.??'}
            </div>
            <div className="number-caption">
              {last
                ? last.won
                  ? `+${money(last.payout)} CR`
                  : `−${money(last.amount)} CR`
                : `Ваша зона: ${zone}`}
            </div>
          </div>
          <div className="zone-bar" aria-hidden="true">
            <div
              className="zone-fill"
              style={
                direction === 'under'
                  ? { left: 0, width: threshold + '%' }
                  : { left: threshold + '%', right: 0 }
              }
            />
            {last && <span className="zone-pointer" style={{ left: last.result / 100 + '%' }} />}
          </div>
          <div className="zone-labels">
            <span>0</span>
            <span>25</span>
            <span>50</span>
            <span>75</span>
            <span>100</span>
          </div>
          {last && (
            <button className="text-button stage-verify" onClick={() => verify(last)}>
              <ShieldCheck size={16} /> Проверить бросок
            </button>
          )}
        </div>
      </section>
      <GameError error={error} />
    </>
  );
}
