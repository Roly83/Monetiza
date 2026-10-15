// Repetición espaciada (variante simplificada de SM-2).
// quality: 0 = no la recordé, 3 = con dificultad, 4 = bien, 5 = perfecta.
const DAY = 24 * 60 * 60 * 1000;

export function newCard(now = Date.now()) {
  return { ease: 2.5, interval: 0, reps: 0, due: now };
}

export function review(card, quality, now = Date.now()) {
  const c = { ...(card ?? newCard(now)) };
  if (quality < 3) {
    c.reps = 0;
    c.interval = 0;
    c.due = now + 10 * 60 * 1000; // vuelve en 10 minutos
  } else {
    c.reps += 1;
    c.interval = c.reps === 1 ? 1 : c.reps === 2 ? 3 : Math.round(c.interval * c.ease);
    c.due = now + c.interval * DAY;
  }
  c.ease = Math.max(1.3, c.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  return c;
}

export function dueCards(cards, ids, now = Date.now()) {
  return ids.filter((id) => !cards[id] || cards[id].due <= now);
}
