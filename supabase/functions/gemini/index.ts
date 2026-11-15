// ════════════════════════════════════════════════════════════════════
//  La Cuenta. — Edge Function "gemini"
//  Hace de intermediario con la API de Gemini para que la clave NUNCA esté en la app.
//  Solo responde a usuarios con sesión iniciada (JWT de Supabase).
//
//  Secretos (Supabase → Edge Functions → Secrets):
//    GEMINI_API_KEY  (obligatorio) clave de https://aistudio.google.com/apikey
//    GEMINI_MODEL    (opcional)    p. ej. "gemini-2.5-flash"; si no existe, se elige solo el Flash más nuevo
//
//  Tareas:
//    { task: "recipe",   text }                       → receta ordenada (ingredientes, pasos, utensilios…)
//    { task: "discover", visited, wishlist, focus, wish } → sitios reales en Madrid que os podrían gustar
// ════════════════════════════════════════════════════════════════════

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const API = 'https://generativelanguage.googleapis.com/v1beta';
const KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
let model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash';
let modelChecked = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** Si el modelo configurado ya no existe, elige el "flash" más reciente disponible. */
async function pickNewestFlash() {
  const res = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': KEY } });
  if (!res.ok) return;
  const data = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  const flash = (data.models ?? [])
    .filter((m) => /flash/.test(m.name) && !/lite|image|tts|audio|live|thinking|exp/.test(m.name))
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name.replace('models/', ''))
    .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
  if (flash[0]) model = flash[0];
}

async function gemini(body: Record<string, unknown>): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${API}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
      body: JSON.stringify(body),
    });
    if (res.status === 404 && !modelChecked) {
      modelChecked = true;
      await pickNewestFlash();
      continue;
    }
    if (!res.ok) {
      const t = await res.text();
      if (res.status === 429) throw new Error('Gemini está saturado o se ha llegado al límite gratuito. Prueba en un rato.');
      throw new Error(`Gemini respondió ${res.status}: ${t.slice(0, 200)}`);
    }
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    return parts.map((p: { text?: string }) => p.text ?? '').join('');
  }
  throw new Error('No hay ningún modelo de Gemini disponible.');
}

