import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, LoaderCircle, LocateFixed, MapPinOff, Navigation, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import type { RestaurantEntry } from '../data/seedData';
import { directionsUrl, fmtEuro, fmtScore, rankVisited } from '../lib/utils';
import { currentPosition } from '../lib/geo';
import { TILE_ATTRIBUTION, TILE_URL } from '../lib/tiles';
import { ICON, Photo, ScorePill } from '../components/ui';

const MADRID: [number, number] = [40.4068, -3.6995];

/** Encuadra todos los pines la primera vez (y cuando cambia el filtro). */
function FitBounds({ points, filterKey }: { points: [number, number][]; filterKey: string }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) map.setView(points[0], 16);
    else map.fitBounds(L.latLngBounds(points), { padding: [56, 56], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);
  return null;
}

function LocateMe() {
  const map = useMap();
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState<[number, number] | null>(null);
  const showToast = useStore((s) => s.showToast);
  return (
    <>
      {me && <CircleMarker center={me} radius={7} pathOptions={{ color: '#fff', weight: 3, fillColor: '#1C1917', fillOpacity: 1 }} />}
      <button
        type="button"
        aria-label="Dónde estoy"
        ref={(el) => {
          if (el) L.DomEvent.disableClickPropagation(el);
        }}
        onClick={async () => {
          setBusy(true);
          try {
            const c = await currentPosition();
            setMe(c);
            map.setView(c, 16);
          } catch (e) {
            showToast((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
        className="absolute right-3 bottom-3 z-[500] grid h-11 w-11 place-items-center rounded-full border border-line bg-paper/95 text-ink shadow-warm backdrop-blur"
      >
        {busy ? <LoaderCircle size={18} className="animate-spin" /> : <LocateFixed size={18} {...ICON} />}
      </button>
    </>
  );
}

const BOOKMARK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z"/></svg>';

/** Pines: podio en dorado, visitados en terracota con su nota, pendientes en oliva. */
function pinIcon(r: RestaurantEntry, active: boolean, rank: number) {
  const ring = active ? 'outline outline-[3px] outline-offset-2 outline-ink/80 scale-110' : '';
  const podium = rank > 0 && rank <= 3;
  const bg = r.status === 'visited' ? (podium ? 'bg-gold' : 'bg-terracotta') : 'bg-sage';
  const html =
    r.status === 'visited' && r.scores
      ? `<div class="flex h-8 items-center justify-center gap-1 rounded-full border-2 border-cream ${bg} px-2.5 font-mono text-[13px] font-bold text-white shadow-[0_6px_14px_-4px_rgb(120_60_30/0.55)] transition-transform ${ring}">${
          podium ? `<span class="text-[10px] opacity-90">#${rank}</span>` : ''
        }${fmtScore(r.scores.average)}</div>`
      : `<div class="flex h-8 items-center justify-center gap-1 rounded-full border-2 border-cream bg-sage px-2.5 text-white shadow-[0_6px_14px_-4px_rgb(40_70_50/0.55)] transition-transform ${ring}">${BOOKMARK_SVG}</div>`;
  return L.divIcon({
    html: `<div class="flex flex-col items-center">${html}<span class="-mt-[3px] h-2 w-2 rotate-45 border-r-2 border-b-2 border-cream ${bg}"></span></div>`,
    className: 'lc-pin',
    iconSize: [64, 42],
    iconAnchor: [32, 42],
  });
}

function ClickAway({ onClick }: { onClick: () => void }) {
  useMapEvents({ click: onClick });
  return null;
}

type Filter = 'all' | 'visited' | 'wishlist';

export default function MapView({ onOpen }: { onOpen: (id: string) => void }) {
  const restaurants = useStore((s) => s.restaurants);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [showMissing, setShowMissing] = useState(false);

  const places = useMemo(() => restaurants.filter((r) => r.kind === 'restaurant'), [restaurants]);
  const rankOf = useMemo(() => new Map(rankVisited(places).map((r, k) => [r.id, k + 1])), [places]);
  const shown = places.filter((r) => r.coordinates && (filter === 'all' || r.status === filter));
  const missing = places.filter((r) => !r.coordinates);
  const selected = places.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="relative h-full overflow-hidden rounded-3xl border border-line shadow-warm">
      <MapContainer center={MADRID} zoom={14} zoomControl={false} className="h-full w-full">
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} subdomains="abcd" maxZoom={20} />
        <FitBounds points={shown.map((r) => r.coordinates!)} filterKey={filter} />
        {!selected && <LocateMe />}
        <ClickAway
          onClick={() => {
            setSelectedId(null);
            setShowMissing(false);
          }}
        />
        {shown.map((r) => (
          <Marker
            key={r.id}
            position={r.coordinates!}
            icon={pinIcon(r, r.id === selectedId, rankOf.get(r.id) ?? 0)}
            zIndexOffset={r.id === selectedId ? 1000 : 0}
            title={r.name}
            eventHandlers={{ click: () => setSelectedId(r.id) }}
          />
        ))}
      </MapContainer>

      <div className="absolute inset-x-3 top-3 z-[500] flex items-start justify-between gap-2">
        <div className="flex gap-1 rounded-full border border-line bg-paper/90 p-1 backdrop-blur-md">
          {(
            [
              ['all', 'Todos', null],
              ['visited', 'Fuimos', 'bg-terracotta'],
              ['wishlist', 'Pendientes', 'bg-sage'],
            ] as const
          ).map(([key, label, dot]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setFilter(key);
                setSelectedId(null);
              }}
              aria-pressed={filter === key}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
                filter === key ? 'bg-ink text-paper' : 'text-muted'
              }`}
            >
              {dot && <span className={`h-2 w-2 rounded-full ${dot}`} />}
              {label}
            </button>
          ))}
        </div>

        {missing.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMissing((v) => !v)}
              aria-expanded={showMissing}
              className="flex items-center gap-1 rounded-full border border-line bg-paper/90 px-2.5 py-2 text-[12px] font-semibold text-muted backdrop-blur-md"
            >
              <MapPinOff size={14} {...ICON} /> {missing.length}
            </button>
            <AnimatePresence>
              {showMissing && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="absolute top-11 right-0 w-56 rounded-2xl border border-line bg-cream p-2 shadow-lift"
                >
                  <p className="px-2 pt-1 pb-1.5 text-[11px] text-muted">Sin ubicar. Toca para añadirla:</p>
                  {missing.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setShowMissing(false);
                        onOpen(r.id);
                      }}
                      className="block w-full truncate rounded-xl px-2 py-2 text-left text-[13.5px] font-medium hover:bg-sand"
                    >
                      {r.name}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      <AnimatePresence>
        {selected && (
          <motion.div
            key={selected.id}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className="absolute inset-x-3 bottom-3 z-[600] rounded-2xl border border-line bg-cream p-3 shadow-lift"
          >
            <div className="flex gap-3">
              <Photo src={selected.imageUrl} alt="" category={selected.category} className="h-20 w-20 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-serif text-[24px] leading-none">{selected.name}</p>
                    <p className="mt-1 truncate text-[12px] text-muted">
                      {[selected.address, selected.neighborhood, selected.category].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    aria-label="Cerrar tarjeta"
                    className="-mt-1 -mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted"
                  >
                    <X size={16} {...ICON} />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  {selected.scores ? (
                    <>
                      <span className="rounded-full bg-terracotta px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                        {fmtScore(selected.scores.average)}
                      </span>
                      <ScorePill who="G" value={selected.scores.gonzalo} />
                      <ScorePill who="V" value={selected.scores.vero} />
                    </>
                  ) : (
                    <span className="rounded-full bg-sage px-2 py-0.5 text-[11px] font-semibold text-white">Pendiente</span>
                  )}
                  {selected.pricePerPerson != null && (
                    <span className="ml-auto font-mono text-[11px] text-muted">{fmtEuro(selected.pricePerPerson)}/p</span>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <a
                href={directionsUrl(selected.coordinates!)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-1.5 rounded-full bg-ink py-2.5 text-[13px] font-semibold text-paper"
              >
                <Navigation size={15} {...ICON} /> Cómo llegar
              </a>
              <button
                type="button"
                onClick={() => onOpen(selected.id)}
                className="flex items-center justify-center gap-1 rounded-full bg-sand py-2.5 text-[13px] font-semibold"
              >
                Ver ficha <ChevronRight size={15} {...ICON} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
