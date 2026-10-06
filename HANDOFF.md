# Continuación verificada: Pliegue IA

## Estado en tres líneas

1. Juego funcional con 51 lecciones, 229 preguntas de práctica y 40 de desafío, progreso, respaldos y web sin conexión comprobada.
2. APK firmada 1.0.4 (versionCode 5, 18,4 MB, SHA-256 `00e05d17…9dad`, misma firma que las anteriores) publicada en `public/downloads`; falta probarla en un dispositivo, incluido el audio de los reels y el feed.
3. Publicación Sites pendiente de recuperar su complemento local; revisión Google Skills pendiente de 11 quizzes y cinco guías ES.

## Pestaña «Reels» con feed (2026-10-06)

- Nueva pestaña «Reels» (`src/reels/ReelFeed.tsx`): pantalla completa, columna con `scroll-snap` vertical, un reel por pantalla (66, en orden del curso: reel de unidad y luego los de sus lecciones; `feedOrder` en `src/lib/reels.ts`). Solo el reel visible se monta y suena (IntersectionObserver al 60 %); al terminar avanza solo a los 3,5 s (`onEnded` en `ReelPlayer`, no en modo quieto). Abre en el reel de la lección pendiente. Flechas/PageUp/PageDown y Esc en escritorio; botones arriba/abajo ≥ 760 px.
- Verificado: `npm test` 79/79; `npm run build` PASS offline (215 archivos); `validate-reels` PASS; en navegador a 375 px y escritorio: abre, desliza al siguiente, auto-avance, teclado. El panel de Claude deja el scroll suave ~20 px descuadrado (rAF limitado); con `scrollBy` el snap es exacto.
- Sin verificar: gestos táctiles reales y audio al deslizar en el WebView de Android.

## Reels por lección (2026-10-06)

- 66 reels: los 17 de unidad y 49 de lección. 4.07 y 5.12 son la lección única de su unidad y abren el reel de la unidad. `reelKey` (lección si la tiene, unidad si no) nombra arte, voz y entrada de `reels-audio.json`; `reelForLesson` elige el reel de una lección.
- Interfaz: botón «Reel» junto a cada lección de la ruta y «Ver reel de esta lección» al empezarla; el reel de lección dice «Empezar lección» o «Seguir con la lección».
- `node scripts/validate-reels.mjs` (estricto): `PASS reels: 17/17 de unidad · 49/49 de lección · 132/132 ilustraciones · 1735 KB · 66/66 con voz · música sí · audio 11469 KB`. Topes: arte 3 MB, audio 13 MB. Precarga: 215 archivos.
- Los guiones son de redacción propia y cada escena cita su lección en `from`; falta que los leas (documento de revisión enviado). La voz se comprobó por transcripción (mínimo 0,93), no de oído.
- Arte: 98 imágenes nuevas, revisadas una a una; 2.04-a se regeneró porque traía fotos con figuras. Originales en `../../paper-assets/reels`.
- Aprendido: el comando en segundo plano se corta a las 2 h, pero `nohup node scripts/reels-art.mjs …` sigue vivo; dos tandas de voz a la vez pisarían `reels-audio.json`; `--fit` ajusta los segundos de cada escena a su voz.

## Modo enfoque, sonido, modos nuevos y reels con audio (2026-10-02)

Plan aprobado: `/Users/luizun/.claude/plans/haz-una-de-los-serialized-harbor.md`, ocho fases (0 a 7). Regla del plan: la app, el código y los archivos del repo describen el «modo enfoque» por lo que hace y nunca nombran a un público (`tests/copy.test.ts` lo comprueba).

Publicado en `main` junto con la APK 1.0.2 (commit «Reels con audio, modo enfoque y modos nuevos; APK 1.0.2»).

