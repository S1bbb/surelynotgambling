import { ArrowUpRight, ShieldCheck } from 'lucide-react';
import type { GameId, State } from '../lib/models';
import { GAMES } from './catalog';

export const activeRound = (state: State, id: GameId) =>
  id === 'ladder' ? state.activeLadder : id === 'mines' ? state.activeMines : id === 'chicken' ? state.activeChicken : id === 'crash' ? state.activeCrash : null;

export default function Lobby({ state, open }: { state: State; open: (tab: string) => void }) {
  const unfinished = GAMES.filter((g) => activeRound(state, g.id));
  return (
    <section className="lobby">
      {unfinished.map((g) => (
        <div className="notice resume" key={g.id}>
          <span>У вас не закончен раунд: {g.title}</span>
          <button onClick={() => open(g.id)}>
            Продолжить <ArrowUpRight size={16} />
          </button>
        </div>
      ))}
      <div className="game-catalog">
        {GAMES.map((g) => (
          <button key={g.id} className={'catalog-card card-' + g.id} onClick={() => open(g.id)}>
            <span className="catalog-icon">
              <g.icon size={30} />
            </span>
            <span className="catalog-title">
              {g.title}
              {activeRound(state, g.id) && <em>идёт раунд</em>}
            </span>
            <span className="catalog-text">{g.tagline}</span>
            <span className="catalog-footer">
              <span>
                <ShieldCheck size={14} /> RTP {state.rtpBps / 100}%
              </span>
              <strong>Играть →</strong>
            </span>
          </button>
        ))}
      </div>
      <div className="lobby-note">
        <ShieldCheck size={19} />
        <p>
          Исход каждой ставки заранее зафиксирован хешем server seed и
          проверяется в браузере после раскрытия seed. Кредиты виртуальные.
        </p>
        <button className="text-button" onClick={() => open('stats')}>
          Статистика <ArrowUpRight size={16} />
        </button>
      </div>
    </section>
  );
}
