import { useEffect, useState } from 'react';
import { ArrowUpRight, Copy, ShieldCheck } from 'lucide-react';
import { verifyLadder, type LadderProofInput } from '../lib/verify-ladder';
import type { LadderRound, State } from '../lib/models';
import LadderBoard from './ladder-board';
import './fairness-checker.css';
import './ladder.css';

export default function LadderChecker({
  round,
  retired,
}: {
  round: LadderRound | null;
  retired: State['retired'];
}) {
  const [form, setForm] = useState<LadderProofInput>(() => ({
    serverSeed:
      retired.find((s) => s.commitment === round?.commitment)?.seed || '',
    clientSeed: round?.clientSeed || '',
    nonce: String(round?.nonce ?? 0),
    commitment: round?.commitment || '',
    rocks: String(round?.rocks ?? 2),
    path: round?.moves.map((c) => c + 1).join(', ') || '',
    amount: String((round?.amount ?? 10000) / 100),
    rtp: String((round?.rtpBps ?? 9700) / 100),
    recordedBoard: round?.board ? JSON.stringify(round.board) : '',
    recordedPayout: round ? (round.payout / 100).toFixed(2) : '',
    recordedStatus: round && round.status !== 'active' ? round.status : '',
  }));
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof verifyLadder>
  > | null>(null);
  const [automatic] = useState(() => (round && form.serverSeed ? form : null));
  const [busy, setBusy] = useState(Boolean(automatic));
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!automatic) return;
    let cancelled = false;
    verifyLadder(automatic)
      .then((value) => {
        if (!cancelled) setResult(value);
      })
      .catch((reason) => {
        if (!cancelled)
          setError(
            reason instanceof Error ? reason.message : 'Ошибка проверки',
          );
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [automatic]);
  function change(key: keyof LadderProofInput, value: string) {
    setForm((s) => ({ ...s, [key]: value }));
    setResult(null);
    setError('');
    setCopied(false);
  }
  function field(key: keyof LadderProofInput, label: string, hint?: string) {
    return (
      <div className="proof-field">
        <label htmlFor={'stairs-' + key}>{label}</label>
        <input
          id={'stairs-' + key}
          value={form[key]}
          onChange={(e) => change(key, e.target.value)}
          disabled={busy}
          spellCheck={false}
          autoComplete="off"
          maxLength={key === 'clientSeed' ? 128 : 80}
        />
        {hint && <small>{hint}</small>}
      </div>
    );
  }
  function check(
    value: boolean | null,
    matched: string,
    mismatched: string,
    missing: string,
  ) {
    return (
      <div
        className={
          'proof-check ' + (value === null ? 'muted' : value ? 'green' : 'red')
        }
      >
        {value === null ? missing : value ? matched : mismatched}
      </div>
    );
  }
  return (
    <section className="proof-layout">
      <form
        className="panel proof-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError('');
          setResult(null);
          try {
            setResult(await verifyLadder(form));
          } catch (reason) {
            setError(
              reason instanceof Error ? reason.message : 'Ошибка проверки',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="section-heading">
          <h2>Данные лестницы</h2>
          <span className="badge">STAIRS · v1</span>
        </div>
        <div className="proof-game">8 ступеней · 5 клеток</div>
        {round && (
          <p className="proof-source">
            Из истории · ставка {round.id.slice(0, 8)}
          </p>
        )}
        {round && !form.serverSeed && (
          <p className="proof-wait">
            Данные подставлены. Завершите seed-сессию ниже — карта камней
            проверится автоматически.
          </p>
        )}
        {field(
          'serverSeed',
          'Раскрытый сид сервера',
          'Доступен после завершения seed-сессии',
        )}
        {field('clientSeed', 'Сид клиента', 'Выбран до начала раунда')}
        {field(
          'commitment',
          'Исходный SHA-256',
          'Сохранён до ставки · необязателен для расчёта',
        )}
        <div className="proof-fields">
          {field('nonce', 'Номер ставки (nonce)')}
          {field('rocks', 'Камней на ступени')}
          {field('amount', 'Ставка, CR')}
          {field('rtp', 'RTP ставки, %')}
        </div>
        {field(
          'path',
          'Ваш путь снизу вверх',
          'Номера клеток 1–5 через запятую, например: 2, 4, 1. Пустой путь покажет только карту.',
        )}
        <details className="ladder-proof-details">
          <summary>Данные из истории для сравнения</summary>
          <div className="proof-field">
            <label htmlFor="stairs-board">Карта камней (JSON)</label>
            <textarea
              id="stairs-board"
              rows={4}
              value={form.recordedBoard}
              maxLength={300}
              disabled={busy}
              onChange={(e) => change('recordedBoard', e.target.value)}
            />
            <small>8 строк, индексы клеток 0–4. Необязательно.</small>
          </div>
          {field('recordedPayout', 'Записанная выплата, CR', 'Необязательно')}
          {field(
            'recordedStatus',
            'Записанный итог',
            'lost — камень, cashed — забрал, completed — вершина. Необязательно.',
          )}
        </details>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button" disabled={busy} type="submit">
          {busy ? 'Проверяем…' : 'Воспроизвести лестницу'}
          <ArrowUpRight size={19} />
        </button>
      </form>
      <div className="proof-right">
        <h2>Результат проверки</h2>
        <div className="proof-result ladder-proof-result" aria-live="polite">
          {result ? (
            <>
              <span className="proof-kicker">ВОССТАНОВЛЕННАЯ КАРТА</span>
              <LadderBoard
                rocks={result.rocks}
                moves={result.moves}
                board={result.board}
              />
              <p className={result.status === 'lost' ? 'red' : 'green'}>
                {result.status === 'unplayed'
                  ? 'Введите путь, чтобы рассчитать итог'
                  : result.status === 'lost'
                    ? `Камень на ступени ${result.hit + 1}`
                    : result.status === 'completed'
                      ? 'Вершина пройдена — 8 / 8'
                      : `Выигрыш забран после ступени ${result.steps}`}
              </p>
              {result.payout !== null && (
                <div className="proof-payout">
                  <span>Расчётная выплата</span>
                  <strong>{(result.payout / 100).toFixed(2)} CR</strong>
                </div>
              )}
              {check(
                result.hashMatches,
                'Seed соответствует исходному хешу',
                'Seed НЕ соответствует исходному хешу',
                'Хеш не указан — обязательство не проверено',
              )}
              {check(
                result.boardMatches,
                'Все камни совпадают с историей',
                'Карта камней НЕ совпадает с историей',
                'Карта из истории не указана',
              )}
              {check(
                result.payoutMatches,
                'Выплата совпадает с историей',
                'Выплата НЕ совпадает с историей',
                'Выплата из истории не сравнивалась',
              )}
              {check(
                result.statusMatches,
                'Итог раунда совпадает',
                'Итог раунда НЕ совпадает',
                'Итог из истории не сравнивался',
              )}
              <details className="proof-hash">
                <summary>Вычисленный SHA-256</summary>
                <code className="hash">{result.commitment}</code>
              </details>
            </>
          ) : (
            <div className="proof-empty">
              <ShieldCheck size={40} />
              <h3>Вся лестница перед вами</h3>
              <p>
                По сидам и числу камней восстановим каждую ступень. По вашему
                пути — исход и выплату.
              </p>
            </div>
          )}
        </div>
        <div className="proof-explanation">
          <ShieldCheck size={22} />
          <p>
            <strong>Камни определены до первого шага</strong>Одинаковые сиды,
            номер раунда и число камней дают одну и ту же карту. Проверка
            выполняется в браузере. Сохранённый до игры хеш позволяет проверить
            неизменность server seed.
          </p>
        </div>
        <button
          className="text-button proof-copy"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                JSON.stringify({ protocol: 'stairs-v1', ...form }, null, 2),
              );
              setCopied(true);
            } catch {
              setError('Не удалось скопировать данные.');
            }
          }}
        >
          <Copy size={16} />
          {copied ? 'Данные скопированы' : 'Скопировать данные проверки'}
        </button>
      </div>
    </section>
  );
}
