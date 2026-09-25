import { ArrowUpDown, Bird, ChevronsUp, CircleDot, Dices, Gem, Mountain, Rocket, Triangle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { GameId, Round } from '../lib/models';
import { mult } from '../lib/format';

export const GAMES: { id: GameId; title: string; icon: LucideIcon; tagline: string }[] = [
  { id: 'crash', title: 'Краш', icon: Rocket, tagline: 'Заберите выигрыш до того, как ракета улетит' },
  { id: 'mines', title: 'Минёр', icon: Gem, tagline: 'Открывайте алмазы, обходите бомбы' },
  { id: 'chicken', title: 'Курочка', icon: Bird, tagline: 'Переведите курицу через дорогу' },
  { id: 'plinko', title: 'Плинко', icon: Triangle, tagline: 'Шарик, штыри и множители внизу' },
  { id: 'roulette', title: 'Рулетка', icon: CircleDot, tagline: 'Красное, чёрное или зелёное 0' },
  { id: 'upgrade', title: 'Апгрейд', icon: ChevronsUp, tagline: 'Рискните суммой ради цели побольше' },
  { id: 'ladder', title: 'Лестница', icon: Mountain, tagline: 'Поднимайтесь, пока не упал камень' },
  { id: 'hilo', title: 'Больше / меньше', icon: ArrowUpDown, tagline: 'Число выше или ниже порога' },
];
export const gameTitle = (id: GameId) => GAMES.find((g) => g.id === id)?.title ?? id;
export const BrandIcon = Dices;

const color = (n: number) => (n === 0 ? 'зел.' : n <= 7 ? 'крас.' : 'чёрн.');
const target = (t: string | number) => (t === 'red' ? 'красное' : t === 'black' ? 'чёрное' : `№${t}`);
// Human description of the bet and of the outcome for the history table.
export function describe(r: Round): { condition: string; outcome: string } {
  switch (r.game ?? 'hilo') {
    case 'hilo': {
      const h = r as Extract<Round, { threshold: number }>;
      return { condition: `${h.direction === 'under' ? '<' : '≥'} ${h.threshold}`, outcome: (h.result / 100).toFixed(2) };
    }
    case 'ladder': {
      const l = r as Extract<Round, { game: 'ladder' }>;
      const rows = l.widths?.length ?? l.rows;
      return { condition: `${l.rocks} камн.`, outcome: `${l.steps}/${rows} · ${l.status === 'lost' ? 'камень' : l.status === 'completed' ? 'вершина' : 'забрал'}` };
    }
    case 'mines':
    case 'chicken': {
      const m = r as Extract<Round, { game: 'mines' | 'chicken' }>;
      const names = { easy: 'лёгкая', medium: 'средняя', hard: 'сложная', daredevil: 'безумная' };
      return {
        condition: m.game === 'mines' ? `${m.bombs} бомб` : names[m.difficulty ?? 'easy'],
        outcome: `${m.hits}/${m.maxHits} · ${m.status === 'lost' ? (m.game === 'mines' ? 'бомба' : 'сбита') : m.status === 'completed' ? 'всё поле' : 'забрал'}`,
      };
    }
    case 'crash': {
      const c = r as Extract<Round, { game: 'crash' }>;
      return {
        condition: c.target ? `авто ×${mult(c.target / 100)}` : 'вручную',
        outcome: `краш ×${mult((c.crashPoint ?? 100) / 100)}${c.cashout ? ` · вывод ×${mult(c.cashout / 100)}` : ''}`,
      };
    }
    case 'roulette': {
      const x = r as Extract<Round, { game: 'roulette' }>;
      return { condition: x.bets.map((b) => target(b.target)).join(', '), outcome: `${x.result} ${color(x.result)}` };
    }
    case 'upgrade': {
      const u = r as Extract<Round, { game: 'upgrade' }>;
      return { condition: `цель ×${mult(u.target / u.amount)} · ${u.chance.toFixed(2)}%`, outcome: u.won ? 'успех' : 'мимо' };
    }
    case 'plinko': {
      const p = r as Extract<Round, { game: 'plinko' }>;
      const risk = { low: 'низк.', medium: 'средн.', high: 'высок.' }[p.risk];
      return { condition: `${p.rows} рядов · ${risk}`, outcome: `лунка ${p.bucket}` };
    }
  }
}
