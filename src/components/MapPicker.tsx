import { useState } from 'react';
import { MapContainer, TileLayer, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Check, X } from 'lucide-react';
import { ICON } from './ui';
import { TILE_ATTRIBUTION, TILE_URL } from '../lib/tiles';

const MADRID: [number, number] = [40.4168, -3.7038];

function Track({ onMove }: { onMove: (c: [number, number]) => void }) {
  const map = useMapEvents({
    move: () => {
      const c = map.getCenter();
      onMove([Number(c.lat.toFixed(5)), Number(c.lng.toFixed(5))]);
    },
  });
  return null;
}

/** Mapa a pantalla completa con un pin fijo en el centro: se mueve el mapa, no el pin. */
export default function MapPicker({
  initial,
  onPick,
  onCancel,
}: {
  initial?: [number, number];
  onPick: (c: [number, number]) => void;
  onCancel: () => void;
}) {
  const [center, setCenter] = useState<[number, number]>(initial ?? MADRID);
  return (
    <div className="absolute inset-0 z-20 flex flex-col overflow-hidden rounded-2xl border border-line bg-sand">
      <div className="relative min-h-0 flex-1">
        <MapContainer center={center} zoom={initial ? 18 : 14} zoomControl={false} className="h-full w-full">
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} subdomains="abcd" maxZoom={20} />
          <Track onMove={setCenter} />
        </MapContainer>
        {/* Pin fijo */}
        <div className="pointer-events-none absolute top-1/2 left-1/2 z-[500] -translate-x-1/2 -translate-y-full">
          <div className="flex flex-col items-center">
            <span className="grid h-9 w-9 place-items-center rounded-full border-[3px] border-cream bg-terracotta shadow-[0_8px_16px_-6px_rgb(150_60_40/0.6)]">
              <span className="h-2.5 w-2.5 rounded-full bg-cream" />
            </span>
            <span className="-mt-1 h-3 w-[3px] rounded-b bg-terracotta" />
          </div>
        </div>
        <p className="absolute top-3 left-1/2 z-[500] -translate-x-1/2 rounded-full bg-ink/85 px-3 py-1.5 text-[12px] font-medium whitespace-nowrap text-paper">
          Mueve el mapa hasta la puerta del sitio
        </p>
      </div>
      <div className="flex gap-2 bg-cream p-2">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancelar"
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-sand"
        >
          <X size={18} {...ICON} />
        </button>
        <button
          type="button"
          onClick={() => onPick(center)}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-ink font-semibold text-paper"
        >
          <Check size={18} {...ICON} /> Usar este punto
        </button>
      </div>
    </div>
  );
}
