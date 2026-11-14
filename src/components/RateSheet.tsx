import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import {
  Bookmark,
  Check,
  Camera,
  ChevronLeft,
  ClipboardPaste,
  EyeOff,
  Home,
  LoaderCircle,
  LocateFixed,
  MapPin,
  MapPinned,
  Minus,
  Plus,
  ReceiptText,
  Search,
  ThumbsDown,
  ThumbsUp,
  Utensils,
  Wand2,
  X,
} from 'lucide-react';
import Sheet from './Sheet';
import { ICON, Photo, Segmented } from './ui';
import { useStore } from '../store/useStore';
import { RECIPE_TYPES, RESTAURANT_TYPES, TAG_SUGGESTIONS, type Kind, type RecipeDetails, type RestaurantEntry } from '../data/seedData';
import { avgOf, emojiFor, fmtScore, norm, today, uid, verdict } from '../lib/utils';
import {
  currentPosition,
  fmtDistance,
  nearbyPlaces,
  parseShared,
  rememberPosition,
  reverse,
  searchPlaces,
  type Place,
} from '../lib/geo';
import { haptic, pickPhoto, readClipboard } from '../lib/native';
import { useBackHandler } from '../lib/back';
import { linesToList, parseRecipeText } from '../lib/recipe';

const MapPicker = lazy(() => import('./MapPicker'));

export const CONFETTI_COLORS = ['#E05A47', '#4A6B53', '#D97706', '#F3EFEA', '#1C1917'];

/** id null = nuevo · evaluate = un pendiente que ya hemos probado · step = abrir en un paso concreto */
export type RateTarget = {
  id: string | null;
  evaluate?: boolean;
  status?: 'wishlist';
  step?: 'donde' | 'receta';
  /** Forzar Fuera o En casa al crear (p. ej. desde el Recetario). */
  kind?: Kind;
} | null;

interface Props {
  target: RateTarget;
  onClose: () => void;
  onSaved: (id: string) => void;
}

export default function RateSheet({ target, onClose, onSaved }: Props) {
  const entry = useStore((s) => (target?.id ? s.restaurants.find((r) => r.id === target.id) : undefined));
  const mode = useStore((s) => s.mode);
  return (
    <Sheet open={!!target} onClose={onClose} title="Pasar la cuenta" tall>
      {target && (
        <Flow
          key={`${target.id ?? 'new'}-${target.evaluate ?? ''}-${target.status ?? ''}-${target.step ?? ''}`}
          entry={entry}
          evaluate={!!target.evaluate}
          startAt={target.step}
          initialKind={entry?.kind ?? target.kind ?? mode}
          initialStatus={target.status ?? (entry && !target.evaluate ? entry.status : 'visited')}
          onSaved={onSaved}
        />
      )}
    </Sheet>
  );
}

type Step = 'sitio' | 'donde' | 'receta' | 'gonzalo' | 'pasa' | 'vero' | 'veredicto';

export const field =
  'w-full rounded-xl border border-transparent bg-sand px-3.5 py-3 text-[16px] text-ink placeholder:text-muted/70 outline-none focus:border-terracotta/50 focus:bg-cream';

function Label({ children }: { children: ReactNode }) {
  return <span className="mb-1.5 block text-[12px] font-semibold text-muted">{children}</span>;
}

interface Location {
  coordinates?: [number, number];
  address?: string;
  placeName?: string;
  phone?: string;
  website?: string;
}

