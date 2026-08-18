export const ENERGY_CATEGORIES = [
  {
    category: "Gravity",
    examples: [
      "Excavation cave-in",
      "Falling or sliding materials/objects",
      "Slips/trips/falls",
      "Working at heights",
    ],
  },
  {
    category: "Motion",
    examples: [
      "Wind",
      "Road/ground conditions",
      "Flying particles/debris",
      "Simultaneous operations",
      "Watercourses",
      "Ergonomics",
      "Congestion",
      "Vehicles/vessels/mobile equipment",
    ],
  },
  {
    category: "Mechanical",
    examples: [
      "Tool/equipment nip points/pinch points",
      "Vibration",
      "Rotating equipment",
    ],
  },
  {
    category: "Electrical",
    examples: [
      "Electrical equipment/lines - normal or abnormal condition (shock or arc flash)",
      "Non-intrinsically safe tools/equipment",
      "Static electricity",
      "Induced voltage",
    ],
  },
  {
    category: "Pressure",
    examples: [
      "Compressed cylinders",
      "Pressurized piping/hoses/equipment",
      "Tanks/vessels",
      "Pressure relief systems",
    ],
  },
  {
    category: "Sound",
    examples: ["Tools/equipment", "Pressure relief systems", "Purging"],
  },
  {
    category: "Radiation",
    examples: ["Welding arc", "NDT/X-ray", "NORM", "Infrared scanners", "Sun"],
  },
  {
    category: "Biological",
    examples: [
      "Plants",
      "Insects",
      "Needles",
      "Reptiles",
      "Viruses",
      "Animals",
      "Mold",
      "Bloodborne pathogens",
      "Birds",
      "Bacteria",
    ],
  },
  {
    category: "Chemical",
    examples: [
      "Flammable/combustible",
      "Toxic vapors/dusts/fibers/fumes",
      "Corrosive",
      "Skin/eye irritants",
      "Designated substances, pipeline contaminants, spills, suspect soils",
      "Reactive",
    ],
  },
  {
    category: "Temperature",
    examples: [
      "Cold surfaces (Nitrogen, LNG, propane)",
      "Hot surfaces (friction, heat sources)",
      "Hot emissions/vapors",
      "Weather conditions",
      "Ignition sources",
    ],
  },
  {
    category: "Human factors",
    examples: [
      "Knowledge/skill",
      "Risk tolerance",
      "Working alone",
      "Training",
      "Communication",
      "Fit for duty",
      "Deviation from plan",
    ],
  },
] as const;

export const ENERGY_CATEGORY_NAMES = ENERGY_CATEGORIES.map(
  ({ category }) => category,
) as [
  "Gravity",
  "Motion",
  "Mechanical",
  "Electrical",
  "Pressure",
  "Sound",
  "Radiation",
  "Biological",
  "Chemical",
  "Temperature",
  "Human factors",
];

export type EnergyCategoryName = (typeof ENERGY_CATEGORY_NAMES)[number];

export const WORKER_ACKNOWLEDGMENT =
  "I have reviewed all applicable documentation, site hazards, and my responsibilities to follow safe work plans to protect myself and others while on site.";

export const SAFETY_GATE_QUESTION =
  "Have all known hazards been identified and addressed using the Energy Wheel?";

export const MAX_TASKS = 15;
export const MAX_CREW_MEMBERS = 10;
