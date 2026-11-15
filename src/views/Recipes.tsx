import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, ChefHat, Clock, Plus, Search, Sparkles, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import type { RestaurantEntry } from '../data/seedData';
import { emojiFor, fmtScore, lastVisit, norm } from '../lib/utils';
import { fmtMinutes } from '../lib/recipe';
import { Chip, ICON, Kicker, Photo } from '../components/ui';

type Show = 'all' | 'done' | 'todo' | 'steps';
type Order = 'name' | 'score' | 'recent' | 'quick';

interface Props {
  onOpen: (id: string) => void;
  onAdd: () => void;
  onDiscover: () => void;
}

/** Recetario: todas las recetas (hechas y por hacer) para buscar qué cocinar. */
export default function Recipes({ onOpen, onAdd, onDiscover }: Props) {
  const restaurants = useStore((s) => s.restaurants);
  const recipes = useMemo(() => restaurants.filter((r) => r.kind === 'recipe'), [restaurants]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [show, setShow] = useState<Show>('all');
  const [order, setOrder] = useState<Order>('name');

  const categories = useMemo(() => {
    const count = new Map<string, number>();
    recipes.forEach((r) => count.set(r.category, (count.get(r.category) ?? 0) + 1));
    return [...count.entries()].sort((a, b) => b[1] - a[1]);
  }, [recipes]);

  const nq = norm(q);
  const list = recipes
    .filter((r) => !cat || r.category === cat)
    .filter((r) =>
      show === 'done' ? r.status === 'visited' : show === 'todo' ? r.status === 'wishlist' : show === 'steps' ? !!r.recipe?.steps.length : true
    )
    .filter(
      (r) =>
        !nq ||
        norm(
          [r.name, r.category, ...(r.tags ?? []), ...(r.recipe?.ingredients ?? []), r.notes ?? '', r.bestDish ?? ''].join(' ')
        ).includes(nq)
    )
    .sort((a, b) => {
      if (order === 'score') return (b.scores?.average ?? -1) - (a.scores?.average ?? -1) || a.name.localeCompare(b.name, 'es');
      if (order === 'recent') return (lastVisit(b) ?? '').localeCompare(lastVisit(a) ?? '') || a.name.localeCompare(b.name, 'es');
      if (order === 'quick') return (a.recipe?.minutes ?? 9999) - (b.recipe?.minutes ?? 9999) || a.name.localeCompare(b.name, 'es');
      return a.name.localeCompare(b.name, 'es');
    });

  const done = recipes.filter((r) => r.status === 'visited').length;

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <Kicker>
            {recipes.length} recetas · {done} hechas · {recipes.length - done} por hacer
          </Kicker>
          <h2 className="font-serif text-[30px] leading-none">Recetario</h2>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onDiscover}
            className="flex items-center gap-1 rounded-full bg-terracotta px-3.5 py-2 text-[13px] font-semibold text-white"
          >
            <Sparkles size={15} {...ICON} /> Ideas
          </button>
          <button
            type="button"
            onClick={onAdd}
            className="flex items-center gap-1 rounded-full bg-sand px-3.5 py-2 text-[13px] font-semibold"
          >
            <Plus size={15} {...ICON} /> Receta
          </button>
        </div>
      </div>

      {/* Buscador y filtros, siempre a mano al bajar */}
      <div className="sticky top-0 z-10 -mx-4 space-y-2 bg-paper/90 px-4 pt-1 pb-2 backdrop-blur-md">
        <div className="relative">
          <Search size={16} {...ICON} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Busca por nombre o ingrediente…"
            aria-label="Buscar recetas"
            className="h-11 w-full rounded-full border border-line bg-cream pr-10 pl-10 text-[16px] outline-none focus:border-terracotta/50"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ('')}
              aria-label="Limpiar"
              className="absolute top-1/2 right-2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-muted"
            >
              <X size={15} {...ICON} />
            </button>
          )}
        </div>
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4" role="toolbar" aria-label="Categorías">
          <Chip active={!cat} onClick={() => setCat(null)}>
            Todas
          </Chip>
          {categories.map(([c, n]) => (
            <Chip key={c} active={cat === c} onClick={() => setCat(cat === c ? null : c)}>
              {emojiFor(c)} {c} <span className="opacity-60">{n}</span>
            </Chip>
          ))}
        </div>
        <div className="no-scrollbar -mx-4 flex items-center gap-1.5 overflow-x-auto px-4">
          {(
            [
              ['all', 'Todas'],
              ['done', 'Hechas'],
              ['todo', 'Por hacer'],
              ['steps', 'Con paso a paso'],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setShow(k)}
              aria-pressed={show === k}
              className={`shrink-0 rounded-full border px-3 py-1 text-[12.5px] font-semibold ${
                show === k ? 'border-ink text-ink' : 'border-line text-muted'
              }`}
            >
              {l}
            </button>
          ))}
          <span className="mx-1 h-4 w-px shrink-0 bg-line" />
          <select
            value={order}
            onChange={(e) => setOrder(e.target.value as Order)}
            aria-label="Ordenar"
            className="shrink-0 rounded-full border border-line bg-transparent px-2.5 py-1 text-[12.5px] font-semibold text-muted outline-none"
          >
            <option value="name">A–Z</option>
            <option value="score">Mejor nota</option>
            <option value="recent">Recientes</option>
            <option value="quick">Más rápidas</option>
          </select>
        </div>
      </div>

      {recipes.length === 0 ? (
        <div className="grid min-h-[45dvh] place-items-center text-center">
          <div>
            <BookOpen size={28} {...ICON} className="mx-auto text-sage" />
            <p className="mt-3 font-serif text-[26px] leading-tight">El recetario está vacío.</p>
            <p className="mt-1 text-[14px] text-muted">Pega la receta de un TikTok y la ordeno en pasos.</p>
          </div>
        </div>
      ) : list.length === 0 ? (
        <p className="py-10 text-center font-serif text-[22px] text-muted">Ninguna receta con esos filtros.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2.5">
          {list.map((r, k) => (
            <RecipeTile key={r.id} r={r} onOpen={onOpen} delay={Math.min(k, 10) * 0.025} />
          ))}
        </ul>
      )}
    </div>
  );
}