function Flow({
  entry,
  evaluate,
  startAt,
  initialKind,
  initialStatus,
  onSaved,
}: {
  entry?: RestaurantEntry;
  evaluate: boolean;
  startAt?: 'donde' | 'receta';
  initialKind: Kind;
  initialStatus: RestaurantEntry['status'];
  onSaved: (id: string) => void;
}) {
  const upsert = useStore((s) => s.upsert);
  const all = useStore((s) => s.restaurants);

  const [kind, setKind] = useState<Kind>(initialKind);
  const [status, setStatus] = useState(initialStatus);
  const [name, setName] = useState(entry?.name ?? '');
  const [category, setCategory] = useState(entry?.category ?? '');
  const [visitDate, setVisitDate] = useState(entry?.visitDate ?? today());
  const [hood, setHood] = useState(entry?.neighborhood ?? '');
  const [loc, setLoc] = useState<Location>({
    coordinates: entry?.coordinates,
    address: entry?.address,
    placeName: entry?.coordinates ? entry.name : undefined,
    phone: entry?.phone,
    website: entry?.website,
  });
  const [price, setPrice] = useState(entry?.pricePerPerson != null ? String(entry.pricePerPerson) : '');
  const [gonzalo, setGonzalo] = useState(entry?.scores?.gonzalo ?? 8);
  const [vero, setVero] = useState(entry?.scores?.vero ?? 8);
  const [food, setFood] = useState(entry?.scores?.food);
  const [vibe, setVibe] = useState(entry?.scores?.vibe);
  const [value, setValue] = useState(entry?.scores?.value);
  const [bestDish, setBestDish] = useState(entry?.bestDish ?? '');
  // Sin marcar hasta que lo elijáis (antes salía "sí" por defecto y falseaba las estadísticas).
  const [wouldRepeat, setWouldRepeat] = useState<boolean | undefined>(entry?.wouldRepeat);
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [imageUrl, setImageUrl] = useState(entry?.imageUrl);
  const [recipe, setRecipe] = useState<RecipeDraft>({
    ingredients: entry?.recipe?.ingredients.join('\n') ?? '',
    steps: entry?.recipe?.steps.join('\n') ?? '',
    servings: entry?.recipe?.servings != null ? String(entry.recipe.servings) : '',
    minutes: entry?.recipe?.minutes != null ? String(entry.recipe.minutes) : '',
    sourceUrl: entry?.recipe?.sourceUrl ?? '',
  });
  const [tags, setTags] = useState<string[]>(entry?.tags ?? []);
  const [priceLevel, setPriceLevel] = useState(entry?.priceLevel);
  const [error, setError] = useState('');

  const home = kind === 'recipe';
  const visited = status === 'visited';
  const blind = visited && !entry?.scores; // voto a ciegas solo la primera vez
  // Editar algo que ya existe: pestañas para saltar a cualquier paso y "Guardar" siempre a mano.
  const editing = !!entry && !evaluate && !startAt;

  const steps = useMemo<Step[]>(() => {
    const s: Step[] = ['sitio'];
    s.push(home ? 'receta' : 'donde');
    if (visited) s.push(...((blind ? ['gonzalo', 'pasa', 'vero'] : ['gonzalo', 'vero']) as Step[]), 'veredicto');
    return s;
  }, [home, visited, blind]);

  const [i, setI] = useState(() => {
    if (startAt) return Math.max(0, steps.indexOf(startAt));
    if (evaluate && entry) return Math.max(0, steps.indexOf('gonzalo'));
    return 0;
  });
  const [dir, setDir] = useState(1);
  const step = steps[Math.min(i, steps.length - 1)];
  // "Ubicar" / "Añadir receta" desde la ficha: se guarda ese paso sin repasar el resto.
  const quickLocate = !!startAt && !!entry && step === startAt;
  const last = i >= steps.length - 1 || quickLocate;

  const typeOptions = useMemo(() => {
    const used = all.filter((r) => r.kind === kind).map((r) => r.category);
    return [...new Set([...used, ...(kind === 'recipe' ? RECIPE_TYPES : RESTAURANT_TYPES)])].slice(0, 9);
  }, [all, kind]);
  const duplicate = useMemo(
    () => (name.trim() ? all.find((r) => r.id !== entry?.id && norm(r.name) === norm(name)) : undefined),
    [all, name, entry?.id]
  );

  /** Valida un paso (al avanzar) o todos (al guardar). Devuelve el error y el paso donde está. */
  const validate = (only?: Step): { error: string; at?: Step } => {
    const check = (s: Step) => !only || only === s;
    if (check('sitio')) {
      if (!name.trim()) return { error: home ? 'Ponle nombre a la receta.' : 'Ponle nombre al sitio.', at: 'sitio' };
      if (!category.trim()) return { error: 'Elige un tipo.', at: 'sitio' };
      if (visited && !/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) return { error: 'Pon la fecha.', at: 'sitio' };
    }
    if (check('donde') && !home && price.trim()) {
      const n = Number(price.replace(',', '.'));
      if (!Number.isFinite(n) || n < 0 || n > 1000) return { error: 'El precio no es válido.', at: 'donde' };
    }
    if (check('receta') && home) {
      if (recipe.servings.trim() && !(Number(recipe.servings) > 0)) return { error: 'Las raciones deben ser un número.', at: 'receta' };
      if (recipe.minutes.trim() && !(Number(recipe.minutes) > 0)) return { error: 'El tiempo debe ser en minutos.', at: 'receta' };
    }
    return { error: '' };
  };

  const jump = (target: number) => {
    setError('');
    haptic.select();
    setDir(target > i ? 1 : -1);
    setI(target);
  };

  const recipeDetails = (): RecipeDetails | undefined => {
    const r: RecipeDetails = {
      ingredients: linesToList(recipe.ingredients),
      steps: linesToList(recipe.steps),
      servings: Number(recipe.servings) || undefined,
      minutes: Number(recipe.minutes) || undefined,
      sourceUrl: recipe.sourceUrl.trim() || undefined,
    };
    return r.ingredients.length || r.steps.length || r.sourceUrl ? r : undefined;
  };

  const go = (delta: number) => {
    if (delta > 0) {
      const { error: err } = validate(step);
      if (err) return setError(err);
    }
    setError('');
    haptic.tap();
    setDir(delta);
    setI((x) => Math.max(0, Math.min(steps.length - 1, x + delta)));
  };

  const save = () => {
    const { error: err, at } = validate();
    if (err) {
      if (at && steps.includes(at)) jump(steps.indexOf(at));
      return setError(err);
    }
    const id = entry?.id ?? uid();
    const priceNum = price.trim() ? Number(price.replace(',', '.')) : undefined;
    // Se parte de lo que ya había (favorito, revisitas…) para no perder nada al editar.
    const { scores: _s, visitDate: _d, wouldRepeat: _w, revisits: _r, ...kept } = entry ?? ({} as Partial<RestaurantEntry>);
    void _s;
    void _d;
    void _w;
    const next: RestaurantEntry = {
      ...kept,
      ...(visited && _r?.length ? { revisits: _r.filter((d) => d !== visitDate) } : {}),
      tags: tags.length ? tags : undefined,
      priceLevel: home ? undefined : priceLevel,
      id,
      kind,
      name: name.trim(),
      category: category.trim(),
      status,
      neighborhood: home ? undefined : hood.trim() || undefined,
      address: home ? undefined : loc.address,
      phone: home ? undefined : loc.phone,
      website: home ? undefined : loc.website,
      coordinates: home ? undefined : loc.coordinates,
      pricePerPerson: home ? undefined : priceNum,
      bestDish: bestDish.trim() || undefined,
      notes: notes.trim() || undefined,
      imageUrl,
      recipe: home ? recipeDetails() : undefined,
      ...(visited
        ? {
            visitDate,
            wouldRepeat,
            scores: { gonzalo, vero, average: avgOf(gonzalo, vero), ...(home ? {} : { food, vibe, value }) },
          }
        : {}),
    };
    upsert(next);
    haptic.success();
    if (quickLocate) return onSaved(id);
    if (visited && !editing && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      confetti({ particleCount: 90, spread: 70, origin: { y: 0.85 }, colors: CONFETTI_COLORS, zIndex: 2000 });
    }
    onSaved(id);
  };

  const title =
    step === 'sitio'
      ? entry && !evaluate
        ? 'Editar'
        : home
          ? 'Nueva receta'
          : 'Pasar la cuenta'
      : step === 'donde'
        ? '¿Dónde está?'
        : step === 'receta'
          ? 'La receta'
          : step === 'veredicto'
          ? 'El veredicto'
          : '';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {editing ? (
        <div className="no-scrollbar -mx-5 flex shrink-0 gap-1.5 overflow-x-auto px-5 pt-1 pb-3" role="tablist" aria-label="Partes">
          {steps.map((s, k) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={k === i}
              onClick={() => jump(k)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                k === i ? 'bg-ink text-paper' : 'bg-sand text-muted'
              }`}
            >
              {STEP_LABEL[s]}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-1.5 pt-1 pb-3" aria-hidden>
          {steps.map((s, k) => (
            <span key={s} className={`h-1 flex-1 rounded-full transition-colors ${k <= i ? 'bg-terracotta' : 'bg-sand'}`} />
          ))}
        </div>
      )}

      {title && (
        <h2 className="shrink-0 font-serif text-[32px] leading-none">
          {title}
          <span className="text-terracotta">.</span>
        </h2>
      )}

      <div className="relative min-h-0 flex-1">
        <AnimatePresence mode="popLayout" custom={dir} initial={false}>
          <motion.div
            key={step}
            initial={{ x: dir * 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: dir * -60, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="no-scrollbar absolute inset-0 overflow-y-auto overscroll-contain pt-4 pb-2"
          >
            {step === 'sitio' && (
              <div className="space-y-4">
                {!entry && (
                  <Segmented
                    label="Fuera o en casa"
                    value={kind}
                    onChange={(k) => {
                      setKind(k);
                      setCategory('');
                    }}
                    options={[
                      { value: 'restaurant', label: <><Utensils size={15} {...ICON} /> Fuera</> },
                      { value: 'recipe', label: <><Home size={15} {...ICON} /> En casa</> },
                    ]}
                  />
                )}
                <Segmented
                  label="Estado"
                  value={status}
                  onChange={setStatus}
                  options={[
                    { value: 'visited', label: <><ReceiptText size={15} {...ICON} /> {home ? 'Ya la hicimos' : 'Ya fuimos'}</> },
                    { value: 'wishlist', label: <><Bookmark size={15} {...ICON} /> Pendiente</> },
                  ]}
                />
                <label className="block">
                  <Label>{home ? 'Receta' : 'Sitio'}</Label>
                  <input
                    className={field}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={home ? 'Lasaña de la abuela…' : 'Casa Lucio…'}
                    autoComplete="off"
                    enterKeyHint="next"
                  />
                  {duplicate && (
                    <span className="mt-1.5 block text-[12.5px] text-gold">
                      Ojo: ya tenéis «{duplicate.name}» {duplicate.status === 'wishlist' ? 'en pendientes' : 'en la lista'}.
                    </span>
                  )}
                </label>
                <div>
                  <Label>Tipo</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {typeOptions.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setCategory(t)}
                        aria-pressed={category === t}
                        className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
                          category === t ? 'bg-ink text-paper' : 'bg-sand text-muted'
                        }`}
                      >
                        {emojiFor(t)} {t}
                      </button>
                    ))}
                  </div>
                  <input
                    className={`${field} mt-2`}
                    value={typeOptions.includes(category) ? '' : category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="u otro tipo…"
                    aria-label="Otro tipo"
                  />
                </div>
                {visited && <DateField value={visitDate} onChange={setVisitDate} label={home ? '¿Cuándo la hicisteis?' : '¿Cuándo fuisteis?'} />}
                <TagPicker kind={kind} tags={tags} setTags={setTags} />
              </div>
            )}

            {step === 'receta' && (
              <RecipeStep
                draft={recipe}
                setDraft={setRecipe}
                onTitle={(t) => !name.trim() && setName(t)}
              />
            )}

            {step === 'donde' && (
              <WhereStep
                name={name}
                setName={setName}
                loc={loc}
                setLoc={setLoc}
                hood={hood}
                setHood={setHood}
                price={price}
                setPrice={setPrice}
                priceLevel={priceLevel}
                setPriceLevel={setPriceLevel}
                visited={visited}
              />
            )}

            {step === 'gonzalo' && <VoteStep who="Gonzalo" value={gonzalo} onChange={setGonzalo} accent="#E05A47" blind={blind} />}

            {step === 'pasa' && (
              <div className="grid h-full place-items-center text-center">
                <div>
                  <motion.div
                    initial={{ rotate: -12, scale: 0.8 }}
                    animate={{ rotate: 0, scale: 1 }}
                    className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-ink text-paper"
                  >
                    <EyeOff size={40} {...ICON} />
                  </motion.div>
                  <p className="mt-6 font-serif text-[38px] leading-none">Pásale el móvil a Vero</p>
                  <p className="mt-3 text-[15px] text-muted">
                    La nota de Gonzalo queda en sobre cerrado.
                    <br />
                    Se revela al final.
                  </p>
                </div>
              </div>
            )}

            {step === 'vero' && <VoteStep who="Vero" value={vero} onChange={setVero} accent="#4A6B53" blind={blind} />}

            {step === 'veredicto' && (
              <VerdictStep
                name={name}
                category={category}
                gonzalo={gonzalo}
                vero={vero}
                reveal={blind}
                home={home}
                food={food}
                vibe={vibe}
                value={value}
                setFood={setFood}
                setVibe={setVibe}
                setValue={setValue}
                wouldRepeat={wouldRepeat}
                setWouldRepeat={setWouldRepeat}
                bestDish={bestDish}
                setBestDish={setBestDish}
                notes={notes}
                setNotes={setNotes}
                visitDate={visitDate}
                showDate={evaluate}
                setVisitDate={setVisitDate}
                imageUrl={imageUrl}
                setImageUrl={setImageUrl}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {error && (
        <p className="mb-2 shrink-0 rounded-xl bg-terracotta/10 px-3 py-2 text-[13px] text-terracotta-dark" role="alert">
          {error}
        </p>
      )}

      {editing ? (
        <div className="flex shrink-0 gap-2 pt-2">
          {!last && (
            <button
              type="button"
              onClick={() => go(1)}
              className="flex h-14 shrink-0 items-center gap-1 rounded-full bg-sand px-5 text-[15px] font-semibold text-ink"
            >
              Siguiente
            </button>
          )}
          <button
            type="button"
            onClick={save}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-terracotta text-[16px] font-semibold text-white transition-colors hover:bg-terracotta-dark"
          >
            <Check size={18} {...ICON} /> Guardar cambios
          </button>
        </div>
      ) : (
      <div className="flex shrink-0 gap-2 pt-2">
        {i > 0 && (
          <button
            type="button"
            onClick={() => go(-1)}
            className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-sand text-ink"
            aria-label="Atrás"
          >
            <ChevronLeft size={22} {...ICON} />
          </button>
        )}
        <button
          type="button"
          onClick={() => (last ? save() : go(1))}
          className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-terracotta text-[16px] font-semibold text-white transition-colors hover:bg-terracotta-dark"
        >
          {quickLocate ? (
            <>
              {step === 'receta' ? <><ReceiptText size={18} {...ICON} /> Guardar receta</> : <><MapPinned size={18} {...ICON} /> Guardar ubicación</>}
            </>
          ) : last ? (
            <>
              <ReceiptText size={18} {...ICON} /> {visited ? 'Cerrar la cuenta' : entry ? 'Guardar' : 'Guardar en pendientes'}
            </>
          ) : step === 'donde' && !loc.coordinates ? (
            'Seguir sin ubicación'
          ) : step === 'gonzalo' && blind ? (
            'Votar y tapar'
          ) : step === 'pasa' ? (
            'Soy Vero, a votar'
          ) : step === 'vero' && blind ? (
            'Revelar notas'
          ) : (
            'Siguiente'
          )}
        </button>
      </div>
      )}
    </div>
  );
}