Hecho:
- **Preferencias y sonido de botones.** `src/lib/json-store.ts`, `src/lib/prefs.ts` (clave `pliegue-ia.prefs.v1`), `src/lib/sound.ts`, `src/sound/web.ts`, tarjeta inicial, interruptor y altavoz en la barra superior (`src/ui/`).
- **Modo enfoque.** Interruptor global; `src/lib/copy.ts` (voces `warm` y `plain`), `src/focus.css` (se importa el último en `src/main.tsx`), `src/modes/FocusHome.tsx`, `src/modes/LessonIntro.tsx` (lección por pasos), opciones plegadas en el feedback, parejas de una en una, reels quietos y solo con voz.
- **Texto de las lecciones.** `src/lib/lesson-steps.ts` da formato a los fragmentos y `src/data/lesson-overrides.json` reescribe 35 que venían de filas de tabla (20 lecciones), cada uno con su línea de `TEMARIO.md`.
- **Modos nuevos en «Repasar».** Selector Preguntas / ¿Sí o no? / Tarjetas. `src/lib/yesno.ts` + `src/modes/YesNo.tsx` (200 de las 229 preguntas de práctica sirven); `src/lib/cards.ts` + `src/modes/Flashcards.tsx` con `src/data/glossary.json` (138 tarjetas, `npm run glossary`). No escriben en `Progress`; `touchStreak` (`src/lib/engine.ts`) cuenta el día de estudio. Las marcas de las tarjetas van en `pliegue-ia.cards.v1`.
- **«Conecta ideas».** Salió de `src/App.tsx` a `src/modes/Matching.tsx`; el avance de un conjunto sigue vivo al cambiar de pestaña (variable del módulo) y `restartMatching()` lo reinicia al restaurar un respaldo. `src/App.tsx` queda en 48 438 bytes, bajo el objetivo del plan (48 453).
- **Reels.** Los 17 guiones en `src/data/reels.json` (39 a 43,5 s). Voz: `npm run reels:voice` → `public/reels-audio/<unidad>.mp3` + `src/data/reels-audio.json`. Música: `npm run reels:music` → `public/reels-audio/music.mp3`. Reproductor: `src/lib/reelAudio.ts`, `src/reels/reelAudioEngine.ts`, `src/reels/useReelAudio.ts`; la posición del audio sale del fotograma. El zorro bajó a 640 px.

Verificado (2026-10-02):
- `node --import tsx --test tests/json-store.test.ts tests/prefs.test.ts tests/sound.test.ts tests/engine.test.ts tests/storage.test.ts tests/reels.test.ts tests/reelAudio.test.ts tests/lesson-steps.test.ts tests/copy.test.ts tests/cards.test.ts tests/glossary.test.ts tests/yesno.test.ts` → 77/77 (son los doce archivos de `tests/`).
- `npx tsc -b` sin errores; `npm run build` → `PASS offline: 68 archivos precargados`; `npm run validate:content` → cinco PASS; la huella de `curriculum.json` sigue en `28e2e784…`.
- `node scripts/validate-reels.mjs` (estricto) → `PASS reels: 17/17 reels · 34/34 ilustraciones · 490 KB · 17/17 con voz · música sí · audio 3350 KB`. En el navegador, los 17 reels cargan sus dos AVIF (720×960) y su MP3 se decodifica (6 escenas cada uno).
- En navegador (escritorio, 390 y 320 px): inicio de enfoque, lección por pasos, pregunta, feedback con opciones plegadas, resultados, parejas de una en una y, tras sacarlas del shell, parejas en los dos modos (error, acierto, conjunto completo que se guarda en `completedMatching`, «Volver a conectar», cambio de conjunto, avance que se conserva al cambiar de pestaña y reinicio al restaurar un respaldo), panel «A tu ritmo», una ronda completa de «¿Sí o no?» y de tarjetas (la fallada vuelve tres tarjetas después y sale la primera en la ronda siguiente). Reel 1.2 con sus dos ilustraciones, voz y música; en modo quieto, voz completa por escena y sin música. Los 17 MP3 se descargan y decodifican, con señal en las 102 escenas y silencio entre ellas.

Arte de los reels:
- Las 34 ilustraciones están en `public/reels/` (AVIF 720×960) y sus originales en `../../paper-assets/reels/`. Revisadas una a una: sin texto, logotipos ni personas.
- Se rehicieron tres: 3.3-b (el plano técnico traía cotas con números dos veces seguidas; ahora es una turbina de papel en 3D), 3.4-b (cronómetro con números y fotos de personas) y 5.4-a (brújula con letras). Sus asuntos nuevos están en `scripts/comfy/art-manifest.json` y las versiones descartadas en el directorio temporal de la sesión.
- `npm run reels:art` es idempotente y ahora espera a que ComfyUI esté libre y a tener 8 GB de RAM libres (`REELS_MIN_FREE_GB`), aprovecha la imagen de un trabajo anterior que haya terminado y admite 150 min por imagen. Motivo: el 2 de octubre LM Studio (lanzado por Bionic) cargó un modelo de 25 a 37 GB y cada paso de ComfyUI pasó de 17 s a más de 2 min; con el límite de 40 min se perdió una imagen al 95 %.

