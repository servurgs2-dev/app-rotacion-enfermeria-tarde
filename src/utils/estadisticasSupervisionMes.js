const ESTADOS_DOTACION = Object.freeze(["critico", "bajo_optimo", "optimo"]);

const lista = (valor) => Array.isArray(valor) ? valor : [];
const numeroValido = (valor) => Number.isFinite(valor) ? valor : null;
const codigo = (item) => String(item?.codigo || "SIN_CODIGO");

const incrementarCodigo = (conteos, item) => {
  const clave = codigo(item);
  conteos[clave] = (conteos[clave] || 0) + 1;
};

const descubrirEstructura = (dias) => {
  const categoriasPorTurno = new Map();
  dias.forEach((dia) => {
    Object.entries(dia?.turnos || {}).forEach(([turno, datosTurno]) => {
      if (!categoriasPorTurno.has(turno)) categoriasPorTurno.set(turno, new Set());
      Object.entries(datosTurno || {}).forEach(([categoria, datosCategoria]) => {
        if (datosCategoria && typeof datosCategoria === "object" &&
          ("proyeccion" in datosCategoria || "estadoDotacion" in datosCategoria)) {
          categoriasPorTurno.get(turno).add(categoria);
        }
      });
    });
  });
  return categoriasPorTurno;
};

const crearAcumulador = (diasTotales) => ({
  diasTotales,
  diasConDatos: 0,
  diasSinDatos: 0,
  estados: { criticos: 0, bajoOptimo: 0, optimos: 0 },
  minimoOperativo: null,
  maximoOperativo: null,
  fechasMinimoOperativo: [],
  fechasMaximoOperativo: [],
  promedioOperativo: null,
  promedioBase: null,
  deficitPromedio: null,
  deficitMaximo: null,
  fechasDeficitMaximo: [],
  combinacionesConAdvertencias: 0,
  _sumaOperativa: 0,
  _sumaBase: 0,
  _sumaDeficit: 0
});

const actualizarExtremo = (acumulador, campo, campoFechas, cantidad, fecha, comparar) => {
  const actual = acumulador[campo];
  if (actual === null || comparar(cantidad, actual)) {
    acumulador[campo] = cantidad;
    acumulador[campoFechas] = [fecha];
  } else if (cantidad === actual) {
    acumulador[campoFechas].push(fecha);
  }
};

const obtenerDeficit = (datosCategoria, cantidad) => {
  const directo = numeroValido(datosCategoria?.estadoDotacion?.faltanParaMinimo);
  if (directo !== null) return Math.max(0, directo);
  const minimo = numeroValido(datosCategoria?.umbral?.minimo);
  return minimo === null ? 0 : Math.max(0, minimo - cantidad);
};

const finalizarAcumulador = (acumulador) => {
  const { _sumaOperativa, _sumaBase, _sumaDeficit, ...resultado } = acumulador;
  if (resultado.diasConDatos > 0) {
    resultado.promedioOperativo = _sumaOperativa / resultado.diasConDatos;
    resultado.promedioBase = _sumaBase / resultado.diasConDatos;
    resultado.deficitPromedio = _sumaDeficit / resultado.diasConDatos;
    if (resultado.deficitMaximo === 0) resultado.fechasDeficitMaximo = [];
  }
  return resultado;
};

const calidadVacia = () => ({
  advertenciasTotal: 0,
  erroresTotal: 0,
  advertenciasPorCodigo: {},
  erroresPorCodigo: {},
  diasConAdvertencias: 0,
  combinacionesConAdvertencias: 0
});

const resumenVacio = () => ({
  combinacionesTotales: 0,
  combinacionesConDatos: 0,
  combinacionesSinDatos: 0,
  combinacionesCriticas: 0,
  combinacionesBajoOptimo: 0,
  combinacionesOptimas: 0,
  diasConAlgunCritico: 0,
  combinacionesConAdvertencias: 0
});

