import { Sigma } from 'lucide-react';
import type { GameId, GameStats, State } from '../lib/models';
import { money, mult, pct } from '../lib/format';
import { GAMES } from './catalog';

// All values in cents; variance in cents². Under a correct game (paid − expected)/σ ≈ N(0, 1).
export function derive(g: GameStats) {
  const sd = Math.sqrt(g.variance);
  const z = sd > 0 ? (g.paid - g.expected) / sd : 0;
  return {
    ...g,
    sd,
    z,
    rtp: g.wagered ? g.paid / g.wagered : 0,
    expectedRtp: g.wagered ? g.expected / g.wagered : 0,
    low: g.wagered ? (g.expected - 1.96 * sd) / g.wagered : 0,
    high: g.wagered ? (g.expected + 1.96 * sd) / g.wagered : 0,
    net: g.paid - g.wagered,
  };
}
export function verdict(z: number, count: number) {
  if (count < 30) return { text: 'Мало данных', tone: 'muted' };
  const a = Math.abs(z);
  if (a < 1.96) return { text: 'В пределах нормы', tone: 'green' };
  if (a < 3) return { text: 'Необычно, но возможно', tone: 'amber' };
  return { text: 'Сильное отклонение', tone: 'red' };
}
const signed = (cents: number) => (cents > 0 ? '+' : cents < 0 ? '−' : '') + money(Math.abs(cents));

export default function StatsView({ state, compact }: { state: State; compact?: boolean }) {
  const total = derive(state.stats);
  const rows = GAMES.map((g) => ({ ...g, s: state.stats.games[g.id as GameId] })).filter((g) => g.s?.count);
  const v = verdict(total.z, total.count);
  return (
    <>
      <div className="stat-tiles">
        <div className="panel">
          <span>Раундов</span>
          <strong>{total.count.toLocaleString('ru-RU')}</strong>
        </div>
        <div className="panel">
          <span>Оборот</span>
          <strong>{money(total.wagered)} <small>CR</small></strong>
        </div>
        <div className="panel">
          <span>Итог игрока</span>
          <strong className={total.net >= 0 ? 'green' : 'red'}>{signed(total.net)} <small>CR</small></strong>
          <em>ожидалось {signed(total.expected - total.wagered)}</em>
        </div>
        <div className="panel">
          <span>Фактический RTP</span>
          <strong>{total.wagered ? pct(total.rtp) : '—'}</strong>
          <em>ожидалось {total.wagered ? pct(total.expectedRtp) : '—'}</em>
        </div>
        <div className="panel">
          <span>Отклонение от ожидания</span>
          <strong className={v.tone}>{total.count ? `${total.z >= 0 ? '+' : '−'}${Math.abs(total.z).toFixed(2)}σ` : '—'}</strong>
          <em className={v.tone}>{v.text}</em>
        </div>
      </div>
      <div className="table-wrap">
        <table className="stats-table">
          <thead>
            <tr>
              <th>Игра</th>
              <th>Раунды</th>
              <th>Оборот</th>
              <th>Выплачено</th>
              <th>Итог игрока</th>
              <th>RTP факт</th>
              <th>RTP ожид.</th>
              <th>95% коридор RTP</th>
              <th>σ выплат</th>
              <th>Откл.</th>
              {!compact && <th>С выплатой</th>}
              {!compact && <th>В плюс</th>}
              {!compact && <th>Лучший ×</th>}
            </tr>
          </thead>
          <tbody>
            {[...rows, { id: 'total', title: 'Все игры', s: state.stats as GameStats }].map((row) => {
              const d = derive(row.s!);
              const t = verdict(d.z, d.count);
              return (
                <tr key={row.id} className={row.id === 'total' ? 'total-row' : ''}>
                  <td>{row.title}</td>
                  <td>{d.count}</td>
                  <td>{money(d.wagered)}</td>
                  <td>{money(d.paid)}</td>
                  <td className={d.net >= 0 ? 'green' : 'red'}>{signed(d.net)}</td>
                  <td>{pct(d.rtp)}</td>
                  <td>{pct(d.expectedRtp, 3)}</td>
                  <td className="muted">
                    {pct(Math.max(0, d.low), 1)} … {pct(d.high, 1)}
                  </td>
                  <td>{money(d.sd)}</td>
                  <td className={t.tone} title={t.text}>
                    {d.z >= 0 ? '+' : '−'}
                    {Math.abs(d.z).toFixed(2)}σ
                  </td>
                  {!compact && <td>{pct(d.paying / d.count, 1)}</td>}
                  {!compact && <td>{pct(d.profitable / d.count, 1)}</td>}
                  {!compact && <td>×{mult(d.best)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <div className="empty"><p>Статистика появится после первых ставок</p></div>}
      </div>
      {!compact && (
        <section className="panel explain stats-explain">
          <h2>
            <Sigma size={20} /> Как считаются величины
          </h2>
          <p>
            <strong>Ожидаемая выплата</strong> считается точно для каждого раунда
            с учётом округления вниз до 0.01 CR. Для Hi-Lo, рулетки, апгрейда и
            плинко — по полному распределению исходов. В лестнице, минёре,
            курочке и краше игрок решает по ходу, поэтому ожидание складывается
            из шагов, которые он реально сделал: Σ (шанс шага × стоимость после
            шага − стоимость до шага). Это разложение Дуба: оно несмещённое при
            любой стратегии вывода.
          </p>
          <p>
            <strong>σ выплат</strong> — стандартное отклонение суммы выплат:
            корень из суммы дисперсий по раундам (для пошаговых игр — Σ шанс ×
            (1 − шанс) × стоимость²). <strong>Отклонение</strong> = (выплачено −
            ожидалось) / σ. У честной игры оно распределено примерно как N(0, 1):
            в 95% случаев |откл.| &lt; 1.96σ. <strong>95% коридор RTP</strong> —
            (ожидалось ± 1.96σ) / оборот: на коротких сериях он широкий, и
            фактический RTP вполне может быть выше 100%.
          </p>
          <p className="muted">
            «С выплатой» — доля раундов с ненулевой выплатой, «в плюс» — доля,
            где выплата больше ставки. В плинко выплата бывает почти всегда, но
            часто меньше ставки. Незавершённые раунды в статистику не входят.
          </p>
        </section>
      )}
    </>
  );
}
