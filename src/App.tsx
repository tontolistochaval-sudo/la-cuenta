import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Bookmark, Dices, Map as MapIcon, Plus, Settings as SettingsIcon, Trophy, type LucideIcon } from 'lucide-react';
import Ranking from './views/Ranking';
import Wishlist from './views/Wishlist';
import Recipes from './views/Recipes';
import Decider from './views/Decider';
import Settings from './views/Settings';
import DetailSheet from './components/DetailSheet';
import RateSheet, { type RateTarget } from './components/RateSheet';
import StatsSheet from './components/StatsSheet';
import DiscoverSheet from './components/DiscoverSheet';
import Toast from './components/Toast';
import { ICON, Segmented } from './components/ui';
import { useStore } from './store/useStore';
import { haptic, isNative } from './lib/native';
import { popBack } from './lib/back';
import { bootSync } from './lib/sync';

const MapView = lazy(() => import('./views/MapView'));

type Tab = 'olimpo' | 'pendientes' | 'recetas' | 'mapa' | 'decisor' | 'ajustes';

const TABS: { id: Tab; label: string; Icon: LucideIcon }[] = [
  { id: 'olimpo', label: 'El Olimpo', Icon: Trophy },
  { id: 'pendientes', label: 'Pendientes', Icon: Bookmark },
  { id: 'recetas', label: 'Recetario', Icon: BookOpen },
  { id: 'mapa', label: 'Mapa', Icon: MapIcon },
  { id: 'decisor', label: 'Decisor', Icon: Dices },
  { id: 'ajustes', label: 'Ajustes', Icon: SettingsIcon },
];

/** Pestañas donde tiene sentido el interruptor Fuera / En casa. */
const MODE_TABS: Tab[] = ['olimpo', 'pendientes', 'decisor'];

