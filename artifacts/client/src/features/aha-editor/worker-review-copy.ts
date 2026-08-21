import {
  ENERGY_CATEGORIES,
  WORKER_ACKNOWLEDGMENT,
  type EnergyCategoryName,
} from "@workspace/aha-domain";

export type WorkerReviewLanguage = "en" | "es";

type CanonicalEnergyExample =
  (typeof ENERGY_CATEGORIES)[number]["examples"][number];

export type WorkerReviewErrorKey =
  "capacity" | "fit" | "pdf_check" | "save_signature" | "worker_add";

export interface WorkerReviewCopy {
  locale: "en-US" | "es-US";
  languageAnnouncement: string;
  languageControlLabel: string;
  addWorkerTitle: string;
  foreman: string;
  readOnly: string;
  signingFor: string;
  workerName: string;
  workerNameHelper: string;
  workerNamePlaceholder: string;
  reviewNotice: string;
  details: string;
  personInCharge: string;
  location: string;
  closestEmergencyCentre: string;
  emergencyNumber: string;
  musterPoint: string;
  rescuePlanRequired: string;
  workOrderPermit: string;
  jhaProcedureNumbers: string;
  descriptionOfWork: string;
  workLabel: (count: number) => string;
  untitledTask: string;
  hazards: string;
  controls: string;
  noTasks: string;
  energyLabel: (selected: number, total: number) => string;
  energyWheelHeading: string;
  energyWheelSelection: (selected: number, total: number) => string;
  energyWheelHelper: string;
  energyWheelAccessibility: (selected: number, total: number) => string;
  noExamples: string;
  noEnergy: string;
  safetyCheck: string;
  meetingNotes: string;
  notEntered: string;
  notAnswered: string;
  notApplicable: string;
  yes: string;
  no: string;
  acknowledgmentHeading: string;
  acknowledgmentHelper: string;
  acknowledgment: string;
  signAs: (name: string) => string;
  signatureAreaLabel: string;
  signaturePlaceholder: string;
  thisWorker: string;
  clear: string;
  confirmSignature: string;
  saving: string;
  backToCrew: string;
  backToCompleted: string;
  signedCount: (signed: number, total?: number) => string;
  signingBanner: string;
  offline: string;
  discardAddedTitle: string;
  discardSignatureTitle: string;
  discardAddedBody: string;
  discardSignatureBody: string;
  cancel: string;
  keepSigning: string;
  discard: string;
  discardAndReturn: string;
  errors: Record<WorkerReviewErrorKey, string>;
}

const SPANISH_ENERGY_CATEGORIES: Record<EnergyCategoryName, string> = {
  Gravity: "Gravedad",
  Motion: "Movimiento",
  Mechanical: "Mecánica",
  Electrical: "Eléctrica",
  Pressure: "Presión",
  Sound: "Sonido",
  Radiation: "Radiación",
  Biological: "Biológica",
  Chemical: "Química",
  Temperature: "Temperatura",
  "Human factors": "Factores humanos",
};

