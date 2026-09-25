import { useEffect, useState } from 'react';
import { ArrowUpRight, BarChart3, Check, History, LayoutGrid, Settings2, ShieldCheck, Wallet } from 'lucide-react';
import FairnessChecker from './fairness-checker';
import LadderChecker from './ladder-checker';
import GameChecker, { type CheckedGame } from './game-checker';
import Lobby, { activeRound } from './lobby';
import HiLoGame from './hilo-game';
import LadderGame from './ladder-game';
import MinesGame from './mines-game';
import ChickenGame from './chicken-game';
import CrashGame from './crash-game';
import RouletteGame from './roulette-game';
import UpgradeGame from './upgrade-game';
import PlinkoGame from './plinko-game';
import HistoryTable from './history-table';
import StatsView from './stats-view';
import { BrandIcon, GAMES } from './catalog';
import { gameOf, type GameId, type HiLoRound, type LadderRound, type Round, type State } from '../lib/models';
import { api } from '../lib/api';
import { money } from '../lib/format';

const PAGES = [
  { id: 'history', label: 'История ставок', icon: History, text: 'Каждая ставка с условиями, исходом и проверкой.' },
  { id: 'stats', label: 'Статистика', icon: BarChart3, text: 'Фактический и ожидаемый RTP, разброс и отклонение от ожидания.' },
  { id: 'fairness', label: 'Честность', icon: ShieldCheck, text: 'Сначала обязательство. Затем результат. После — доказательство.' },
  { id: 'admin', label: 'Администратор', icon: Settings2, text: 'Условия игры и статистика локальной площадки.' },
];
const TABS = ['lobby', ...GAMES.map((g) => g.id), ...PAGES.map((p) => p.id)];
const fromHash = () => {
  const hash = location.hash.slice(1);
  return TABS.includes(hash) ? hash : 'lobby';
};