Esperan al usuario:
- Escuchar: los ocho sonidos en Suave y Vivo, y la voz, la música y la mezcla de los reels. La voz se comprobó transcribiéndola (parecido mínimo 0,93, media 0,98), no de oído.
- Leer: los 17 guiones, la voz directa del modo enfoque (`src/lib/copy.ts`), las 35 reescrituras y las 7 filas del glosario que quedan fuera del mazo (`npm run glossary` las lista).

Sin verificar: audio en el WebView de Android y en Safari de iPhone (el interruptor físico de silencio). Hay simuladores de iPhone (iOS 27, Xcode): para probarlo hace falta conceder acceso a Claude desde el panel del simulador. La prueba prevista es una página temporal en `public/` que decodifica y reproduce `1.1.mp3` y `music.mp3` tras un toque y muestra un AVIF; se borró al no tener acceso.

Para tener en cuenta:
- Con la app en silencio, el reel muestra un botón «Activar sonido»: el silencio es el valor inicial hasta que la persona elige Suave o Vivo.
- El service worker precarga ahora con `cache: 'reload'` (`scripts/build-sw.mjs`): los MP3, el arte y `index.html` no cambian de nombre entre versiones y la caché HTTP podía emparejar los tiempos nuevos con la narración anterior. No llama a `skipWaiting`: en un servidor de vista previa ya visitado, una compilación nueva se ve al cerrar la pestaña y volver a abrirla. El servidor de desarrollo no usa service worker.
- Sin conexión, comprobado con la compilación final (68 archivos) en `npm run preview` (puerto 4176, configuración `pliegue-ia-preview` de `../.claude/launch.json`): con el servidor apagado la app recarga y salen de la caché las 34 ilustraciones, las 17 voces (se decodifican) y la música.
- Quedan abiertos desde el 1 de octubre tres servidores de este proyecto que no arrancó esta sesión: `vite` en 4173 y `vite preview` en 4174 y 4175.

Voz, lo aprendido:
- El servidor `text-2-voce` lo mantiene un agente launchd del usuario (`com.luizun.ia-assist.tts`, puerto 7860): no arrancar otro. `scripts/voice/voice.json` fija la voz `serena`, la instrucción, el tempo 1,06 (se aplica al montar, sin volver a narrar) y la nota mínima.
- El preset «narrador» sale lento. Una frase que empieza por un nombre en inglés arrastra el acento: por eso hay `say` en 33 escenas y la comparación arranca con «Por un lado…». «IA» se lee «ya» sin el léxico; «GPU» y «TPU» se dicen mal sin deletrear.
- Las listas de frases cortas salen lentas (unos 9 caracteres por segundo): en `say` se redactan como una sola frase.
- `WHISPER_PYTHON="$HOME/.hermes/hermes-agent/venv/bin/python"` activa la comprobación; `--retake` repite las tomas por debajo de la nota y `--fit` ajusta los segundos de cada escena a su voz. El modelo `base` confunde nombres propios: se le pasan los del reel como pista, nunca la frase.

Callejones ya vistos:
- El toque genérico no puede leer el control cuando el evento sube: React ya volvió a pintar y el nodo pulsado puede estar desprendido. `installTapSound` lo lee al bajar y suena al subir.
- En el panel de navegador de Claude `document.hidden` es `true` y casi no hay `requestAnimationFrame`. Dos clics automatizados con menos de 50 ms de separación omiten el segundo toque por diseño. Para contar sonidos, parchear `AudioContext.prototype` antes del primer clic; para sonidos, los clics deben ser reales.
- Las capturas de ese panel muestran un fotograma atrasado: esperar 1 s y capturar dos veces. Para ver un reel escena a escena, activar el modo enfoque o «Reducir movimiento».
- Un clic por referencia del panel desplaza el elemento a la vista: con `overflow:hidden` eso corría de lado el escenario del reel. Ahora es `overflow:clip`.
- El CSS importado desde un componente queda antes de `styles.css`; lo que deba ganarle va en `ui.css` o `focus.css`.

