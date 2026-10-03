// Two voices for the same screens. `warm` is the app's usual tone; `plain` is the focus mode's:
// literal, short, no figures of speech. Only the strings that differ between them live here.
const plural = (count: number, one: string, many: string) => count === 1 ? one : many;
const answers = (ids: readonly string[]) => ids.length === 1 ? `La respuesta correcta es la ${ids[0]}.` : `Las respuestas correctas son la ${ids.slice(0, -1).join(', la ')} y la ${ids[ids.length - 1]}.`;

export interface Copy {
  loading: string;
  exitSession: string;
  newSessionTitle: string;
  newSessionBody: (answered: number, total: number) => string;
  newSessionKept: string;
  newSessionConfirm: string;
  newSessionKeep: string;
  learnEyebrow: string;
  learnTitle: string;
  lessonEyebrow: string;
  lessonIdea: string;
  lessonPoints: string;
  lessonExample: string;
  lessonDistinctions: string;
  lessonSource: string;
  lessonStart: (count: number) => string;
  lessonStartButton: (count: number) => string;
  sessionLabel: (mode: 'lesson' | 'quick' | 'exam', lessonId?: string) => string;
  questionEyebrow: (position: number, total: number) => string;
  questionTitle: (position: number, total: number, multiple: boolean) => string;
  selectionHelp: (multiple: boolean) => string;
  takeYourTime: string;
  feedbackEyebrow: (correct: boolean) => string;
  feedbackTitle: (correct: boolean) => string;
  feedbackDetail: (correct: boolean, correctIds: readonly string[]) => string;
  chosenLabel: string;
  why: string;
  nextQuestion: (last: boolean) => string;
  resultsEyebrow: string;
  resultsTitle: (mode: 'lesson' | 'quick' | 'exam') => string;
  resultsSummary: (mode: 'lesson' | 'quick' | 'exam', correct: number, total: number) => string;
  resultsNote: (mode: 'lesson' | 'quick' | 'exam', done: number, lessons: number) => string;
  reviewTitle: string;
  reviewWrong: string;
  quickEyebrow: string;
  quickTitle: string;
  quickSubtitle: string;
  quickPanel: string;
  quickNoMistakes: string;
  quickStart: string;
  examEyebrow: string;
  examTitle: string;
  examSubtitle: string;
  examCardEyebrow: string;
  examCardTitle: string;
  examFeatures: readonly string[];
  examNote: string;
  examStart: string;
  matchingEyebrow: string;
  matchingSubtitle: (sets: number) => string;
  matchingHow: string;
  matchStart: string;
  matchPickFirst: string;
  matchChosen: (term: string) => string;
  matchWrong: string;
  matchRight: (done: number, total: number) => string;
  matchComplete: (total: number) => string;
  matchRepeat: string;
  progressEyebrow: string;
  progressTitle: string;
  progressSubtitle: string;
  progressWorlds: string;
  progressHow: string;
}

