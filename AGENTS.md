# Pliegue IA

Aplican las reglas maestras proporcionadas por el usuario. El bootstrap completo queda pendiente de su prompt.

## Lecciones aprendidas

- En Chrome, una opción marcada no confirma el envío: exige resultado visible y detén el flujo tras dos intentos fallidos; el pie fijo puede tapar controles al final del quiz.
- Si desaparece una ruta de plugin, localiza el paquete instalado una sola vez; no repitas comandos con la ruta o versión anterior.
- Las herramientas de edición convierten un escape como `\u0300` en el carácter literal: para quitar acentos usa `\p{M}` con la bandera `u`, y si hace falta un escape Unicode escríbelo con un script y compruébalo con `grep`.

## Entrega

- Mantener la firma Android fuera del proyecto y de los archivos publicados. Copiar la APK a `dist/downloads` únicamente después de `cap sync` y de firmar.
- No publicar transcripciones ni PDF completos. El currículo distribuido es una adaptación y el desafío final queda separado del repaso.
- No incrementar `contentVersion` sin una migración de progreso probada; la validación actual exige una versión compatible.
- Reels: el arte se genera con `npm run reels:art` (ComfyUI local, Qwen-Image 2512) y va sin texto ni logotipos; `public/reels` no supera 3 MB porque el service worker lo precarga entero. Los guiones son adaptaciones propias. Hay un reel por unidad y otro por lección; la lección única de una unidad (4.07, 5.12) abre el de su unidad. La clave de un reel (`reelKey`: su lección si la tiene, su unidad si no) nombra su arte (`1.01-a.avif`), su voz (`1.01.mp3`) y su entrada en `reels-audio.json`. Un reel de lección solo adapta su lección.
- Audio de los reels: la voz sale de `npm run reels:voice` (servidor local text-2-voce) y la música de `npm run reels:music` (ComfyUI local, ACE-Step v1); van en `public/reels-audio`, con 260 KB por reel y 13 MB en total como máximo. El texto narrado es el de la pantalla; `say` y `scripts/voice/lexicon.json` solo ajustan cómo se dice. Si cambia el texto de una escena hay que volver a narrarla: el validador compara su huella.
- La pestaña «Reels» es un feed a pantalla completa con `scroll-snap`; solo el reel visible se monta (`ReelPlayer` con `active`), para no tener varios audios a la vez.
- Los sonidos de botones y los efectos de los reels se sintetizan en `src/lib/sound.ts`; no se añaden archivos de audio para ellos.
- Tarjetas de memoria: `src/data/glossary.json` sale de `npm run glossary` (glosario del temario) y no se edita a mano. Las tarjetas y «¿Sí o no?» no escriben en `Progress` ni dan XP; solo cuentan el día de estudio. Las marcas de las tarjetas van en la clave `pliegue-ia.cards.v1` y las preferencias en `pliegue-ia.prefs.v1`, las dos fuera del respaldo.
- Las reescrituras de `src/data/lesson-overrides.json` solo devuelven el contexto que una fila de tabla perdió; cada una cita su línea del temario y no cambia `curriculum.json`.
- El «modo enfoque» se describe siempre por lo que hace; la app y el repositorio no nombran a ningún público.
