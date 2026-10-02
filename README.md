# Pliegue IA

Juego de estudio en español para Generative AI Leader: React, TypeScript, Vite y Capacitor 8. Ruta de 5 mundos, 17 unidades y 51 lecciones; 229 preguntas de práctica, 40 de desafío final y 5 conjuntos de parejas. Material base fechado el 1 de octubre de 2026; complemento autenticado documentado en `../fuentes/complementos-autenticados/COBERTURA.md`.

## Estudiar

- **Aprender:** explicación breve, ejemplos y cinco preguntas. Si faltan preguntas de la lección, se completa con su unidad.
- **Repaso rápido:** cinco o diez preguntas sin duplicados, todas las unidades, una unidad o errores pendientes. Un error deja de estar pendiente cuando se responde correctamente.
- **Conecta ideas:** empareja conceptos y definiciones.
- **Desafío final:** las 40 preguntas se mantienen fuera del repaso habitual.
- **Mi progreso:** estadísticas, respaldo y movimiento reducido. No hay cuentas ni sincronización automática.

Cada respuesta guarda el progreso. Se conceden 10 XP al primer acierto de una pregunta y 5 XP en aciertos posteriores; los errores permiten continuar sin perder vidas. La racha usa la fecha local del dispositivo.

## Android

El archivo de entrega es `artifacts/pliegue-ia.apk` y su suma está en `artifacts/pliegue-ia.apk.sha256`. Requiere Android 7.0 o posterior.

1. Copia la APK al teléfono y ábrela.
2. Si Android lo solicita, permite instalar desde la aplicación que abrió el archivo.
3. Instala y abre Pliegue IA. El contenido y las ilustraciones ya están incluidos.

Para actualizar, instala la nueva APK encima de la anterior, sin desinstalar. Debe conservar el identificador `com.luizun.pliegueia` y la misma clave de firma. Exporta un respaldo antes de cambiar de dispositivo o desinstalar.

## Respaldo

En **Mi progreso**, usa **Descargar respaldo** en web o la opción de compartir en Android y guarda el archivo JSON en un lugar que controles. En el otro dispositivo, selecciona **Importar JSON**. La aplicación valida formato, versión, identificadores, contadores y estado de sesión antes de pedir confirmación para reemplazar el avance.

El respaldo actual es compatible con contenido `1.1.2`. Una versión de contenido incompatible se rechaza y no sobrescribe el progreso. Borrar los datos del navegador o desinstalar la APK elimina el avance local si no guardaste un respaldo.

## Web y uso sin conexión

La web se prepara para Sites mediante `.openai/hosting.json`. La publicación está pendiente de recuperar el complemento local Sites; registrar un sitio no significa que esté publicado.

Abre la web con conexión y espera **Listo para estudiar sin conexión** antes de desconectarte. Los enlaces a Google Skills y la descarga de la APK requieren conexión. La APK contiene los recursos localmente desde su instalación.

Para ejecutar la web localmente, con Node 22 o posterior:

```sh
npm ci
npm run dev
```

Para servir la compilación:

```sh
npm run build
npm run preview
```

El service worker solo se activa en compilación de producción; no se activa en el servidor de desarrollo.

## Verificación y construcción

```sh
npm run validate:content
node --import tsx --test tests/engine.test.ts tests/storage.test.ts
npm run build
node scripts/android-release.mjs
```

El script Android usa JDK 21, SDK 36 y build-tools 36.0.0. Acepta `JAVA_HOME` y `ANDROID_HOME`. Conserva la firma en `../../.private-signing/pliegue-ia/`, fuera del repositorio. Haz una copia privada de esa carpeta para poder emitir futuras actualizaciones; no la subas al sitio ni la incluyas en archivos públicos.

Para regenerar contenido se necesitan `../TEMARIO.md` y las fuentes del curso. El JSON ya está incluido para compilar la aplicación sin distribuir los originales completos.

Consulta `VERIFICACION.md` para distinguir comprobaciones ejecutadas y pendientes. `HANDOFF.md` registra los bloqueos de publicación y de revisión autenticada del curso.
