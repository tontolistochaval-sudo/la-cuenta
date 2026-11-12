# 🧾 La Cuenta. — Private Culinary Club & Gastro Tracker PWA

## 1. Visión del Proyecto
**La Cuenta.** es una Progressive Web App (PWA) privada, *Mobile-First* y con estética de club gastronómico moderno, diseñada para que Gonzalo y Vero registren, puntúen por separado, clasifiquen en un ranking automático y decidan sus próximos restaurantes en Madrid.
El concepto gira en torno al momento final de cada cita: cuando llega "la cuenta", se hace balance de la cena y cada uno emite su veredicto.

---

## 2. 🎨 Sistema de Diseño y Reglas Estéticas (CRÍTICO - LEER ANTES DE CODIFICAR)
El objetivo es una estética **2026 Editorial Warm Minimalist & Bento UI** (inspirada en *Apple Journal*, *Beli* y papelería de restaurantes de autor), incorporando guiños visuales sutiles a **tickets/facturas gastronómicas de diseño**.

### ❌ PROHIBIDO (Anti-Patrones de IA):
- **Prohibido** usar el azul o morado por defecto de Tailwind (`bg-blue-500`, `indigo-600`).
- **Prohibido** usar fondos blancos puros (`#FFFFFF`) como fondo general de la aplicación.
- **Prohibido** usar sombras oscuras genéricas o tablas HTML clásicas.

### ✅ Paleta de Colores Exacta (Tailwind Custom Tokens):
- **Background Principal (Warm Alabaster / Papel Térmico Cálido):** `#FAF8F5`
- **Surface / Cards (Pure Cream):** `#FFFFFF` con borde sutil `1px solid #EBE5D9`.
- **Surface Secundaria (Warm Sand):** `#F3EFEA` (Para chips inactivos, bloques de ticket e inputs).
- **Texto Principal (Ink Charcoal):** `#1C1917` (`stone-900`).
- **Texto Secundario (Muted Stone):** `#78716C` (`stone-500`).
- **Acento Principal (Terracotta / Lacre):** `#E05A47` (Para botones primarios, insignias destacadas y notas sobresalientes).
- **Acento Secundario (Sage Olive):** `#4A6B53` (Para etiquetas de "Pagado/Visitado" o buena relación calidad-precio).
- **Gold / Podio Top 3:** `#D97706` sobre fondo `#FEF3C7`.

### 🔤 Tipografía (Importar desde Google Fonts):
- **Logo y Títulos (`font-serif`):** `'Instrument Serif'` (El logo en el header debe leerse como **`La Cuenta.`** con el punto final en color `#E05A47`).
- **Cuerpo de UI (`font-sans`):** `'Plus Jakarta Sans'` (Limpia, moderna y muy legible).
- **Notas, Precios, Desgloses y Fechas (`font-mono`):** `'JetBrains Mono'` (Vital para dar la estética de ticket/recibo cuando se muestran las notas `G: 8.9 | V: 8.5` y el precio por cabeza).

### ✨ Detalles de Identidad "La Cuenta":
- **Tarjeta de Desglose ("El Ticket"):** Al abrir el detalle de un restaurante visitado, el resumen de puntuaciones (Comida, Ambiente, Calidad/Precio, Nota de Gonzalo, Nota de Vero y Media Final) debe presentarse con estética de recibo moderno: fuente `font-mono`, separadores con líneas punteadas (`border-dashed border-stone-300`), fecha estilo sello y el veredicto final abajo en grande.
- **Bordes y Navegación:** Contenedores con `rounded-3xl`, tarjetas con `rounded-2xl` y barra de navegación inferior flotante (*Floating Dock* en `bottom-6`) con `backdrop-blur-xl bg-stone-900/90 text-white rounded-full px-6 py-3 shadow-2xl`.
- **Animaciones:** `framer-motion` para transiciones suaves entre pestañas y modales inferiores (*Bottom Sheets*).

---

## 3. 🛠️ Stack Tecnológico
- **Framework:** Vite + React + TypeScript (SPA rápida y ligera preparada como PWA).
- **Estilos:** Tailwind CSS + `lucide-react` (`strokeWidth={1.75}`).
- **Animaciones:** `framer-motion` + `canvas-confetti`.
- **Mapa:** `react-leaflet` + `leaflet` usando **exclusivamente** el mapa minimalista claro de CartoDB Positron (`https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`).
- **Estado y Persistencia:** `zustand` con middleware `persist` en `localStorage`, inicializado con `seedData.ts`, más opción en ajustes para Exportar/Importar copia de seguridad en JSON.

---

## 4. 📱 Funcionalidades y Vistas Principales

### 1. Ranking & Dashboard ("El Olimpo")
- **Header:** Logo editorial **`La Cuenta.`** a la izquierda y botón rápido `+ Pasar la cuenta` (añadir sitio) a la derecha.
- **Bento Grid de Estadísticas:**
  - *Cuentas saldadas* (Total de restaurantes visitados).
  - *Ticket medio* (Gasto medio por persona en `€`).
  - *Índice de exigencia* (Comparativa rápida de quién tiene la media de puntuación más dura: Gonzalo vs. Vero).
  - *Zona cero* (Barrio con más visitas).
- **Podio Top 3:** Tarjetas visuales con foto, posición `#1`, `#2`, `#3` y nota media en fuente Serif grande.
- **Listado del Ranking:** Ordenado automáticamente de mayor a menor nota media. Muestra posición, foto miniatura, nombre, barrio, categoría, precio/persona en `font-mono` y las dos píldoras individuales (`G` y `V`) junto a la nota final. Incluye buscador y filtros por categoría/barrio.

