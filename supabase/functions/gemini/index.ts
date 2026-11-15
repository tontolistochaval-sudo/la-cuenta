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
/** Modelo que ha funcionado la última vez (se recuerda mientras la función siga caliente). */
let working: string | null = Deno.env.get('GEMINI_MODEL') ?? null;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** Solo Vero y Gonzalo: la llamada tiene que traer la sesión de un usuario real de Supabase. */
async function isUser(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization') ?? '';
  const apikey = req.headers.get('apikey') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const url = Deno.env.get('SUPABASE_URL');
  if (!url || !auth.startsWith('Bearer ')) return false;
  const res = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: auth, apikey } });
  return res.ok;
}

/** Modelos a probar, de mejor a más ligero: el configurado, los Flash más nuevos y los Flash-Lite. */
async function candidates(): Promise<string[]> {
  const list: string[] = [];
  if (working) list.push(working);
  try {
    const res = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': KEY } });
    if (res.ok) {
      const data = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
      const names = (data.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => m.name.replace('models/', ''))
        .filter((n) => /flash/.test(n) && !/image|tts|audio|live|thinking|exp|preview/.test(n))
        .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
      list.push(...names.filter((n) => !/lite/.test(n)), ...names.filter((n) => /lite/.test(n)));
    }
  } catch {
    /* sin lista: se prueban los conocidos */
  }
  list.push('gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash');
  return [...new Set(list)];
}

/** Mensaje legible del error de Google. */
const googleMessage = (t: string) => {
  try {
    return (JSON.parse(t)?.error?.message as string)?.split('\n')[0]?.slice(0, 300) ?? t.slice(0, 300);
  } catch {
    return t.slice(0, 300);
  }
};

/** Una llamada a un modelo concreto, con tiempo máximo. En los 2.5 se apaga el "pensamiento" (más rápido). */
function callModel(model: string, body: Record<string, unknown>, timeoutMs: number) {
  const cfg = { ...((body.generationConfig as Record<string, unknown>) ?? {}) };
  if (/2\.5/.test(model)) cfg.thinkingConfig = { thinkingBudget: 0 };
  return fetch(`${API}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({ ...body, generationConfig: cfg }),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/** Diagnóstico: prueba cada modelo con una pregunta mínima y dice si responde y cuánto tarda. */
async function diagnose() {
  const models = (await candidates()).slice(0, 8);
  const out = [];
  for (const model of models) {
    const t0 = Date.now();
    try {
      const res = await callModel(model, { contents: [{ role: 'user', parts: [{ text: 'Responde solo: ok' }] }] }, 25000);
      out.push({ model, status: res.status, ms: Date.now() - t0, error: res.ok ? undefined : googleMessage(await res.text()).slice(0, 140) });
    } catch (e) {
      out.push({ model, status: 0, ms: Date.now() - t0, error: (e as Error).name === 'TimeoutError' ? 'tarda más de 25 s' : (e as Error).message });
    }
  }
  return { configured: Deno.env.get('GEMINI_MODEL') ?? null, results: out };
}

async function gemini(body: Record<string, unknown>): Promise<string> {
  // Con GEMINI_MODEL fijado se usa solo ese (rápido); si no, se prueban candidatos.
  const fixed = Deno.env.get('GEMINI_MODEL');
  const models = fixed ? [fixed] : await candidates();
  let lastError = 'No hay ningún modelo de Gemini disponible.';
  for (const model of models.slice(0, 4)) {
    let res: Response;
    try {
      res = await callModel(model, body, 45000);
    } catch (e) {
      lastError = (e as Error).name === 'TimeoutError' ? `${model} tarda demasiado` : (e as Error).message;
      continue;
    }
    if (res.ok) {
      working = model;
      const data = await res.json();
      const parts = data?.candidates?.[0]?.content?.parts ?? [];
      return parts.map((p: { text?: string }) => p.text ?? '').join('');
    }
    const t = await res.text();
    const msg = googleMessage(t);
    // Modelo inexistente o sin cuota para esta clave: probar el siguiente.
    if (res.status === 404 || res.status === 429 || (res.status === 400 && /not supported|google_search/i.test(msg))) {
      lastError = res.status === 429 ? `Sin cuota en ${model}: ${msg}` : `${model}: ${msg}`;
      if (working === model) working = null;
      continue;
    }
    if (res.status === 400 && /API key not valid/i.test(msg)) throw new Error('La clave GEMINI_API_KEY no es válida. Revísala en Supabase → Edge Functions → Secrets.');
    if (res.status === 400 && /location|country|region/i.test(msg)) throw new Error(`Gemini no está disponible desde esta región: ${msg}`);
    throw new Error(`Gemini respondió ${res.status}: ${msg}`);
  }
  throw new Error(`Gemini no ha podido responder. ${lastError}`);
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
  if (!(await isUser(req))) return json({ error: 'Para usar la IA, entra en Ajustes → Juntos en la nube.' }, 401);
  try {
    const body = await req.json();
    if (body.task === 'recipe') return json(await recipe(String(body.text ?? '')));
    if (body.task === 'discover') return json(await discover(body));
    if (body.task === 'diag') return json(await diagnose());
    return json({ error: 'Tarea desconocida' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Error' }, 500);
  }
});