## Reels paper cut (2026-10-02)

Plan aprobado: `/Users/luizun/.claude/plans/a-la-aplicaci-n-tambien-starry-sutton.md`. Su fase 1 (piloto) está en el commit `113560c`; el usuario dio por bueno el estilo. Sus fases 2 y 3 (guiones y arte) siguen en el plan de arriba; su fase 4 (pestaña «Reels» con feed) queda para otra ronda.

- Piloto: nuevos `public/reels/`, `scripts/comfy/`, `scripts/reels-art.mjs`, `scripts/validate-reels.mjs`, `src/data/reels.json`, `src/lib/reels.ts`, `src/reels/`, `tests/reels.test.ts`.
- Verificado: `node --import tsx --test tests/reels.test.ts` → 10/10; `node scripts/validate-reels.mjs --partial` → `PASS reels: 1/17 reels · 2/2 ilustraciones · 34 KB`; `npm run build` → `PASS offline: 16 archivos precargados` con ambos AVIF en `dist/sw.js`. En navegador: visor en 375×812 y escritorio, flechas y Esc, movimiento reducido, CTA que abre la lección 1.01.
- Sin verificar: AVIF y botón atrás en el WebView de Android, gestos táctiles reales. (La recarga sin conexión ya se comprobó; ver la sección de arriba.)
- Arte: `npm run reels:art` contra ComfyUI (Comfy Desktop, `127.0.0.1:8188`, Qwen-Image 2512). Unos 6 min por imagen (345-365 s medidos). Fuera del repo: enlace `~/ComfyUI-Shared/models/diffusion_models/qwen-image-2512-Q4_K_M.gguf` y originales en `../../paper-assets/reels/`.
- Pendiente de aquel plan, para otra ronda: la pestaña «Reels» con feed y el registro de visto en la clave `pliegue-ia.reels.v1`.

Callejones ya vistos:
- El panel de navegador de Claude casi no dispara `requestAnimationFrame` entre capturas: el reel parece congelado en `--f: 0`. No es un fallo del reloj; intercalar capturas o esperas del panel.
- El primer prompt de estilo dio un fondo azul con hojas apiladas en `1.1-b`; el manifiesto ya fija «plain cream paper background… no border, no frame, no stacked sheets».
- No reescribir `package.json` con un serializador JSON: pierde su formato compacto. Editar a mano.

## Archivos y estado real

Proyecto: `/Users/luizun/github/Cursos/Generative AI Leader/pliegue-ia`. Se creó un repositorio Git local nuevo; el directorio no tenía repositorio antes. Al preparar este traspaso, `git status --short` mostró los archivos nuevos preparados y `git diff --cached --stat` mostró **85 archivos y 17 443 líneas añadidas**, antes de añadir este traspaso y el informe de verificación. `git diff --stat` no mostró cambios fuera del índice en ese momento. No se sobrescribieron commits previos ni se hizo un push.

Cambios principales: `src/App.tsx`, `src/styles.css`, `src/types.ts`, `src/data/curriculum.json`, `src/lib/engine.ts`, `src/lib/storage.ts`, `src/offline.ts`, `src/webmcp.ts`, `scripts/`, `tests/`, configuración Vite/Capacitor y proyecto `android/`. Las tres ilustraciones originales están conservadas en `public/art/` y sus originales en `../../paper-assets/`.

El temario y las notas están fuera del repositorio de la aplicación: `../TEMARIO.md`, `../fuentes/INDICE.md` y `../fuentes/complementos-autenticados/`. La tabla `COBERTURA.md` y el índice reflejan tres quizzes confirmados; el manifiesto usado para compilar conserva su instantánea previa. La nota del quiz 3 explica la confirmación tardía. No regenerar por rutina el JSON firmado solo para cambiar esa nota.

## Reanudar publicación

