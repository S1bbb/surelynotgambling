import { useRef, useState } from 'react';
import { ArrowUpRight, Mountain, ShieldCheck, Coins } from 'lucide-react';
import type { LadderRound, State } from '../lib/models';
import { api, ApiError } from '../lib/api';
import LadderBoard from './ladder-board';
import './ladder.css';

const money = (amount: number) =>
  (amount / 100).toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export function previewLadderPayout(
  amount: number,
  rtpBps: number,
  rocks: number,
  steps: number,
) {
  if (!Number.isSafeInteger(amount) || amount < 0 || !steps) return 0;
  return Number(
    (BigInt(amount) * BigInt(rtpBps) * 5n ** BigInt(steps)) /
      (10000n * BigInt(5 - rocks) ** BigInt(steps)),
  );
}
export default function LadderGame({
  state,
  update,
  clientSeed,
  verify,
}: {
  state: State;
  update: (state: State) => void;
  clientSeed: string;
  verify: (round: LadderRound) => void;
}) {
  const [amount, setAmount] = useState('100');
  const [rocks, setRocks] = useState(2);
  const [last, setLast] = useState<LadderRound | null>(
    () =>
      (state.rounds.find((r) => r.game === 'ladder') as
        | LadderRound
        | undefined) ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(false);
  const pending = useRef<{ path: string; body: object } | null>(null);
  const lock = useRef(false);
  const active = state.activeLadder;
  const shown = active || last;
  const count = active?.rocks ?? rocks;
  const rtpBps = active?.rtpBps ?? state.rtpBps;
  const multiplier = (step: number) =>
    ((rtpBps / 10000) * (5 / (5 - count)) ** step).toFixed(3);
  async function send(path: string, body: object) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    pending.current ||= { path, body };
    try {
      const response = await api<{ state: State; round: LadderRound }>(
        pending.current.path,
        pending.current.body,
      );
      update(response.state);
      setLast(response.round);
      pending.current = null;
      setRetry(false);
    } catch (reason) {
      if (reason instanceof ApiError) {
        pending.current = null;
        setRetry(false);
        setError(reason.message);
        try {
          update(await api('state'));
        } catch {
          setError(reason.message + ' Не удалось обновить состояние.');
        }
      } else {
        setRetry(true);
        setError(
          'Связь прервалась. Повторите запрос — действие не будет выполнено дважды.',
        );
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function start() {
    const wager = Number(amount);
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || wager < 1 || wager > 1000) {
      setError('Ставка: от 1 до 1 000 CR, до двух знаков после точки.');
      return;
    }
    void send('ladder/start', {
      requestId: crypto.randomUUID(),
      amount: Math.round(wager * 100),
      rocks,
      clientSeed,
      commitment: state.commitment,
      version: state.version,
    });
  }
  const cashout = active
    ? previewLadderPayout(
        active.amount,
        active.rtpBps,
        active.rocks,
        active.steps,
      )
    : 0;
  return (
    <>
      <section className="game-panel ladder-game">
        <div className="bet-panel">
          <div className="section-label">
            <Mountain size={19} /> Настройки лестницы
          </div>
          <label htmlFor="ladder-amount">
            Сумма ставки <span>CR</span>
          </label>
          <div className="amount-input">
            <Coins size={19} />
            <input
              id="ladder-amount"
              value={active ? String(active.amount / 100) : amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={Boolean(active) || busy || retry}
              type="number"
              min="1"
              max="1000"
              step="0.01"
            />
          </div>
          <fieldset
            className="rocks-picker"
            disabled={Boolean(active) || busy || retry}
          >
            <legend>Камней на ступени</legend>
            <div>
              {[1, 2, 3, 4].map((n) => (
                <label
                  key={n}
                  className={count === n ? 'rock-option chosen' : 'rock-option'}
                >
                  <input
                    type="radio"
                    name="ladder-rocks"
                    value={n}
                    checked={count === n}
                    onChange={() => {
                      setRocks(n);
                      setLast(null);
                    }}
                  />
                  <span>{n}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="ladder-risk">
            {5 - count} из 5 клеток безопасны
            <br />
            Шанс пройти ступень: {(5 - count) * 20}%
          </p>
          <div className="return-box">
            <span>{active ? 'Можно забрать' : 'После первой ступени'}</span>
            <strong>
              {money(
                active
                  ? cashout
                  : previewLadderPayout(
                      Math.round(Number(amount || 0) * 100),
                      rtpBps,
                      count,
                      1,
                    ),
              )}{' '}
              <small>CR</small>
            </strong>
            <span>Включая сумму ставки</span>
          </div>
          {retry ? (
            <button
              className="play-button"
              disabled={busy}
              onClick={() => void send('', {})}
            >
              Повторить запрос
            </button>
          ) : active ? (
            <button
              className="play-button"
              disabled={busy || active.steps === 0}
              onClick={() =>
                void send('ladder/cashout', {
                  roundId: active.id,
                  steps: active.steps,
                })
              }
            >
              {busy ? 'Считаем…' : 'Забрать выигрыш'}
              <ArrowUpRight size={20} />
            </button>
          ) : (
            <button
              className="play-button"
              disabled={busy || state.balance < 100}
              onClick={start}
            >
              {busy ? 'Начинаем…' : 'Начать подъём'}
              <ArrowUpRight size={20} />
            </button>
          )}
          <p className="bet-footnote">
            {active?.steps === 0
              ? 'Выберите клетку на первой ступени'
              : '8 ступеней · 5 клеток · от 1 CR'}
          </p>
          <div className="ladder-rules">
            <strong>Как играть</strong>
            <p>
              Выбирайте клетку на подсвеченной ступени. Камень завершает раунд
              без выплаты. После безопасного шага можно забрать выигрыш. На
              восьмой ступени выплата автоматическая.
            </p>
          </div>
          <div className="detail-row">
            <span>RTP этой игры</span>
            <strong>{rtpBps / 100}%</strong>
          </div>
        </div>
        <div className="ladder-play-area">
          <div className="game-top">
            <span>
              <i /> ЛЕСТНИЦА
            </span>
            <span>{active ? `${active.steps} / 8` : '8 СТУПЕНЕЙ'}</span>
          </div>
          <output className="ladder-status" aria-live="polite">
            {active
              ? `Ваш ход: ступень ${active.steps + 1}`
              : last
                ? last.status === 'lost'
                  ? 'Камнепад. Раунд завершён'
                  : `Вы забрали ${money(last.payout)} CR`
                : 'Каждый шаг — новый выбор'}
          </output>
          <LadderBoard
            rocks={shown?.rocks ?? count}
            moves={shown?.moves ?? []}
            board={active ? active.revealed : (last?.board ?? [])}
            activeStep={active?.steps}
            disabled={busy || retry}
            onPick={(column) => {
              if (active)
                void send('ladder/step', {
                  roundId: active.id,
                  step: active.steps,
                  column,
                });
            }}
            multiplier={
              shown && !active
                ? (step) =>
                    (
                      (shown.rtpBps / 10000) *
                      (5 / (5 - shown.rocks)) ** step
                    ).toFixed(3)
                : multiplier
            }
          />
          <div className="ladder-legend">
            <span>
              <span className="legend-dot safe" />
              Безопасно
            </span>
            <span>
              <Mountain size={15} />
              Камень
            </span>
            <span>↑ Ваш путь</span>
          </div>
          {!active && last && (
            <button
              className="primary-button ladder-verify"
              onClick={() => verify(last)}
            >
              <ShieldCheck size={18} /> Проверить эту лестницу
            </button>
          )}
          {active && (
            <p className="ladder-session-note">
              Можно уйти с этой страницы: начатая игра сохранится.
            </p>
          )}
        </div>
      </section>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
    </>
  );
}
