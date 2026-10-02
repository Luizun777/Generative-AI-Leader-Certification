# Verificación ejecutada

Fecha local: 1 de octubre de 2026. APK final: **1.0.1 (versionCode 2)**. Contenido: **1.1.2**.

## Contenido

Comando: `npm run validate:content`.

```text
PASS: 5 worlds · 17 units · 51 lessons · 225 base practice + 4 authenticated practice + 40 reserved exam questions.
PASS: 51/51 lessons have practice references; IDs, unit links, answer keys and 2–5 options are valid.
PASS: 7 complete Markdown tables · 2 multiple-answer questions · 5 matching sets × 4 distinct pairs.
PASS: all 265 numbered source questions retained; appendix excluded; no dependencies required.
PASS: 6 authenticated activities with local evidence and provenance; no duplicate Foundation/LLM questions added.
```

Total evaluable: **269**, dividido en **229 de práctica y 40 de desafío**. Las listas de las lecciones 2.06 y 3.04 ya no generan tarjetas vacías de tipo `1.`. La pregunta adicional contradictoria permanece excluida.

La revisión autenticada del curso está incompleta: tres quizzes del curso 1 confirmados al 100 %, un quiz del curso 2 observado sin enviar y diez interiores pendientes. Las confirmaciones tardías están en la documentación de cobertura. No se afirma haber revisado todos los paneles de los cinco cursos ni haber obtenido las cinco guías oficiales ES.

## Lógica, persistencia y respaldo

Comando: `node --import tsx --test tests/engine.test.ts tests/storage.test.ts`.

```text
tests 17
pass 17
fail 0
cancelled 0
skipped 0
```

Incluye corrección exacta de selección múltiple; opciones omitidas, duplicadas o desconocidas; separación del examen; tandas sin duplicados; repaso de errores; racha por fecha local; puntuación idempotente; estados de sesión; respaldos inválidos; cola de escrituras; fallos de lectura y conservación del almacenamiento corrupto.

## Recorridos web reales

| Comprobación | Evidencia observada |
|---|---|
| Lección 1.01 completa | Cinco respuestas, 4/5 correctas, 80 %, 40 XP y una lección completada |
| Cierre mediante recarga y continuación | Recuperó una respuesta y volvió a la pregunta 2 de 5 |
| Error explicado y repaso | Un error pendiente; al corregirlo pasó a cero y sumó 10 XP |
| Teclado | Selección con Espacio y comprobación con Intro en una pregunta |
| Importación | Archivo de prueba validado, diálogo previo y restauración de 70 XP/una lección |
| Exportación real | Chrome mostró `pliegue-ia-respaldo-2026-10-02.json`, 424 B, Listo; `parseBackup` aceptó el archivo descargado |
| Transferencia de archivo | El JSON exportado en Chrome fue importado y confirmado en el navegador integrado |
| Emparejamiento | Cuatro parejas correctas y mensaje de conjunto completado, con servidor apagado |
| Móvil | Pantallas revisadas a 390×844 y 320×740; ancho de documento 320 y scrollWidth 320 |
| Escritorio | Captura real de la aplicación a 1280×900 |
| Movimiento reducido | Preferencia activada; estilo calculado del zorro: `animationName: none` |
| WebMCP | Consulta devuelve el avance real; abrir repaso no contesta preguntas; argumentos desconocidos se rechazan |

Capturas: `artifacts/web-desktop.jpg`, `artifacts/web-mobile.jpg` y `artifacts/web-offline.jpg`. El zoom de Chrome solo se verificó al 110 % y luego se restauró al 100 %; **200 % sigue pendiente**.

## Sin conexión

La primera prueba detectó un fallo por `Vary: Origin` en el servidor Vite. Se corrigió la búsqueda en la caché de recursos estáticos mediante `ignoreVary: true`, conservando la coincidencia de URL. La versión final del service worker es `f8cd1fd98d38fa47`, con 13 archivos precargados.

Prueba repetida sobre producción local en el puerto 4175:

```text
Servidor detenido: exit_code 130
curl: (7) Failed to connect to 127.0.0.1 port 4175
Recarga del navegador: aplicación visible
Respuesta sin servidor: ¡Así es!
Segunda recarga: 1 de 5 preguntas respondidas. Tu sesión está guardada.
```

La APK contiene el contenido localmente; sus 14 archivos web, incluido el service worker, coinciden byte a byte con el `dist` previo a añadir las descargas.

## Android

```text
BUILD SUCCESSFUL in 10s
Verifies
Verified using v2 scheme: true
Verified using v3 scheme: true
package: com.luizun.pliegueia
versionName: 1.0.1
versionCode: 2
sdkVersion: 24
targetSdkVersion: 36
Performing Incremental Install
Success
Status: ok
LaunchState: COLD
TotalTime: 410
```

Instalación limpia ejecutada en AOSP Android 16, API 36, arm64. Actualización real de 1.0.0 a 1.0.1: una **fixture explícita de prueba** con 70 XP, una lección y seis registros se conservó byte a byte en `CapacitorStorage.xml`; el JSON leído después pasó la validación actual. No se presenta esto como un recorrido táctil. La herramienta CUA no expuso la ventana Qt del emulador y no se completó el recorrido visual de la APK final ni el selector/compartidor de archivos nativo.

Informe: `artifacts/android-upgrade-verification.json`. No se detectaron errores fatales al arrancar. La clave de firma permanece fuera del proyecto; no está en la APK ni en los archivos de distribución.

SHA-256 de la APK final (7 697 107 bytes):

```text
a261343da269d2d4688cb15cc59a81620f042b823fe9490b80bdda1fddd9af14
```

## Publicación pendiente

Sites conserva el proyecto registrado, pero no tiene una URL publicada. Los scripts locales de su complemento desaparecieron durante la sesión. Se pidió volver a habilitarlo; no se creó otro sitio ni se inventó un enlace publicado. La carpeta `dist` y su archivo ZIP quedan preparados.
