export const configuracionSectores = {
  enfermero: {
    sectoresFijos: [
      "REA 1", "EXPLORA 1", "1-3 + 21", "PRE INT 1", "DX 25-30",
      "8-13", "4-7", "SILLÓN 1", "14-19", "REA 2",
      "SILLON 2", "20-22-24", "PRE INT 2", "EXPLORA 2", "SM"
    ],
    turnantes: ["T1", "T2", "T3", "T4", "T5"],
    posicionesTurnantes: [2, 5, 7, 11, 14],
    sectoresCriticos: [
      "REA 1", "EXPLORA 1", "1-3 + 21", "PRE INT 1", "DX 25-30",
      "8-13", "4-7", "SILLÓN 1", "14-19", "20-22-24", "SM"
    ],
    sectoresBajaPrioridad: ["REA 2", "PRE INT 2", "EXPLORA 2", "SILLON 2"],
    sectoresParo: [
      "1 al 3 + 19 al 22",
      "4 al 10",
      "11 al 18",
      "23 al 30",
      "Explora",
      "Sillones",
      "Rea"
    ],
    prioridadesParo: {
      "1 al 3 + 19 al 22": ["1-3 + 21", "20-22-24"],
      "4 al 10": ["4-7", "8-13"],
      "11 al 18": ["14-19", "8-13"],
      "23 al 30": ["DX 25-30", "20-22-24"],
      Explora: ["EXPLORA 1", "EXPLORA 2"],
      Sillones: ["SILLÓN 1", "SILLON 2"],
      Rea: ["REA 1", "REA 2"]
    },
    ordenVisual: [
      "REA 1", "REA 2", "DIVIDER",
      "1-3 + 21", "4-7", "8-13", "14-19", "20-22-24", "DX 25-30", "DIVIDER",
      "EXPLORA 1", "EXPLORA 2", "DIVIDER",
      "SILLÓN 1", "SILLON 2", "SILLONES 3", "DIVIDER",
      "PRE INT 1", "PRE INT 2", "SM", "DIVIDER",
      "SIN ASIGNAR"
    ],
    ordenPDF: [
      "REA 1", "REA 2", "1-3 + 21", "4-7", "8-13", "14-19", "20-22-24",
      "DX 25-30", "SILLÓN 1", "SILLON 2", "EXPLORA 1", "EXPLORA 2",
      "PRE INT 1", "PRE INT 2", "SM", "T1", "T2", "T3", "T4", "T5"
    ]
  },
  licenciado: {
    sectoresFijos: [
      "Triage 1", "Estabiliza", "Reanimación + Sillones", "Observación 1", "Explora",
      "Triage 2", "Diagnostico", "Observación 2", "Preinternación", "Salud Mental"
    ],
    turnantes: ["T1", "T2", "T3"],
    posicionesTurnantes: [1, 7, 10],
    sectoresCriticos: ["Triage 1", "Estabiliza", "Reanimación + Sillones"],
    sectoresBajaPrioridad: ["Observación 2", "Preinternación", "Salud Mental"],
    sectoresParo: [
      "Triage",
      "Reanimación + Sillones",
      "Observación 1",
      "Observación 2",
      "SM + Preinternación"
    ],
    prioridadesParo: {
      Triage: ["Triage 1", "Triage 2"],
      "Reanimación + Sillones": ["Reanimación + Sillones", "Estabiliza"],
      "Observación 1": ["Observación 1"],
      "Observación 2": ["Observación 2"],
      "SM + Preinternación": ["Salud Mental", "Preinternación"]
    },
    ordenVisual: [
      "Triage 1", "Triage 2", "DIVIDER",
      "Estabiliza", "Reanimación + Sillones", "DIVIDER",
      "Observación 1", "Observación 2", "DIVIDER",
      "Explora", "Diagnostico", "DIVIDER",
      "Preinternación", "Salud Mental", "DIVIDER",
      "SIN ASIGNAR"
    ],
    // Se conserva el orden histórico del PDF, que no incluye T3.
    ordenPDF: [
      "Triage 1", "Triage 2", "Reanimación + Sillones", "Estabiliza", "Observación 1",
      "Observación 2", "Diagnostico", "Explora", "Preinternación", "Salud Mental", "T1", "T2"
    ]
  }
};
