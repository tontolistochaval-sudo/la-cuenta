import { useState } from 'react';
import { motion } from 'framer-motion';
import { BookmarkPlus, Check, Clock, LoaderCircle, Sparkles } from 'lucide-react';
import Sheet from './Sheet';
import { ICON, Kicker, Segmented } from './ui';
import { useStore } from '../store/useStore';
import { aiCreateRecipe, aiDiscoverRecipes, aiUnavailable, type AIRecipeIdea, type DiscoverFocus } from '../lib/ai';
import { haptic } from '../lib/native';
import { emojiFor, norm, uid } from '../lib/utils';
import { fmtMinutes } from '../lib/recipe';
import type { RestaurantEntry } from '../data/seedData';

const LOADING = ['Mirando vuestras mejores recetas…', 'Pensando en platos…', 'Descartando lo que ya habéis hecho…'];

/** "Descubrir" en Casa: ideas de recetas según lo que mejor os ha salido; al guardar, la IA la escribe entera. */
export default function DiscoverRecipesSheet({ open, onClose, onOpen }: { open: boolean; onClose: () => void; onOpen: (id: string) => void }) {
  const restaurants = useStore((s) => s.restaurants);
  const upsert = useStore((s) => s.upsert);
  const [focus, setFocus] = useState<DiscoverFocus>('parecido');
  const [wish, setWish] = useState('');
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [ideas, setIdeas] = useState<AIRecipeIdea[] | null>(null);
  const [model, setModel] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, string>>({});

  const known = (name: string) => restaurants.find((r) => r.kind === 'recipe' && norm(r.name) === norm(name));

  const ask = async () => {
    const why = aiUnavailable();
    if (why) return setError(why);
    setBusy(true);
    setError('');
    setIdeas(null);
    const timer = window.setInterval(() => setTick((t) => t + 1), 1600);
    try {
      const res = await aiDiscoverRecipes(restaurants, focus, wish.trim());
      setIdeas(res.recipes);
      setModel(res.model ? `${res.provider === 'groq' ? 'Groq · ' : ''}${res.model}` : '');
      if (!res.recipes.length) setError('No han salido ideas. Prueba con otro enfoque.');
      else haptic.success();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      clearInterval(timer);
      setBusy(false);
    }
  };

  const save = async (idea: AIRecipeIdea) => {
    setSaving(idea.name);
    setError('');
    try {
      // La receta completa (ingredientes, pasos, utensilios) para tenerla lista en el modo cocina.
      let recipe: RestaurantEntry['recipe'];
      try {
        const { recipe: r } = await aiCreateRecipe(idea.name, idea.why);
        if (r.ingredients?.length || r.steps?.length) {
          recipe = {
            ingredients: r.ingredients ?? [],
            steps: r.steps ?? [],
            tools: r.tools?.length ? r.tools : undefined,
            tips: r.tips?.length ? r.tips : undefined,
            servings: r.servings || 2,
            minutes: r.minutes || idea.minutes,
          };
        }
      } catch {
        // Sin IA en este momento: se guarda la idea y la receta se puede escribir después.
      }
      const entry: RestaurantEntry = {
        id: uid(),
        kind: 'recipe',
        name: idea.name,
        category: idea.category || 'Comida casera',
        status: 'wishlist',
        notes: idea.why || undefined,
        recipe: recipe ?? (idea.minutes ? { ingredients: [], steps: [], minutes: idea.minutes } : undefined),
        tags: ['Sugerencia IA'],
      };
      upsert(entry);
      haptic.success();
      setSaved((s) => ({ ...s, [idea.name]: entry.id }));
      if (!recipe) setError(`He guardado «${idea.name}», pero ahora no he podido escribir la receta. Ábrela y pulsa «Añadir la receta».`);
    } finally {
      setSaving(null);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Descubrir recetas" tone="paper">
      <div className="space-y-4 pb-2">
        <div>
          <Kicker>Con IA · en casa</Kicker>
          <h2 className="font-serif text-[34px] leading-none">
            Descubrir recetas<span className="text-terracotta">.</span>
          </h2>
          <p className="mt-1 text-[13.5px] text-muted">Ideas para cocinar según lo que mejor os ha salido. Al guardarlas, la receta viene completa.</p>
        </div>

        <Segmented
          label="Enfoque"
          size="sm"
          value={focus}
          onChange={setFocus}
          options={[
            { value: 'parecido', label: 'Como las mejores' },
            { value: 'nuevo', label: 'Algo nuevo' },
            { value: 'rapidas', label: 'Rápidas' },
          ]}
        />
        <input
          className="w-full rounded-xl border border-transparent bg-sand px-3.5 py-3 text-[16px] outline-none placeholder:text-muted/70 focus:border-terracotta/50 focus:bg-cream"
          value={wish}
          onChange={(e) => setWish(e.target.value)}
          placeholder="¿Algo concreto? Sin horno, con pollo, postre fácil…"
          aria-label="Qué os apetece cocinar"
          enterKeyHint="search"
          onKeyDown={(e) => e.key === 'Enter' && !busy && ask()}
        />
        <button
          type="button"
          onClick={ask}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-terracotta py-3.5 text-[15px] font-semibold text-white disabled:opacity-60"
        >
          {busy ? <LoaderCircle size={18} className="animate-spin" /> : <Sparkles size={18} {...ICON} />}
          {busy ? LOADING[tick % LOADING.length] : ideas ? 'Otras ideas' : 'Danos ideas'}
        </button>

        {error && (
          <p role="alert" className="rounded-xl bg-terracotta/10 px-3 py-2 text-[13px] text-terracotta-dark">
            {error}
          </p>
        )}

        {ideas && ideas.length > 0 && (
          <ul className="space-y-2.5">
            {ideas.map((r, k) => {
              const already = known(r.name);
              const savedId = saved[r.name];
              return (
                <motion.li
                  key={`${r.name}-${k}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: k * 0.06 }}
                  className="rounded-2xl border border-line bg-cream p-3.5 shadow-warm"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sand text-[22px]">{emojiFor(r.category ?? r.name)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-serif text-[22px] leading-tight">{r.name}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-muted">
                        {r.category}
                        {r.minutes != null && (
                          <span className="inline-flex items-center gap-0.5">
                            · <Clock size={11} {...ICON} /> {fmtMinutes(r.minutes)}
                          </span>
                        )}
                        {r.difficulty && <span>· {r.difficulty}</span>}
                      </p>
                    </div>
                  </div>
                  {r.basedOn && (
                    <p className="mt-2 inline-flex rounded-full bg-gold-soft px-2.5 py-1 text-[11.5px] font-semibold text-gold">
                      Porque os encantó {r.basedOn}
                    </p>
                  )}
                  {r.why && <p className="mt-2 text-[13.5px] leading-snug">{r.why}</p>}
                  <div className="mt-3">
                    {already || savedId ? (
                      <button
                        type="button"
                        onClick={() => onOpen((already ?? restaurants.find((x) => x.id === savedId))!.id)}
                        className="flex w-full items-center justify-center gap-1.5 rounded-full bg-sage/15 py-2.5 text-[13px] font-semibold text-sage"
                      >
                        <Check size={15} {...ICON} /> {savedId ? 'Guardada · ver receta' : 'Ya la tenéis'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => save(r)}
                        disabled={!!saving}
                        className="flex w-full items-center justify-center gap-1.5 rounded-full bg-ink py-2.5 text-[13px] font-semibold text-paper disabled:opacity-60"
                      >
                        {saving === r.name ? <LoaderCircle size={15} className="animate-spin" /> : <BookmarkPlus size={15} {...ICON} />}
                        {saving === r.name ? 'Escribiendo la receta…' : 'Por cocinar'}
                      </button>
                    )}
                  </div>
                </motion.li>
              );
            })}
          </ul>
        )}

        {ideas && ideas.length > 0 && model && (
          <p className="text-center font-mono text-[10.5px] text-muted">Modelo: {model}</p>
        )}
      </div>
    </Sheet>
  );
}
