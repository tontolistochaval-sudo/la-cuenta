import type { RecipeDetails } from '../data/seedData';

/**
 * Convierte el texto pegado de un TikTok, Instagram o web en ingredientes y pasos.
 * Funciona sin conexión y sin IA: reconoce secciones ("Ingredientes", "Preparación"…),
 * viñetas, numeraciones, cantidades y tiempos. Lo que no sepa colocar, lo deja editable.
 */

const URL_RE = /https?:\/\/\S+/gi;
const INGREDIENTS_HEADER = /^(?:ingredientes?|lo que necesitas|necesitas|ingredients?)\b\s*(?:para[^:]*)?:?\s*/i;
const STEPS_HEADER =
  /^(?:pasos?|preparaci[oó]n|elaboraci[oó]n|instrucciones|modo de (?:hacer|preparaci[oó]n)|c[oó]mo (?:se )?hac(?:e|erl[oa])|receta|method|steps?)\b\s*:?\s*/i;
const NOISE =
  /(link en (?:la )?bio|s[ií]gueme|follow|guarda (?:esta|el) (?:receta|post|v[ií]deo)|comparte|dale like|comenta|suscr[ií]bete|#\w+)/i;

// Viñetas, emojis y numeraciones al principio de la línea.
const BULLET = /^(?:[•●▪‣⁃\-–—*·>]+|\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*|\d{1,2}\s*[.)\-:ºª]|paso\s*\d+\s*[.:)\-]?)\s*/iu;

const QTY =
  /^(?:\d+(?:[.,/]\d+)?|½|¼|¾|un[ao]?|dos|tres|cuatro|media|medio|una pizca|pizca|al gusto|c\/n)\b|\b\d+(?:[.,]\d+)?\s?(?:g|gr|grs|gramos|kg|ml|l|litros?|cl|cucharad(?:a|ita)s?|cdas?|cdtas?|tazas?|vasos?|dientes?|unidad(?:es)?|latas?|sobres?|hojas?|rebanadas?|lonchas?|pizca)\b/i;
const IMPERATIVE =
  /^(?:a[ñn]ade|a[ñn]adir|mezcla|mezclar|bate|batir|corta|cortar|pica|picar|calienta|calentar|hornea|hornear|cocina|cocinar|cuece|cocer|fr[ií]e|fre[ií]r|sofr[ií]e|pon|poner|echa|echar|deja|dejar|retira|retirar|sirve|servir|precalienta|precalentar|incorpora|incorporar|remueve|remover|lava|pela|pelar|ralla|rallar|tritura|triturar|vierte|verter|amasa|amasar|forma|formar|reserva|reservar|saltea|saltear|dora|dorar|hierve|hervir|escurre|escurrir|monta|montar|derrite|derretir|unta|untar|cubre|cubrir|enfr[ií]a|refrigera|coloca|colocar|agrega|agregar|lleva|tapa|tapar|emplata|decora)\b/i;

const clean = (l: string) =>
  l
    .replace(URL_RE, '')
    .replace(BULLET, '')
    .replace(/\s+/g, ' ')
    .trim();

/** "Huevos, patatas y cebolla" → 3 ingredientes (solo si parece una lista corta). */
const splitInline = (l: string) => {
  const parts = l.split(/\s*,\s*|\s+y\s+(?=[^,]+$)/i).map((s) => s.trim()).filter(Boolean);
  return parts.length > 1 && parts.every((p) => p.length <= 40) ? parts : [l];
};

/** Un párrafo largo de preparación → un paso por frase. */
const splitSentences = (l: string) =>
  l.length > 140
    ? l
        .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¡¿])/u)
        .map((s) => s.trim())
        .filter(Boolean)
    : [l];

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export interface ParsedRecipe extends RecipeDetails {
  title?: string;
}

