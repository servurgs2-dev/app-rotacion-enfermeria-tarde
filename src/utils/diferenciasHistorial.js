const SECCIONES_CONOCIDAS = Object.freeze([
  "personal",
  "planillas",
  "calendario",
  "licencias",
  "certificaciones"
]);
const LIMITE_DETALLES_PREDETERMINADO = 200;
const PRESUPUESTO_PREDETERMINADO = 10_000;
const PRESUPUESTO_MAXIMO = 100_000;
const PROFUNDIDAD_DETECCION_MAXIMA = 12;
const NODOS_VISTA_PREVIA_POR_CAMPO = 50;
const NODOS_VISTA_PREVIA_GLOBALES = 1_000;
const PROFUNDIDAD_VISTA_PREVIA_MAXIMA = 6;
const CONTENIDO_OMITIDO = "[contenido omitido por límite]";

const esObjeto = (valor) =>
  Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

const crearAcumulador = (limite, presupuesto) => ({
  limite,
  presupuesto,
  nodosVisitados: 0,
  nodosVistaPrevia: 0,
  totalDetalles: 0,
  detallesIncluidos: 0,
  truncado: false,
  analisisIncompleto: false,
  seccionesCambiadas: new Set(),
  totales: { agregados: 0, eliminados: 0, modificados: 0 },
  detalle: Object.fromEntries(SECCIONES_CONOCIDAS.map((seccion) => [seccion, []]))
});

const consumirNodo = (acumulador) => {
  if (acumulador.nodosVisitados >= acumulador.presupuesto) {
    acumulador.truncado = true;
    acumulador.analisisIncompleto = true;
    return false;
  }
  acumulador.nodosVisitados += 1;
  return true;
};

const crearVistaPreviaAcotada = (
  valor,
  acumulador,
  profundidad = 0,
  estadoLocal = { nodos: 0, omitido: false }
) => {
  const sinPresupuesto =
    estadoLocal.nodos >= NODOS_VISTA_PREVIA_POR_CAMPO ||
    acumulador.nodosVistaPrevia >= NODOS_VISTA_PREVIA_GLOBALES ||
    profundidad > PROFUNDIDAD_VISTA_PREVIA_MAXIMA;
  if (sinPresupuesto) {
    estadoLocal.omitido = true;
    acumulador.truncado = true;
    return CONTENIDO_OMITIDO;
  }

  estadoLocal.nodos += 1;
  acumulador.nodosVistaPrevia += 1;
  if (Array.isArray(valor)) {
    const salida = [];
    for (const elemento of valor) {
      if (
        estadoLocal.nodos >= NODOS_VISTA_PREVIA_POR_CAMPO ||
        acumulador.nodosVistaPrevia >= NODOS_VISTA_PREVIA_GLOBALES
      ) {
        estadoLocal.omitido = true;
        acumulador.truncado = true;
        salida.push(CONTENIDO_OMITIDO);
        break;
      }
      salida.push(
        crearVistaPreviaAcotada(
          elemento,
          acumulador,
          profundidad + 1,
          estadoLocal
        )
      );
    }
    return salida;
  }
  if (!esObjeto(valor)) return valor;

  const salida = {};
  for (const clave in valor) {
    if (!Object.hasOwn(valor, clave)) continue;
    if (
      estadoLocal.nodos >= NODOS_VISTA_PREVIA_POR_CAMPO ||
      acumulador.nodosVistaPrevia >= NODOS_VISTA_PREVIA_GLOBALES
    ) {
      estadoLocal.omitido = true;
      acumulador.truncado = true;
      salida.__contenidoOmitido = CONTENIDO_OMITIDO;
      break;
    }
    salida[clave] = crearVistaPreviaAcotada(
      valor[clave],
      acumulador,
      profundidad + 1,
      estadoLocal
    );
  }
  return salida;
};

