import {
  validarRangosTurnoPropio,
  validarVigenciasPersonaMes
} from "../utils/vigenciasTurnoPersonal.js";
import { puedeMutarPeriodoMensual } from "../utils/proteccionTemporalMensual.js";

const CLAVES_RANGO_PERSISTIDO = ["desde", "hasta", "turno"];

const exigirPeriodoEditable = (mes, mesReferencia) => {
  if (!puedeMutarPeriodoMensual({ mes, mesReferencia })) {
    throw crearErrorDominio(
      "El período está fuera de la ventana habilitada para editar vigencias.",
      "MES_FUERA_DE_VENTANA"
    );
  }
};

const crearErrorDominio = (mensaje, codigo, detalles) => {
  const error = new TypeError(mensaje);
  error.codigo = codigo;
  if (detalles !== undefined) error.detalles = detalles;
  return error;
};

const textoRequerido = (valor, campo) => {
  const normalizado = typeof valor === "string" ? valor.trim() : "";
  if (!normalizado) {
    throw crearErrorDominio(`${campo} es requerido.`, `${campo.toUpperCase()}_INVALIDO`);
  }
  return normalizado;
};

const normalizarContexto = ({ mes, personaId }) => {
  const periodo = textoRequerido(mes, "mes");
  const identidad = textoRequerido(personaId, "personaId");
  const validacion = validarVigenciasPersonaMes({
    mes: periodo,
    personaId: identidad,
    vigencias: []
  });
  if (!validacion.valido) {
    throw crearErrorDominio(
      "La persona o el mes no son válidos.",
      "CONTEXTO_VIGENCIAS_INVALIDO",
      validacion.errores
    );
  }
  return { mes: periodo, personaId: identidad };
};

export const normalizarRevisionVigenciasTurno = (
  revision,
  { permitirCero = true } = {}
) => {
  const valor = typeof revision === "bigint"
    ? revision.toString()
    : typeof revision === "number" && Number.isSafeInteger(revision)
      ? String(revision)
      : typeof revision === "string" ? revision.trim() : "";
  if (!/^\d+$/.test(valor)) {
    throw crearErrorDominio(
      "La revisión debe ser un entero decimal no negativo.",
      "REVISION_INVALIDA"
    );
  }
  const normalizada = valor.replace(/^0+(?=\d)/, "");
  if (!permitirCero && normalizada === "0") {
    throw crearErrorDominio(
      "La revisión persistida debe ser mayor o igual a uno.",
      "REVISION_INVALIDA"
    );
  }
  return normalizada;
};

const esRangoPersistidoEstricto = (rango) => {
  if (!rango || typeof rango !== "object" || Array.isArray(rango)) return false;
  const claves = Object.keys(rango).sort();
  return claves.length === CLAVES_RANGO_PERSISTIDO.length &&
    claves.every((clave, indice) => clave === CLAVES_RANGO_PERSISTIDO[indice]);
};

const expandirYValidarVigencias = ({ mes, personaId, vigencias, origen }) => {
  if (!Array.isArray(vigencias) || vigencias.length === 0 ||
    !vigencias.every(esRangoPersistidoEstricto)) {
    throw crearErrorDominio(
      `Las vigencias ${origen} no respetan el contrato persistido.`,
      origen === "remotas" ? "VIGENCIAS_REMOTAS_INVALIDAS" : "VIGENCIAS_INVALIDAS"
    );
  }
  const expandidas = vigencias.map((rango) => ({
    personaId,
    mes,
    turno: rango.turno,
    desde: rango.desde,
    hasta: rango.hasta
  }));
  const validacion = validarVigenciasPersonaMes({ personaId, mes, vigencias: expandidas });
  if (!validacion.valido || validacion.vigencias.length !== expandidas.length) {
    throw crearErrorDominio(
      `Las vigencias ${origen} no son válidas.`,
      origen === "remotas" ? "VIGENCIAS_REMOTAS_INVALIDAS" : "VIGENCIAS_INVALIDAS",
      validacion.errores
    );
  }
  return validacion.vigencias.map((vigencia) => ({ ...vigencia }));
};

