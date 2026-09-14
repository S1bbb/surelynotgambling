import { ArrowUpRight, Dices, Mountain, ShieldCheck } from 'lucide-react';
import type { State } from '../lib/models';
import './ladder.css';

export default function Lobby({
  state,
  open,
}: {
  state: State;
  open: (tab: string) => void;
}) {
  return (
    <section className="lobby">
      {state.activeLadder && (
        <div className="notice lobby-resume">
          <span>
            Лестница в процессе · {state.activeLadder.steps} из 8 ступеней
          </span>
          <button onClick={() => open('ladder')}>
            Продолжить <ArrowUpRight size={16} />
          </button>
        </div>
      )}
      <div className="section-heading">
        <h2>
          Все игры <span>02</span>
        </h2>
        <span className="muted">SNG Originals</span>
      </div>
      <div className="game-catalog">
        <button
          className="catalog-card catalog-hilo"
          onClick={() => open('game')}
        >
          <div className="catalog-top">
            <span>01 / HI-LO</span>
            <Dices size={26} />
          </div>
          <div className="catalog-preview hilo-preview" aria-hidden="true">
            <span>
              49<span className="decimal">.99</span>
            </span>
            <div className="catalog-meter">
              <i />
            </div>
            <div className="catalog-zones">
              <span>МЕНЬШЕ</span>
              <span>БОЛЬШЕ</span>
            </div>
          </div>
          <div className="catalog-title">
            <h2>Больше / меньше</h2>
            <ArrowUpRight />
          </div>
          <p>Выберите порог и сторону. Один бросок — один результат.</p>
          <div className="catalog-footer">
            <span>
              <ShieldCheck size={15} /> Provably Fair
            </span>
            <strong>Играть →</strong>
          </div>
        </button>
        <button
          className="catalog-card catalog-ladder"
          onClick={() => open('ladder')}
        >
          <div className="catalog-top">
            <span>02 / ЛЕСТНИЦА</span>
            <Mountain size={26} />
          </div>
          <div className="catalog-preview ladder-preview" aria-hidden="true">
            {[0, 1, 2].map((row) => (
              <div className="mini-step" key={row}>
                {[0, 1, 2, 3, 4].map((col) => (
                  <span
                    key={col}
                    className={col === row + 1 ? 'mini-path' : ''}
                  >
                    {col === row + 1 ? (
                      '↑'
                    ) : col === 4 - row ? (
                      <Mountain size={17} />
                    ) : (
                      '·'
                    )}
                  </span>
                ))}
              </div>
            ))}
          </div>
          <div className="catalog-title">
            <h2>Лестница</h2>
            <ArrowUpRight />
          </div>
          <p>Обходите падающие камни. Заберите выигрыш до следующего шага.</p>
          <div className="catalog-footer">
            <span>
              <ShieldCheck size={15} /> Provably Fair
            </span>
            <strong>{state.activeLadder ? 'Продолжить →' : 'Играть →'}</strong>
          </div>
        </button>
      </div>
      <div className="lobby-note">
        <ShieldCheck size={19} />
        <p>
          У каждой ставки есть доказательство. Откройте её в истории, чтобы
          воспроизвести результат и сравнить исходные данные.
        </p>
        <button className="text-button" onClick={() => open('history')}>
          Мои ставки <ArrowUpRight size={16} />
        </button>
      </div>
    </section>
  );
}
