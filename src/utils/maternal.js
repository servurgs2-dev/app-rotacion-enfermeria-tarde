export const TIPOS_MATERNAL = Object.freeze({
  NINGUNO: "ninguno",
  ENTRA_UNA_HORA_DESPUES: "entraUnaHoraDespues",
  SALE_UNA_HORA_ANTES: "saleUnaHoraAntes"
});

const VALORES_CANONICOS = new Set(Object.values(TIPOS_MATERNAL));

const AJUSTES_MATERNAL = Object.freeze({
  [TIPOS_MATERNAL.NINGUNO]: Object.freeze({ minutosEntrada: 0, minutosSalida: 0 }),
  [TIPOS_MATERNAL.ENTRA_UNA_HORA_DESPUES]: Object.freeze({
    minutosEntrada: 60,
    minutosSalida: 0
  }),
  [TIPOS_MATERNAL.SALE_UNA_HORA_ANTES]: Object.freeze({
    minutosEntrada: 0,
    minutosSalida: -60
  })
});

const ETIQUETAS_MATERNAL = Object.freeze({
  [TIPOS_MATERNAL.NINGUNO]: "Sin horario maternal",
  [TIPOS_MATERNAL.ENTRA_UNA_HORA_DESPUES]: "Entra 1 hora después",
  [TIPOS_MATERNAL.SALE_UNA_HORA_ANTES]: "Sale 1 hora antes"
});

export const normalizarMaternal = (valor) => {
  if (valor === true) return TIPOS_MATERNAL.SALE_UNA_HORA_ANTES;
  if (VALORES_CANONICOS.has(valor)) return valor;
  return TIPOS_MATERNAL.NINGUNO;
};

export const obtenerAjusteMaternal = (valor) =>
  AJUSTES_MATERNAL[normalizarMaternal(valor)];

export const obtenerEtiquetaMaternal = (valor) =>
  ETIQUETAS_MATERNAL[normalizarMaternal(valor)];
