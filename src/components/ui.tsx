import { useState, type ReactNode } from 'react';
import { emojiFor, fmtScore } from '../lib/utils';

export const ICON = { strokeWidth: 1.75 } as const;

/** Fondo cálido por tipo de comida para cuando no hay foto (misma familia que la paleta). */
const TONES = [
  'from-[#F6D9CF] to-[#EBC0B1]', // terracota suave
  'from-[#DCE5D8] to-[#C5D3C0]', // oliva suave
  'from-[#F7E7C4] to-[#EED39A]', // dorado suave
  'from-[#EFE3D2] to-[#DFCDB4]', // arena
  'from-[#EAD9DD] to-[#D9C0C6]', // rosa vino
];
export const tileTone = (category: string) =>
  TONES[[...category].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % TONES.length];

/** Foto con respaldo cálido (emoji del tipo de comida) si falta o falla. */
export function Photo({
  src,
  alt,
  category = '',
  className = '',
  emojiSize = 'text-2xl',
}: {
  src?: string;
  alt: string;
  category?: string;
  className?: string;
  emojiSize?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div
        className={`grid place-items-center bg-gradient-to-br ${tileTone(category)} ${className}`}
        role="img"
        aria-label={alt}
      >
        <span className={emojiSize} aria-hidden>
          {emojiFor(category)}
        </span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`bg-sand object-cover ${className}`}
    />
  );
}

export function ScorePill({ who, value }: { who: 'G' | 'V'; value: number }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-sand px-2 py-0.5 font-mono text-[11px] text-ink"
      title={who === 'G' ? 'Nota de Gonzalo' : 'Nota de Vero'}
    >
      <span className="text-muted">{who}</span>
      {fmtScore(value)}
    </span>
  );
}

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors ${
        active ? 'bg-ink text-paper' : 'bg-sand text-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-cream shadow-warm ${className}`}>{children}</div>;
}

export function Kicker({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`font-mono text-[10px] tracking-[0.18em] text-muted uppercase ${className}`}>{children}</p>;
}

/** Puntos de 1 a 5 estilo recibo: ●●●●○ */
export function Dots({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <span className="font-mono tracking-[0.12em]" aria-label={`${value} de ${max}`}>
      <span className="text-ink">{'●'.repeat(value)}</span>
      <span className="text-stone-300">{'○'.repeat(Math.max(0, max - value))}</span>
    </span>
  );
}

/** Control segmentado de 2-3 opciones. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  size?: 'sm' | 'md';
  label: string;
}) {
  return (
    <div className="flex gap-1 rounded-full bg-sand p-1" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-full font-semibold whitespace-nowrap transition-colors ${
            size === 'sm' ? 'px-3 py-1.5 text-[12.5px]' : 'px-3 py-2.5 text-[14px]'
          } ${value === o.value ? 'bg-cream text-ink shadow-warm' : 'text-muted'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
