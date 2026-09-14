import { useState } from 'react';
import { ArrowUpRight, Copy, ShieldCheck } from 'lucide-react';
import { verifyHiLo, type VerificationInput } from '../lib/verify';
import './fairness-checker.css';

type Receipt = {
  id: string;
  clientSeed: string;
  nonce: number;
  commitment: string;
  threshold: number;
  direction: string;
  amount: number;
  rtpBps: number;
  result: number;
};
type Props = {
  round: Receipt | null;
  retired: { seed: string; commitment: string }[];
};
export default function FairnessChecker({ round, retired }: Props) {
  const [form, setForm] = useState<VerificationInput>(() => ({
    serverSeed:
      retired.find((s) => s.commitment === round?.commitment)?.seed || '',
    clientSeed: round?.clientSeed || '',
    nonce: String(round?.nonce ?? 0),
    commitment: round?.commitment || '',
    threshold: String(round?.threshold ?? 50),
    direction: round?.direction || 'under',
    amount: String((round?.amount ?? 10000) / 100),
    rtp: String((round?.rtpBps ?? 9700) / 100),
    recordedResult: round ? (round.result / 100).toFixed(2) : '',
  }));
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof verifyHiLo>
  > | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  function change(key: keyof VerificationInput, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setResult(null);
    setError('');
    setCopied(false);
  }
  function field(
    key: keyof VerificationInput,
    label: string,
    hint?: string,
    placeholder?: string,
  ) {
    return (
      <div className="proof-field">
        <label htmlFor={'proof-' + key}>{label}</label>
        <input
          id={'proof-' + key}
          value={form[key]}
          onChange={(e) => change(key, e.target.value)}
          placeholder={placeholder}
          disabled={busy}
          autoComplete="off"
          spellCheck={false}
          maxLength={key === 'clientSeed' ? 128 : 80}
        />
        {hint && <small>{hint}</small>}
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
            setResult(await verifyHiLo(form));
          } catch (reason) {
            setError(
              reason instanceof Error
                ? reason.message
                : 'Не удалось выполнить проверку.',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="section-heading">
          <h2>Данные игры</h2>
          <span className="badge">HI-LO · v1</span>
        </div>
        <div className="proof-game">Больше / меньше</div>
        {round && (
          <p className="proof-source">
            Из истории · ставка {round.id.slice(0, 8)}
          </p>
        )}
        {round && !form.serverSeed && (
          <p className="proof-wait">
            Серверный seed ещё не раскрыт. Завершите сессию ниже, затем
            вернитесь к проверке.
          </p>
        )}
        {field(
          'serverSeed',
          'Сид сервера',
          'Раскрывается после завершения сессии',
          'Вставьте раскрытый server seed',
        )}
        {field(
          'clientSeed',
          'Сид клиента',
          'Выбирается игроком до ставки',
          'Ваш client seed',
        )}
        {field(
          'nonce',
          'Номер ставки (nonce)',
          'Счётчик в seed-сессии, начиная с 0',
        )}
        {field(
          'commitment',
          'Исходный SHA-256',
          'Сохранён до ставки · необязательно для расчёта',
          'Хеш для сравнения',
        )}
        <div className="proof-fields">
          {field('threshold', 'Порог')}
          <div className="proof-field">
            <label htmlFor="proof-direction">Прогноз</label>
            <select
              id="proof-direction"
              disabled={busy}
              value={form.direction}
              onChange={(e) => change('direction', e.target.value)}
            >
              <option value="under">Меньше (&lt;)</option>
              <option value="over">Больше (≥)</option>
            </select>
          </div>
          {field('amount', 'Ставка, CR')}
          {field('rtp', 'RTP ставки, %')}
        </div>
        {field(
          'recordedResult',
          'Число из истории',
          'Необязательно · для автоматического сравнения',
          'Например, 37.42',
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button" disabled={busy} type="submit">
          {busy ? 'Вычисляем…' : 'Проверить результат'}
          <ArrowUpRight size={19} />
        </button>
      </form>
      <div className="proof-right">
        <h2>Результат проверки</h2>
        <div className="proof-result" aria-live="polite">
          {result ? (
            <>
              <span className="proof-kicker">РАСЧЁТНОЕ ЧИСЛО</span>
              <strong className="proof-number">
                {(result.result / 100).toFixed(2)}
              </strong>
              <div
                className="proof-scale"
                style={{
                  background: `linear-gradient(to right, ${result.direction === 'under' ? '#698f73' : '#9f6377'} ${result.threshold}%, ${result.direction === 'under' ? '#9f6377' : '#698f73'} ${result.threshold}%)`,
                }}
              >
                <span
                  className="proof-threshold"
                  style={{ left: result.threshold + '%' }}
                  title={'Порог: ' + result.threshold}
                />
                <span
                  className="proof-pointer"
                  style={{ left: (result.result / 9999) * 100 + '%' }}
                />
              </div>
              <div className="proof-scale-labels">
                <span>0.00</span>
                <span>Порог {result.threshold}</span>
                <span>99.99</span>
              </div>
              <p className={result.won ? 'green' : 'red'}>
                {result.won ? 'Выигрыш' : 'Проигрыш'} · число{' '}
                {result.direction === 'under' ? '<' : '≥'} {result.threshold}:{' '}
                {result.won ? 'да' : 'нет'}
              </p>
              <div className="proof-payout">
                <span>Расчётная выплата</span>
                <strong>{(result.payout / 100).toFixed(2)} CR</strong>
              </div>
              <div
                className={
                  'proof-check ' +
                  (result.hashMatches === false
                    ? 'red'
                    : result.hashMatches
                      ? 'green'
                      : 'muted')
                }
              >
                <ShieldCheck size={18} />
                {result.hashMatches === null
                  ? 'Исходный хеш не указан — обязательство не проверено'
                  : result.hashMatches
                    ? 'Seed соответствует исходному хешу'
                    : 'Seed НЕ соответствует исходному хешу'}
              </div>
              <div
                className={
                  'proof-check ' +
                  (result.resultMatches === false
                    ? 'red'
                    : result.resultMatches
                      ? 'green'
                      : 'muted')
                }
              >
                {result.resultMatches === null
                  ? 'Сравните рассчитанное число с историей'
                  : result.resultMatches
                    ? 'Число совпадает с историей'
                    : 'Число НЕ совпадает с историей'}
              </div>
              <details className="proof-hash">
                <summary>Вычисленный SHA-256</summary>
                <code className="hash">{result.commitment}</code>
              </details>
            </>
          ) : (
            <div className="proof-empty">
              <ShieldCheck size={40} />
              <h3>Воспроизведите свою ставку</h3>
              <p>
                Введите исходные данные слева.
                <br />
                Здесь появятся число и расчёт выплаты.
              </p>
            </div>
          )}
        </div>
        <div className="proof-explanation">
          <ShieldCheck size={22} />
          <p>
            <strong>Проверка, которую можно повторить</strong>Одинаковые
            исходные данные всегда дают одинаковый результат. Расчёт выполняется
            в вашем браузере, без обращения к серверу. Сравнение с хешем,
            сохранённым до ставки, подтверждает неизменность server seed.
          </p>
        </div>
        <button
          type="button"
          className="text-button proof-copy"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                JSON.stringify({ protocol: 'hilo-v1', ...form }, null, 2),
              );
              setCopied(true);
            } catch {
              setError(
                'Браузер не разрешил копирование. Данные можно выделить вручную.',
              );
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
