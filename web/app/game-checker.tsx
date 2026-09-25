import { useEffect, useState } from 'react';
import { ArrowUpRight, ShieldCheck } from 'lucide-react';
import type { Round, State } from '../lib/models';
import { money, mult } from '../lib/format';
import {
  CHICKEN_DIFFICULTY,
  minesPayout,
  plinkoPayout,
  replayCrash,
  replayMines,
  replayPlinko,
  replayRoulette,
  replayUpgrade,
  rouletteColor,
  rouletteHit,
  roulettePayout,
  upgradeOutcomes,
  type PlinkoRisk,
  type RouletteTarget,
} from '../lib/verify-games';
import './fairness-checker.css';

export type CheckedGame = 'roulette' | 'upgrade' | 'crash' | 'plinko' | 'mines' | 'chicken';
type Form = Record<string, string>;
type Line = { label: string; value: string; ok?: boolean | null };

const EXTRA: Record<CheckedGame, [string, string, string?][]> = {
  roulette: [['bets', 'Фишки (JSON)', 'Например: [{"target":"red","amount":1000}] — суммы в сотых CR'], ['recorded', 'Число из истории', 'Необязательно']],
  upgrade: [['amount', 'Ставка, CR'], ['target', 'Цель, CR'], ['rtp', 'RTP, %'], ['recorded', 'Результат из истории', '0–999 999, необязательно']],
  crash: [['rtp', 'RTP, %'], ['cashout', 'Ваш вывод, ×', 'Пусто — не выводили'], ['amount', 'Ставка, CR'], ['recorded', 'Точка краша из истории, ×', 'Необязательно']],
  plinko: [['rows', 'Рядов'], ['risk', 'Риск', 'low, medium или high'], ['amount', 'Ставка, CR'], ['rtp', 'RTP, %'], ['recorded', 'Лунка из истории', 'Необязательно']],
  mines: [['bombs', 'Бомб'], ['moves', 'Открытые клетки', 'Номера 1–25 через запятую'], ['amount', 'Ставка, CR'], ['rtp', 'RTP, %'], ['recorded', 'Бомбы из истории', 'Номера 1–25, необязательно']],
  chicken: [['difficulty', 'Сложность', 'easy, medium, hard или daredevil'], ['moves', 'Пройдено полос'], ['amount', 'Ставка, CR'], ['rtp', 'RTP, %'], ['recorded', 'Машины из истории', 'Номера слотов 1–25, необязательно']],
};

function initial(game: CheckedGame, round: Round | null, retired: State['retired']): Form {
  const r = round as (Round & Record<string, unknown>) | null;
  const base: Form = {
    serverSeed: retired.find((s) => s.commitment === round?.commitment)?.seed ?? '',
    clientSeed: round?.clientSeed ?? '',
    nonce: String(round?.nonce ?? 0),
    commitment: round?.commitment ?? '',
    amount: String((round?.amount ?? 1000) / 100),
    rtp: String((round?.rtpBps ?? 9700) / 100),
  };
  if (!r) return { ...base, bets: '[{"target":"red","amount":1000}]', target: '20', cashout: '', rows: '8', risk: 'medium', bombs: '3', moves: '', difficulty: 'medium', recorded: '' };
  switch (game) {
    case 'roulette': return { ...base, bets: JSON.stringify(r.bets), recorded: String(r.result) };
    case 'upgrade': return { ...base, target: String((r.target as number) / 100), recorded: String(r.result) };
    case 'crash': return { ...base, cashout: r.cashout ? String((r.cashout as number) / 100) : '', recorded: r.crashPoint ? String((r.crashPoint as number) / 100) : '' };
    case 'plinko': return { ...base, rows: String(r.rows), risk: String(r.risk), recorded: String(r.bucket) };
    case 'mines': return { ...base, bombs: String(r.bombs), moves: (r.moves as number[]).map((c) => c + 1).join(', '), recorded: (r.board as number[] | undefined)?.map((c) => c + 1).join(', ') ?? '' };
    case 'chicken': return { ...base, difficulty: String(r.difficulty), moves: String((r.moves as number[]).length), recorded: (r.board as number[] | undefined)?.map((c) => c + 1).join(', ') ?? '' };
  }
}
const cents = (text: string, name: string) => {
  if (!/^\d+(\.\d{1,2})?$/.test(text.trim())) throw Error(`${name}: число с точностью до 0.01`);
  return Math.round(Number(text) * 100);
};
const bps = (text: string) => {
  const v = cents(text, 'RTP');
  if (v < 8000 || v > 9900) throw Error('RTP: от 80 до 99%');
  return v;
};
const list = (text: string) => (text.trim() ? text.split(',').map((v) => Number(v.trim()) - 1) : []);