### 2. Modal de Valoración ("Pasar La Cuenta")
- Formulario táctil para añadir un sitio nuevo o evaluar uno que estaba en *Pendientes*:
  - Sliders independientes de 0 a 10 (con paso de 0.1) para **Gonzalo** y **Vero**.
  - Cálculo en vivo de la **Media Final**.
  - Puntuación de 1 a 5 en: *Comida*, *Ambiente* y *Calidad/Precio*.
  - Precio por persona (`€`), *Plato estrella*, *¿Repetiríamos?* (Sí/No) y notas de la cita.

### 3. Mapa Gastro de Madrid
- Mapa centrado en Madrid (`[40.4068, -3.6995]`).
- Pines HTML personalizados (`divIcon`):
  - **Visitados:** Cápsula color Terracotta (`#E05A47`) con la nota media escrita dentro en `font-mono`.
  - **Pendientes (Wishlist):** Cápsula color Verde Oliva (`#4A6B53`) con un icono de marcador.
- Al pulsar un pin, emerge una tarjeta flotante inferior con el resumen del local y enlace directo a cómo llegar.

### 4. Decisor de Citas ("¿Dónde pedimos hoy?")
- Filtra los restaurantes en estado `wishlist` por barrio o presupuesto máximo.
- Animación interactiva que baraja las opciones candidatas y extrae el restaurante ganador del día con confeti.

---

## 5. 🗄️ Datos Iniciales (`src/data/seedData.ts`)
Inicializa la app con esta interfaz y estos restaurantes reales en Madrid:

```typescript
export interface RestaurantEntry {
  id: string;
  name: string;
  category: 'Japonés / Sushi' | 'Italiano' | 'Burgers' | 'Mediterráneo' | 'Fusión' | 'Postres / Café';
  neighborhood: 'Arganzuela' | 'Acacias' | 'Embajadores' | 'Atocha' | 'Centro' | 'Moncloa' | 'Chamberí' | 'Salamanca';
  status: 'visited' | 'wishlist';
  visitDate?: string;
  pricePerPerson: number;
  scores?: {
    gonzalo: number;
    vero: number;
    average: number;
    food: number;
    vibe: number;
    value: number;
  };
  bestDish?: string;
  notes?: string;
  wouldRepeat?: boolean;
  coordinates: [number, number];
  imageUrl: string;
}

export const INITIAL_RESTAURANTS: RestaurantEntry[] = [
  {
    id: 'rest-1',
    name: 'Burmet',
    category: 'Burgers',
    neighborhood: 'Arganzuela',
    status: 'visited',
    visitDate: '2026-09-25',
    pricePerPerson: 18,
    scores: {
      gonzalo: 8.9,
      vero: 8.5,
      average: 8.7,
      food: 5,
      vibe: 4,
      value: 5
    },
    bestDish: 'Smash Burger Trufada con patatas caseras',
    notes: 'Punto de la carne brutal y el pan brioche no se deshace nada.',
    wouldRepeat: true,
    coordinates: [40.4012, -3.7018],
    imageUrl: '[https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80](https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80)'
  },
  {
    id: 'rest-2',
    name: 'La Tagliatella',
    category: 'Italiano',
    neighborhood: 'Arganzuela',
    status: 'visited',
    visitDate: '2026-09-18',
    pricePerPerson: 24,
    scores: {
      gonzalo: 8.4,
      vero: 8.8,
      average: 8.6,
      food: 4,
      vibe: 5,
      value: 4
    },
    bestDish: 'Pizza Bismark y pasta con salsa Tartufo',
    notes: 'Raciones enormes y ambiente muy cómodo para cenar sin prisas.',
    wouldRepeat: true,
    coordinates: [40.3985, -3.6942],
    imageUrl: '[https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=800&q=80](https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=800&q=80)'
  },
  {
    id: 'rest-3',
    name: 'Buffet Sushi Acacias',
    category: 'Japonés / Sushi',
    neighborhood: 'Acacias',
    status: 'visited',
    visitDate: '2026-09-05',
    pricePerPerson: 21,
    scores: {
      gonzalo: 7.8,
      vero: 8.2,
      average: 8.0,
      food: 4,
      vibe: 3,
      value: 5
    },
    bestDish: 'Uramaki crujiente de salmón y gyozas a la plancha',
    notes: 'Perfecto para quitarse el antojo de sushi en cantidad y rápido.',
    wouldRepeat: true,
    coordinates: [40.4039, -3.7065],
    imageUrl: '[https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=800&q=80](https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=800&q=80)'
  },
  {
    id: 'rest-4',
    name: 'Grosso Napoletano',
    category: 'Italiano',
    neighborhood: 'Embajadores',
    status: 'wishlist',
    pricePerPerson: 22,
    bestDish: 'Pizza Diavola y tiramisú blanco',
    notes: 'Pendiente para ir después de un paseo por Madrid Río.',
    coordinates: [40.4052, -3.7023],
    imageUrl: '[https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=800&q=80](https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=800&q=80)'
  },
  {
    id: 'rest-5',
    name: 'Sala de Despiece (SDD)',
    category: 'Fusión',
    neighborhood: 'Chamberí',
    status: 'wishlist',
    pricePerPerson: 42,
    bestDish: 'Rolex de panceta y yema trufada',
    notes: 'Guardado para celebrar una fecha especial.',
    coordinates: [40.4379, -3.6992],
    imageUrl: '[https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80](https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80)'
  },
  {
    id: 'rest-6',
    name: 'Ramen Kagura',
    category: 'Japonés / Sushi',
    neighborhood: 'Centro',
    status: 'wishlist',
    pricePerPerson: 16,
    bestDish: 'Tonkotsu Ramen clásico',
    notes: 'Plan infalible para un finde de frío por el centro.',
    coordinates: [40.4183, -3.7089],
    imageUrl: '[https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=80](https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=80)'
  }
];