export default function App() {
  const [tab, setTab] = useState<Tab>('olimpo');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [rate, setRate] = useState<RateTarget>(null);
  const [stats, setStats] = useState(false);
  const [discover, setDiscover] = useState(false);
  const closeDiscover = useCallback(() => setDiscover(false), []);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);

  const openDetail = useCallback((id: string) => {
    setStats(false);
    setDiscover(false);
    setDetailId(id);
  }, []);
  const closeDetail = useCallback(() => setDetailId(null), []);
  const closeRate = useCallback(() => setRate(null), []);
  const closeStats = useCallback(() => setStats(false), []);
  const newEntry = () => setRate({ id: null, kind: tab === 'recetas' ? 'recipe' : undefined });

  // El mapa y el decisor son pantallas fijas; el resto se desliza como una página.
  const scrolls = tab !== 'mapa' && tab !== 'decisor';
  const mainRef = useRef<HTMLElement>(null);
  const goTo = (t: Tab) => {
    haptic.select();
    if (t === tab) mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); // tocar la pestaña activa = volver arriba
    else {
      setTab(t);
      mainRef.current?.scrollTo({ top: 0 });
    }
  };

  // Botón Atrás (Android) y Escape: cierra lo último abierto → vuelve a El Olimpo → minimiza la app.
  const tabRef = useRef(tab);
  tabRef.current = tab;
  useEffect(() => {
    const back = () => {
      if (popBack()) return;
      if (tabRef.current !== 'olimpo') {
        setTab('olimpo');
        mainRef.current?.scrollTo({ top: 0 });
      } else if (isNative) CapApp.minimizeApp().catch(() => {});
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && popBack();
    window.addEventListener('keydown', onKey);
    const sub = isNative ? CapApp.addListener('backButton', back) : null;
    return () => {
      window.removeEventListener('keydown', onKey);
      sub?.then((h) => h.remove());
    };
  }, []);

  // Los datos se leen de IndexedDB (asíncrono): no pintar hasta tenerlos, para no enseñar datos viejos.
  const [ready, setReady] = useState(() => useStore.persist.hasHydrated());
  useEffect(() => {
    if (ready) return;
    const unsub = useStore.persist.onFinishHydration(() => setReady(true));
    if (useStore.persist.hasHydrated()) setReady(true);
    return unsub;
  }, [ready]);

  // Con los datos locales ya cargados, conectar con la nube (si está configurada).
  useEffect(() => {
    if (ready) bootSync();
  }, [ready]);

  if (!ready) {
    return (
      <div className="grid h-dvh place-items-center bg-paper">
        <p className="font-serif text-[44px] leading-none">
          La Cuenta<span className="text-terracotta">.</span>
        </p>
      </div>
    );
  }

  return (
    <div className="paper-grain flex h-dvh flex-col overflow-hidden">
      <header className="shrink-0 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-xl items-center gap-2 px-4 pt-3 pb-2.5">
          <button
            type="button"
            onClick={() => goTo('olimpo')}
            className="mr-auto font-serif text-[30px] leading-none tracking-tight"
            aria-label="La Cuenta. — inicio"
          >
            La Cuenta<span className="text-terracotta">.</span>
          </button>
          {MODE_TABS.includes(tab) && (
            <div className="w-[136px]">
              <Segmented
                label="Fuera o en casa"
                size="sm"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'restaurant', label: 'Fuera' },
                  { value: 'recipe', label: 'Casa' },
                ]}
              />
            </div>
          )}
          <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            onClick={newEntry}
            aria-label={mode === 'recipe' ? 'Votar un plato' : 'Pasar la cuenta'}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-terracotta text-white shadow-[0_8px_20px_-8px_rgb(224_90_71/0.7)] transition-colors hover:bg-terracotta-dark"
          >
            <Plus size={20} {...ICON} />
          </motion.button>
        </div>
      </header>

      <main
        ref={mainRef}
        className={`relative min-h-0 w-full flex-1 ${scrolls ? 'no-scrollbar overflow-y-auto overscroll-contain' : ''}`}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={tab === 'mapa' || tab === 'ajustes' ? tab : `${tab}-${mode}`}
            className={`mx-auto w-full max-w-xl px-4 pt-1 pb-[calc(6.75rem+env(safe-area-inset-bottom))] ${scrolls ? '' : 'h-full'}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            {tab === 'olimpo' && (
              <Ranking onOpen={openDetail} onAdd={newEntry} onStats={() => setStats(true)} />
            )}
            {tab === 'recetas' && <Recipes onOpen={openDetail} onAdd={() => setRate({ id: null, kind: 'recipe' })} />}
            {tab === 'pendientes' && (
              <Wishlist
                onOpen={openDetail}
                onEvaluate={(id) => setRate({ id, evaluate: true })}
                onAddWish={() => setRate({ id: null, status: 'wishlist' })}
                onDiscover={() => setDiscover(true)}
              />
            )}
            {tab === 'mapa' && (
              <Suspense fallback={<div className="h-full animate-pulse rounded-3xl bg-sand" />}>
                <MapView onOpen={openDetail} />
              </Suspense>
            )}
            {tab === 'decisor' && <Decider onOpen={openDetail} />}
            {tab === 'ajustes' && <Settings />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Floating Dock */}
      <nav aria-label="Navegación principal" className="fixed inset-x-0 bottom-6 z-[1000] mx-auto mb-[env(safe-area-inset-bottom)] w-max">
        <ul className="flex items-center gap-1 rounded-full bg-stone-900/90 px-6 py-3 text-white shadow-2xl backdrop-blur-xl max-[380px]:px-4">
          {TABS.map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => goTo(id)}
                  aria-label={label}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex h-11 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors ${
                    active ? 'text-ink' : 'text-white/65 hover:text-white'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="dock-pill"
                      className="absolute inset-0 rounded-full bg-paper"
                      transition={{ type: 'spring', damping: 28, stiffness: 380 }}
                    />
                  )}
                  <Icon size={19} {...ICON} className="relative" />
                  {active && <span className="relative hidden sm:inline">{label}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <StatsSheet open={stats} onClose={closeStats} onOpen={openDetail} />
      <DiscoverSheet open={discover} onClose={closeDiscover} onOpen={openDetail} />
      <DetailSheet
        id={detailId}
        onClose={closeDetail}
        onRate={(t) => {
          setDetailId(null);
          setRate(t);
        }}
      />
      <RateSheet
        target={rate}
        onClose={closeRate}
        onSaved={(id) => {
          setRate(null);
          setDetailId(id);
        }}
      />
      <Toast />
    </div>
  );
}