async function check(game: CheckedGame, f: Form): Promise<{ lines: Line[]; hash: boolean | null; commitment: string }> {
  const seeds = { serverSeed: f.serverSeed.trim(), clientSeed: f.clientSeed, nonce: f.nonce.trim(), commitment: f.commitment.trim() };
  const recorded = f.recorded.trim();
  switch (game) {
    case 'roulette': {
      const p = await replayRoulette(seeds);
      let bets: { target: RouletteTarget; amount: number }[] = [];
      try { bets = JSON.parse(f.bets || '[]'); } catch { throw Error('Фишки: JSON-массив'); }
      const payout = bets.reduce((a, b) => a + (rouletteHit(b.target, p.result) ? roulettePayout(b.amount, bps(f.rtp), b.target) : 0), 0);
      return { hash: p.hashMatches, commitment: p.commitment, lines: [
        { label: 'Выпавшее число', value: `${p.result} (${{ red: 'красное', black: 'чёрное', green: 'зелёное' }[rouletteColor(p.result)]})`, ok: recorded ? Number(recorded) === p.result : null },
        { label: 'Расчётная выплата', value: money(payout) + ' CR' },
      ] };
    }
    case 'upgrade': {
      const p = await replayUpgrade(seeds);
      const W = upgradeOutcomes(cents(f.amount, 'Ставка'), cents(f.target, 'Цель'), bps(f.rtp));
      return { hash: p.hashMatches, commitment: p.commitment, lines: [
        { label: 'Выпавшее число', value: String(p.result), ok: recorded ? Number(recorded) === p.result : null },
        { label: 'Зона выигрыша', value: `0 … ${W - 1} (шанс ${(W / 1e4).toFixed(4)}%)` },
        { label: 'Итог', value: p.result < W ? `успех, выплата ${money(cents(f.target, 'Цель'))} CR` : 'мимо, выплата 0' },
      ] };
    }
    case 'crash': {
      const p = await replayCrash(seeds, bps(f.rtp));
      const out = f.cashout.trim() ? cents(f.cashout, 'Вывод') : null;
      return { hash: p.hashMatches, commitment: p.commitment, lines: [
        { label: 'Точка краша', value: '×' + mult(p.result / 100), ok: recorded ? cents(recorded, 'Точка краша') === p.result : null },
        { label: 'Итог', value: out === null ? 'без вывода — ставка сгорает' : out <= p.result ? `вывод ×${mult(out / 100)} успел, выплата ${money(Math.floor((cents(f.amount, 'Ставка') * out) / 100))} CR` : `вывод ×${mult(out / 100)} невозможен: краш раньше` },
      ] };
    }
    case 'plinko': {
      const rows = Number(f.rows), risk = f.risk.trim() as PlinkoRisk;
      if (!['low', 'medium', 'high'].includes(risk)) throw Error('Риск: low, medium или high');
      const p = await replayPlinko(seeds, rows);
      return { hash: p.hashMatches, commitment: p.commitment, lines: [
        { label: 'Путь', value: p.path.map((b) => (b ? '→' : '←')).join(' ') },
        { label: 'Лунка', value: `${p.result} из 0…${rows}`, ok: recorded ? Number(recorded) === p.result : null },
        { label: 'Расчётная выплата', value: money(plinkoPayout(cents(f.amount, 'Ставка'), rows, risk, bps(f.rtp), p.result)) + ' CR' },
      ] };
    }
    case 'mines':
    case 'chicken': {
      const chicken = game === 'chicken';
      const bombs = chicken ? CHICKEN_DIFFICULTY[f.difficulty.trim() as keyof typeof CHICKEN_DIFFICULTY] : Number(f.bombs);
      if (!bombs) throw Error('Сложность: easy, medium, hard или daredevil');
      const p = await replayMines(seeds, bombs, chicken ? 'chicken-v1' : 'mines-v1');
      const moves = chicken ? Array.from({ length: Number(f.moves) || 0 }, (_, i) => i) : list(f.moves);
      const hit = moves.findIndex((c) => p.result.includes(c));
      const hits = hit >= 0 ? hit : moves.length;
      const record = list(recorded).sort((a, b) => a - b);
      return { hash: p.hashMatches, commitment: p.commitment, lines: [
        { label: chicken ? 'Слоты с машинами' : 'Бомбы', value: p.result.map((c) => c + 1).join(', '), ok: recorded ? JSON.stringify(record) === JSON.stringify(p.result) : null },
        { label: 'Итог хода', value: moves.length ? (hit >= 0 ? `${chicken ? 'сбита на полосе' : 'бомба на ходу'} ${hit + 1}` : `${hits} ${chicken ? 'полос пройдено' : 'алмазов'}`) : 'ходы не указаны' },
        { label: 'Расчётная выплата', value: hit >= 0 ? '0,00 CR' : money(minesPayout(cents(f.amount, 'Ставка'), bps(f.rtp), bombs, hits)) + ' CR' },
      ] };
    }
  }
}