const compactarVigencias = ({ mes, personaId, vigencias }) => {
  if (!Array.isArray(vigencias) || vigencias.length === 0 || vigencias.some((vigencia) =>
    vigencia?.personaId !== personaId || vigencia?.mes !== mes
  )) {
    throw crearErrorDominio(
      "Todas las vigencias deben pertenecer a la misma persona y mes.",
      "VIGENCIAS_INVALIDAS"
    );
  }
  const compactas = vigencias.map(({ turno, desde, hasta }) => ({ turno, desde, hasta }));
  expandirYValidarVigencias({ mes, personaId, vigencias: compactas, origen: "recibidas" });
  return compactas.map((rango) => ({ ...rango }));
};

const normalizarFila = (fila) => {
  if (!fila || typeof fila !== "object") {
    throw crearErrorDominio("La fila remota no es válida.", "FILA_REMOTA_INVALIDA");
  }
  const mes = textoRequerido(fila.mes, "mes");
  const personaId = textoRequerido(fila.persona_id, "personaId");
  return {
    existe: true,
    mes,
    personaId,
    revision: normalizarRevisionVigenciasTurno(fila.revision, { permitirCero: false }),
    actualizadoEn: typeof fila.actualizado_en === "string" ? fila.actualizado_en : null,
    vigencias: expandirYValidarVigencias({
      mes,
      personaId,
      vigencias: fila.vigencias,
      origen: "remotas"
    })
  };
};

const contenidoRpc = (respuesta) => Array.isArray(respuesta) ? respuesta[0] : respuesta;

const normalizarRemotoConflicto = (contenido) => {
  const existe = contenido.existe === true;
  if (!existe) {
    return {
      existe: false,
      mes: contenido.mes,
      personaId: contenido.persona_id,
      revision: "0",
      actualizadoEn: null,
      vigencias: []
    };
  }
  return normalizarFila({
    mes: contenido.mes,
    persona_id: contenido.persona_id,
    revision: contenido.revision,
    actualizado_en: contenido.actualizado_en,
    vigencias: contenido.vigencias
  });
};