/** Saca el primer bloque JSON del texto (por si viene con ```json … ```). */
function parseJson(text: string) {
  const clean = text.replace(/```(?:json)?/g, '').trim();
  const start = clean.search(/[[{]/);
  const end = Math.max(clean.lastIndexOf('}'), clean.lastIndexOf(']'));
  if (start < 0 || end < start) throw new Error('Gemini no devolvió datos legibles.');
  return JSON.parse(clean.slice(start, end + 1));
}

/** De un enlace de TikTok/Instagram/web intenta sacar la descripción (lo que suele llevar la receta). */
async function fetchDescription(url: string): Promise<string> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 7000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36', 'Accept-Language': 'es-ES,es' },
    });
    clearTimeout(t);
    if (!res.ok) return '';
    const html = (await res.text()).slice(0, 600_000);
    const metas = [...html.matchAll(/<meta[^>]+(?:property|name)="(?:og:description|description|og:title|twitter:description)"[^>]+content="([^"]*)"/gi)].map((m) => m[1]);
    const ld = [...html.matchAll(/"(?:description|recipeInstructions|recipeIngredient|text)"\s*:\s*"((?:[^"\\]|\\.){20,4000})"/g)].map((m) => m[1]);
    const decode = (s: string) =>
      s.replace(/\\n/g, '\n').replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'");
    return [...new Set([...metas, ...ld].map(decode))].join('\n').slice(0, 8000);
  } catch {
    return '';
  }
}

/* ─────────── Tarea: receta ─────────── */

const RECIPE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    category: { type: 'STRING', description: 'Una de: Comida casera, Postre, Pasta, Cena rápida, Horno, u otra corta' },
    servings: { type: 'INTEGER' },
    minutes: { type: 'INTEGER', description: 'Tiempo total aproximado en minutos' },
    ingredients: { type: 'ARRAY', items: { type: 'STRING' } },
    tools: { type: 'ARRAY', items: { type: 'STRING' } },
    steps: { type: 'ARRAY', items: { type: 'STRING' } },
    tips: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['title', 'ingredients', 'steps'],
};

async function recipe(text: string) {
  let source = text.trim();
  const url = source.match(/https?:\/\/\S+/)?.[0];
  // Si solo hay (casi) un enlace, intentar leer la descripción del vídeo o la web.
  if (url && source.replace(url, '').trim().length < 40) {
    const desc = await fetchDescription(url);
    if (desc) source = `${source}\n\nTexto encontrado en el enlace:\n${desc}`;
  }
  if (source.length < 15) throw new Error('Pega el texto de la receta (o un enlace que tenga la receta escrita).');

  const out = await gemini({
    systemInstruction: {
      parts: [
        {
          text:
            'Eres un cocinero que convierte textos desordenados (descripciones de TikTok, Instagram, webs, notas) en recetas claras en español de España. ' +
            'Respeta la receta original. Ingredientes con cantidad delante ("200 g de harina"); si falta una cantidad, propón una razonable y añade "(aprox.)". ' +
            'Pasos en imperativo, uno por acción, con tiempos y temperaturas concretos cuando se puedan deducir. ' +
            'Incluye los utensilios necesarios (sartén, horno, batidora…). Consejos solo si aportan algo. ' +
            'Si el texto no contiene una receta, devuelve ingredients y steps vacíos.',
        },
      ],
    },
    contents: [{ role: 'user', parts: [{ text: source.slice(0, 12000) }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: RECIPE_SCHEMA },
  });
  return { recipe: parseJson(out), sourceUrl: url };
}

/* ─────────── Tarea: descubrir sitios ─────────── */

interface Visited {
  name: string;
  category?: string;
  neighborhood?: string;
  average?: number;
  gonzalo?: number;
  vero?: number;
}

async function discover(p: { visited?: Visited[]; wishlist?: string[]; focus?: string; wish?: string; city?: string }) {
  const city = p.city || 'Madrid';
  const visited = (p.visited ?? []).slice(0, 60);
  const lista = visited
    .map((v) => `- ${v.name} (${[v.category, v.neighborhood].filter(Boolean).join(', ')}) → media ${v.average ?? '?'} (G ${v.gonzalo ?? '?'}, V ${v.vero ?? '?'})`)
    .join('\n');
  const focus =
    p.focus === 'zonas'
      ? 'Prioriza sitios en los barrios donde más han ido o muy cerca de ellos.'
      : p.focus === 'nuevo'
        ? 'Prioriza descubrir: tipos de cocina y barrios que todavía NO han probado, aunque sean diferentes a lo habitual.'
        : 'Prioriza sitios parecidos a los que mejor puntuaron (mismo tipo de cocina, estilo y precio).';

  const prompt = `Somos una pareja (Gonzalo y Vero) que puntúa restaurantes en ${city}.
Donde ya hemos ido y nuestras notas (0-10):
${lista || '- (todavía nada)'}

Ya los tenemos apuntados como pendientes (NO los recomiendes): ${(p.wishlist ?? []).join(', ') || 'ninguno'}.
${focus}
${p.wish ? `Además, hoy nos apetece: "${p.wish}".` : ''}

Busca en Google y recomiéndanos 6 restaurantes REALES de ${city}, abiertos actualmente, que no estén en las listas anteriores.
Devuelve SOLO un JSON (sin texto antes ni después) con esta forma:
{"places":[{"name":"","category":"Hamburguesas|Sushi|Italiano|Burrito|Ramen|Fusión|Mediterráneo|Postres / Café|otra corta","neighborhood":"barrio","address":"calle y número","priceLevel":1,"why":"una frase en español de por qué nos puede gustar, citando lo que ya nos gustó si aplica","dish":"plato que hay que pedir"}]}
priceLevel: 1=barato … 4=caro.`;

  const out = await gemini({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.7 },
  });
  const parsed = parseJson(out);
  const places = (Array.isArray(parsed) ? parsed : parsed.places ?? []).filter((x: { name?: string }) => x?.name);
  return { places: places.slice(0, 8) };
}

/* ─────────── Servidor ─────────── */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Usa POST' }, 405);
  if (!KEY) return json({ error: 'Falta el secreto GEMINI_API_KEY en Supabase.' }, 500);
  try {
    const body = await req.json();
    if (body.task === 'recipe') return json(await recipe(String(body.text ?? '')));
    if (body.task === 'discover') return json(await discover(body));
    return json({ error: 'Tarea desconocida' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Error' }, 500);
  }
});
