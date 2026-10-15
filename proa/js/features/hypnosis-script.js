// Generador local de guiones de autohipnosis (funciona sin conexión ni IA).
// Estructura clásica: inducción → profundización → aprendizaje → sugestiones → salida.

export const INDUCCION = [
  'Busca una postura cómoda, sentado o tumbado, y ponte los auriculares.',
  'Cierra los ojos suavemente. Inspira despacio por la nariz… y suelta el aire por la boca.',
  'Otra vez. Inspira… y suelta. Con cada respiración tu cuerpo se vuelve más pesado y tranquilo.',
  'Imagina que estás en la cubierta de un barco, al atardecer. El mar está en calma.',
  'Escucha el sonido del agua. Cada ola que llega te relaja un poco más.',
  'Relaja la frente… los ojos… la mandíbula. Deja caer los hombros.',
  'Relaja los brazos y las manos. Siente cómo se aflojan.',
  'Relaja el pecho, el abdomen, las piernas, hasta la punta de los pies.',
];

export const PROFUNDIZACION = [
  'Ahora imagina una escalera que baja hacia el puente de mando. Tiene diez escalones.',
  'Con cada número bajas un escalón y te relajas el doble.',
  'Diez… nueve… ocho… cada vez más tranquilo.',
  'Siete… seis… cinco… tu mente se abre, receptiva y despierta.',
  'Cuatro… tres… dos… uno.',
  'Estás en el puente. Todo está en orden. Tu mente está preparada para aprender sin esfuerzo.',
];

export const SUGESTIONES = [
  'Cada vez que escuches estas frases, las recordarás con más facilidad.',
  'Cuando hables por radio, tu voz sonará clara, tranquila y segura.',
  'El inglés marítimo te resulta cada día más natural, como el ritmo de las olas.',
  'Tu memoria guarda cada palabra en su lugar del barco, lista para cuando la necesites.',
];

export const SALIDA = [
  'Ahora vamos a volver. Voy a contar del uno al cinco.',
  'Uno… empiezas a notar tu cuerpo.',
  'Dos… mueve despacio los dedos de las manos y de los pies.',
  'Tres… respira hondo y llena de energía todo tu cuerpo.',
  'Cuatro… te sientes despejado, descansado y de buen humor.',
  'Cinco… abre los ojos. Completamente despierto y alerta.',
];

const seg = (kind, lang, text, pause_ms) => ({ kind, lang, text, pause_ms });

// phrases: [{en, es, ancla?}] — ancla: lugar del barco para el palacio de la memoria.
export function generateScript({ phrases, minutes = 15, title, repetitions } = {}) {
  if (!phrases?.length) throw new Error('Elige al menos una unidad con frases.');
  const out = [];
  INDUCCION.forEach((t) => out.push(seg('induccion', 'es', t, 3500)));
  PROFUNDIZACION.forEach((t) => out.push(seg('profundizacion', 'es', t, 3000)));
  out.push(seg('aprendizaje', 'es', 'Ahora vas a escuchar frases en inglés. No tienes que esforzarte: solo escucha y deja que se graben.', 3000));

  // Repeticiones según duración: aprox. 18 s por frase y repetición.
  const fixedSeconds = 150;
  const reps = repetitions ?? Math.max(1, Math.min(4, Math.round(((minutes * 60) - fixedSeconds) / (phrases.length * 18))));
  for (let r = 0; r < reps; r++) {
    if (r > 0) out.push(seg('aprendizaje', 'es', 'Una vez más, ahora todavía más profundo y más fácil.', 2500));
    for (const p of phrases) {
      if (r === 0 && p.ancla) out.push(seg('aprendizaje', 'es', `Imagina esta frase escrita en ${p.ancla.toLowerCase()}.`, 1200));
      out.push(seg('aprendizaje', 'en', p.en, 1800));
      out.push(seg('aprendizaje', 'es', p.es, 1500));
      out.push(seg('aprendizaje', 'en', p.en, 3500)); // pausa para repetir mentalmente
    }
  }
  SUGESTIONES.forEach((t) => out.push(seg('sugestion', 'es', t, 3000)));
  SALIDA.forEach((t) => out.push(seg('salida', 'es', t, 2000)));
  return { title: title ?? 'Sesión de inglés marítimo', segments: out, repetitions: reps };
}

// Duración estimada en segundos (≈ 2,6 palabras/s al hablar despacio + pausas).
export function estimateSeconds(script) {
  return Math.round(
    script.segments.reduce((t, s) => t + s.text.split(/\s+/).length / 2.6 + s.pause_ms / 1000, 0),
  );
}