export const crearServicioVigenciasTurnoPersonal = (repositorio) => {
  if (!repositorio) throw new Error("El repositorio de vigencias es requerido.");

  const cargarVigenciasTurnoPersonaMes = async ({ mes, personaId } = {}) => {
    const { mes: periodo, personaId: identidad } = normalizarContexto({ mes, personaId });
    const fila = await repositorio.cargarFilaVigenciasTurnoPersonaMes({
      mes: periodo,
      personaId: identidad
    });
    if (fila && (textoRequerido(fila.mes, "mes") !== periodo ||
      textoRequerido(fila.persona_id, "personaId") !== identidad)) {
      throw crearErrorDominio(
        "La fila remota no coincide con la persona y el mes consultados.",
        "CONTEXTO_REMOTO_INVALIDO"
      );
    }
    return fila
      ? normalizarFila(fila)
      : {
          existe: false,
          mes: periodo,
          personaId: identidad,
          revision: "0",
          actualizadoEn: null,
          vigencias: []
        };
  };

  const cargarVigenciasTurnoMes = async (mes) => {
    const periodo = normalizarContexto({ mes, personaId: "contexto-mensual" }).mes;
    const filas = await repositorio.cargarFilasVigenciasTurnoMes(periodo);
    if (!Array.isArray(filas)) {
      throw crearErrorDominio("La consulta mensual devolvió datos inválidos.", "FILAS_REMOTAS_INVALIDAS");
    }
    if (filas.some((fila) => textoRequerido(fila?.mes, "mes") !== periodo)) {
      throw crearErrorDominio(
        "La consulta mensual devolvió filas de otro mes.",
        "CONTEXTO_REMOTO_INVALIDO"
      );
    }
    return filas.map(normalizarFila);
  };

  const guardarVigenciasTurnoPersonaMes = async ({
    mes,
    mesReferencia,
    personaId,
    vigencias,
    revisionEsperada
  } = {}) => {
    const { mes: periodo, personaId: identidad } = normalizarContexto({ mes, personaId });
    exigirPeriodoEditable(periodo, mesReferencia);
    const revision = normalizarRevisionVigenciasTurno(revisionEsperada);
    const compactas = compactarVigencias({ mes: periodo, personaId: identidad, vigencias });
    const respuesta = contenidoRpc(await repositorio.guardarFilaVigenciasTurnoPersonaMes({
      mes: periodo,
      personaId: identidad,
      vigencias: compactas,
      revisionEsperada: revision
    }));
    if (!respuesta || typeof respuesta !== "object") {
      throw new Error("La RPC de guardado devolvió una respuesta vacía.");
    }
    if (respuesta.resultado === "guardado") {
      const remoto = normalizarFila({
        mes: respuesta.mes,
        persona_id: respuesta.persona_id,
        revision: respuesta.revision,
        actualizado_en: respuesta.actualizado_en,
        vigencias: respuesta.vigencias
      });
      return { ok: true, conflicto: false, ...remoto };
    }
    if (respuesta.resultado === "conflicto" && respuesta.codigo === "REVISION_CONFLICTO") {
      return {
        ok: false,
        conflicto: true,
        codigo: "REVISION_CONFLICTO",
        remoto: normalizarRemotoConflicto(respuesta)
      };
    }
    throw new Error("La RPC de guardado devolvió un resultado desconocido.");
  };

  const eliminarVigenciasTurnoPersonaMes = async ({
    mes,
    mesReferencia,
    personaId,
    revisionEsperada
  } = {}) => {
    const { mes: periodo, personaId: identidad } = normalizarContexto({ mes, personaId });
    exigirPeriodoEditable(periodo, mesReferencia);
    const revision = normalizarRevisionVigenciasTurno(revisionEsperada, { permitirCero: false });
    const respuesta = contenidoRpc(await repositorio.eliminarFilaVigenciasTurnoPersonaMes({
      mes: periodo,
      personaId: identidad,
      revisionEsperada: revision
    }));
    if (!respuesta || typeof respuesta !== "object") {
      throw new Error("La RPC de eliminación devolvió una respuesta vacía.");
    }
    if (respuesta.resultado === "eliminado") {
      return {
        ok: true,
        conflicto: false,
        eliminado: true,
        mes: respuesta.mes,
        personaId: respuesta.persona_id,
        revisionEliminada: normalizarRevisionVigenciasTurno(
          respuesta.revision_eliminada,
          { permitirCero: false }
        )
      };
    }
    if (respuesta.resultado === "conflicto" && respuesta.codigo === "REVISION_CONFLICTO") {
      return {
        ok: false,
        conflicto: true,
        eliminado: false,
        codigo: "REVISION_CONFLICTO",
        remoto: normalizarRemotoConflicto(respuesta)
      };
    }
    throw new Error("La RPC de eliminación devolvió un resultado desconocido.");
  };

  const guardarVigenciasTurnoPersonaMesTurnoPropio = async ({
    mes,
    mesReferencia,
    personaId,
    rangos,
    revisionEsperada
  } = {}) => {
    const { mes: periodo, personaId: identidad } = normalizarContexto({ mes, personaId });
    exigirPeriodoEditable(periodo, mesReferencia);
    const revision = normalizarRevisionVigenciasTurno(revisionEsperada);
    const validacion = validarRangosTurnoPropio({ mes: periodo, rangos });
    if (!validacion.valido) {
      throw crearErrorDominio(
        "Los rangos del turno propio no son válidos.",
        "RANGOS_PROPIOS_INVALIDOS",
        validacion.errores
      );
    }
    const compactos = validacion.rangos.map((rango) => ({ ...rango }));
    const respuesta = contenidoRpc(
      await repositorio.guardarFilaVigenciasTurnoPersonaMesTurnoPropio({
        mes: periodo,
        personaId: identidad,
        rangos: compactos,
        revisionEsperada: revision
      })
    );
    if (!respuesta || typeof respuesta !== "object") {
      throw new Error("La RPC de turno propio devolvió una respuesta vacía.");
    }
    if (respuesta.resultado === "guardado") {
      const remoto = normalizarFila({
        mes: respuesta.mes,
        persona_id: respuesta.persona_id,
        revision: respuesta.revision,
        actualizado_en: respuesta.actualizado_en,
        vigencias: respuesta.vigencias
      });
      return { ok: true, conflicto: false, ...remoto };
    }
    if (respuesta.resultado === "conflicto" && respuesta.codigo === "REVISION_CONFLICTO") {
      return {
        ok: false,
        conflicto: true,
        codigo: "REVISION_CONFLICTO",
        remoto: normalizarRemotoConflicto(respuesta)
      };
    }
    throw new Error("La RPC de turno propio devolvió un resultado desconocido.");
  };

  return {
    cargarVigenciasTurnoPersonaMes,
    cargarVigenciasTurnoMes,
    guardarVigenciasTurnoPersonaMes,
    guardarVigenciasTurnoPersonaMesTurnoPropio,
    eliminarVigenciasTurnoPersonaMes
  };
};
