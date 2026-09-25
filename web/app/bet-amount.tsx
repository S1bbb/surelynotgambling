import { Coins } from 'lucide-react';
import { parseAmount } from '../lib/format';

// Shared stake input: ½, ×2, min and max keep the value within 1–1 000 CR and the balance.
export default function BetAmount({
  id,
  value,
  onChange,
  balance,
  disabled,
  label = 'Сумма ставки',
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  balance: number;
  disabled?: boolean;
  label?: string;
}) {
  const cents = parseAmount(value) ?? 0;
  const clamp = (c: number) =>
    String(Math.max(100, Math.min(100000, balance, Math.round(c))) / 100);
  return (
    <div className="bet-amount">
      <label htmlFor={id}>
        {label} <span>CR</span>
      </label>
      <div className="amount-input">
        <Coins size={18} />
        <input
          id={id}
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          autoComplete="off"
        />
      </div>
      <div className="amount-actions">
        <button type="button" disabled={disabled} onClick={() => onChange(clamp(cents / 2))}>
          ½
        </button>
        <button type="button" disabled={disabled} onClick={() => onChange(clamp(cents * 2))}>
          ×2
        </button>
        <button type="button" disabled={disabled} onClick={() => onChange('1')}>
          Мин
        </button>
        <button type="button" disabled={disabled} onClick={() => onChange(clamp(100000))}>
          Макс
        </button>
      </div>
    </div>
  );
}