const STEP_LABEL: Record<Step, string> = {
  sitio: 'Sitio',
  donde: 'Dónde',
  receta: 'Receta',
  gonzalo: 'Gonzalo',
  pasa: '·',
  vero: 'Vero',
  veredicto: 'Veredicto',
};

/** Fecha con selector nativo; muestra "Hoy", "Ayer" o la fecha escrita para que se lea de un vistazo. */
function DateField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const t = today();
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex gap-1.5">
        {[
          [t, 'Hoy'],
          [yesterday, 'Ayer'],
        ].map(([v, l]) => (
          <button
            key={l}
            type="button"
            onClick={() => onChange(v)}
            aria-pressed={value === v}
            className={`rounded-full px-3.5 py-2.5 text-[14px] font-semibold ${value === v ? 'bg-ink text-paper' : 'bg-sand text-muted'}`}
          >
            {l}
          </button>
        ))}
        <input
          type="date"
          className={`${field} min-w-0 flex-1 py-2.5 font-mono`}
          value={value}
          max={t}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          aria-label={label}
        />
      </div>
    </div>
  );
}

/** Etiquetas: sugerencias + las que ya usáis + crear nuevas. */
function TagPicker({ kind, tags, setTags }: { kind: Kind; tags: string[]; setTags: (t: string[]) => void }) {
  const all = useStore((s) => s.restaurants);
  const [custom, setCustom] = useState('');
  const options = useMemo(() => {
    const used = all.filter((r) => r.kind === kind).flatMap((r) => r.tags ?? []);
    return [...new Set([...tags, ...used, ...TAG_SUGGESTIONS[kind]])];
  }, [all, kind, tags]);
  const toggle = (t: string) => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t]);
  return (
    <div>
      <Label>Etiquetas (opcional)</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => toggle(t)}
            aria-pressed={tags.includes(t)}
            className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
              tags.includes(t) ? 'bg-sage text-white' : 'bg-sand text-muted'
            }`}
          >
            #{t}
          </button>
        ))}
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const t = custom.trim().replace(/^#/, '');
          if (t && !tags.includes(t)) setTags([...tags, t]);
          setCustom('');
        }}
      >
        <input className={`${field} py-2.5`} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Nueva etiqueta…" aria-label="Nueva etiqueta" />
        <button type="submit" disabled={!custom.trim()} className="shrink-0 rounded-full bg-ink px-4 text-[14px] font-semibold text-paper disabled:opacity-40">
          Añadir
        </button>
      </form>
    </div>
  );
}

/* ─────────── Paso: dónde ─────────── */

const TYPE_LABEL: Record<string, string> = {
  restaurant: 'Restaurante',
  fast_food: 'Comida rápida',
  cafe: 'Cafetería',
  bar: 'Bar',
  pub: 'Pub',
  ice_cream: 'Heladería',
};

function PlaceRow({ p, onPick }: { p: Place; onPick: () => void }) {
  return (
    <li className="border-b border-line last:border-0">
      <button type="button" onClick={onPick} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-sand">
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${p.type ? 'bg-terracotta/10 text-terracotta' : 'bg-sand text-muted'}`}
        >
          {p.type ? <Utensils size={16} {...ICON} /> : <MapPin size={16} {...ICON} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-semibold">{p.name}</span>
          <span className="block truncate text-[12px] text-muted">
            {[p.address, p.neighborhood].filter(Boolean).join(' · ') || (p.type ? TYPE_LABEL[p.type] : '')}
          </span>
        </span>
        {p.distance != null && <span className="shrink-0 font-mono text-[11px] text-muted">{fmtDistance(p.distance)}</span>}
      </button>
    </li>
  );
}