- Reutilizar `.openai/hosting.json`: proyecto `appgprj_6abf1cbec70c81918f54fdca844ebc88`. No crear otro Site.
- `sites_get_site` confirmó `status: active`, `current_live_url: null`, acceso `custom`.
- El usuario autorizó web compartible por enlace. Al publicar, aplicar acceso público explícitamente y verificar el resultado de despliegue antes de entregar URL.
- Los archivos locales `site-workflow.mjs` y `build-site.mjs` ya no existen bajo `/Users/luizun/.codex/plugins`; una búsqueda completa acotada a ese directorio confirmó ausencia. La ruta antigua terminaba en `sites/0.1.75/`. No volver a probar versiones supuestas.
- Cuando vuelva Sites, leer su skill actual y ejecutar su flujo normal usando este repositorio. Obtener una credencial nueva; no imprimir ni guardar tokens.
- `dist/downloads/pliegue-ia.apk` y `.sha256` se copiaron DESPUÉS de `cap sync` y firma. Si el flujo vuelve a compilar Vite, recopiar ambos desde `artifacts/` después del build y antes de empaquetar la web. Nunca copiar APK a `public/` antes de sincronizar Android.
- El código fuente y la web preparados se entregan también como ZIP en `artifacts/`.

## Reanudar Google Skills con contexto limpio

Usar Chrome con la sesión existente. Leer `../fuentes/complementos-autenticados/COBERTURA.md` y `INVENTARIO.md`; no volver a inventariar todo el curso.

- C1 quizzes 566759, 566762 y 566766: 100 %, resultados y feedback confirmados. El tercero apareció tras un retraso largo; **no reenviarlo**.
- C2 quiz 652147: seis preguntas observadas, primeras cinco seleccionadas, última sin seleccionar y **sin envío ni aprobado**. Sesión observada 45739596. Su nota enumera los conceptos y la limitación visual.
- La última respuesta de C2 aparecía tapada por el pie fijo. Desplazamientos nativos dieron `noWindowsAvailable`; teclado de desplazamiento no resolvió el problema. Detener ese flujo tras dos intentos y retomar desde una UI verificada.
- No navegar por GET a enlaces `/start` de quizzes: una prueba devolvió 404. Iniciar mediante el control visible correspondiente.
- C1 conserva versión inscrita anterior. C2 mostró versión nueva con actividades 652141–652156. No reiniciar ni actualizar una inscripción existente.
- Quedan C2.1 sin enviar, C2.2/C2.3 y los interiores de C3–C5; las cinco guías oficiales ES y revisión exhaustiva de paneles/actividades también están pendientes.
- Mantener fuera la pregunta del apéndice con clave contradictoria. Redactar nuevas preguntas propias solo si aportan conceptos no duplicados y documentar el método de verificación.

## Pruebas y decisiones que conservar

Ver salidas reales y límites en `VERIFICACION.md`. Comandos usados:

```sh
npm run validate:content
node --import tsx --test tests/engine.test.ts tests/storage.test.ts
npm run build
node scripts/build-sw.mjs
node --check dist/sw.js
node scripts/android-release.mjs
```

17 tests específicos pasan. Se comprobó una lección completa, repaso de errores, teclado, importación confirmada, exportación real de Chrome, transferencia del archivo, parejas y recarga/guardado con servidor apagado. WebMCP válido e inválido probado. Pendientes: recorrido táctil final Android, respaldo nativo por UI, ampliación 200 % y publicación.

No cambiar `contentVersion: 1.1.2` sin implementar una migración; la validación actual rechaza versiones incompatibles. El SHA del currículo es `28e2e7843860a66a9208f2d02323063ef4e8b59e3d9112e7fb1d46af11ec4143`.

La APK 1.0.2/code3 (2026-10-02, con reels con audio, modo enfoque y los modos nuevos) tiene SHA-256 `2386bfe7594b4bda7d8f75790917dc6ef0c4508feeda106403ade649c9cc616a` y la misma firma que la 1.0.1/code2 (`a261343d…`), así que se instala encima conservando el progreso. Sin probar todavía en un dispositivo. La firma está en `/Users/luizun/github/Cursos/.private-signing/pliegue-ia/`, fuera del repositorio; conservarla, no publicarla. El informe nativo confirma 70 XP/una lección conservados byte a byte al actualizar.

El fallo offline inicial se corrigió: Vite sirve `Vary: Origin`; los recursos públicos precargados se buscan con `ignoreVary: true`. La prueba final en 4175 pasó con servidor apagado, una respuesta y dos recargas. No eliminar esa corrección ni volver a atribuir el fallo a la herramienta.

Las lecciones nuevas están en `AGENTS.md`. Borrar este `HANDOFF.md` cuando se hayan cerrado los pendientes y volver a validar cualquier archivo modificado.