const agregarVistasPrevias = (
  acumulador,
  cambio,
  { anterior, nuevo, incluirAnterior = false, incluirNuevo = false }
) => {
  let contenidoOmitido = false;
  if (incluirAnterior) {
    const estado = { nodos: 0, omitido: false };
    cambio.anterior = crearVistaPreviaAcotada(anterior, acumulador, 0, estado);
    contenidoOmitido ||= estado.omitido;
  }
  if (incluirNuevo) {
    const estado = { nodos: 0, omitido: false };
    cambio.nuevo = crearVistaPreviaAcotada(nuevo, acumulador, 0, estado);
    contenidoOmitido ||= estado.omitido;
  }
  if (contenidoOmitido) cambio.contenidoOmitido = true;
  return cambio;
};

const obtenerClavesAcotadas = (valor, acumulador) => {
  const claves = [];
  for (const clave in valor) {
    if (!Object.hasOwn(valor, clave)) continue;
    if (claves.length >= acumulador.presupuesto - acumulador.nodosVisitados) {
      acumulador.truncado = true;
      acumulador.analisisIncompleto = true;
      break;
    }
    claves.push(clave);
  }
  return claves.sort();
};

const canonizarConPresupuesto = (
  valor,
  acumulador,
  profundidad = 0
) => {
  if (!consumirNodo(acumulador)) return { completo: false, valor: null };
  if (profundidad > PROFUNDIDAD_DETECCION_MAXIMA) {
    acumulador.truncado = true;
    acumulador.analisisIncompleto = true;
    return { completo: false, valor: null };
  }
  if (Array.isArray(valor)) {
    const salida = [];
    for (const elemento of valor) {
      const resultado = canonizarConPresupuesto(
        elemento,
        acumulador,
        profundidad + 1
      );
      if (!resultado.completo) return resultado;
      salida.push(resultado.valor);
    }
    return { completo: true, valor: salida };
  }
  if (!esObjeto(valor)) return { completo: true, valor: valor ?? null };

  const salida = {};
  for (const clave of obtenerClavesAcotadas(valor, acumulador)) {
    const resultado = canonizarConPresupuesto(
      valor[clave],
      acumulador,
      profundidad + 1
    );
    if (!resultado.completo) return resultado;
    salida[clave] = resultado.valor;
  }
  return { completo: true, valor: salida };
};

const crearFirmaCanonica = (valor, acumulador) => {
  const resultado = canonizarConPresupuesto(valor, acumulador);
  return resultado.completo ? JSON.stringify(resultado.valor) : null;
};

const obtenerIdentidadEstable = (elemento) => {
  if (!esObjeto(elemento)) return null;
  for (const clave of ["id", "personaId", "uuid", "key"]) {
    const valor = String(elemento[clave] ?? "").trim();
    if (valor) return `${clave}:${valor}`;
  }
  return null;
};

const agregarCambio = (acumulador, seccion, cambio) => {
  acumulador.seccionesCambiadas.add(seccion);
  acumulador.totales[
    cambio.tipo === "agregado"
      ? "agregados"
      : cambio.tipo === "eliminado"
        ? "eliminados"
        : "modificados"
  ] += 1;
  acumulador.totalDetalles += 1;
  if (acumulador.detallesIncluidos < acumulador.limite) {
    acumulador.detalle[seccion].push(cambio);
    acumulador.detallesIncluidos += 1;
  } else {
    acumulador.truncado = true;
  }
};

const agruparPorIdentidad = (lista, acumulador) => {
  const estables = new Map();
  const sinIdentidad = [];
  for (const elemento of lista) {
    if (!consumirNodo(acumulador)) break;
    const identidad = obtenerIdentidadEstable(elemento);
    if (identidad) estables.set(identidad, elemento);
    else sinIdentidad.push(elemento);
  }
  return { estables, sinIdentidad };
};