const SPANISH_ENERGY_EXAMPLES: Record<CanonicalEnergyExample, string> = {
  "Excavation cave-in": "Derrumbe de excavación",
  "Falling or sliding materials/objects":
    "Materiales u objetos que caen o se deslizan",
  "Slips/trips/falls": "Resbalones, tropiezos y caídas",
  "Working at heights": "Trabajo en alturas",
  Wind: "Viento",
  "Road/ground conditions": "Condiciones del camino o del terreno",
  "Flying particles/debris": "Partículas o escombros proyectados",
  "Simultaneous operations": "Operaciones simultáneas",
  Watercourses: "Cursos de agua",
  Ergonomics: "Ergonomía",
  Congestion: "Congestión",
  "Vehicles/vessels/mobile equipment":
    "Vehículos, embarcaciones o equipo móvil",
  "Tool/equipment nip points/pinch points":
    "Puntos de atrapamiento o pellizco de herramientas o equipos",
  Vibration: "Vibración",
  "Rotating equipment": "Equipo giratorio",
  "Electrical equipment/lines - normal or abnormal condition (shock or arc flash)":
    "Equipos o líneas eléctricas en condición normal o anormal (descarga eléctrica o arco eléctrico)",
  "Non-intrinsically safe tools/equipment":
    "Herramientas o equipos sin seguridad intrínseca",
  "Static electricity": "Electricidad estática",
  "Induced voltage": "Voltaje inducido",
  "Compressed cylinders": "Cilindros de gas comprimido",
  "Pressurized piping/hoses/equipment":
    "Tuberías, mangueras o equipos presurizados",
  "Tanks/vessels": "Tanques o recipientes",
  "Pressure relief systems": "Sistemas de alivio de presión",
  "Tools/equipment": "Herramientas o equipos",
  Purging: "Purga",
  "Welding arc": "Arco de soldadura",
  "NDT/X-ray": "END/rayos X",
  NORM: "Material radiactivo natural (NORM)",
  "Infrared scanners": "Escáneres infrarrojos",
  Sun: "Sol",
  Plants: "Plantas",
  Insects: "Insectos",
  Needles: "Agujas",
  Reptiles: "Reptiles",
  Viruses: "Virus",
  Animals: "Animales",
  Mold: "Moho",
  "Bloodborne pathogens": "Patógenos transmitidos por la sangre",
  Birds: "Aves",
  Bacteria: "Bacterias",
  "Flammable/combustible": "Inflamable o combustible",
  "Toxic vapors/dusts/fibers/fumes": "Vapores, polvos, fibras o humos tóxicos",
  Corrosive: "Corrosivo",
  "Skin/eye irritants": "Irritantes de la piel o los ojos",
  "Designated substances, pipeline contaminants, spills, suspect soils":
    "Sustancias designadas, contaminantes de tuberías, derrames o suelos sospechosos",
  Reactive: "Reactivo",
  "Cold surfaces (Nitrogen, LNG, propane)":
    "Superficies frías (nitrógeno, GNL, propano)",
  "Hot surfaces (friction, heat sources)":
    "Superficies calientes (fricción, fuentes de calor)",
  "Hot emissions/vapors": "Emisiones o vapores calientes",
  "Weather conditions": "Condiciones climáticas",
  "Ignition sources": "Fuentes de ignición",
  "Knowledge/skill": "Conocimiento o habilidad",
  "Risk tolerance": "Tolerancia al riesgo",
  "Working alone": "Trabajo en solitario",
  Training: "Capacitación",
  Communication: "Comunicación",
  "Fit for duty": "Aptitud para el trabajo",
  "Deviation from plan": "Desviación del plan",
};

export const WORKER_REVIEW_COPY: Record<
  WorkerReviewLanguage,
  WorkerReviewCopy