function RecipeTile({ r, onOpen, delay }: { r: RestaurantEntry; onOpen: (id: string) => void; delay: number }) {
  const hasSteps = !!r.recipe?.steps.length;
  return (
    <motion.li initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <button
        type="button"
        onClick={() => onOpen(r.id)}
        className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-line bg-cream text-left shadow-warm active:scale-[0.99]"
      >
        <div className="relative">
          <Photo src={r.imageUrl} alt="" category={r.category} className="h-24 w-full" emojiSize="text-4xl" />
          {r.scores ? (
            <span className="absolute top-2 right-2 rounded-full bg-ink/80 px-2 py-0.5 font-serif text-[17px] leading-tight text-paper">
              {fmtScore(r.scores.average)}
            </span>
          ) : (
            <span className="absolute top-2 right-2 rounded-full bg-sage px-2 py-0.5 text-[10.5px] font-semibold text-white">
              Por hacer
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col p-2.5">
          <p className="line-clamp-2 text-[14px] leading-tight font-semibold">{r.name}</p>
          <p className="mt-0.5 truncate text-[11.5px] text-muted">{r.category}</p>
          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2 text-[11px] text-muted">
            {r.recipe?.minutes != null && (
              <span className="inline-flex items-center gap-0.5">
                <Clock size={11} {...ICON} /> {fmtMinutes(r.recipe.minutes)}
              </span>
            )}
            {hasSteps ? (
              <span className="inline-flex items-center gap-0.5 text-sage">
                <ChefHat size={11} {...ICON} /> {r.recipe!.steps.length} pasos
              </span>
            ) : (
              <span className="italic">sin receta aún</span>
            )}
          </div>
        </div>
      </button>
    </motion.li>
  );
}