const crearMulticonjunto = (lista, acumulador) => {
  const firmas = new Map();
  for (const elemento of lista) {
    const firma = crearFirmaCanonica(elemento, acumulador);
    if (firma === null) break;
    const grupo = firmas.get(firma) ?? { cantidad: 0, elementos: [] };
    grupo.cantidad += 1;
    grupo.elementos.push(elemento);
    firmas.set(firma, grupo);
  }
  return firmas;
};

const compararSinIdentidad = ({
  anterior,
  nuevo,
  seccion,
  acumulador,
  etiqueta
}) => {
  const firmasAnteriores = crearMulticonjunto(anterior, acumulador);
  if (acumulador.analisisIncompleto) return;
  const firmasNuevas = crearMulticonjunto(nuevo, acumulador);
  if (acumulador.analisisIncompleto) return;
  const firmas = [...new Set([
    ...firmasAnteriores.keys(),
    ...firmasNuevas.keys()
  ])].sort();

  for (const firma of firmas) {
    if (!consumirNodo(acumulador)) return;
    const previos = firmasAnteriores.get(firma);
    const siguientes = firmasNuevas.get(firma);
    const diferencia = (siguientes?.cantidad ?? 0) - (previos?.cantidad ?? 0);
    for (let indice = 0; indice < Math.abs(diferencia); indice += 1) {
      if (diferencia > 0) {
        agregarCambio(
          acumulador,
          seccion,
          agregarVistasPrevias(
            acumulador,
            {
              tipo: "agregado",
              identidad: null,
              descripcion: `${etiqueta} agregado`
            },
            {
              nuevo: siguientes.elementos[indice],
              incluirNuevo: true
            }
          )
        );
      } else {
        agregarCambio(
          acumulador,
          seccion,
          agregarVistasPrevias(
            acumulador,
            {
              tipo: "eliminado",
              identidad: null,
              descripcion: `${etiqueta} eliminado`
            },
            {
              anterior: previos.elementos[indice],
              incluirAnterior: true
            }
          )
        );
      }
    }
  }
};

const compararColeccion = ({
  anterior,
  nuevo,
  seccion,
  acumulador,
  etiqueta
}) => {
  const listaAnterior = Array.isArray(anterior) ? anterior : [];
  const listaNueva = Array.isArray(nuevo) ? nuevo : [];
  const gruposAnteriores = agruparPorIdentidad(listaAnterior, acumulador);
  if (acumulador.analisisIncompleto) return;
  const gruposNuevos = agruparPorIdentidad(listaNueva, acumulador);
  if (acumulador.analisisIncompleto) return;
  const identidades = [...new Set([
    ...gruposAnteriores.estables.keys(),
    ...gruposNuevos.estables.keys()
  ])].sort();

  for (const identidad of identidades) {
    if (!consumirNodo(acumulador)) return;
    const valorAnterior = gruposAnteriores.estables.get(identidad);
    const valorNuevo = gruposNuevos.estables.get(identidad);
    if (valorAnterior === undefined) {
      agregarCambio(
        acumulador,
        seccion,
        agregarVistasPrevias(
          acumulador,
          { tipo: "agregado", identidad, descripcion: `${etiqueta} agregado` },
          { nuevo: valorNuevo, incluirNuevo: true }
        )
      );
    } else if (valorNuevo === undefined) {
      agregarCambio(
        acumulador,
        seccion,
        agregarVistasPrevias(
          acumulador,
          { tipo: "eliminado", identidad, descripcion: `${etiqueta} eliminado` },
          { anterior: valorAnterior, incluirAnterior: true }
        )
      );
    } else {
      const firmaAnterior = crearFirmaCanonica(valorAnterior, acumulador);
      const firmaNueva = crearFirmaCanonica(valorNuevo, acumulador);
      if (firmaAnterior === null || firmaNueva === null) return;
      if (firmaAnterior !== firmaNueva) {
        const campos = [...new Set([
          ...Object.keys(valorAnterior),
          ...Object.keys(valorNuevo)
        ])]
          .filter((campo) => {
            const anteriorCampo = crearFirmaCanonica(valorAnterior[campo], acumulador);
            const nuevoCampo = crearFirmaCanonica(valorNuevo[campo], acumulador);
            return anteriorCampo === null ||
              nuevoCampo === null ||
              anteriorCampo !== nuevoCampo;
          })
          .sort();
        if (acumulador.analisisIncompleto) return;
        agregarCambio(
          acumulador,
          seccion,
          agregarVistasPrevias(
            acumulador,
            {
              tipo: "modificado",
              identidad,
              descripcion: `${etiqueta} modificado`,
              campos
            },
            {
              anterior: valorAnterior,
              nuevo: valorNuevo,
              incluirAnterior: true,
              incluirNuevo: true
            }
          )
        );
      }
    }
  }

  compararSinIdentidad({
    anterior: gruposAnteriores.sinIdentidad,
    nuevo: gruposNuevos.sinIdentidad,
    seccion,
    acumulador,
    etiqueta
  });
};

