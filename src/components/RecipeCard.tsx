import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChefHat, ChevronLeft, ChevronRight, Clock, ExternalLink, ListChecks, Plus, Users, X } from 'lucide-react';
import type { RestaurantEntry } from '../data/seedData';
import { fmtMinutes, sourceLabel } from '../lib/recipe';
import { ICON, Kicker } from './ui';
import { useBackHandler } from '../lib/back';

/** La receta dentro de la ficha: ingredientes para ir tachando, pasos y "modo cocina". */
export default function RecipeCard({ r, onEdit }: { r: RestaurantEntry; onEdit: () => void }) {
  const rec = r.recipe;
  const [done, setDone] = useState<Set<number>>(new Set());
  const [cooking, setCooking] = useState(false);

  if (!rec || (!rec.ingredients.length && !rec.steps.length)) {
    return (
      <button
        type="button"
        onClick={onEdit}
        className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-stone-300 p-4 text-left"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-terracotta/10 text-terracotta">
          <Plus size={20} {...ICON} />
        </span>
        <span>
          <span className="block text-[15px] font-semibold">Añadir la receta</span>
          <span className="block text-[12.5px] text-muted">Pega el texto de un TikTok o escríbela: la ordeno en ingredientes y pasos.</span>
        </span>
      </button>
    );
  }

  const toggle = (k: number) =>
    setDone((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <section className="rounded-2xl border border-line bg-cream p-4" aria-label="La receta">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Kicker>La receta</Kicker>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[12px] text-muted">
            {rec.minutes != null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sand px-2.5 py-1">
                <Clock size={12} {...ICON} /> {fmtMinutes(rec.minutes)}
              </span>
            )}
            {rec.servings != null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sand px-2.5 py-1">
                <Users size={12} {...ICON} /> {rec.servings} {rec.servings === 1 ? 'ración' : 'raciones'}
              </span>
            )}
            {rec.sourceUrl && (
              <a
                href={rec.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full bg-sand px-2.5 py-1 text-ink"
              >
                <ExternalLink size={12} {...ICON} /> Ver en {sourceLabel(rec.sourceUrl)}
              </a>
            )}
          </div>
        </div>
        <button type="button" onClick={onEdit} className="shrink-0 text-[12.5px] font-semibold text-muted underline-offset-2 hover:underline">
          Editar
        </button>
      </div>

      {rec.ingredients.length > 0 && (
        <>
          <p className="mt-4 mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold">
            <ListChecks size={15} {...ICON} /> Ingredientes
            <span className="font-mono text-[11px] font-normal text-muted">
              {done.size}/{rec.ingredients.length}
            </span>
          </p>
          <ul className="space-y-0.5">
            {rec.ingredients.map((ing, k) => (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => toggle(k)}
                  aria-pressed={done.has(k)}
                  className="flex w-full items-start gap-2.5 rounded-lg py-1.5 text-left text-[14.5px]"
                >
                  <span
                    className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 text-[11px] transition-colors ${
                      done.has(k) ? 'border-sage bg-sage text-white' : 'border-stone-300'
                    }`}
                  >
                    {done.has(k) && '✓'}
                  </span>
                  <span className={done.has(k) ? 'text-muted line-through' : ''}>{ing}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {rec.steps.length > 0 && (
        <>
          <p className="mt-4 mb-2 text-[13px] font-semibold">Paso a paso</p>
          <ol className="space-y-3">
            {rec.steps.map((s, k) => (
              <li key={k} className="flex gap-3 text-[14.5px] leading-snug">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink font-mono text-[11px] text-paper">{k + 1}</span>
                <span className="pt-0.5">{s}</span>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={() => setCooking(true)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-terracotta py-3.5 font-semibold text-white"
          >
            <ChefHat size={18} {...ICON} /> Modo cocina
          </button>
        </>
      )}

      {cooking && createPortal(<CookMode r={r} onClose={() => setCooking(false)} />, document.body)}
    </section>
  );
}

/** Pantalla completa, un paso cada vez, letra grande y la pantalla sin apagarse. */
function CookMode({ r, onClose }: { r: RestaurantEntry; onClose: () => void }) {
  const steps = r.recipe!.steps;
  const ingredients = r.recipe!.ingredients;
  const [k, setK] = useState(-1); // -1 = ingredientes
  const [dir, setDir] = useState(1);
  const total = steps.length;
  useBackHandler(true, onClose);

  // Que no se apague la pantalla con las manos llenas de harina.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {});
    const onKey = (e: KeyboardEvent) => {

      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      lock?.release().catch(() => {});
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = (d: number) => {
    setDir(d);
    setK((x) => Math.max(-1, Math.min(total - 1, x + d)));
  };

  return (
    <div className="fixed inset-0 z-[1400] flex flex-col bg-ink text-paper" role="dialog" aria-modal="true" aria-label={`Modo cocina: ${r.name}`}>
      <div className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.2em] text-paper/50 uppercase">Modo cocina</p>
          <p className="truncate font-serif text-[24px] leading-none">{r.name}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Salir" className="grid h-11 w-11 place-items-center rounded-full bg-paper/10">
          <X size={20} {...ICON} />
        </button>
      </div>

      <div className="flex gap-1 px-5" aria-hidden>
        {[-1, ...steps.map((_, i) => i)].map((i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i <= k ? 'bg-terracotta' : 'bg-paper/15'}`} />
        ))}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div
            key={k}
            initial={{ x: dir * 80, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: dir * -80, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.3}
            onDragEnd={(_, info) => {
              if (info.offset.x < -70) go(1);
              else if (info.offset.x > 70) go(-1);
            }}
            className="absolute inset-0 overflow-y-auto px-6 pt-8 pb-6"
          >
            {k === -1 ? (
              <>
                <p className="font-mono text-[12px] tracking-[0.2em] text-terracotta">ANTES DE EMPEZAR</p>
                <p className="mt-2 font-serif text-[36px] leading-tight">Ten esto a mano</p>
                <ul className="mt-5 space-y-3 text-[20px] leading-snug">
                  {ingredients.map((ing, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="text-terracotta">•</span>
                      {ing}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <p className="font-mono text-[12px] tracking-[0.2em] text-terracotta">
                  PASO {k + 1} DE {total}
                </p>
                <p className="mt-4 text-[clamp(24px,6.5vw,34px)] leading-snug font-medium">{steps[k]}</p>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex gap-3 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={k === -1}
          aria-label="Paso anterior"
          className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-paper/10 disabled:opacity-30"
        >
          <ChevronLeft size={26} {...ICON} />
        </button>
        {k < total - 1 ? (
          <button
            type="button"
            onClick={() => go(1)}
            className="flex h-16 flex-1 items-center justify-center gap-2 rounded-full bg-terracotta text-[18px] font-semibold"
          >
            {k === -1 ? 'Empezar' : 'Siguiente'} <ChevronRight size={22} {...ICON} />
          </button>
        ) : (
          <button type="button" onClick={onClose} className="flex h-16 flex-1 items-center justify-center rounded-full bg-sage text-[18px] font-semibold">
            ¡Listo! A comer 🍽️
          </button>
        )}
      </div>
    </div>
  );
}