export default function GameChecker({ game, round, retired }: { game: CheckedGame; round: Round | null; retired: State['retired'] }) {
  const [form, setForm] = useState(() => initial(game, round, retired));
  const [result, setResult] = useState<Awaited<ReturnType<typeof check>> | null>(null);
  const [error, setError] = useState('');
  // A round opened from history with a revealed seed is checked once on mount.
  const [automatic] = useState(() => (round && form.serverSeed ? form : null));
  const [busy, setBusy] = useState(Boolean(automatic));
  async function run(values: Form) {
    setBusy(true);
    setError('');
    try { setResult(await check(game, values)); }
    catch (e) { setResult(null); setError(e instanceof Error ? e.message : 'Ошибка проверки'); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!automatic) return;
    let cancelled = false;
    check(game, automatic)
      .then((value) => { if (!cancelled) setResult(value); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Ошибка проверки'); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [automatic, game]);
  const field = (key: string, label: string, hint?: string) => (
    <div className="proof-field" key={key}>
      <label htmlFor={'check-' + key}>{label}</label>
      <input id={'check-' + key} value={form[key] ?? ''} disabled={busy} spellCheck={false} autoComplete="off" onChange={(e) => { setForm({ ...form, [key]: e.target.value }); setResult(null); }} />
      {hint && <small>{hint}</small>}
    </div>
  );
  return (
    <section className="proof-layout">
      <form className="panel proof-form" onSubmit={(e) => { e.preventDefault(); void run(form); }}>
        <div className="section-heading">
          <h2>Данные раунда</h2>
          <span className="badge">{game.toUpperCase()} · v1</span>
        </div>
        {round && <p className="proof-source">Из истории · раунд {round.id.slice(0, 8)}</p>}
        {round && !form.serverSeed && <p className="proof-wait">Seed этой сессии ещё не раскрыт. Завершите сессию ниже — проверка станет доступна.</p>}
        {field('serverSeed', 'Сид сервера', 'Раскрывается после завершения сессии')}
        {field('clientSeed', 'Сид клиента')}
        {field('commitment', 'Исходный SHA-256', 'Сохранён до ставки')}
        {field('nonce', 'Номер ставки (nonce)')}
        <div className="proof-fields">{EXTRA[game].map(([k, l, h]) => field(k, l, h))}</div>
        {error && <p className="notice error" role="alert">{error}</p>}
        <button className="primary-button" disabled={busy} type="submit">
          {busy ? 'Вычисляем…' : 'Проверить раунд'} <ArrowUpRight size={18} />
        </button>
      </form>
      <div className="proof-right">
        <h2>Результат проверки</h2>
        <div className="proof-result" aria-live="polite">
          {result ? (
            <>
              <div className={'proof-check ' + (result.hash === null ? 'muted' : result.hash ? 'green' : 'red')}>
                <ShieldCheck size={18} />
                {result.hash === null ? 'Хеш не указан — обязательство не проверено' : result.hash ? 'Seed соответствует исходному хешу' : 'Seed НЕ соответствует исходному хешу'}
              </div>
              <dl className="proof-lines">
                {result.lines.map((l) => (
                  <div key={l.label}>
                    <dt>{l.label}</dt>
                    <dd>
                      {l.value}
                      {l.ok !== undefined && l.ok !== null && <span className={l.ok ? 'green' : 'red'}>{l.ok ? ' ✓ совпадает с историей' : ' ✗ НЕ совпадает с историей'}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
              <details className="proof-hash">
                <summary>Вычисленный SHA-256</summary>
                <code className="hash">{result.commitment}</code>
              </details>
            </>
          ) : (
            <div className="proof-empty">
              <ShieldCheck size={40} />
              <h3>Воспроизведите раунд</h3>
              <p>По раскрытому seed браузер заново вычислит исход и выплату — без обращения к серверу.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