const recorrerHojas = (
  valor,
  acumulador,
  ruta = [],
  salida = new Map(),
  profundidad = 0
) => {
  if (!consumirNodo(acumulador)) return salida;
  if (profundidad > PROFUNDIDAD_DETECCION_MAXIMA) {
    acumulador.truncado = true;
    acumulador.analisisIncompleto = true;
    return salida;
  }
  if (!esObjeto(valor)) {
    salida.set(ruta.join("."), valor);
    return salida;
  }
  const claves = obtenerClavesAcotadas(valor, acumulador);
  if (claves.length === 0) salida.set(ruta.join("."), valor);
  for (const clave of claves) {
    if (acumulador.analisisIncompleto) break;
    recorrerHojas(
      valor[clave],
      acumulador,
      [...ruta, clave],
      salida,
      profundidad + 1
    );
  }
  return salida;
};

const compararEstructura = ({
  anterior,
  nuevo,
  seccion,
  acumulador,
  etiqueta
}) => {
  const hojasAnterior = recorrerHojas(
    esObjeto(anterior) ? anterior : {},
    acumulador
  );
  if (acumulador.analisisIncompleto) return;
  const hojasNuevas = recorrerHojas(esObjeto(nuevo) ? nuevo : {}, acumulador);
  if (acumulador.analisisIncompleto) return;
  const rutas = [...new Set([...hojasAnterior.keys(), ...hojasNuevas.keys()])].sort();
  for (const ruta of rutas) {
    if (!consumirNodo(acumulador)) return;
    const existeAnterior = hojasAnterior.has(ruta);
    const existeNueva = hojasNuevas.has(ruta);
    const valorAnterior = hojasAnterior.get(ruta);
    const valorNuevo = hojasNuevas.get(ruta);
    const firmaAnterior = crearFirmaCanonica(valorAnterior, acumulador);
    const firmaNueva = crearFirmaCanonica(valorNuevo, acumulador);
    if (firmaAnterior === null || firmaNueva === null) return;
    if (existeAnterior && existeNueva && firmaAnterior === firmaNueva) continue;
    agregarCambio(
      acumulador,
      seccion,
      agregarVistasPrevias(
        acumulador,
        {
          tipo: !existeAnterior
            ? "agregado"
            : !existeNueva
              ? "eliminado"
              : "modificado",
          ruta,
          descripcion: `${etiqueta}: ${ruta || "contenido general"}`
        },
        {
          anterior: valorAnterior,
          nuevo: valorNuevo,
          incluirAnterior: existeAnterior,
          incluirNuevo: existeNueva
        }
      )
    );
  }
};

