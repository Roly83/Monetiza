# Proa · Inglés Marítimo

Aplicación web (instalable en el móvil) para aprender inglés marítimo con métodos poco convencionales.

## Secciones

| Sección | Qué hace | ¿Necesita IA? |
|---|---|---|
| 📘 **Curso** | 8 unidades basadas en las frases estándar de la OMI (SMCP). Cada unidad tiene un lugar del barco como **palacio de la memoria**, audio normal y lento, **shadowing** con evaluación de pronunciación y **repaso espaciado** | No |
| 🌊 **Hipnosis** | Genera sesiones de **autohipnosis con sonido binaural** (alfa, theta, descenso alfa→theta, beta) y oleaje. Guion: inducción → profundización → frases EN/ES → sugestiones → despertar. Se guardan en una biblioteca y se pueden **repetir sin límite** (1, 2, 3 veces o en bucle). **Modo pantalla apagada**: convierte la sesión en un MP3 con voces neuronales que suena en segundo plano, con controles en la pantalla de bloqueo y opción de descarga | No (con IA, guion personalizado) |
| 🔤 **Traductor** | Español ⇄ inglés por texto o voz, con la frase SMCP equivalente | Sin IA: solo glosario |
| 🎧 **Intérprete** | Media entre 2 a 4 personas que hablan español e inglés. **Por turnos con botón** o **automático manos libres**. Identifica a cada persona por su idioma; lee la traducción en voz alta y permite descargar la transcripción | Sí |
| 📻 **Examen** | Examen oral como conversación por radio VHF o a bordo, solo sobre las unidades estudiadas, con nota por respuesta e informe final | Sin IA: examen guiado |

## Cómo se usa

1. Abre `index.html` desde un servidor web (por ejemplo GitHub Pages). El micrófono exige HTTPS.
2. Usa **Chrome o Edge**: son los navegadores con reconocimiento de voz.
3. Para las funciones con IA, pon una clave de la API de Claude en **Ajustes** (console.anthropic.com). La clave se guarda solo en el dispositivo.

Para probarla en local: `cd proa && python3 -m http.server 8000` y abre http://localhost:8000.

## Modo oscuro

Oscuro por defecto. Se cambia con el botón 🌙/☀️ de la barra superior o en Ajustes (oscuro, claro o automático).

## Técnica

- HTML, CSS y JavaScript sin dependencias ni compilación; funciona sin conexión gracias a un *service worker*.
- **Audio binaural**: Web Audio API (un oscilador por oído y ruido rosa con oleaje).
- **Voz natural (Kokoro-82M, Apache-2.0)** en tres niveles:
  1. **Audios pre-generados** (`models/clips/`, ~720 MP3) para todo el texto fijo: frases del curso, guiones de
     hipnosis y examen guiado, con 2 voces inglesas (George, Emma) y 2 españolas (Alex, Dora). Suenan al instante
     y sin descargas. Se regeneran con `tools/textos-voz.mjs` + `tools/bake_voices.py`.
  2. **Modelo en el navegador** (`models/kokoro/`, 93 MB, int8) para texto nuevo (traductor, intérprete, examen
     con IA, guiones con IA): se descarga una vez desde Ajustes. Fonemas con espeak-ng en WebAssembly
     (piper-phonemize) e inferencia con onnxruntime-web; `sw.js` activa el aislamiento entre orígenes para usar
     varios hilos.
  3. **Voz del navegador** como respaldo.
  También está disponible **Piper** (voces de Hugging Face) como motor más rápido y ligero.
- **Reconocimiento de voz**: el del navegador (Chrome/Edge).
- **Audio para pantalla apagada**: la sesión se mezcla con el fondo binaural (`OfflineAudioContext`) y se codifica
  a MP3 con [lamejs](https://github.com/zhuker/lamejs) (LGPL-3.0, en `vendor/`). El audio se guarda en IndexedDB.
- **IA**: Claude (`claude-opus-5-5` por defecto; se puede cambiar a Sonnet o Haiku para abaratar).
- **Progreso**: almacenamiento local del navegador; exportable desde Ajustes.
- **Tests**: `node --test proa/tests/*.test.js`.

## Aviso

La autohipnosis y los pulsos binaurales son técnicas de relajación de apoyo; la evidencia científica sobre los
pulsos binaurales es limitada. No usar durante la guardia, conduciendo o manejando maquinaria. La app lo muestra
antes del primer uso.
