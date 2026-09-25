import { History, ShieldCheck } from 'lucide-react';
import { gameOf, type Round } from '../lib/models';
import { money, mult } from '../lib/format';
import { describe, gameTitle } from './catalog';

export default function HistoryTable({ rounds, verify }: { rounds: Round[]; verify: (r: Round) => void }) {
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
            <th>Множитель</th>
            <th>Выплата</th>
            <th aria-label="Проверка" />
          </tr>
        </thead>
        <tbody>
          {rounds.map((r) => {
            const { condition, outcome } = describe(r);
            const profit = r.payout - r.amount;
            return (
              <tr key={r.id} className="bet-history-row">
                <td>{new Date(r.createdAt).toLocaleTimeString('ru-RU')}</td>
                <td>{gameTitle(gameOf(r))}</td>
                <td>
                  <button className="bet-open" aria-label={`Открыть и проверить ставку ${r.id.slice(0, 8)}`} onClick={() => verify(r)}>
                    {money(r.amount)}
                  </button>
                </td>
                <td className="muted">{condition}</td>
                <td>
                  <span className={'result-tag ' + (profit > 0 ? 'won' : profit < 0 ? 'lost' : 'even')}>{outcome}</span>
                </td>
                <td>×{mult(r.payout / r.amount)}</td>
                <td className={profit > 0 ? 'green' : profit < 0 ? 'red' : 'muted'}>
                  {money(r.payout)}
                </td>
                <td>
                  <button className="icon-button" aria-label="Проверить ставку" onClick={() => verify(r)}>
                    <ShieldCheck size={17} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rounds.length && (
        <div className="empty">
          <History size={26} />
          <p>Здесь появятся ваши ставки</p>
          <span>Сыграйте в любую игру — каждую ставку можно будет проверить.</span>
        </div>
      )}
    </div>
  );
}
