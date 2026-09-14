import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleHelp,
  Coins,
  Dices,
  History,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Wallet,
  LayoutGrid,
  Mountain,
} from 'lucide-react';
import FairnessChecker from './fairness-checker';
import Lobby from './lobby';
import LadderGame from './ladder-game';
import LadderChecker from './ladder-checker';
import type { HiLoRound, Round, State } from '../lib/models';
import { api, ApiError } from '../lib/api';
const money = (n: number) =>
  (n / 100).toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export default function Home() {
  const [state, setState] = useState<State | null>(null);
  const [tab, setTab] = useState('lobby');
  const [amount, setAmount] = useState('100');
  const [threshold, setThreshold] = useState(50);
  const [direction, setDirection] = useState('under');
  const [clientSeed, setClientSeed] = useState(
    () => localStorage.getItem('sng-client-seed') || crypto.randomUUID(),
  );
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const pending = useRef<unknown>(null);
  const [retry, setRetry] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [last, setLast] = useState<HiLoRound | null>(null);
  const [rtp, setRtp] = useState('97');
  const [selected, setSelected] = useState<Round | null>(null);
  const [proofGame, setProofGame] = useState('hilo');
  const [rules, setRules] = useState(false);
  useEffect(() => {
    api('state')
      .then((s) => {
        setState(s);
        setRtp(String(s.rtpBps / 100));
      })
      .catch((e) => setError(e.message));
  }, []);
  async function action(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка запроса');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function play() {
    if (!state) return;
    await action(async () => {
      if (!pending.current) {
        const value = Number(amount);
        if (
          !Number.isFinite(value) ||
          value < 1 ||
          value > 1000 ||
          Math.abs(value * 100 - Math.round(value * 100)) > 1e-7
        )
          throw Error(
            'Ставка: от 1 до 1 000, не больше двух знаков после запятой',
          );
        if (!clientSeed.trim() || clientSeed.length > 128)
          throw Error('Введите client seed от 1 до 128 символов');
        localStorage.setItem('sng-client-seed', clientSeed);
        pending.current = {
          requestId: crypto.randomUUID(),
          amount: Math.round(value * 100),
          threshold,
          direction,
          clientSeed,
          version: state.version,
          commitment: state.commitment,
        };
      }
      let result;
      try {
        result = await api<{ round: HiLoRound; state: State }>(
          'bets',
          pending.current,
        );
      } catch (e) {
        if (e instanceof ApiError) {
          pending.current = null;
          setRetry(false);
          setState(await api('state'));
        } else {
          setRetry(true);
          throw Error(
            'Связь прервалась. Нажмите «Повторить запрос»: одна ставка не спишется дважды.',
          );
        }
        throw e;
      }
      pending.current = null;
      setRetry(false);
      setState(result.state);
      setLast(result.round);
    });
  }
  const chance = direction === 'under' ? threshold : 100 - threshold;
  const multiplier = state ? state.rtpBps / (chance * 100) : 0;
  function verify(round: Round) {
    setSelected(round);
    setProofGame(round.game === 'ladder' ? 'ladder' : 'hilo');
    setTab('fairness');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (tool: unknown, options: unknown) => unknown;
        };
      }
    ).modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: 'open_fairness',
            description:
              'Открыть проверку честности и показать публичный хеш активного seed.',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true },
            execute: async (input: object) => {
              if (!input || Object.keys(input).length)
                throw Error('Ожидается пустой объект');
              setTab('fairness');
              const s = await api('state');
              setState(s);
              return { commitment: s.commitment, nonce: s.nonce };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {
      /* Optional browser API. */
    }
    return () => lifecycle.abort();
  }, []);
  const navigation = [
    { id: 'lobby', label: 'Все игры', icon: LayoutGrid },
    { id: 'game', label: 'Больше / меньше', icon: Dices },
    { id: 'ladder', label: 'Лестница', icon: Mountain },
    { id: 'history', label: 'История ставок', icon: History },
    { id: 'fairness', label: 'Честность игры', icon: ShieldCheck },
    { id: 'admin', label: 'Администратор', icon: Settings2 },
  ];
  function history(rounds: Round[]) {
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Время</th>
              <th>Игра</th>
              <th>Ставка</th>
              <th>Условие</th>
              <th>Результат</th>
              <th>Выплата</th>
              <th>Проверка</th>
            </tr>
          </thead>
          <tbody>
            {rounds.map((r) => (
              <tr key={r.id} className="bet-history-row">
                <td>{new Date(r.createdAt).toLocaleTimeString('ru-RU')}</td>
                <td>{r.game === 'ladder' ? 'Лестница' : 'Hi-Lo'}</td>
                <td>
                  <button
                    className="bet-open"
                    aria-label={`Открыть и проверить ставку ${r.id.slice(0, 8)}`}
                    onClick={() => verify(r)}
                  >
                    {money(r.amount)}
                  </button>
                </td>
                <td>
                  {r.game === 'ladder'
                    ? `${r.rocks} камн. / ступень`
                    : `${r.direction === 'under' ? '<' : '≥'} ${r.threshold}`}{' '}
                  <small>×{r.multiplier.toFixed(4)}</small>
                </td>
                <td>
                  <span
                    className={r.won ? 'result-tag won' : 'result-tag lost'}
                  >
                    {r.game === 'ladder'
                      ? `${r.steps} / 8 · ${r.status === 'lost' ? 'камень' : r.status === 'completed' ? 'вершина' : 'забрал'}`
                      : (r.result / 100).toFixed(2)}
                  </span>
                </td>
                <td className={r.won ? 'green' : 'muted'}>{money(r.payout)}</td>
                <td>
                  <button
                    className="icon-button"
                    aria-label="Проверить ставку"
                    onClick={() => verify(r)}
                  >
                    <ShieldCheck size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rounds.length && (
          <div className="empty">
            <History size={26} />
            <p>Здесь будет ваша первая ставка</p>
            <span>Выберите сумму и нажмите «Играть».</span>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Surely Not Gambling">
          <span className="brand-mark">
            <Dices size={28} />
          </span>
          <span>
            SURELY NOT
            <span className="brand-bottom">
              GAMBLING<span className="brand-dot">.</span>
            </span>
          </span>
        </a>
        <div className="nav-caption">ИГРОВАЯ ПЛОЩАДКА</div>
        <nav>
          {navigation.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? 'nav-item active' : 'nav-item'}
              onClick={() => setTab(item.id)}
            >
              <item.icon size={19} />
              {item.label}
              {tab === item.id && <ChevronRight size={15} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <ShieldCheck size={23} />
          <strong>Проверяемая честность</strong>
          <p>
            Каждую ставку можно
            <br />
            проверить самостоятельно.
          </p>
          <button onClick={() => setTab('fairness')}>
            Как это работает <ArrowUpRight size={15} />
          </button>
          <div className="local-status">
            <i /> LOCAL DEMO <span>v0.1</span>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            Игры <ChevronRight size={14} />
            <span>{navigation.find((n) => n.id === tab)?.label}</span>
          </div>
          <div className="wallet">
            <Wallet size={18} />
            <span>{state ? money(state.balance) : '—'}</span>
            <span className="credit">CR</span>
          </div>
          <span className="avatar">S</span>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                SNG ORIGINALS{' '}
                <span>
                  / {tab === 'ladder' ? '02' : tab === 'game' ? '01' : 'LOBBY'}
                </span>
              </div>
              <h1>{navigation.find((n) => n.id === tab)?.label}</h1>
              <p>
                {tab === 'game'
                  ? 'Выберите сторону. Задайте порог. Испытайте удачу.'
                  : tab === 'lobby'
                    ? 'Выберите свою игру. Каждую ставку можно проверить.'
                    : tab === 'ladder'
                      ? 'Выберите сложность. Обойдите камни. Заберите выигрыш.'
                      : tab === 'admin'
                        ? 'Условия игры и статистика локальной площадки.'
                        : tab === 'history'
                          ? 'Результаты с сохранёнными условиями каждой ставки.'
                          : 'Сначала обязательство. Затем результат. После — доказательство.'}
              </p>
            </div>
            <span className="demo-pill">
              <i /> Демо-режим
            </span>
          </div>
          {error && (
            <div className="notice error" role="alert">
              {error}
              <button
                onClick={() =>
                  void action(async () => {
                    setState(await api('state'));
                  })
                }
              >
                Обновить
              </button>
            </div>
          )}
          {message && <output className="notice">{message}</output>}
          {!state ? (
            <section className="panel empty">
              <p>{error ? 'Сервер недоступен' : 'Подключаемся к игре…'}</p>
            </section>
          ) : (
            <>
              {tab === 'lobby' && <Lobby state={state} open={setTab} />}
              {tab === 'ladder' && (
                <>
                  <LadderGame
                    state={state}
                    update={setState}
                    clientSeed={clientSeed}
                    verify={verify}
                  />
                  <section className="history-section">
                    <div className="section-heading">
                      <h2>Последние лестницы</h2>
                      <button
                        className="text-button"
                        onClick={() => setTab('history')}
                      >
                        Вся история <ArrowUpRight size={16} />
                      </button>
                    </div>
                    {history(
                      state.rounds
                        .filter((r) => r.game === 'ladder')
                        .slice(0, 6),
                    )}
                  </section>
                </>
              )}
              {tab === 'game' && (
                <>
                  <section className="game-panel">
                    <div className="bet-panel">
                      <div className="section-label">
                        <SlidersHorizontal size={17} /> Настройки ставки
                      </div>
                      <label htmlFor="amount">
                        Сумма ставки <span>CR</span>
                      </label>
                      <div className="amount-input">
                        <Coins size={19} />
                        <input
                          id="amount"
                          inputMode="decimal"
                          type="number"
                          min="1"
                          max="1000"
                          step="0.01"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          disabled={busy || retry}
                        />
                      </div>
                      <div className="amount-actions">
                        <button
                          disabled={busy || retry}
                          onClick={() =>
                            setAmount(
                              String(
                                Math.max(
                                  1,
                                  Math.round(Number(amount) * 50) / 100,
                                ),
                              ),
                            )
                          }
                        >
                          ½
                        </button>
                        <button
                          disabled={busy || retry}
                          onClick={() =>
                            setAmount(
                              String(
                                Math.min(
                                  1000,
                                  Math.round(Number(amount) * 200) / 100,
                                ),
                              ),
                            )
                          }
                        >
                          ×2
                        </button>
                        <button
                          disabled={busy || retry}
                          onClick={() =>
                            setAmount(
                              String(Math.min(1000, state.balance / 100)),
                            )
                          }
                        >
                          Макс.
                        </button>
                      </div>
                      <div className="field-label">Ваш прогноз</div>
                      <div className="direction">
                        <button
                          className={direction === 'under' ? 'selected' : ''}
                          disabled={busy || retry}
                          onClick={() => setDirection('under')}
                        >
                          <ArrowDown size={18} /> Меньше
                        </button>
                        <button
                          className={direction === 'over' ? 'selected' : ''}
                          disabled={busy || retry}
                          onClick={() => setDirection('over')}
                        >
                          <ArrowUp size={18} /> Больше
                        </button>
                      </div>
                      <div className="return-box">
                        <span>Выплата при победе</span>
                        <strong>
                          {money(
                            Math.floor(Number(amount || 0) * 100 * multiplier),
                          )}{' '}
                          <small>CR</small>
                        </strong>
                        <span>Включая сумму ставки</span>
                      </div>
                      <button
                        className="play-button"
                        disabled={busy || (!retry && state.balance < 100)}
                        onClick={() => void play()}
                      >
                        {busy
                          ? 'Разыгрываем…'
                          : retry
                            ? 'Повторить запрос'
                            : 'Играть'}
                        <ArrowUpRight size={21} />
                      </button>
                      <div className="bet-footnote">
                        От 1 до 1 000 CR за ставку
                      </div>
                    </div>
                    <div className="play-area">
                      <div className="game-top">
                        <span>
                          <i /> HI-LO
                        </span>
                        <button
                          className="text-button"
                          onClick={() => setRules(!rules)}
                        >
                          <CircleHelp size={17} /> Правила
                        </button>
                      </div>
                      {rules && (
                        <div className="rules">
                          Выпадает число от 0.00 до 99.99. «Меньше» выигрывает
                          строго ниже порога, «Больше» — на пороге и выше.
                          Выплата = ставка × RTP / вероятность, округлённая вниз
                          до 0.01 CR.
                        </div>
                      )}
                      <div className="number-display" aria-live="polite">
                        <span>
                          {last
                            ? last.won
                              ? 'ПОБЕДА'
                              : 'ПОПРОБУЙТЕ ЕЩЁ'
                            : 'СЛЕДУЮЩЕЕ ЧИСЛО'}
                        </span>
                        <div
                          className={
                            last
                              ? last.won
                                ? 'big-number green'
                                : 'big-number red'
                              : 'big-number'
                          }
                        >
                          {last ? (
                            (last.result / 100).toFixed(2)
                          ) : (
                            <>
                              <span>?</span>
                              <span className="decimal">.??</span>
                            </>
                          )}
                        </div>
                        <div className="number-caption">
                          {last ? (
                            last.won ? (
                              `Выплата +${money(last.payout)} CR`
                            ) : (
                              `Ставка ${money(last.amount)} CR`
                            )
                          ) : (
                            <>
                              Ваша зона: {direction === 'under' ? 'ниже' : 'от'}{' '}
                              <b>{threshold.toFixed(2)}</b>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="slider-block">
                        <div className="slider-label">
                          <span>Порог</span>
                          <input
                            aria-label="Порог"
                            type="number"
                            min="5"
                            max="95"
                            value={threshold}
                            disabled={busy || retry}
                            onChange={(e) =>
                              setThreshold(
                                Math.max(
                                  5,
                                  Math.min(
                                    95,
                                    Math.round(Number(e.target.value)),
                                  ),
                                ),
                              )
                            }
                          />
                        </div>
                        <input
                          className="threshold-slider"
                          aria-label="Выбрать порог"
                          type="range"
                          min="5"
                          max="95"
                          value={threshold}
                          disabled={busy || retry}
                          style={{
                            background: `linear-gradient(to right, ${direction === 'under' ? '#c6f46a' : '#5c3943'} ${(threshold - 5) / 0.9}%, ${direction === 'under' ? '#5c3943' : '#c6f46a'} ${(threshold - 5) / 0.9}%)`,
                          }}
                          onChange={(e) => setThreshold(Number(e.target.value))}
                        />
                        <div className="range-labels">
                          <span>5</span>
                          <span>25</span>
                          <span>50</span>
                          <span>75</span>
                          <span>95</span>
                        </div>
                      </div>
                      <div className="game-metrics">
                        <div>
                          <span>Шанс победы</span>
                          <strong>
                            {chance.toFixed(2)}
                            <small>%</small>
                          </strong>
                        </div>
                        <div>
                          <span>Коэффициент</span>
                          <strong>
                            {multiplier.toFixed(4)}
                            <small>×</small>
                          </strong>
                        </div>
                        <div>
                          <span>
                            RTP игры <ShieldCheck size={13} />
                          </span>
                          <strong>
                            {(state.rtpBps / 100).toFixed(2)}
                            <small>%</small>
                          </strong>
                        </div>
                      </div>
                    </div>
                  </section>
                  <div className="trust-strip">
                    <ShieldCheck size={17} />
                    <span>Provably Fair</span>
                    <span className="muted">Результат можно проверить</span>
                    <button onClick={() => setTab('fairness')}>
                      Проверить честность <ArrowUpRight size={15} />
                    </button>
                  </div>
                  <section className="history-section">
                    <div className="section-heading">
                      <h2>
                        Последние ставки <span>{state.stats.count}</span>
                      </h2>
                      <button
                        className="text-button"
                        onClick={() => setTab('history')}
                      >
                        Вся история <ArrowUpRight size={16} />
                      </button>
                    </div>
                    {history(
                      state.rounds
                        .filter((r) => r.game !== 'ladder')
                        .slice(0, 6),
                    )}
                  </section>
                </>
              )}
              {tab === 'history' && (
                <section className="panel">
                  <div className="section-heading">
                    <h2>Последние 100 ставок</h2>
                    <span className="muted">Всего: {state.stats.count}</span>
                  </div>
                  {history(state.rounds)}
                </section>
              )}
              {tab === 'fairness' && (
                <>
                  <div
                    className="proof-game-switch"
                    aria-label="Игра для проверки"
                  >
                    <button
                      className={proofGame === 'hilo' ? 'chosen' : ''}
                      aria-pressed={proofGame === 'hilo'}
                      onClick={() => {
                        setProofGame('hilo');
                        setSelected(null);
                      }}
                    >
                      Больше / меньше
                    </button>
                    <button
                      className={proofGame === 'ladder' ? 'chosen' : ''}
                      aria-pressed={proofGame === 'ladder'}
                      onClick={() => {
                        setProofGame('ladder');
                        setSelected(null);
                      }}
                    >
                      Лестница
                    </button>
                  </div>
                  {proofGame === 'ladder' ? (
                    <LadderChecker
                      key={
                        (selected?.id || 'manual') + ':' + state.retired.length
                      }
                      round={selected?.game === 'ladder' ? selected : null}
                      retired={state.retired}
                    />
                  ) : (
                    <FairnessChecker
                      key={
                        (selected?.id || 'manual') + ':' + state.retired.length
                      }
                      round={selected?.game === 'ladder' ? null : selected}
                      retired={state.retired}
                    />
                  )}
                  <div className="details-grid">
                    <section className="panel">
                      <div className="section-heading">
                        <h2>
                          <ShieldCheck size={21} /> Активная сессия
                        </h2>
                        <span className="badge">HMAC-SHA256</span>
                      </div>
                      <div className="field-label">Server seed hash</div>
                      <code className="hash">{state.commitment}</code>
                      <p className="muted">
                        Хеш зафиксирован до ставки. Сам seed остаётся секретным
                        до завершения сессии.
                      </p>
                      <label htmlFor="client-seed">Client seed</label>
                      <input
                        id="client-seed"
                        value={clientSeed}
                        maxLength={128}
                        disabled={busy || retry}
                        onChange={(e) => setClientSeed(e.target.value)}
                      />
                      <p className="muted">
                        Ваш вклад в результат. Можно задать любую строку до 128
                        символов.
                      </p>
                      <div className="detail-row">
                        <span>Следующий nonce</span>
                        <strong>{state.nonce}</strong>
                      </div>
                      <button
                        className="primary-button"
                        disabled={busy || retry || Boolean(state.activeLadder)}
                        onClick={() =>
                          void action(async () => {
                            setState(await api('seeds/rotate', {}));
                            setMessage(
                              'Сессия завершена. Seed раскрыт, ставки доступны для проверки.',
                            );
                          })
                        }
                      >
                        Завершить сессию и раскрыть seed
                      </button>
                      {state.activeLadder && (
                        <div className="ladder-seed-lock">
                          <p>
                            Сначала завершите активную лестницу. Раскрытие seed
                            открыло бы будущие камни.
                          </p>
                          <button
                            className="text-button"
                            onClick={() => setTab('ladder')}
                          >
                            Вернуться к лестнице <ArrowUpRight size={16} />
                          </button>
                        </div>
                      )}
                    </section>
                    <section className="panel explain">
                      <h2>Как проверить ставку</h2>
                      <div>
                        <b>01</b>
                        <p>
                          <strong>До игры</strong>Сохраните хеш server seed и
                          выберите свой client seed.
                        </p>
                      </div>
                      <div>
                        <b>02</b>
                        <p>
                          <strong>После игры</strong>Завершите сессию, чтобы
                          сервер раскрыл использованный seed.
                        </p>
                      </div>
                      <div>
                        <b>03</b>
                        <p>
                          <strong>Сравните результат</strong>Нажмите щит в
                          истории. Браузер независимо проверит хеш, число и
                          выплату.
                        </p>
                      </div>
                      <p className="muted">
                        RTP меняет выплату, а не случайное число. Теоретический
                        RTP не гарантирует результат отдельной сессии.
                      </p>
                    </section>
                    <section className="panel wide">
                      <h2>Раскрытые сессии</h2>
                      {!state.retired.length && (
                        <p className="muted">Пока нет завершённых сессий.</p>
                      )}
                      {[...state.retired].reverse().map((s) => (
                        <div className="seed-row" key={s.commitment}>
                          <span>Ставок: {s.bets}</span>
                          <div className="field-label">Server seed</div>
                          <code className="hash">{s.seed}</code>
                          <div className="field-label">SHA-256</div>
                          <code className="hash">{s.commitment}</code>
                        </div>
                      ))}
                    </section>
                  </div>
                </>
              )}
              {tab === 'admin' && (
                <>
                  <div className="admin-stats">
                    <div className="panel">
                      <span>Ставок</span>
                      <strong>{state.stats.count}</strong>
                    </div>
                    <div className="panel">
                      <span>Оборот, CR</span>
                      <strong>{money(state.stats.wagered)}</strong>
                    </div>
                    <div className="panel">
                      <span>Выплачено, CR</span>
                      <strong>{money(state.stats.paid)}</strong>
                    </div>
                    <div className="panel">
                      <span>Фактический RTP</span>
                      <strong>
                        {state.stats.wagered
                          ? (
                              (state.stats.paid / state.stats.wagered) *
                              100
                            ).toFixed(2) + '%'
                          : '—'}
                      </strong>
                    </div>
                  </div>
                  <div className="details-grid">
                    <section className="panel">
                      <h2>RTP всех игр</h2>
                      <p className="muted">
                        Настройки применяются к новым ставкам Hi-Lo и новым
                        лестницам. Начатая лестница сохраняет свой RTP.
                      </p>
                      <label htmlFor="rtp">Теоретический RTP, %</label>
                      <input
                        id="rtp"
                        type="number"
                        min="80"
                        max="99"
                        step="0.01"
                        value={rtp}
                        onChange={(e) => setRtp(e.target.value)}
                      />
                      <p className="muted">
                        Диапазон 80–99%. Выплаты округляются вниз до 0.01 CR,
                        поэтому матожидание немного ниже указанного RTP.
                      </p>
                      <button
                        className="primary-button"
                        disabled={busy || retry}
                        onClick={() =>
                          void action(async () => {
                            const value = Number(rtp);
                            if (
                              !rtp ||
                              !Number.isFinite(value) ||
                              Math.abs(value * 100 - Math.round(value * 100)) >
                                1e-7
                            )
                              throw Error('Введите RTP с точностью до 0.01%');
                            setState(
                              await api('admin/config', {
                                rtpBps: Math.round(value * 100),
                                version: state.version,
                              }),
                            );
                            setMessage(
                              'RTP обновлён. Изменение записано в журнал.',
                            );
                          })
                        }
                      >
                        Сохранить условия <Check size={17} />
                      </button>
                    </section>
                    <section className="panel">
                      <h2>Журнал изменений</h2>
                      {!state.audit.length && (
                        <p className="muted">Настройки ещё не менялись.</p>
                      )}
                      {state.audit.map((a) => (
                        <div className="audit-row" key={a.version}>
                          <div>
                            <strong>
                              {a.from / 100}% → {a.to / 100}%
                            </strong>
                            <span>Версия условий {a.version}</span>
                          </div>
                          <time>{new Date(a.at).toLocaleString('ru-RU')}</time>
                        </div>
                      ))}
                    </section>
                  </div>
                  <p className="admin-note">
                    Локальный стенд: общий демо-кошелёк, администрирование
                    открыто. Реальные платежи не подключены.
                  </p>
                </>
              )}
            </>
          )}
          <footer>
            <span>© 2026 Surely Not Gambling</span>
            <span>Учебный проект · Виртуальные кредиты</span>
            <span>18+</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
