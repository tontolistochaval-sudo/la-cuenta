// CARTO Voyager: mapa a color (parques verdes, agua azul, calles cálidas). Exige clave (gratis);
// sin ella sirve teselas con marca de agua. El tono se calienta un poco por CSS (.leaflet-tile-pane).
const CARTO_KEY = import.meta.env.VITE_CARTO_KEY as string | undefined;

export const TILE_URL = `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png${
  CARTO_KEY ? `?key=${encodeURIComponent(CARTO_KEY)}` : ''
}`;

export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