export const resumirEstadisticasSupervisionMes = (resultadoMensual) => {
  const mes = String(resultadoMensual?.mes || "");
  const erroresEntrada = lista(resultadoMensual?.errores);
  if (resultadoMensual?.ok !== true || !Array.isArray(resultadoMensual?.dias)) {
    const calidadDatos = calidadVacia();
    erroresEntrada.forEach((error) => {
      calidadDatos.erroresTotal += 1;
      incrementarCodigo(calidadDatos.erroresPorCodigo, error);
    });
    return {
      ok: false,
      mes,
      diasTotales: 0,
      fuente: "proyeccion_supervision_mes",
      turnos: {},
      resumenGeneral: resumenVacio(),
      calidadDatos,
      errores: erroresEntrada.map((error) => ({ ...error }))
    };
  }

  const dias = resultadoMensual.dias;
  const diasTotales = Number.isInteger(resultadoMensual.cantidadDias)
    ? resultadoMensual.cantidadDias
    : dias.length;
  const estructura = descubrirEstructura(dias);
  const acumuladores = Object.fromEntries([...estructura].map(([turno, categorias]) => [
    turno,
    Object.fromEntries([...categorias].map((categoria) => [categoria, crearAcumulador(diasTotales)]))
  ]));
  const resumenGeneral = resumenVacio();
  resumenGeneral.combinacionesTotales = diasTotales * [...estructura.values()]
    .reduce((total, categorias) => total + categorias.size, 0);
  const calidadDatos = calidadVacia();
  const diasAdvertidos = new Set();
  const combinacionesAdvertidas = new Set();
  const diasCriticos = new Set();

  erroresEntrada.forEach((error) => {
    calidadDatos.erroresTotal += 1;
    incrementarCodigo(calidadDatos.erroresPorCodigo, error);
  });

  dias.forEach((dia) => {
    const fecha = String(dia?.fecha || "");
    const advertenciasDia = lista(dia?.advertencias);
    const erroresDia = lista(dia?.errores);
    advertenciasDia.forEach((advertencia) => {
      calidadDatos.advertenciasTotal += 1;
      incrementarCodigo(calidadDatos.advertenciasPorCodigo, advertencia);
      diasAdvertidos.add(fecha);
      const turno = advertencia?.turno;
      const categoria = advertencia?.categoria;
      if (acumuladores?.[turno]?.[categoria]) {
        combinacionesAdvertidas.add(`${fecha}|${turno}|${categoria}`);
      }
    });
    erroresDia.forEach((error) => {
      calidadDatos.erroresTotal += 1;
      incrementarCodigo(calidadDatos.erroresPorCodigo, error);
    });

    Object.entries(acumuladores).forEach(([turno, categorias]) => {
      Object.entries(categorias).forEach(([categoria, acumulador]) => {
        const datos = dia?.turnos?.[turno]?.[categoria];
        const cantidad = numeroValido(datos?.proyeccion?.dotacionPrevistaOperativa?.cantidad);
        const base = numeroValido(datos?.proyeccion?.previstosBase?.cantidad);
        const estado = datos?.estadoDotacion?.estado;
        const disponible = datos?.disponible === true && cantidad !== null && base !== null &&
          estado !== "sin_datos";
        if (!disponible) {
          acumulador.diasSinDatos += 1;
          resumenGeneral.combinacionesSinDatos += 1;
          return;
        }

        acumulador.diasConDatos += 1;
        acumulador._sumaOperativa += cantidad;
        acumulador._sumaBase += base;
        resumenGeneral.combinacionesConDatos += 1;
        actualizarExtremo(acumulador, "minimoOperativo", "fechasMinimoOperativo", cantidad, fecha, (a, b) => a < b);
        actualizarExtremo(acumulador, "maximoOperativo", "fechasMaximoOperativo", cantidad, fecha, (a, b) => a > b);

        const deficit = obtenerDeficit(datos, cantidad);
        acumulador._sumaDeficit += deficit;
        if (acumulador.deficitMaximo === null || deficit > acumulador.deficitMaximo) {
          acumulador.deficitMaximo = deficit;
          acumulador.fechasDeficitMaximo = [fecha];
        } else if (deficit === acumulador.deficitMaximo) {
          acumulador.fechasDeficitMaximo.push(fecha);
        }

        if (ESTADOS_DOTACION.includes(estado)) {
          const campo = estado === "critico" ? "criticos" : estado === "bajo_optimo" ? "bajoOptimo" : "optimos";
          acumulador.estados[campo] += 1;
          if (estado === "critico") {
            resumenGeneral.combinacionesCriticas += 1;
            diasCriticos.add(fecha);
          } else if (estado === "bajo_optimo") {
            resumenGeneral.combinacionesBajoOptimo += 1;
          } else {
            resumenGeneral.combinacionesOptimas += 1;
          }
        }
      });
    });
  });

  combinacionesAdvertidas.forEach((clave) => {
    const [, turno, categoria] = clave.split("|");
    acumuladores[turno][categoria].combinacionesConAdvertencias += 1;
  });
  calidadDatos.diasConAdvertencias = diasAdvertidos.size;
  calidadDatos.combinacionesConAdvertencias = combinacionesAdvertidas.size;
  resumenGeneral.combinacionesConAdvertencias = combinacionesAdvertidas.size;
  resumenGeneral.diasConAlgunCritico = diasCriticos.size;

  return {
    ok: true,
    mes,
    diasTotales,
    fuente: "proyeccion_supervision_mes",
    turnos: Object.fromEntries(Object.entries(acumuladores).map(([turno, categorias]) => [
      turno,
      Object.fromEntries(Object.entries(categorias).map(([categoria, acumulador]) => [
        categoria,
        finalizarAcumulador(acumulador)
      ]))
    ])),
    resumenGeneral,
    calidadDatos,
    errores: erroresEntrada.map((error) => ({ ...error }))
  };
};