export function parseRecipeText(raw: string): ParsedRecipe {
  const text = raw.replace(/\r/g, '');
  const sourceUrl = text.match(URL_RE)?.[0];

  const servings = Number(text.match(/(\d{1,2})\s*(?:personas|raciones|porciones|comensales|pax|unidades)\b/i)?.[1]) || undefined;
  // Tiempo total: solo si se dice explícitamente o va en la cabecera (no los tiempos de cada paso).
  let minutes: number | undefined;
  const head = text.split(/\n+/).slice(0, 2).join(' ');
  const explicit = text.match(/tiempo(?: total)?\s*:?\s*((?:\d+(?:[.,]\d+)?\s*(?:h|horas?)\s*)?(?:\d+\s*(?:min|minutos?))?)/i)?.[1];
  const timeText = explicit?.trim() || head;
  const h = timeText.match(/(\d+(?:[.,]\d+)?)\s*(?:h|horas?)\b/i);
  const m = timeText.match(/(\d{1,3})\s*(?:min|minutos?|')(?=\W|$)/i);
  if (h || m) minutes = Math.round((h ? Number(h[1].replace(',', '.')) * 60 : 0) + (m ? Number(m[1]) : 0)) || undefined;

  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const ingredients: string[] = [];
  const steps: string[] = [];
  let section: 'none' | 'ing' | 'steps' = 'none';
  let title: string | undefined;

  for (const original of lines) {
    if (NOISE.test(original) && original.replace(/#\w+/g, '').replace(URL_RE, '').trim().length < 30) continue;

    // Cabecera de sección (puede llevar contenido en la misma línea).
    const ingHead = original.replace(BULLET, '').match(INGREDIENTS_HEADER);
    const stepHead = ingHead ? null : original.replace(BULLET, '').match(STEPS_HEADER);
    const head = ingHead ?? stepHead;
    if (head) {
      section = ingHead ? 'ing' : 'steps';
      const rest = clean(original.replace(BULLET, '').slice(head[0].length));
      if (!rest) continue;
      if (section === 'ing') ingredients.push(...splitInline(rest));
      else steps.push(...splitSentences(rest));
      continue;
    }

    const l = clean(original.replace(/#\w+/g, ''));
    if (!l || l.length < 2) continue;

    if (section === 'ing') {
      // Una línea larga con verbo de cocina suele indicar que ya empezaron los pasos.
      if (IMPERATIVE.test(l) && l.length > 45) {
        section = 'steps';
        steps.push(...splitSentences(l));
      } else ingredients.push(...splitInline(l));
    } else if (section === 'steps') {
      steps.push(...splitSentences(l));
    } else {
      // Sin cabeceras: decidir por la pinta de la línea.
      if (!title && !QTY.test(l) && !IMPERATIVE.test(l) && l.length <= 60 && !/[.:]$/.test(l)) {
        title = l.replace(/[!¡]+/g, '').replace(/\p{Extended_Pictographic}/gu, '').trim();
      } else if (QTY.test(l) && l.length <= 70 && !IMPERATIVE.test(l)) {
        ingredients.push(l);
      } else if (IMPERATIVE.test(l) || l.length > 50) {
        steps.push(...splitSentences(l));
      } else {
        ingredients.push(l);
      }
    }
  }

  const tidy = (list: string[]) =>
    [...new Set(list.map((s) => capitalize(s.replace(/[.;,]+$/, '').trim())).filter((s) => s.length > 1))];

  return {
    title,
    ingredients: tidy(ingredients),
    steps: tidy(steps).map((s) => (/[.!?]$/.test(s) ? s : `${s}.`)),
    servings,
    minutes,
    sourceUrl,
  };
}

export const linesToList = (s: string) =>
  s
    .split('\n')
    .map((l) => l.replace(BULLET, '').trim())
    .filter(Boolean);

export const fmtMinutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);

export const sourceLabel = (url?: string) =>
  !url ? '' : /tiktok/i.test(url) ? 'TikTok' : /instagram/i.test(url) ? 'Instagram' : /youtu/i.test(url) ? 'YouTube' : 'la web';
