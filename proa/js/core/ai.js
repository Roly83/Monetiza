// Conexión con Claude desde el navegador. La clave de API la introduce el usuario en Ajustes y
// solo se guarda en su dispositivo. Sin clave, la app funciona en modo sin conexión (temario,
// hipnosis, examen guiado y glosario).
import { store } from './store.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.133.0/+esm';
let clientPromise = null;
let clientKey = null;

export const hasAI = () => Boolean(store.get().settings.apiKey);

async function client() {
  const key = store.get().settings.apiKey;
  if (!key) throw new Error('Configura tu clave de API de Claude en Ajustes para usar esta función.');
  if (!clientPromise || clientKey !== key) {
    clientKey = key;
    clientPromise = import(SDK_URL).then(
      ({ default: Anthropic }) => new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true }),
    );
  }
  return clientPromise;
}

// Llama al modelo y devuelve un objeto que cumple el esquema JSON indicado.
export async function askJson({ system, messages, schema, effort = 'low', maxTokens = 16000 }) {
  const c = await client();
  const res = await c.beta.messages.create({
    model: store.get().settings.model || 'claude-opus-5-5',
    max_tokens: maxTokens,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort, format: { type: 'json_schema', schema } },
    system,
    messages,
  });
  if (res.stop_reason === 'refusal') throw new Error('El modelo no ha podido responder a esta petición.');
  if (res.stop_reason === 'max_tokens') throw new Error('La respuesta se ha cortado. Inténtalo con un texto más corto.');
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(text);
}

const obj = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const MARITIME = `Eres un experto en inglés marítimo (IMO SMCP, comunicaciones VHF, vocabulario a bordo) y
traductor profesional español-inglés. Cuando exista una frase SMCP estándar equivalente, priorízala.`;

export function translate(text, from, to) {
  return askJson({
    system: `${MARITIME} Traduce con precisión y naturalidad. Las notas van en español, breves.`,
    messages: [{ role: 'user', content: `Traduce del ${from} al ${to}:\n\n${text}` }],
    schema: obj({
      translation: { type: 'string' },
      smcp_phrase: { type: 'string', description: 'Frase SMCP equivalente en inglés si existe, o cadena vacía' },
      notes: { type: 'array', items: { type: 'string' } },
    }),
  });
}

// Intérprete: identifica el idioma de lo dicho y lo traduce al otro idioma.
export function interpret(text, expectedLang, participants) {
  return askJson({
    system: `${MARITIME} Actúas como intérprete simultáneo entre español e inglés en una conversación entre
varias personas (${participants}). Recibes la transcripción automática de una intervención (puede tener
errores de reconocimiento: corrígelos por contexto). Detecta el idioma real hablado y traduce al otro
idioma de forma natural y fiel, sin añadir comentarios.`,
    messages: [{ role: 'user', content: `Idioma esperado: ${expectedLang}\nTranscripción: ${text}` }],
    schema: obj({
      detected_language: { type: 'string', enum: ['es', 'en'] },
      cleaned_original: { type: 'string' },
      translation: { type: 'string' },
    }),
  });
}

// Examinador oral: conversa en inglés y evalúa cada respuesta.
export function examTurn({ history, content, questionNumber, totalQuestions, scenario }) {
  return askJson({
    system: `Eres un examinador de inglés marítimo que hace un examen oral en forma de conversación por
radio VHF o a bordo. Escenario: ${scenario}. Solo puedes preguntar sobre este contenido ya estudiado:
${content}
Reglas: haz UNA pregunta o situación cada turno, en inglés claro, y espera la respuesta. Evalúa la última
respuesta del alumno (0-10) por exactitud, uso de frases SMCP y comprensibilidad, con un comentario breve en
español y la respuesta modelo en inglés. Turno ${questionNumber} de ${totalQuestions}. Cuando se haya
evaluado la respuesta al último turno, pon finished=true, examiner_says con una despedida y rellena
final_report (en español) con nota media, fortalezas y qué repasar.`,
    messages: history,
    effort: 'medium',
    schema: obj({
      evaluation: obj({
        applies: { type: 'boolean', description: 'false si aún no hay respuesta del alumno que evaluar' },
        score: { type: 'integer' },
        feedback_es: { type: 'string' },
        model_answer: { type: 'string' },
      }),
      examiner_says: { type: 'string' },
      finished: { type: 'boolean' },
      final_report: { type: 'string' },
    }),
  });
}

// Guion de autohipnosis personalizado. Mismo formato que el generador local.
export function hypnosisScript({ goal, phrases, minutes }) {
  return askJson({
    system: `Eres un hipnoterapeuta y profesor de inglés marítimo. Escribe guiones de autohipnosis
seguros (sin promesas médicas) para aprender inglés en estado de relajación. La inducción, profundización,
sugestiones y salida van en español. El aprendizaje alterna cada frase inglesa (lenta) con su significado en
español y una repetición en inglés. Incluye una salida clara y despertadora. Duración aproximada:
${minutes} minutos (unas 110 palabras por minuto contando pausas).`,
    messages: [{
      role: 'user',
      content: `Objetivo: ${goal || 'memorizar las frases y ganar seguridad al hablar por radio'}\nFrases:\n${phrases
        .map((p) => `- ${p.en} = ${p.es}`)
        .join('\n')}`,
    }],
    effort: 'medium',
    schema: obj({
      title: { type: 'string' },
      segments: {
        type: 'array',
        items: obj({
          kind: { type: 'string', enum: ['induccion', 'profundizacion', 'aprendizaje', 'sugestion', 'salida'] },
          lang: { type: 'string', enum: ['es', 'en'] },
          text: { type: 'string' },
          pause_ms: { type: 'integer' },
        }),
      },
    }),
  });
}
