import type { ReactNode } from 'react';
import { ArrowUpRight, CircleHelp } from 'lucide-react';
import { useState } from 'react';

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode; hint?: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="segmented" disabled={disabled}>
      <legend>{label}</legend>
      <div style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 4)}, 1fr)` }}>
        {options.map((o) => (
          <button
            type="button"
            key={String(o.value)}
            className={o.value === value ? 'chosen' : ''}
            aria-pressed={o.value === value}
            title={o.hint}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

// Key numbers of the current bet: chance, multiplier, payout.
export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="facts">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PlayButton({
  children,
  onClick,
  disabled,
  tone = 'primary',
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'cashout';
}) {
  return (
    <button
      type="button"
      className={'play-button ' + tone}
      disabled={disabled}
      onClick={onClick}
    >
      <span>{children}</span>
      <ArrowUpRight size={20} />
    </button>
  );
}

export function GameError({ error }: { error: string }) {
  return error ? (
    <div className="notice error" role="alert">
      {error}
    </div>
  ) : null;
}

export function Rules({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rules-box">
      <button
        type="button"
        className="text-button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <CircleHelp size={16} /> {open ? 'Скрыть правила' : 'Правила и шансы'}
      </button>
      {open && <div className="rules">{children}</div>}
    </div>
  );
}

export function StageTop({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="stage-top">
      <span>
        <i /> {title}
      </span>
      {right}
    </div>
  );
}