> = {
  en: {
    locale: "en-US",
    languageAnnouncement: "Language changed to English.",
    languageControlLabel: "Worker review language",
    addWorkerTitle: "Add worker & sign",
    foreman: "FOREMAN",
    readOnly: "READ ONLY",
    signingFor: "Signing for",
    workerName: "Worker name",
    workerNameHelper: "joins today’s crew",
    workerNamePlaceholder: "First and last name",
    reviewNotice:
      "Read today’s AHA below. Ask the Person in charge about anything unclear before signing.",
    details: "DETAILS",
    personInCharge: "Person in charge",
    location: "Location",
    closestEmergencyCentre: "Closest emergency centre",
    emergencyNumber: "Emergency number",
    musterPoint: "Muster point",
    rescuePlanRequired: "Rescue plan required",
    workOrderPermit: "Work order / permit number",
    jhaProcedureNumbers: "JHA / procedure numbers",
    descriptionOfWork: "DESCRIPTION OF WORK",
    workLabel: (count) => `WORK — ${count} ${count === 1 ? "TASK" : "TASKS"}`,
    untitledTask: "Untitled task",
    hazards: "Hazards",
    controls: "Controls",
    noTasks: "No task rows entered.",
    energyLabel: (selected, total) => `ENERGY — ${selected} OF ${total}`,
    energyWheelHeading: "ENERGY WHEEL",
    energyWheelSelection: (selected, total) =>
      `${selected} of ${total} selected`,
    energyWheelHelper: "Mirrors today’s selections",
    energyWheelAccessibility: (selected, total) =>
      `Energy Wheel showing ${selected} of ${total} selected categories`,
    noExamples: "No examples marked",
    noEnergy: "No energy categories marked.",
    safetyCheck: "Safety check",
    meetingNotes: "ON-SITE MEETING NOTES",
    notEntered: "Not entered",
    notAnswered: "Not answered",
    notApplicable: "Not applicable",
    yes: "Yes",
    no: "No",
    acknowledgmentHeading: "Acknowledgment and signature",
    acknowledgmentHelper: "Review the statement, then sign below.",
    acknowledgment: WORKER_ACKNOWLEDGMENT,
    signAs: (name) => `Sign as ${name}`,
    signatureAreaLabel: "Signature drawing area. Sign here with your finger.",
    signaturePlaceholder: "Sign here with your finger",
    thisWorker: "this worker",
    clear: "Clear",
    confirmSignature: "CONFIRM SIGNATURE",
    saving: "SAVING…",
    backToCrew: "‹ Back to crew list",
    backToCompleted: "‹ Completed",
    signedCount: (signed, total) =>
      total === undefined ? `${signed} signed` : `${signed} of ${total} signed`,
    signingBanner: "SIGNING MODE — HAND THE DEVICE TO EACH CREW MEMBER",
    offline:
      "You’re offline. Your AHA is saved on this iPad and you can keep working.",
    discardAddedTitle: "Discard this worker and signature?",
    discardSignatureTitle: "Discard this unsigned signature?",
    discardAddedBody:
      "The worker has not been added. Entered name and signature ink will be cleared.",
    discardSignatureBody: "This can’t be undone.",
    cancel: "Cancel",
    keepSigning: "Keep signing",
    discard: "Discard",
    discardAndReturn: "Discard and return",
    errors: {
      capacity:
        "This won’t fit on the ITS sheet. Remove an absent worker before adding someone else.",
      fit: "This entry does not fit on the official ITS sheet. Shorten the worker name and try again.",
      pdf_check:
        "We couldn’t check the official PDF. The new signature has not been saved. Try again.",
      save_signature:
        "We couldn’t save this signature. It is still on this screen. Try again.",
      worker_add: "This worker could not be added.",
    },
  },
  es: {
    locale: "es-US",
    languageAnnouncement: "El idioma cambió a español.",
    languageControlLabel: "Idioma de revisión del trabajador",
    addWorkerTitle: "Agregar trabajador y firmar",
    foreman: "CAPATAZ",
    readOnly: "SOLO LECTURA",
    signingFor: "Firma correspondiente al",
    workerName: "Nombre del trabajador",
    workerNameHelper: "se agrega a la cuadrilla de hoy",
    workerNamePlaceholder: "Nombre y apellido",
    reviewNotice:
      "Lea el AHA de hoy a continuación. Los detalles específicos del trabajo aparecen exactamente como fueron escritos y no se traducen automáticamente. Antes de firmar, pida a la persona a cargo que le explique cualquier punto que no comprenda.",
    details: "DETALLES",
    personInCharge: "Persona a cargo",
    location: "Ubicación",
    closestEmergencyCentre: "Centro de emergencias más cercano",
    emergencyNumber: "Número de emergencia",
    musterPoint: "Punto de reunión",
    rescuePlanRequired: "Se requiere un plan de rescate",
    workOrderPermit: "Número de orden de trabajo / permiso",
    jhaProcedureNumbers: "Números de JHA / procedimientos",
    descriptionOfWork: "DESCRIPCIÓN DEL TRABAJO",
    workLabel: (count) =>
      `TRABAJO — ${count} ${count === 1 ? "TAREA" : "TAREAS"}`,
    untitledTask: "Tarea sin título",
    hazards: "Peligros",
    controls: "Controles",
    noTasks: "No se ingresaron tareas.",
    energyLabel: (selected, total) => `ENERGÍA — ${selected} DE ${total}`,
    energyWheelHeading: "RUEDA DE ENERGÍA",
    energyWheelSelection: (selected, total) =>
      `${selected} de ${total} seleccionadas`,
    energyWheelHelper: "Refleja las selecciones de hoy",
    energyWheelAccessibility: (selected, total) =>
      `Rueda de energía que muestra ${selected} de ${total} categorías seleccionadas`,
    noExamples: "No se marcaron ejemplos",
    noEnergy: "No se marcaron categorías de energía.",
    safetyCheck: "Verificación de seguridad",
    meetingNotes: "NOTAS DE LA REUNIÓN EN EL SITIO",
    notEntered: "No ingresado",
    notAnswered: "Sin responder",
    notApplicable: "No aplica",
    yes: "Sí",
    no: "No",
    acknowledgmentHeading: "Reconocimiento y firma",
    acknowledgmentHelper: "Revise la declaración y luego firme a continuación.",
    acknowledgment:
      "He revisado toda la documentación aplicable, los peligros del sitio y mis responsabilidades de seguir los planes de trabajo seguro para protegerme a mí mismo y a los demás mientras esté en el sitio.",
    signAs: (name) => `Firmar como ${name}`,
    signatureAreaLabel: "Área para dibujar la firma. Firme aquí con el dedo.",
    signaturePlaceholder: "Firme aquí con el dedo",
    thisWorker: "este trabajador",
    clear: "Borrar",
    confirmSignature: "CONFIRMAR FIRMA",
    saving: "GUARDANDO…",
    backToCrew: "‹ Volver a la cuadrilla",
    backToCompleted: "‹ Completado",
    signedCount: (signed, total) =>
      total === undefined
        ? `${signed} firmaron`
        : `${signed} de ${total} firmaron`,
    signingBanner:
      "MODO DE FIRMA — ENTREGUE EL DISPOSITIVO A CADA MIEMBRO DE LA CUADRILLA",
    offline:
      "No tiene conexión. Su AHA está guardado en este iPad y puede continuar.",
    discardAddedTitle: "¿Descartar este trabajador y la firma?",
    discardSignatureTitle: "¿Descartar esta firma sin guardar?",
    discardAddedBody:
      "El trabajador no se ha agregado. Se borrarán el nombre ingresado y la firma.",
    discardSignatureBody: "Esta acción no se puede deshacer.",
    cancel: "Cancelar",
    keepSigning: "Seguir firmando",
    discard: "Descartar",
    discardAndReturn: "Descartar y volver",
    errors: {
      capacity:
        "Esto no cabe en la hoja de ITS. Quite a un trabajador ausente antes de agregar a otra persona.",
      fit: "Esta información no cabe en la hoja oficial de ITS. Acorte el nombre del trabajador e inténtelo de nuevo.",
      pdf_check:
        "No pudimos revisar el PDF oficial. La nueva firma no se guardó. Inténtelo de nuevo.",
      save_signature:
        "No pudimos guardar esta firma. La firma sigue en esta pantalla. Inténtelo de nuevo.",
      worker_add: "No se pudo agregar a este trabajador.",
    },
  },
};

export function getWorkerReviewCopy(
  language: WorkerReviewLanguage,
): WorkerReviewCopy {
  return WORKER_REVIEW_COPY[language];
}

export function workerReviewEnergyCategory(
  category: EnergyCategoryName,
  language: WorkerReviewLanguage,
): string {
  return language === "es" ? SPANISH_ENERGY_CATEGORIES[category] : category;
}

export function workerReviewEnergyExample(
  example: string,
  language: WorkerReviewLanguage,
): string {
  return language === "es"
    ? (SPANISH_ENERGY_EXAMPLES[example as CanonicalEnergyExample] ?? example)
    : example;
}

export const WORKER_REVIEW_SPANISH_ENERGY_CATEGORIES =
  SPANISH_ENERGY_CATEGORIES;
export const WORKER_REVIEW_SPANISH_ENERGY_EXAMPLES = SPANISH_ENERGY_EXAMPLES;