function WhereStep({
  name,
  setName,
  loc,
  setLoc,
  hood,
  setHood,
  price,
  setPrice,
  priceLevel,
  setPriceLevel,
  visited,
}: {
  name: string;
  setName: (s: string) => void;
  loc: Location;
  setLoc: (l: Location) => void;
  hood: string;
  setHood: (s: string) => void;
  price: string;
  setPrice: (s: string) => void;
  priceLevel?: 1 | 2 | 3 | 4;
  setPriceLevel: (l?: 1 | 2 | 3 | 4) => void;
  visited: boolean;
}) {
  const [q, setQ] = useState(name);
  const [results, setResults] = useState<Place[] | null>(null);
  const [resultsTitle, setResultsTitle] = useState('');
  const [corrected, setCorrected] = useState<string | undefined>();
  const [busy, setBusy] = useState<'search' | 'near' | 'reverse' | null>(null);
  const [msg, setMsg] = useState('');
  const [paste, setPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [picker, setPicker] = useState(false);
  useBackHandler(picker, () => setPicker(false));
  const abort = useRef<AbortController | null>(null);
  const lastQuery = useRef('');

  const fresh = () => {
    abort.current?.abort();
    abort.current = new AbortController();
    setMsg('');
    return abort.current.signal;
  };

  const search = async (query = q, quick = false) => {
    const clean = query.trim();
    if (clean.length < 2) return;
    lastQuery.current = clean;
    const signal = fresh();
    setBusy('search');
    setResultsTitle('Resultados');
    try {
      const r = await searchPlaces(clean, {
        signal,
        quick,
        onMore: (more) => !signal.aborted && setResults(more.places),
      });
      if (signal.aborted) return;
      setResults(r.places);
      setCorrected(r.corrected);
      if (!r.places.length)
        setMsg(
          quick
            ? 'Nada todavía… pulsa Buscar para probar más variantes.'
            : 'No aparece. Prueba con la calle, «Estamos aquí», pega el enlace de Maps o márcalo en el mapa.'
        );
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setMsg('No se pudo buscar ahora. Prueba en unos segundos.');
    } finally {
      if (!signal.aborted) setBusy(null);
    }
  };

  // Búsqueda al escribir, con pausa (el buscador gratuito pide no más de una petición por segundo).
  useEffect(() => {
    if (loc.coordinates) return;
    const clean = q.trim();
    if (clean.length < 3 || clean === lastQuery.current) return;
    const t = window.setTimeout(() => search(clean, true), 850);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, loc.coordinates]);

  // Al salir: cancela lo pendiente.
  useEffect(() => () => abort.current?.abort(), []);

  const near = async () => {
    const signal = fresh();
    setBusy('near');
    setResults(null);
    setCorrected(undefined);
    try {
      const here = await currentPosition();
      rememberPosition(here);
      setResultsTitle('Cerca de aquí');
      setResults([]);
      let count = 0;
      await nearbyPlaces(
        here,
        (p) => {
          count = p.length;
          if (!signal.aborted) setResults(p);
        },
        signal
      );
      if (!signal.aborted && count === 0) setMsg('No hay locales registrados aquí al lado. Usa “En el mapa”.');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setMsg((e as Error).message);
    } finally {
      if (!signal.aborted) setBusy(null);
    }
  };

  const pick = async (p: Place) => {
    abort.current?.abort();
    setResults(null);
    setMsg('');
    if (!name.trim()) setName(p.name);
    haptic.tap();
    const base = { coordinates: p.coordinates, address: p.address, placeName: p.name, phone: p.phone, website: p.website };
    setLoc(base);
    // El barrio sale siempre de la ubicación real; si el buscador no lo trae, se pregunta por ese punto.
    if (p.neighborhood && p.address) {
      setHood(p.neighborhood);
      setBusy(null);
    } else {
      setBusy('reverse');
      const r = await reverse(p.coordinates);
      setHood(p.neighborhood ?? r.neighborhood ?? '');
      setLoc({ ...base, address: p.address ?? r.address });
      setBusy(null);
    }
  };

  const fromPoint = async (c: [number, number], label: string) => {
    setLoc({ coordinates: c, placeName: label });
    setBusy('reverse');
    const r = await reverse(c);
    setLoc({ coordinates: c, address: r.address, placeName: label });
    setHood(r.neighborhood ?? '');
    setBusy(null);
  };

  const usePasted = (text: string) => {
    const parsed = parseShared(text);
    setPaste(false);
    setPasteText('');
    if (parsed.coordinates) {
      fromPoint(parsed.coordinates, parsed.name && !/^https?:/i.test(parsed.name) ? parsed.name : name || 'Punto de Maps');
    } else if (parsed.query) {
      setQ(parsed.query);
      search(parsed.query);
    } else {
      setMsg('Ese enlace corto no trae la ubicación. Copia también el nombre del sitio, o búscalo arriba.');
    }
  };

  const pasteFromClipboard = async () => {
    try {
      const t = await readClipboard();
      if (t.trim()) return usePasted(t);
    } catch {
      /* sin permiso: se muestra el campo para pegar a mano */
    }
    setPaste(true);
  };

  return (
    <div className="relative space-y-4">
      {loc.coordinates ? (
        <div className="flex items-center gap-3 rounded-2xl bg-sage/10 p-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sage text-white">
            {busy === 'reverse' ? <LoaderCircle size={18} className="animate-spin" /> : <MapPinned size={18} {...ICON} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold">{loc.placeName || 'Ubicación guardada'}</p>
            <p className="truncate text-[12.5px] text-muted">{loc.address || `${loc.coordinates[0]}, ${loc.coordinates[1]}`}</p>
            <p className="mt-0.5 truncate text-[12px] font-semibold text-sage">
              {busy === 'reverse' ? 'Buscando el barrio…' : hood ? `Barrio: ${hood}` : 'Barrio sin identificar'}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => setPicker(true)}
              className="rounded-full bg-cream px-3 py-2 text-[12px] font-semibold"
            >
              Ajustar
            </button>
            <button
              type="button"
              onClick={() => {
                setLoc({});
                setHood('');
              }}
              aria-label="Quitar ubicación"
              className="grid h-9 w-9 place-items-center rounded-full text-muted"
            >
              <X size={16} {...ICON} />
            </button>
          </div>
        </div>
      ) : (
        <>
          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault();
              search();
            }}
          >
            <Search size={17} {...ICON} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
            <input
              className={`${field} pr-24 pl-10`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre del sitio o calle…"
              aria-label="Buscar el sitio"
              enterKeyHint="search"
              type="search"
            />
            <button
              type="submit"
              className="absolute top-1/2 right-1.5 flex h-10 -translate-y-1/2 items-center gap-1 rounded-full bg-ink px-3.5 text-[13px] font-semibold text-paper"
            >
              {busy === 'search' ? <LoaderCircle size={15} className="animate-spin" /> : 'Buscar'}
            </button>
          </form>

          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['near', 'Estamos aquí', LocateFixed, near],
                ['paste', 'Pegar de Maps', ClipboardPaste, pasteFromClipboard],
                ['map', 'En el mapa', MapPinned, () => setPicker(true)],
              ] as const
            ).map(([k, label, Icon, fn]) => (
              <button
                key={k}
                type="button"
                onClick={fn}
                disabled={busy === 'near' && k === 'near'}
                className="flex flex-col items-center gap-1 rounded-2xl bg-sand px-2 py-3 text-[12px] font-semibold text-ink disabled:opacity-60"
              >
                {k === 'near' && busy === 'near' ? <LoaderCircle size={19} className="animate-spin" /> : <Icon size={19} {...ICON} />}
                {label}
              </button>
            ))}
          </div>

          {paste && (
            <div className="space-y-2 rounded-2xl border border-line p-3">
              <p className="text-[12.5px] text-muted">
                En Google Maps: abre el sitio → <b>Compartir</b> → copiar, y pégalo aquí.
              </p>
              <textarea
                className={`${field} min-h-[72px] resize-none`}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                onPaste={(e) => {
                  const t = e.clipboardData.getData('text');
                  if (t) {
                    e.preventDefault();
                    usePasted(t);
                  }
                }}
                placeholder="Pega aquí el enlace o el texto…"
                aria-label="Texto compartido desde Maps"
                autoFocus
              />
              {pasteText.trim() && (
                <button
                  type="button"
                  onClick={() => usePasted(pasteText)}
                  className="w-full rounded-full bg-ink py-2.5 text-[14px] font-semibold text-paper"
                >
                  Usar esto
                </button>
              )}
            </div>
          )}

          {results && (results.length > 0 || busy === 'near') && (
            <div>
              <p className="mb-1.5 flex items-center gap-2 text-[12px] font-semibold text-muted">
                {resultsTitle}
                {busy && busy !== 'reverse' && <LoaderCircle size={13} className="animate-spin" />}
              </p>
              {corrected && resultsTitle === 'Resultados' && (
                <p className="mb-1.5 text-[12.5px] text-gold">
                  ¿Querías decir <b>«{corrected}»</b>? Esto es lo que hay con esa forma.
                </p>
              )}
              <ul className="overflow-hidden rounded-2xl border border-line">
                {results.map((p, k) => (
                  <PlaceRow key={`${p.name}-${k}`} p={p} onPick={() => pick(p)} />
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {msg && <p className="text-[13px] text-terracotta-dark">{msg}</p>}

      <div>
        <Label>¿Caro o barato?</Label>
        <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Nivel de precio">
          {([1, 2, 3, 4] as const).map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={priceLevel === l}
              onClick={() => setPriceLevel(priceLevel === l ? undefined : l)}
              className={`rounded-full py-2.5 font-mono text-[14px] font-bold ${priceLevel === l ? 'bg-ink text-paper' : 'bg-sand text-muted'}`}
            >
              {'€'.repeat(l)}
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <Label>{visited ? 'Precio exacto por persona (opcional)' : 'Presupuesto por persona (opcional)'}</Label>
        <div className="relative">
          <input
            className={`${field} pr-8 font-mono`}
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="25"
          />
          <span className="absolute top-1/2 right-3.5 -translate-y-1/2 font-mono text-muted">€</span>
        </div>
      </label>

      {picker &&
        createPortal(
          <div className="fixed inset-0 z-[1200] bg-ink/40 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="relative mx-auto h-full max-w-xl">
              <Suspense fallback={<div className="h-full animate-pulse rounded-2xl bg-sand" />}>
                <MapPicker
                  initial={loc.coordinates}
                  onCancel={() => setPicker(false)}
                  onPick={(c) => {
                    setPicker(false);
                    fromPoint(c, loc.placeName || name || 'Punto marcado');
                  }}
                />
              </Suspense>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

/* ─────────── Paso: votar ─────────── */

function VoteStep({
  who,
  value,
  onChange,
  accent,
  blind,
}: {
  who: string;
  value: number;
  onChange: (n: number) => void;
  accent: string;
  blind: boolean;
}) {
  const set = (n: number) => onChange(Math.max(0, Math.min(10, Math.round(n * 20) / 20)));
  return (
    <div className="flex h-full flex-col justify-center text-center">
      <p className="font-mono text-[11px] tracking-[0.2em] text-muted uppercase">{blind ? 'Voto secreto' : 'Nota'}</p>
      <p className="font-serif text-[40px] leading-none">{who}</p>
      <p className="mt-1 text-[14px] text-muted">{blind ? 'Que el otro no mire 👀' : 'Ajusta la nota'}</p>

      <motion.p
        key={Math.floor(value)}
        initial={{ scale: 0.92 }}
        animate={{ scale: 1 }}
        className="my-4 font-serif text-[clamp(84px,16dvh,120px)] leading-none tabular-nums"
        style={{ color: accent }}
      >
        {fmtScore(value)}
      </motion.p>
      <p className="-mt-2 mb-5 text-[14px] font-semibold text-muted">{verdict(value)}</p>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => set(value - 0.05)}
          aria-label="Bajar 0,05"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sand"
        >
          <Minus size={18} {...ICON} />
        </button>
        <input
          type="range"
          min={0}
          max={10}
          step={0.05}
          value={value}
          onChange={(e) => set(Number(e.target.value))}
          className="slider"
          style={{ ['--fill' as string]: `${value * 10}%`, ['--accent' as string]: accent }}
          aria-label={`Nota de ${who}`}
        />
        <button
          type="button"
          onClick={() => set(value + 0.05)}
          aria-label="Subir 0,05"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sand"
        >
          <Plus size={18} {...ICON} />
        </button>
      </div>
      <div className="mt-4 flex justify-center gap-2">
        {[7, 8, 8.5, 9, 9.5, 10].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => set(n)}
            className={`rounded-full px-3 py-1.5 font-mono text-[12px] ${value === n ? 'bg-ink text-paper' : 'bg-sand text-muted'}`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─────────── Paso: veredicto ─────────── */

function Rate5({ label, value, onChange }: { label: string; value?: number; onChange: (n?: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[14px] font-medium">{label}</span>
      <div className="flex gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} de 5`}
            onClick={() => onChange(value === n ? undefined : n)}
            className={`grid h-8 w-8 place-items-center rounded-full font-mono text-[12px] transition-colors ${
              value != null && n <= value ? 'bg-ink text-paper' : 'bg-sand text-muted'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function VerdictStep(p: {
  name: string;
  category: string;
  gonzalo: number;
  vero: number;
  reveal: boolean;
  home: boolean;
  food?: number;
  vibe?: number;
  value?: number;
  setFood: (n?: number) => void;
  setVibe: (n?: number) => void;
  setValue: (n?: number) => void;
  wouldRepeat?: boolean;
  setWouldRepeat: (b?: boolean) => void;
  bestDish: string;
  setBestDish: (s: string) => void;
  notes: string;
  setNotes: (s: string) => void;
  visitDate: string;
  setVisitDate: (s: string) => void;
  showDate: boolean;
  imageUrl?: string;
  setImageUrl: (s?: string) => void;
}) {
  const avg = avgOf(p.gonzalo, p.vero);
  const diff = Math.abs(p.gonzalo - p.vero);
  const mood = diff <= 0.3 ? '¡Sintonía total!' : diff >= 1.5 ? 'Aquí hay debate…' : 'Bastante de acuerdo';
  const d = p.reveal ? 1 : 0;
  const [photoBusy, setPhotoBusy] = useState(false);

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-ink p-5 text-paper">
        <div className="grid grid-cols-2 gap-3 text-center">
          {(
            [
              ['Gonzalo', p.gonzalo, '#F08A7A'],
              ['Vero', p.vero, '#9DBBA5'],
            ] as const
          ).map(([who, v, c], k) => (
            <motion.div
              key={who}
              initial={p.reveal ? { rotateY: 90, opacity: 0 } : false}
              animate={{ rotateY: 0, opacity: 1 }}
              transition={{ delay: 0.15 + k * 0.45 * d, duration: 0.45 }}
            >
              <p className="text-[12px] text-paper/60">{who}</p>
              <p className="font-mono text-[34px] leading-tight" style={{ color: c }}>
                {fmtScore(v)}
              </p>
            </motion.div>
          ))}
        </div>
        <motion.div
          initial={p.reveal ? { opacity: 0, y: 10 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1 * d }}
          className="mt-3 border-t border-dashed border-paper/20 pt-3 text-center"
        >
          <p className="font-mono text-[10px] tracking-[0.25em] text-paper/50">MEDIA FINAL</p>
          <p className="font-serif text-[72px] leading-none text-terracotta">{fmtScore(avg)}</p>
          <p className="text-[13px] text-paper/75">
            {verdict(avg)} · {mood}
          </p>
        </motion.div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => p.setWouldRepeat(p.wouldRepeat === true ? undefined : true)}
          aria-pressed={p.wouldRepeat === true}
          className={`flex items-center justify-center gap-2 rounded-full py-3 font-semibold transition-colors ${
            p.wouldRepeat === true ? 'bg-sage text-white' : 'bg-sand text-muted'
          }`}
        >
          <ThumbsUp size={16} {...ICON} /> {p.home ? 'Otra vez' : 'Repetimos'}
        </button>
        <button
          type="button"
          onClick={() => p.setWouldRepeat(p.wouldRepeat === false ? undefined : false)}
          aria-pressed={p.wouldRepeat === false}
          className={`flex items-center justify-center gap-2 rounded-full py-3 font-semibold transition-colors ${
            p.wouldRepeat === false ? 'bg-terracotta text-white' : 'bg-sand text-muted'
          }`}
        >
          <ThumbsDown size={16} {...ICON} /> Una y no más
        </button>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={async () => {
            setPhotoBusy(true);
            try {
              const url = await pickPhoto();
              if (url) p.setImageUrl(url);
            } finally {
              setPhotoBusy(false);
            }
          }}
          className="relative h-[92px] w-[92px] shrink-0 overflow-hidden rounded-2xl bg-sand"
          aria-label={p.imageUrl ? 'Cambiar foto' : 'Añadir foto'}
        >
          {p.imageUrl ? (
            <Photo src={p.imageUrl} alt="" category={p.category} className="h-full w-full" />
          ) : (
            <span className="flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold text-muted">
              {photoBusy ? <LoaderCircle size={20} className="animate-spin" /> : <Camera size={22} {...ICON} />}
              Foto
            </span>
          )}
          {p.imageUrl && (
            <span className="absolute right-1 bottom-1 grid h-7 w-7 place-items-center rounded-full bg-ink/70 text-paper">
              <Camera size={14} {...ICON} />
            </span>
          )}
        </button>
        <div className="min-w-0 flex-1 space-y-2">
          {/* Al votar un pendiente se salta el primer paso: aquí está la fecha. */}
          {p.showDate && (
            <input
              type="date"
              className={`${field} py-2.5 font-mono`}
              value={p.visitDate}
              max={today()}
              onChange={(e) => e.target.value && p.setVisitDate(e.target.value)}
              aria-label="Fecha"
            />
          )}
          <input
            className={`${field} py-2.5`}
            value={p.bestDish}
            onChange={(e) => p.setBestDish(e.target.value)}
            placeholder={p.home ? 'El truco' : 'Plato estrella'}
            aria-label={p.home ? 'El truco' : 'Plato estrella'}
          />
        </div>
      </div>

      <textarea
        className={`${field} min-h-[76px] resize-none`}
        value={p.notes}
        onChange={(e) => p.setNotes(e.target.value)}
        placeholder="Lo que no queremos olvidar…"
        aria-label="Notas"
      />

      {!p.home && (
        <details className="rounded-2xl border border-line px-4 py-3" open={p.food != null}>
          <summary className="cursor-pointer text-[13px] font-semibold text-muted">Desglose 1–5 (opcional)</summary>
          <div className="mt-3 space-y-2.5">
            <Rate5 label="Comida" value={p.food} onChange={p.setFood} />
            <Rate5 label="Ambiente" value={p.vibe} onChange={p.setVibe} />
            <Rate5 label="Calidad/Precio" value={p.value} onChange={p.setValue} />
          </div>
        </details>
      )}
    </div>
  );
}

/* ─────────── Paso: la receta ─────────── */

interface RecipeDraft {
  ingredients: string;
  steps: string;
  servings: string;
  minutes: string;
  sourceUrl: string;
}

function RecipeStep({
  draft,
  setDraft,
  onTitle,
}: {
  draft: RecipeDraft;
  setDraft: (d: RecipeDraft) => void;
  onTitle: (t: string) => void;
}) {
  const [paste, setPaste] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof RecipeDraft, v: string) => setDraft({ ...draft, [k]: v });

  const order = (text: string) => {
    const onlyLink = /^https?:\/\/\S+$/i.test(text.trim());
    if (onlyLink) {
      setDraft({ ...draft, sourceUrl: text.trim() });
      setPaste('');
      setMsg({
        ok: false,
        text: 'Enlace guardado. TikTok e Instagram no dejan leer la receta desde fuera: copia también el texto de la descripción y pégalo aquí.',
      });
      return;
    }
    const p = parseRecipeText(text);
    if (!p.ingredients.length && !p.steps.length) {
      setMsg({ ok: false, text: 'No he encontrado ingredientes ni pasos. Escríbelos abajo, uno por línea.' });
      return;
    }
    setDraft({
      ingredients: p.ingredients.join('\n') || draft.ingredients,
      steps: p.steps.join('\n') || draft.steps,
      servings: p.servings ? String(p.servings) : draft.servings,
      minutes: p.minutes ? String(p.minutes) : draft.minutes,
      sourceUrl: p.sourceUrl ?? draft.sourceUrl,
    });
    if (p.title) onTitle(p.title);
    setPaste('');
    setMsg({ ok: true, text: `Listo: ${p.ingredients.length} ingredientes y ${p.steps.length} pasos. Revísalo abajo.` });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-dashed border-stone-300 p-3">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Wand2 size={15} {...ICON} className="text-terracotta" /> Pega la receta y la ordeno yo
        </p>
        <p className="mt-0.5 text-[12px] text-muted">El texto de un TikTok, Instagram o web, tal cual.</p>
        <textarea
          className={`${field} mt-2 min-h-[84px] resize-none text-[15px]`}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder={'Ingredientes:\n- 4 huevos…\nPreparación:\n1. Bate los huevos…'}
          aria-label="Texto de la receta"
        />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={async () => {
              try {
                const t = await readClipboard();
                if (t.trim()) return order(t);
              } catch {
                /* sin permiso: que lo pegue a mano */
              }
              setMsg({ ok: false, text: 'Mantén pulsado el recuadro y elige «Pegar».' });
            }}
            className="flex h-10 items-center gap-1.5 rounded-full bg-sand px-3.5 text-[13px] font-semibold"
          >
            <ClipboardPaste size={15} {...ICON} /> Pegar
          </button>
          <button
            type="button"
            disabled={!paste.trim()}
            onClick={() => order(paste)}
            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-ink text-[13px] font-semibold text-paper disabled:opacity-40"
          >
            <Wand2 size={15} {...ICON} /> Ordenar receta
          </button>
        </div>
        {msg && <p className={`mt-2 text-[12.5px] ${msg.ok ? 'text-sage' : 'text-terracotta-dark'}`}>{msg.text}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <Label>Raciones</Label>
          <input className={`${field} font-mono`} inputMode="numeric" value={draft.servings} onChange={(e) => set('servings', e.target.value)} placeholder="2" />
        </label>
        <label className="block">
          <Label>Tiempo (min)</Label>
          <input className={`${field} font-mono`} inputMode="numeric" value={draft.minutes} onChange={(e) => set('minutes', e.target.value)} placeholder="30" />
        </label>
      </div>

      <label className="block">
        <Label>Ingredientes · uno por línea</Label>
        <textarea
          className={`${field} min-h-[120px] resize-y leading-relaxed`}
          value={draft.ingredients}
          onChange={(e) => set('ingredients', e.target.value)}
          placeholder={'4 huevos\n3 patatas\n1 cebolla'}
        />
      </label>

      <label className="block">
        <Label>Pasos · uno por línea</Label>
        <textarea
          className={`${field} min-h-[140px] resize-y leading-relaxed`}
          value={draft.steps}
          onChange={(e) => set('steps', e.target.value)}
          placeholder={'Pela y corta las patatas.\nFríelas a fuego medio 20 min.'}
        />
      </label>

      <label className="block">
        <Label>De dónde sale (opcional)</Label>
        <input
          className={field}
          inputMode="url"
          value={draft.sourceUrl}
          onChange={(e) => set('sourceUrl', e.target.value)}
          placeholder="Enlace de TikTok, Instagram…"
        />
      </label>
    </div>
  );
}
