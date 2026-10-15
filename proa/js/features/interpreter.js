import { h, toast, mount } from '../core/ui.js';
import { hasAI, interpret } from '../core/ai.js';
import { speak, listen, LANGS, support, stopSpeaking } from '../audio/speech.js';

const COLORS = ['#2f80ed', '#e2725b', '#27ae60', '#9b51e0'];

// Elige a quién atribuir una intervención según el idioma detectado y quién habló antes.
export function attributeSpeaker(participants, lang, lastSpeakerId) {
  const sameLang = participants.filter((p) => p.lang === lang);
  if (!sameLang.length) return null;
  if (sameLang.length === 1) return sameLang[0];
  // Varias personas con el mismo idioma: se alterna entre ellas.
  const idx = sameLang.findIndex((p) => p.id === lastSpeakerId);
  return sameLang[(idx + 1) % sameLang.length];
}

export function renderInterpreter(view) {
  const state = {
    participants: [
      { id: 'a', name: 'Yo', lang: 'es', color: COLORS[0] },
      { id: 'b', name: 'Interlocutor', lang: 'en', color: COLORS[1] },
    ],
    mode: 'manual',
    speakOut: true,
    running: false,
    lastSpeaker: null,
    log: [],
    currentListen: null,
  };

  const peopleBox = h('div', { class: 'people' });
  const logBox = h('ol', { class: 'log', 'aria-live': 'polite' });
  const statusEl = h('p', { class: 'now-playing' }, support.stt ? 'Listo.' : 'Tu navegador no permite reconocimiento de voz: usa Chrome o Edge.');
  const modeSel = h('select', {}, h('option', { value: 'manual' }, 'Por turnos con botón'), h('option', { value: 'auto' }, 'Automático (manos libres)'));
  const speakOut = h('input', { type: 'checkbox', checked: true });
  const autoBtn = h('button', { class: 'btn primary big hidden' }, '▶ Iniciar interpretación automática');

  modeSel.addEventListener('change', () => { state.mode = modeSel.value; stopAuto(); drawPeople(); autoBtn.classList.toggle('hidden', state.mode !== 'auto'); });
  speakOut.addEventListener('change', () => { state.speakOut = speakOut.checked; });
  autoBtn.addEventListener('click', () => (state.running ? stopAuto() : startAuto()));

  function drawPeople() {
    peopleBox.replaceChildren(...state.participants.map((p) => h('div', { class: 'person', style: `--c:${p.color}` },
      h('input', { value: p.name, 'aria-label': 'Nombre', oninput: (e) => { p.name = e.target.value; } }),
      h('select', { 'aria-label': 'Idioma', onchange: (e) => { p.lang = e.target.value; } },
        h('option', { value: 'es', selected: p.lang === 'es' }, '🇪🇸 Español'),
        h('option', { value: 'en', selected: p.lang === 'en' }, '🇬🇧 English')),
      state.mode === 'manual'
        ? h('button', { class: 'btn primary', disabled: !support.stt, onclick: (e) => manualTurn(p, e.currentTarget) }, p.lang === 'es' ? '🎙️ Hablar' : '🎙️ Speak')
        : null,
      state.participants.length > 2 ? h('button', { class: 'icon-btn', 'aria-label': 'Quitar', onclick: () => { state.participants = state.participants.filter((x) => x !== p); drawPeople(); } }, '✕') : null,
    )));
    if (state.participants.length < 4) {
      peopleBox.append(h('button', { class: 'btn ghost', onclick: () => {
        const n = state.participants.length;
        state.participants.push({ id: `p${Date.now()}`, name: `Persona ${n + 1}`, lang: n % 2 ? 'en' : 'es', color: COLORS[n % COLORS.length] });
        drawPeople();
      } }, '+ Añadir persona'));
    }
  }

  async function process(text, expectedLang, forcedSpeaker) {
    if (!text) return null;
    if (!hasAI()) {
      addLog({ speaker: forcedSpeaker ?? { name: '?', color: '#888' }, original: text, translation: '(Configura tu clave de API en Ajustes para traducir)' });
      return null;
    }
    statusEl.textContent = '🔄 Traduciendo…';
    const names = state.participants.map((p) => `${p.name} (${p.lang})`).join(', ');
    const r = await interpret(text, expectedLang, names);
    const speaker = forcedSpeaker ?? attributeSpeaker(state.participants, r.detected_language, state.lastSpeaker) ?? state.participants[0];
    state.lastSpeaker = speaker.id;
    addLog({ speaker, original: r.cleaned_original || text, translation: r.translation, lang: r.detected_language });
    if (state.speakOut) {
      statusEl.textContent = '🔊 Reproduciendo traducción…';
      await speak(r.translation, r.detected_language === 'es' ? LANGS.en : LANGS.es, { rate: 1 });
    }
    return r.detected_language;
  }

  async function manualTurn(person, btn) {
    btn.disabled = true;
    try {
      statusEl.textContent = `🎙️ Escuchando a ${person.name}…`;
      const l = listen(LANGS[person.lang], { interim: (t) => { statusEl.textContent = `🎙️ ${person.name}: ${t}`; } });
      state.currentListen = l;
      const text = await l.result;
      if (!text) { statusEl.textContent = 'No se ha oído nada. Pulsa de nuevo.'; return; }
      await process(text, person.lang, person);
      statusEl.textContent = 'Listo para el siguiente turno.';
    } catch (e) {
      toast(e.message, 'error');
      statusEl.textContent = 'Error. Inténtalo de nuevo.';
    } finally {
      btn.disabled = false;
    }
  }

  // Modo automático: escucha por turnos alternando idioma; tras varios silencios prueba el otro idioma.
  async function startAuto() {
    if (!hasAI()) { toast('El modo automático necesita la clave de API (Ajustes).', 'error'); return; }
    state.running = true;
    autoBtn.textContent = '⏹ Detener';
    let lang = state.participants[0].lang;
    let silences = 0;
    while (state.running) {
      statusEl.textContent = `🎙️ Escuchando (${lang === 'es' ? 'español' : 'inglés'})…`;
      try {
        state.currentListen = listen(LANGS[lang], { interim: (t) => { statusEl.textContent = `🎙️ ${t}`; } });
        const text = await state.currentListen.result;
        if (!state.running) break;
        if (!text) {
          silences++;
          if (silences >= 2) { lang = lang === 'es' ? 'en' : 'es'; silences = 0; }
          continue;
        }
        silences = 0;
        const detected = await process(text, lang);
        lang = (detected ?? lang) === 'es' ? 'en' : 'es'; // el siguiente turno suele ser del otro idioma
      } catch (e) {
        toast(e.message, 'error');
        stopAuto();
      }
    }
    statusEl.textContent = 'Interpretación automática detenida.';
  }

  function stopAuto() {
    state.running = false;
    state.currentListen?.stop();
    stopSpeaking();
    autoBtn.textContent = '▶ Iniciar interpretación automática';
  }

  function addLog({ speaker, original, translation }) {
    state.log.push({ speaker: speaker.name, original, translation, at: new Date().toLocaleTimeString() });
    logBox.append(h('li', { style: `--c:${speaker.color}` },
      h('strong', {}, speaker.name), h('span', { class: 'muted' }, ` · ${state.log.at(-1).at}`),
      h('div', {}, original), h('div', { class: 'translation' }, `→ ${translation}`)));
    logBox.lastChild.scrollIntoView({ block: 'nearest' });
  }

  const exportBtn = h('button', { class: 'btn ghost', onclick: () => {
    const txt = state.log.map((l) => `[${l.at}] ${l.speaker}: ${l.original}\n   → ${l.translation}`).join('\n');
    const a = h('a', { href: URL.createObjectURL(new Blob([txt], { type: 'text/plain' })), download: 'conversacion-proa.txt' });
    a.click();
  } }, '⬇ Descargar transcripción');

  drawPeople();
  mount(view, 
    h('h1', {}, '🎧 Intérprete español ⇄ inglés'),
    h('p', { class: 'lead' }, 'Coloca el móvil entre las personas. Cada intervención se transcribe, se traduce y se lee en voz alta en el otro idioma.'),
    hasAI() ? null : h('div', { class: 'warning' }, 'El intérprete necesita conexión con la IA: añade tu clave de API en Ajustes.'),
    h('div', { class: 'form' },
      h('label', {}, 'Modo', modeSel),
      h('label', { class: 'check' }, speakOut, 'Leer la traducción en voz alta'),
    ),
    peopleBox, autoBtn, statusEl, logBox, exportBtn,
    h('p', { class: 'muted small' }, 'Cómo se identifica a cada persona: por el idioma en que habla (y alternando si hay varias con el mismo idioma). En modo con botón, por el botón pulsado.'),
  );
  return () => stopAuto();
}