export const COPY: Record<'warm' | 'plain', Copy> = {
  warm: {
    loading: 'Preparando tus ideas…',
    exitSession: 'Pausar y volver',
    newSessionTitle: '¿Empezar una nueva sesión?',
    newSessionBody: (answered, total) => `Tienes una sesión en curso con ${answered} de ${total} ${plural(total, 'pregunta respondida', 'preguntas respondidas')}. Empezar otra reemplazará esa sesión.`,
    newSessionKept: 'Tus respuestas registradas, XP y lecciones completadas se conservan.',
    newSessionConfirm: 'Empezar nueva',
    newSessionKeep: 'Continuar mi sesión actual',
    learnEyebrow: 'TU RUTA DE APRENDIZAJE',
    learnTitle: 'Una idea a la vez',
    lessonEyebrow: 'PRIMERO, UNA IDEA',
    lessonIdea: 'LA IDEA CENTRAL',
    lessonPoints: 'Qué conviene recordar',
    lessonExample: 'Un ejemplo para verlo',
    lessonDistinctions: 'No confundas estas ideas',
    lessonSource: 'Consultar la fuente del curso',
    lessonStart: count => `Ahora, ${count} ${plural(count, 'pregunta', 'preguntas')} para darle forma a lo aprendido.`,
    lessonStartButton: () => 'Vamos a practicar',
    sessionLabel: (mode, lessonId) => mode === 'lesson' ? `LECCIÓN ${lessonId}` : mode === 'exam' ? 'DESAFÍO FINAL' : 'REPASO RÁPIDO',
    questionEyebrow: (position, total) => `PREGUNTA ${position} DE ${total}`,
    questionTitle: (_position, _total, multiple) => multiple ? 'Conecta todas las respuestas' : 'Elige tu respuesta',
    selectionHelp: multiple => multiple ? 'Selección múltiple: marca todas las opciones correctas.' : 'Selección única: marca una opción.',
    takeYourTime: 'Tómate el tiempo que necesites.',
    feedbackEyebrow: correct => correct ? '¡BUEN PLIEGUE!' : 'UNA OPORTUNIDAD PARA APRENDER',
    feedbackTitle: correct => correct ? '¡Así es!' : 'Vamos a darle otra vuelta.',
    feedbackDetail: (correct, correctIds) => correct ? 'Has conectado la idea.' : `Respuesta${correctIds.length > 1 ? 's correctas' : ' correcta'}: ${correctIds.join(', ')}.`,
    chosenLabel: 'Tu elección',
    why: '',
    nextQuestion: last => last ? 'Ver mis resultados' : 'Siguiente pregunta',
    resultsEyebrow: 'CADA IDEA SUMA',
    resultsTitle: mode => mode === 'lesson' ? 'Un pliegue más' : 'Práctica completada',
    resultsSummary: (mode, correct, total) => mode === 'lesson' ? 'Lección completada.' : correct === total ? '¡Todas las ideas encajaron!' : 'Ya sabes dónde seguir practicando.',
    resultsNote: mode => mode === 'lesson' ? 'Tu avance quedó registrado en la ruta. Sigue con la próxima idea cuando quieras.' : 'Tus respuestas actualizan el progreso y la lista de errores para tu próximo repaso.',
    reviewTitle: 'Tus respuestas, paso a paso',
    reviewWrong: 'Para repasar',
    quickEyebrow: 'UN POCO DE PRÁCTICA',
    quickTitle: 'Activa tu memoria',
    quickSubtitle: 'Elige tu repaso. Cada respuesta incluye una explicación para seguir aprendiendo.',
    quickPanel: 'Tu repaso, a tu medida',
    quickNoMistakes: 'No hay errores pendientes con este filtro. ¡Buen trabajo! Prueba otra unidad o desactiva este filtro.',
    quickStart: 'Empezar repaso',
    examEyebrow: 'PON LAS IDEAS EN PRÁCTICA',
    examTitle: 'Tu desafío final',
    examSubtitle: 'Un simulacro para reconocer lo que dominas y lo que conviene repasar.',
    examCardEyebrow: 'UNA VISTA DE TODA LA RUTA',
    examCardTitle: '40 preguntas.\nMuchas conexiones.',
    examFeatures: ['Selección única y selección múltiple', 'Explicación y fuente después de responder', 'Sin límite de tiempo; puedes pausar y continuar'],
    examNote: 'Es una herramienta de estudio, no un examen oficial ni una predicción de certificación.',
    examStart: 'Empezar desafío de 40',
    matchingEyebrow: 'EL CONOCIMIENTO ENCAJA',
    matchingSubtitle: sets => `${sets} conjuntos para unir conceptos y definiciones.`,
    matchingHow: 'Elige un concepto y luego la definición que le corresponde. Puedes usar el teclado o tocar las tarjetas.',
    matchStart: 'Elige un concepto y después su definición.',
    matchPickFirst: 'Primero elige un concepto de la columna izquierda.',
    matchChosen: term => `Concepto elegido: ${term}. Busca su definición.`,
    matchWrong: 'Todavía no encajan. Conserva el concepto y prueba otra definición.',
    matchRight: (done, total) => `¡Encajan! ${done} de ${total} parejas conectadas.`,
    matchComplete: () => '¡Todas las ideas conectadas! Puedes repetir o probar otro conjunto.',
    matchRepeat: 'Volver a conectar',
    progressEyebrow: 'LO QUE YA TOMÓ FORMA',
    progressTitle: 'Cada paso cuenta',
    progressSubtitle: 'Tu avance se guarda en este dispositivo, sin crear una cuenta.',
    progressWorlds: 'Tu ruta, mundo a mundo',
    progressHow: 'Cómo funciona tu progreso',
  },
  plain: {
    loading: 'Cargando…',
    exitSession: 'Guardar y salir',
    newSessionTitle: 'Tienes una sesión sin terminar',
    newSessionBody: (answered, total) => `Respondiste ${answered} de ${total} ${plural(total, 'pregunta', 'preguntas')}. Si empiezas otra sesión, esa se borra.`,
    newSessionKept: 'Tus respuestas guardadas se conservan.',
    newSessionConfirm: 'Empezar otra',
    newSessionKeep: 'Continuar la sesión',
    learnEyebrow: '',
    learnTitle: 'Tu siguiente paso',
    lessonEyebrow: '',
    lessonIdea: 'Idea central',
    lessonPoints: 'Puntos clave',
    lessonExample: 'Ejemplo',
    lessonDistinctions: 'Para no confundir',
    lessonSource: 'Ver la fuente (se abre en otra pestaña)',
    lessonStart: count => `Siguen ${count} ${plural(count, 'pregunta', 'preguntas')} de esta unidad. Sin límite de tiempo. Los errores no restan puntos.`,
    lessonStartButton: count => `Empezar ${plural(count, 'la pregunta', `las ${count} preguntas`)}`,
    sessionLabel: (mode, lessonId) => mode === 'lesson' ? `Lección ${lessonId}` : mode === 'exam' ? 'Desafío de 40' : 'Repaso',
    questionEyebrow: () => '',
    questionTitle: (position, total) => `Pregunta ${position} de ${total}`,
    selectionHelp: multiple => multiple ? 'Elige todas las opciones correctas. Puede haber más de una.' : 'Elige una opción.',
    takeYourTime: '',
    feedbackEyebrow: () => '',
    feedbackTitle: correct => correct ? 'Correcto.' : 'No es correcto.',
    feedbackDetail: (correct, correctIds) => correct ? '' : answers(correctIds),
    chosenLabel: 'Tu respuesta',
    why: 'Por qué:',
    nextQuestion: last => last ? 'Ver resultados' : 'Siguiente',
    resultsEyebrow: '',
    resultsTitle: mode => mode === 'lesson' ? 'Lección completada' : mode === 'exam' ? 'Desafío completado' : 'Repaso completado',
    resultsSummary: (_mode, correct, total) => correct === total ? 'Todas correctas.' : `Tienes ${total - correct} ${plural(total - correct, 'pregunta', 'preguntas')} para repasar.`,
    resultsNote: (mode, done, lessons) => mode === 'lesson' ? `Avance guardado: ${done} de ${lessons} lecciones.` : 'Tus respuestas quedaron guardadas.',
    reviewTitle: 'Tus respuestas',
    reviewWrong: 'Incorrecta',
    quickEyebrow: '',
    quickTitle: 'Repaso rápido',
    quickSubtitle: 'Preguntas al azar con explicación. Sin límite de tiempo.',
    quickPanel: 'Elige tu repaso',
    quickNoMistakes: 'No tienes errores pendientes con este filtro. Prueba otra unidad o desactiva el filtro.',
    quickStart: 'Empezar',
    examEyebrow: '',
    examTitle: 'Desafío de 40 preguntas',
    examSubtitle: 'Un simulacro para ver qué dominas y qué conviene repasar.',
    examCardEyebrow: '',
    examCardTitle: 'Cómo funciona',
    examFeatures: ['40 preguntas, una por pantalla.', 'Sin límite de tiempo.', 'Puedes salir y continuar después.', 'Ves la explicación después de cada respuesta.'],
    examNote: 'No es el examen oficial. No predice tu resultado.',
    examStart: 'Empezar',
    matchingEyebrow: '',
    matchingSubtitle: () => 'Une cada concepto con su definición.',
    matchingHow: 'Verás un concepto cada vez. Elige su definición.',
    matchStart: 'Elige la definición de este concepto.',
    matchPickFirst: 'Elige la definición de este concepto.',
    matchChosen: () => 'Elige la definición de este concepto.',
    matchWrong: 'No es esa definición. Elige otra.',
    matchRight: (done, total) => `Correcto. Llevas ${done} de ${total} parejas.`,
    matchComplete: total => `Conjunto completado. ${total} de ${total} parejas.`,
    matchRepeat: 'Repetir este conjunto',
    progressEyebrow: '',
    progressTitle: 'Mi progreso',
    progressSubtitle: 'Tu avance se guarda en este dispositivo. No necesitas cuenta.',
    progressWorlds: 'Avance por mundo',
    progressHow: 'Cómo se calcula',
  },
};
