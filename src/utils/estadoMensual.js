const esObjetoValido = (valor) =>
  Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

const clonarValor = (valor) => {
  if (Array.isArray(valor)) return valor.map(clonarValor);

  if (esObjetoValido(valor)) {
    return Object.fromEntries(
      Object.entries(valor).map(([clave, contenido]) => [clave, clonarValor(contenido)])
    );
  }

  return valor;
};

export const crearPlanillaMensualVacia = () => ({
  semana1: {},
  semana2: {},
  semana3: {},
  semana4: {},
  semana5: {},
  semana6: {}
});

const crearCalendarioCategoriaVacio = () => ({
  cambiosDia: {},
  cambiosParoDia: {},
  extras: {},
  noDisponibles: {}
});

export const crearEstadoMensualVacio = () => ({
  personal: [],
  planillas: {
    enfermeros: crearPlanillaMensualVacia(),
    licenciados: crearPlanillaMensualVacia()
  },
  calendario: {
    diasParo: {},
    enfermeros: crearCalendarioCategoriaVacio(),
    licenciados: crearCalendarioCategoriaVacio()
  },
  licencias: [],
  certificaciones: []
});

const normalizarPlanilla = (planilla) => {
  const normalizada = esObjetoValido(planilla) ? clonarValor(planilla) : {};

  Object.keys(normalizada).forEach((clave) => {
    if (clave.startsWith("semana") && !esObjetoValido(normalizada[clave])) {
      normalizada[clave] = {};
    }
  });

  Object.keys(crearPlanillaMensualVacia()).forEach((clave) => {
    if (!esObjetoValido(normalizada[clave])) normalizada[clave] = {};
  });

  return normalizada;
};

const normalizarCalendarioCategoria = (calendario) => {
  const normalizado = esObjetoValido(calendario) ? clonarValor(calendario) : {};

  Object.keys(crearCalendarioCategoriaVacio()).forEach((clave) => {
    if (!esObjetoValido(normalizado[clave])) normalizado[clave] = {};
  });

  return normalizado;
};

export const normalizarEstadoMensual = (estado) => {
  if (!esObjetoValido(estado)) return crearEstadoMensualVacio();

  const normalizado = clonarValor(estado);
  const planillas = esObjetoValido(normalizado.planillas) ? normalizado.planillas : {};
  const calendario = esObjetoValido(normalizado.calendario) ? normalizado.calendario : {};

  normalizado.personal = Array.isArray(normalizado.personal) ? normalizado.personal : [];
  normalizado.licencias = Array.isArray(normalizado.licencias) ? normalizado.licencias : [];
  normalizado.certificaciones = Array.isArray(normalizado.certificaciones)
    ? normalizado.certificaciones
    : [];

  normalizado.planillas = {
    ...planillas,
    enfermeros: normalizarPlanilla(planillas.enfermeros),
    licenciados: normalizarPlanilla(planillas.licenciados)
  };

  normalizado.calendario = {
    ...calendario,
    diasParo: esObjetoValido(calendario.diasParo) ? calendario.diasParo : {},
    enfermeros: normalizarCalendarioCategoria(calendario.enfermeros),
    licenciados: normalizarCalendarioCategoria(calendario.licenciados)
  };

  return normalizado;
};
