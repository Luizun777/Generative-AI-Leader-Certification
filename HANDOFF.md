# Continuación verificada: Pliegue IA

## Estado en tres líneas

1. Juego funcional con 51 lecciones, 229 preguntas de práctica y 40 de desafío, progreso, respaldos y web sin conexión comprobada.
2. APK firmada 1.0.1 instalada y actualizada conservando una fixture nativa; recorrido visual Android final pendiente.
3. Publicación Sites pendiente de recuperar su complemento local; revisión Google Skills pendiente de 11 quizzes y cinco guías ES.

## Reels paper cut (en curso, 2026-10-02)

Plan aprobado: `/Users/luizun/.claude/plans/a-la-aplicaci-n-tambien-starry-sutton.md`. Cuatro fases; **solo la fase 1 (piloto) está hecha y espera la revisión de estilo del usuario** antes de producir los 16 reels restantes.

- Hecho y sin commit (`git status --short`: `M AGENTS.md package.json src/App.tsx`; nuevos `public/reels/`, `scripts/comfy/`, `scripts/reels-art.mjs`, `scripts/validate-reels.mjs`, `src/data/reels.json`, `src/lib/reels.ts`, `src/reels/`, `tests/reels.test.ts`).
- Verificado: `node --import tsx --test tests/reels.test.ts` → 10/10; `node scripts/validate-reels.mjs --partial` → `PASS reels: 1/17 reels · 2/2 ilustraciones · 34 KB`; `npm run build` → `PASS offline: 16 archivos precargados` con ambos AVIF en `dist/sw.js`. En navegador: visor en 375×812 y escritorio, flechas y Esc, movimiento reducido, CTA que abre la lección 1.01.
- Sin verificar: recarga sin conexión en `npm run preview`, AVIF y botón atrás en el WebView de Android, gestos táctiles reales.
- Arte: `npm run reels:art` contra ComfyUI (Comfy Desktop, `127.0.0.1:8188`, Qwen-Image 2512). Unos 6 min por imagen (345-365 s medidos). Fuera del repo: enlace `~/ComfyUI-Shared/models/diffusion_models/qwen-image-2512-Q4_K_M.gguf` y originales en `../../paper-assets/reels/`.
- Pendiente: fase 2 (guiones de los 17 en `reels.json` y 34 sujetos en `art-manifest.json`), fase 3 (arte por lotes), fase 4 (pestaña «Reels» con feed, registro de visto en la clave `pliegue-ia.reels.v1`, validador sin `--partial`).

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

La APK final 1.0.1/code2 tiene SHA-256 `a261343da269d2d4688cb15cc59a81620f042b823fe9490b80bdda1fddd9af14`. La firma está en `/Users/luizun/github/Cursos/.private-signing/pliegue-ia/`, fuera del repositorio; conservarla, no publicarla. El informe nativo confirma 70 XP/una lección conservados byte a byte al actualizar.

El fallo offline inicial se corrigió: Vite sirve `Vary: Origin`; los recursos públicos precargados se buscan con `ignoreVary: true`. La prueba final en 4175 pasó con servidor apagado, una respuesta y dos recargas. No eliminar esa corrección ni volver a atribuir el fallo a la herramienta.

Las lecciones nuevas están en `AGENTS.md`. Borrar este `HANDOFF.md` cuando se hayan cerrado los pendientes y volver a validar cualquier archivo modificado.
