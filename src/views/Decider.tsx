import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Navigation, RotateCcw, Shuffle } from 'lucide-react';
import { useStore } from '../store/useStore';
import type { RestaurantEntry } from '../data/seedData';
import { directionsUrl, fmtEuro, fmtScore, ofKind } from '../lib/utils';
import { Chip, ICON, Kicker, Photo, Segmented } from '../components/ui';
import { CONFETTI_COLORS } from '../components/RateSheet';

type Phase = 'idle' | 'shuffling' | 'done';
type Pool = 'nuevo' | 'clasico' | 'sorpresa';

export default function Decider({ onOpen }: { onOpen: (id: string) => void }) {
  const restaurants = useStore((s) => s.restaurants);
  const mode = useStore((s) => s.mode);
  const home = mode === 'recipe';
  const mine = useMemo(() => ofKind(restaurants, mode), [restaurants, mode]);

  // Sin pendientes no hay nada "nuevo" que sortear: empezar por los clásicos.
  const [pool, setPool] = useState<Pool>(() => (mine.some((r) => r.status === 'wishlist') ? 'nuevo' : 'clasico'));
  const [hood, setHood] = useState<string | null>(null);
  const [budget, setBudget] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [current, setCurrent] = useState<RestaurantEntry | null>(null);
  const timers = useRef<number[]>([]);

  // Nuevo = pendientes · Clásico = los que repetiríamos con nota ≥ 8.5 · Sorpresa = todo.
  const base = useMemo(
    () =>
      mine.filter((r) =>
        pool === 'nuevo'
          ? r.status === 'wishlist'
          : pool === 'clasico'
            ? r.status === 'visited' && r.wouldRepeat !== false && (r.scores?.average ?? 0) >= 8.5
            : r.status === 'wishlist' || r.wouldRepeat !== false
      ),
    [mine, pool]
  );
  const hoods = [...new Set(base.map((r) => r.neighborhood).filter(Boolean) as string[])];
  const prices = base.map((r) => r.pricePerPerson).filter((p): p is number => p != null);
  const maxPrice = prices.length ? Math.max(20, ...prices.map((p) => Math.ceil(p / 5) * 5)) : 0;
  const cap = budget ?? maxPrice;
  const candidates = base.filter(
    (r) => (!hood || r.neighborhood === hood) && (r.pricePerPerson == null || !maxPrice || r.pricePerPerson <= cap)
  );

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    timers.current.forEach(clearTimeout);
    setPhase('idle');
    setCurrent(null);
  }, [hood, budget, pool, mode]);
  useEffect(() => {
    setHood(null);
    setBudget(null);
  }, [pool, mode]);

  const shuffle = () => {
    if (!candidates.length) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPhase('shuffling');
    const winner = candidates[Math.floor(Math.random() * candidates.length)];
    const steps = 22;
    let t = 0;
    let last = -1;
    for (let i = 0; i < steps; i++) {
      t += 55 + Math.pow(i / steps, 3) * 420; // frena como una ruleta
      const isLast = i === steps - 1;
      timers.current.push(
        window.setTimeout(() => {
          if (isLast) {
            setCurrent(winner);
            setPhase('done');
            if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
              confetti({ particleCount: 130, spread: 80, origin: { y: 0.5 }, colors: CONFETTI_COLORS, zIndex: 2000 });
            }
          } else {
            let idx = Math.floor(Math.random() * candidates.length);
            if (candidates.length > 1 && idx === last) idx = (idx + 1) % candidates.length;
            last = idx;
            setCurrent(candidates[idx]);
          }
        }, t)
      );
    }
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="shrink-0">
        <Kicker>Decisor</Kicker>
        <h2 className="font-serif text-[30px] leading-none">{home ? '¿Qué cocinamos hoy?' : '¿Dónde vamos hoy?'}</h2>
      </div>

      <div className="shrink-0 space-y-2.5">
        <Segmented
          label="Qué sortear"
          size="sm"
          value={pool}
          onChange={setPool}
          options={[
            { value: 'nuevo', label: 'Algo nuevo' },
            { value: 'clasico', label: 'Un clásico' },
            { value: 'sorpresa', label: 'Sorpresa' },
          ]}
        />
        {hoods.length > 1 && (
          <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
            <Chip active={!hood} onClick={() => setHood(null)}>
              Cualquier barrio
            </Chip>
            {hoods.map((n) => (
              <Chip key={n} active={hood === n} onClick={() => setHood(hood === n ? null : n)}>
                {n}
              </Chip>
            ))}
          </div>
        )}
        {maxPrice > 0 && (
          <label className="flex items-center gap-3">
            <span className="shrink-0 font-mono text-[10px] tracking-[0.15em] text-muted uppercase">Máx.</span>
            <input
              type="range"
              min={10}
              max={maxPrice}
              step={1}
              value={cap}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="slider"
              style={{
                ['--fill' as string]: `${((cap - 10) / (maxPrice - 10)) * 100}%`,
                ['--accent' as string]: '#4A6B53',
              }}
              aria-label="Presupuesto máximo por persona"
            />
            <span className="w-16 shrink-0 text-right font-mono text-[14px]">{fmtEuro(cap)}</span>
          </label>
        )}
      </div>

      {/* Bombo */}
      <div className="relative grid min-h-0 flex-1 place-items-center overflow-hidden rounded-3xl border border-line bg-sand p-4">
        <AnimatePresence mode="popLayout">
          {phase === 'idle' || !current ? (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex max-h-full flex-wrap content-center justify-center gap-2 overflow-hidden"
            >
              {candidates.length === 0 ? (
                <p className="text-center font-serif text-[24px] text-muted">
                  {pool === 'nuevo' ? 'No hay pendientes que sortear.' : 'Nada encaja con esos filtros.'}
                </p>
              ) : (
                candidates.map((r, i) => (
                  <motion.span
                    key={r.id}
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.25, ease: 'easeInOut' }}
                    className="rounded-full border border-line bg-cream px-3.5 py-2 text-[13px] font-semibold"
                  >
                    {r.name}
                  </motion.span>
                ))
              )}
            </motion.div>
          ) : (
            <motion.div
              key={phase === 'done' ? `win-${current.id}` : `spin-${current.id}-${Math.random()}`}
              initial={phase === 'done' ? { scale: 0.85, opacity: 0, rotate: -3 } : { y: 40, opacity: 0 }}
              animate={{ scale: 1, opacity: 1, y: 0, rotate: 0 }}
              exit={{ y: -40, opacity: 0 }}
              transition={phase === 'done' ? { type: 'spring', damping: 14, stiffness: 220 } : { duration: 0.08 }}
              className={`flex max-h-full w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-line bg-cream ${
                phase === 'done' ? 'shadow-lift' : ''
              }`}
            >
              <Photo
                src={current.imageUrl}
                alt={current.name}
                category={current.category}
                className="h-[clamp(70px,16dvh,150px)] w-full shrink-0"
                emojiSize="text-5xl"
              />
              <div className="p-3.5 text-center">
                {phase === 'done' && (
                  <p className="font-mono text-[10px] tracking-[0.25em] text-terracotta">★ HOY TOCA ★</p>
                )}
                <p className="font-serif text-[28px] leading-tight">{current.name}</p>
                <p className="text-[12.5px] text-muted">
                  {[current.neighborhood, current.category].filter(Boolean).join(' · ')}
                  {current.scores && <span className="font-mono"> · {fmtScore(current.scores.average)}</span>}
                  {current.pricePerPerson != null && <span className="font-mono"> · ~{fmtEuro(current.pricePerPerson)}</span>}
                </p>
                {phase === 'done' && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {current.coordinates ? (
                      <a
                        href={directionsUrl(current.coordinates)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-1.5 rounded-full bg-ink py-2.5 text-[13px] font-semibold text-paper"
                      >
                        <Navigation size={15} {...ICON} /> Cómo llegar
                      </a>
                    ) : (
                      <span />
                    )}
                    <button
                      type="button"
                      onClick={() => onOpen(current.id)}
                      className="rounded-full bg-sand py-2.5 text-[13px] font-semibold"
                    >
                      Ver ficha
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <button
        type="button"
        onClick={shuffle}
        disabled={!candidates.length || phase === 'shuffling'}
        className="flex h-14 w-full shrink-0 items-center justify-center gap-2 rounded-full bg-terracotta text-[16px] font-semibold text-white transition-colors hover:bg-terracotta-dark disabled:opacity-50"
      >
        {phase === 'done' ? <RotateCcw size={18} {...ICON} /> : <Shuffle size={18} {...ICON} />}
        {phase === 'shuffling'
          ? 'Barajando…'
          : phase === 'done'
            ? 'Otra vez'
            : `Sortear entre ${candidates.length}`}
      </button>
    </div>
  );
}
