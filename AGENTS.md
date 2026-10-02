# Pliegue IA

Aplican las reglas maestras proporcionadas por el usuario. El bootstrap completo queda pendiente de su prompt.

## Lecciones aprendidas

- En Chrome, una opción marcada no confirma el envío: exige resultado visible y detén el flujo tras dos intentos fallidos; el pie fijo puede tapar controles al final del quiz.
- Si desaparece una ruta de plugin, localiza el paquete instalado una sola vez; no repitas comandos con la ruta o versión anterior.

## Entrega

- Mantener la firma Android fuera del proyecto y de los archivos publicados. Copiar la APK a `dist/downloads` únicamente después de `cap sync` y de firmar.
- No publicar transcripciones ni PDF completos. El currículo distribuido es una adaptación y el desafío final queda separado del repaso.
- No incrementar `contentVersion` sin una migración de progreso probada; la validación actual exige una versión compatible.
- Reels: el arte se genera con `npm run reels:art` (ComfyUI local, Qwen-Image 2512) y va sin texto ni logotipos; `public/reels` no supera 3 MB porque el service worker lo precarga entero. Los guiones son adaptaciones propias.
