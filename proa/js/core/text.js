// Utilidades de texto: normalización y similitud para evaluar respuestas habladas sin IA.
export function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s-]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Similitud por palabras (F1 entre los conjuntos de palabras), de 0 a 1.
export function similarity(a, b) {
  const wa = normalize(a).split(' ').filter(Boolean);
  const wb = normalize(b).split(' ').filter(Boolean);
  if (!wa.length || !wb.length) return 0;
  const pool = [...wb];
  let common = 0;
  for (const w of wa) {
    const i = pool.indexOf(w);
    if (i !== -1) {
      common++;
      pool.splice(i, 1);
    }
  }
  const p = common / wa.length;
  const r = common / wb.length;
  return p + r === 0 ? 0 : (2 * p * r) / (p + r);
}

// Busca en una lista de frases las más parecidas a un texto (para el traductor sin conexión).
export function bestMatches(query, phrases, field, limit = 3) {
  return phrases
    .map((p) => ({ p, score: similarity(query, p[field]) }))
    .filter((x) => x.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