export const compararSnapshotsMensuales = (
  snapshotAnterior,
  snapshotNuevo,
  {
    limiteDetalles = LIMITE_DETALLES_PREDETERMINADO,
    presupuestoProcesamiento = PRESUPUESTO_PREDETERMINADO
  } = {}
) => {
  const limite =
    Number.isInteger(limiteDetalles) && limiteDetalles > 0
      ? Math.min(limiteDetalles, 1000)
      : LIMITE_DETALLES_PREDETERMINADO;
  const presupuesto =
    Number.isInteger(presupuestoProcesamiento) && presupuestoProcesamiento > 0
      ? Math.min(presupuestoProcesamiento, PRESUPUESTO_MAXIMO)
      : PRESUPUESTO_PREDETERMINADO;
  const anterior = esObjeto(snapshotAnterior) ? snapshotAnterior : {};
  const nuevo = esObjeto(snapshotNuevo) ? snapshotNuevo : {};
  const acumulador = crearAcumulador(limite, presupuesto);

  compararColeccion({
    anterior: anterior.personal,
    nuevo: nuevo.personal,
    seccion: "personal",
    acumulador,
    etiqueta: "Persona"
  });
  if (!acumulador.analisisIncompleto) {
    compararColeccion({
      anterior: anterior.licencias,
      nuevo: nuevo.licencias,
      seccion: "licencias",
      acumulador,
      etiqueta: "Licencia"
    });
  }
  if (!acumulador.analisisIncompleto) {
    compararColeccion({
      anterior: anterior.certificaciones,
      nuevo: nuevo.certificaciones,
      seccion: "certificaciones",
      acumulador,
      etiqueta: "Certificación"
    });
  }
  if (!acumulador.analisisIncompleto) {
    compararEstructura({
      anterior: anterior.planillas,
      nuevo: nuevo.planillas,
      seccion: "planillas",
      acumulador,
      etiqueta: "Asignación de planilla"
    });
  }
  if (!acumulador.analisisIncompleto) {
    compararEstructura({
      anterior: anterior.calendario,
      nuevo: nuevo.calendario,
      seccion: "calendario",
      acumulador,
      etiqueta: "Calendario"
    });
  }

  const seccionesDesconocidas = [];
  if (!acumulador.analisisIncompleto) {
    const candidatas = [...new Set([
      ...Object.keys(anterior),
      ...Object.keys(nuevo)
    ])]
      .filter((seccion) => !SECCIONES_CONOCIDAS.includes(seccion))
      .sort();
    for (const seccion of candidatas) {
      const firmaAnterior = crearFirmaCanonica(anterior[seccion], acumulador);
      const firmaNueva = crearFirmaCanonica(nuevo[seccion], acumulador);
      if (firmaAnterior === null || firmaNueva === null) break;
      if (firmaAnterior !== firmaNueva) seccionesDesconocidas.push(seccion);
    }
  }

  const seccionesCambiadas = [
    ...SECCIONES_CONOCIDAS.filter((seccion) =>
      acumulador.seccionesCambiadas.has(seccion)
    ),
    ...seccionesDesconocidas
  ];

  return {
    seccionesCambiadas,
    resumen: seccionesCambiadas.map(
      (seccion) => `Se modificó la sección ${seccion}.`
    ),
    totales: { ...acumulador.totales },
    detalle: acumulador.detalle,
    totalDetalles: acumulador.totalDetalles,
    truncado: acumulador.truncado,
    analisisIncompleto: acumulador.analisisIncompleto,
    nodosVisitados: acumulador.nodosVisitados,
    nodosVistaPrevia: acumulador.nodosVistaPrevia
  };
};

export const LIMITES_DIFERENCIAS_HISTORIAL = Object.freeze({
  detallesPredeterminado: LIMITE_DETALLES_PREDETERMINADO,
  presupuestoPredeterminado: PRESUPUESTO_PREDETERMINADO,
  presupuestoMaximo: PRESUPUESTO_MAXIMO,
  vistaPreviaPorCampo: NODOS_VISTA_PREVIA_POR_CAMPO,
  vistaPreviaGlobal: NODOS_VISTA_PREVIA_GLOBALES
});