export default function Home() {
  const [state, setState] = useState<State | null>(null);
  const [tab, setTabState] = useState(fromHash);
  const [clientSeed, setClientSeed] = useState(() => {
    try {
      return localStorage.getItem('sng-client-seed') || crypto.randomUUID();
    } catch {
      return crypto.randomUUID();
    }
  });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [rtp, setRtp] = useState('97');
  const [selected, setSelected] = useState<Round | null>(null);
  const [proofGame, setProofGame] = useState<GameId>('crash');
  function setTab(next: string) {
    setTabState(next);
    history.replaceState(null, '', next === 'lobby' ? location.pathname : '#' + next);
    window.scrollTo({ top: 0 });
  }
  useEffect(() => {
    const onHash = () => setTabState(fromHash());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    api('state')
      .then((s) => {
        setState(s);
        setRtp(String(s.rtpBps / 100));
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('sng-client-seed', clientSeed);
    } catch {
      /* Private mode: the seed lives only in this tab. */
    }
  }, [clientSeed]);
  // Optional WebMCP tool: lets a supporting browser agent open the fairness page.
  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options: unknown) => unknown } }).modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: 'open_fairness',
            description: 'Открыть проверку честности и показать публичный хеш активного seed.',
            inputSchema: { type: 'object', properties: {}, additionalProperties: false },
            annotations: { readOnlyHint: true },
            execute: async (input: object) => {
              if (!input || Object.keys(input).length) throw Error('Ожидается пустой объект');
              setTabState('fairness');
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
  async function action(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка запроса');
    } finally {
      setBusy(false);
    }
  }
  function verify(round: Round) {
    setSelected(round);
    setProofGame(gameOf(round));
    setTab('fairness');
  }
  const game = GAMES.find((g) => g.id === tab);
  const page = PAGES.find((p) => p.id === tab);
  const title = game?.title ?? page?.label ?? 'Все игры';
  const props = state && { state, update: setState, clientSeed, verify };
  const anyActive = state && GAMES.some((g) => activeRound(state, g.id));
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button type="button" className="brand" onClick={() => setTab('lobby')} aria-label="Surely Not Gambling — все игры">
          <span className="brand-mark">
            <BrandIcon size={26} />
          </span>
          <span>
            SURELY NOT
            <span className="brand-bottom">
              GAMBLING<span className="brand-dot">.</span>
            </span>
          </span>
        </button>
        <nav aria-label="Игры">
          <div className="nav-caption">ИГРЫ</div>
          <button className={'nav-item' + (tab === 'lobby' ? ' active' : '')} onClick={() => setTab('lobby')}>
            <LayoutGrid size={18} /> Все игры
          </button>
          {GAMES.map((g) => (
            <button key={g.id} className={'nav-item' + (tab === g.id ? ' active' : '')} onClick={() => setTab(g.id)}>
              <g.icon size={18} /> {g.title}
              {state && activeRound(state, g.id) && <i className="live-dot" title="Идёт раунд" />}
            </button>
          ))}
          <div className="nav-caption">АККАУНТ</div>
          {PAGES.map((p) => (
            <button key={p.id} className={'nav-item' + (tab === p.id ? ' active' : '')} onClick={() => setTab(p.id)}>
              <p.icon size={18} /> {p.label}
            </button>
          ))}
        </nav>
        <div className="local-status">
          <i /> ДЕМО · виртуальные кредиты
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="page-title">
            <h1>{title}</h1>
            <p>{game ? game.tagline : page ? page.text : 'Выберите игру. Каждую ставку можно проверить.'}</p>
          </div>
          <div className="wallet" aria-label="Баланс">
            <Wallet size={18} />
            <span>{state ? money(state.balance) : '—'}</span>
            <span className="credit">CR</span>
          </div>
        </header>
        <main>
          {error && (
            <div className="notice error" role="alert">
              {error}
              <button onClick={() => void action(async () => setState(await api('state')))}>Обновить</button>
            </div>
          )}
          {message && <output className="notice">{message}</output>}
          {!state || !props ? (
            <section className="panel empty">
              <p>{error ? 'Сервер недоступен' : 'Подключаемся к игре…'}</p>
            </section>
          ) : (
            <>
              {tab === 'lobby' && <Lobby state={state} open={setTab} />}
              {tab === 'hilo' && <HiLoGame {...props} verify={(r: HiLoRound) => verify(r)} />}
              {tab === 'ladder' && <LadderGame {...props} verify={(r: LadderRound) => verify(r)} />}
              {tab === 'mines' && <MinesGame {...props} />}
              {tab === 'chicken' && <ChickenGame {...props} />}
              {tab === 'crash' && <CrashGame {...props} />}
              {tab === 'roulette' && <RouletteGame {...props} />}
              {tab === 'upgrade' && <UpgradeGame {...props} />}
              {tab === 'plinko' && <PlinkoGame {...props} />}
              {game && (
                <section className="history-section">
                  <div className="section-heading">
                    <h2>Последние ставки · {game.title}</h2>
                    <button className="text-button" onClick={() => setTab('history')}>
                      Вся история <ArrowUpRight size={16} />
                    </button>
                  </div>
                  <HistoryTable rounds={state.rounds.filter((r) => gameOf(r) === game.id).slice(0, 8)} verify={verify} />
                </section>
              )}
              {tab === 'history' && (
                <section>
                  <div className="section-heading">
                    <h2>Последние 100 ставок</h2>
                    <span className="muted">Всего: {state.stats.count}</span>
                  </div>
                  <HistoryTable rounds={state.rounds} verify={verify} />
                </section>
              )}
              {tab === 'stats' && <StatsView state={state} />}
              {tab === 'fairness' && (
                <>
                  <nav className="proof-game-switch" aria-label="Игра для проверки">
                    {GAMES.map((g) => (
                      <button key={g.id} className={proofGame === g.id ? 'chosen' : ''} aria-pressed={proofGame === g.id} onClick={() => { setProofGame(g.id); setSelected(null); }}>
                        {g.title}
                      </button>
                    ))}
                  </nav>
                  {(() => {
                    const round = selected && gameOf(selected) === proofGame ? selected : null;
                    const key = (round?.id ?? 'manual') + ':' + proofGame + ':' + state.retired.length;
                    if (proofGame === 'hilo') return <FairnessChecker key={key} round={round as HiLoRound | null} retired={state.retired} />;
                    if (proofGame === 'ladder') return <LadderChecker key={key} round={round as LadderRound | null} retired={state.retired} />;
                    return <GameChecker key={key} game={proofGame as CheckedGame} round={round} retired={state.retired} />;
                  })()}
                  <div className="details-grid">
                    <section className="panel">
                      <div className="section-heading">
                        <h2>
                          <ShieldCheck size={20} /> Активная сессия
                        </h2>
                        <span className="badge">HMAC-SHA256</span>
                      </div>
                      <div className="field-label">Хеш server seed</div>
                      <code className="hash">{state.commitment}</code>
                      <p className="muted">Хеш зафиксирован до ставок. Сам seed остаётся секретным до завершения сессии.</p>
                      <label htmlFor="client-seed">Client seed</label>
                      <input id="client-seed" className="text-input" value={clientSeed} maxLength={128} disabled={busy} onChange={(e) => setClientSeed(e.target.value)} />
                      <p className="muted">Ваш вклад в случайность: любая строка до 128 символов.</p>
                      <div className="detail-row">
                        <span>Следующий nonce</span>
                        <strong>{state.nonce}</strong>
                      </div>
                      <button
                        className="primary-button"
                        disabled={busy || Boolean(anyActive)}
                        onClick={() =>
                          void action(async () => {
                            setState(await api('seeds/rotate', {}));
                            setMessage('Сессия завершена. Seed раскрыт — ставки можно проверить.');
                          })
                        }
                      >
                        Завершить сессию и раскрыть seed
                      </button>
                      {anyActive && <p className="notice warn">Сначала завершите начатые раунды: раскрытие seed открыло бы их будущие исходы.</p>}
                    </section>
                    <section className="panel explain">
                      <h2>Как проверить ставку</h2>
                      <div><b>01</b><p><strong>До игры</strong>Сохраните хеш server seed и задайте свой client seed.</p></div>
                      <div><b>02</b><p><strong>После игры</strong>Завершите сессию — сервер раскроет использованный seed.</p></div>
                      <div><b>03</b><p><strong>Сравните</strong>Нажмите щит в истории: браузер сам пересчитает исход и выплату.</p></div>
                      <p className="muted">RTP меняет выплаты (а в краше — распределение точки краша), но не генератор случайных чисел.</p>
                    </section>
                    <section className="panel wide">
                      <h2>Раскрытые сессии</h2>
                      {!state.retired.length && <p className="muted">Пока нет завершённых сессий.</p>}
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
                  <div className="details-grid">
                    <section className="panel">
                      <h2>RTP всех игр</h2>
                      <p className="muted">Применяется к новым ставкам. Начатые раунды сохраняют свой RTP.</p>
                      <label htmlFor="rtp">Теоретический RTP, %</label>
                      <input id="rtp" className="text-input" inputMode="decimal" value={rtp} onChange={(e) => setRtp(e.target.value)} />
                      <p className="muted">80–99%, шаг 0.01%. Выплаты округляются вниз до 0.01 CR, поэтому точное матожидание чуть ниже.</p>
                      <button
                        className="primary-button"
                        disabled={busy}
                        onClick={() =>
                          void action(async () => {
                            const value = Number(rtp.replace(',', '.'));
                            if (!rtp || !Number.isFinite(value) || Math.abs(value * 100 - Math.round(value * 100)) > 1e-7) throw Error('Введите RTP с точностью до 0.01%');
                            setState(await api('admin/config', { rtpBps: Math.round(value * 100), version: state.version }));
                            setMessage('RTP обновлён. Изменение записано в журнал.');
                          })
                        }
                      >
                        Сохранить условия <Check size={17} />
                      </button>
                    </section>
                    <section className="panel">
                      <h2>Журнал изменений</h2>
                      {!state.audit.length && <p className="muted">Настройки ещё не менялись.</p>}
                      {state.audit.map((a) => (
                        <div className="audit-row" key={a.version}>
                          <div>
                            <strong>{a.from / 100}% → {a.to / 100}%</strong>
                            <span>Версия условий {a.version}</span>
                          </div>
                          <time>{new Date(a.at).toLocaleString('ru-RU')}</time>
                        </div>
                      ))}
                    </section>
                  </div>
                  <h2 className="admin-heading">Статистика по играм</h2>
                  <StatsView state={state} compact />
                  <p className="admin-note">Локальный стенд: общий демо-кошелёк, администрирование открыто. Реальные платежи не подключены.</p>
                </>
              )}
            </>
          )}
          <footer>
            <span>© 2026 Surely Not Gambling</span>
            <span>Учебный проект · виртуальные кредиты</span>
            <span>18+</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
