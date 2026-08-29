import { useMemo, useState } from "react";
import ConfiguracionPlanilla from "../configuracion/ConfiguracionPlanilla.jsx";
import AsignacionesFijasMes from "./AsignacionesFijasMes.jsx";
import PrioridadCoberturaMes from "./PrioridadCoberturaMes.jsx";
import {
  crearConfiguracionPlanillaLicenciadosV2,
  validarConfiguracionPlanillaLicenciadosV2
} from "../../utils/configuracionPlanilla.js";
import { prepararTransicionLicenciadosV1aV2 } from "../../utils/transicionLicenciadosV1aV2.js";
import {
  resolverVersionEstructuraLicenciados,
  VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA
} from "../../utils/estructuraLicenciadosDinamica.js";

const CATEGORIAS_PRIORIDAD = Object.freeze(["enfermero", "licenciado"]);

function PanelPrepararMes({
  analisis,
  borradoresConfiguracionPlanilla,
  onActualizarBorradorConfiguracionPlanilla,
  error,
  onCancelar,
  onConfirmar
}) {
  const enfermeros = analisis.enfermeros;
  const flex = enfermeros.analisis;
  const origenLicenciadosV2 = resolverVersionEstructuraLicenciados(
    analisis.configuracionLicenciadosOrigen
  ) === VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA;
  const [estadoInicialLicenciadosV2] = useState(() => {
    const fijasOrigen = analisis.configuracionLicenciadosOrigen?.asignacionesFijas || [];
    const creacion = crearConfiguracionPlanillaLicenciadosV2({
      filas: origenLicenciadosV2
        ? analisis.configuracionLicenciadosOrigen.filas.filter(
            (fila) => fila?.turnanteId !== "turnante_4"
          )
        : undefined,
      prioridadCoberturaSectorIds: origenLicenciadosV2
        ? analisis.configuracionLicenciadosOrigen.prioridadCoberturaSectorIds
        : [],
      asignacionesFijas: fijasOrigen
    });
    const compatibles = creacion.configuracion.asignacionesFijas || [];
    const clavesCompatibles = new Set(compatibles.map(({ sectorId, personaId }) =>
      `${sectorId}:${personaId}`
    ));
    return {
      borrador: creacion.configuracion,
      fijasPendientes: origenLicenciadosV2 ? [] : fijasOrigen.filter(({ sectorId, personaId }) =>
        !clavesCompatibles.has(`${sectorId}:${personaId}`)
      )
    };
  });
  const [borradorLicenciadosV2, setBorradorLicenciadosV2] = useState(
    estadoInicialLicenciadosV2.borrador
  );
  const [fijasLegacyPendientes, setFijasLegacyPendientes] = useState(
    estadoInicialLicenciadosV2.fijasPendientes
  );

  const borradoresVisibles = {
    ...borradoresConfiguracionPlanilla,
    licenciado: borradorLicenciadosV2
  };
  const actualizarBorradorVisible = (categoria, actualizador) => {
    if (categoria === "licenciado") {
      setBorradorLicenciadosV2((actual) =>
        typeof actualizador === "function" ? actualizador(actual) : actualizador
      );
      return;
    }
    onActualizarBorradorConfiguracionPlanilla?.(categoria, actualizador);
  };
  const resultadoTransicion = useMemo(() => {
    if (origenLicenciadosV2 || !borradorLicenciadosV2) return null;
    return prepararTransicionLicenciadosV1aV2({
      configuracionOrigen: analisis.configuracionLicenciadosOrigen,
      baseSemanalOrigen: analisis.licenciados.base,
      filasDestinoV2: borradorLicenciadosV2.filas,
      prioridadDestinoV2: borradorLicenciadosV2.prioridadCoberturaSectorIds,
      asignacionesFijasOrigen: [
        ...(borradorLicenciadosV2.asignacionesFijas || []),
        ...fijasLegacyPendientes
      ],
      personalDestino: (analisis.personal || []).filter(
        (persona) => persona?.categoria === "licenciado"
      )
    });
  }, [analisis, borradorLicenciadosV2, fijasLegacyPendientes, origenLicenciadosV2]);
  const personalPorId = useMemo(() => new Map(
    (analisis.personal || []).map((persona) => [String(persona.id), persona])
  ), [analisis.personal]);
  const nombrePersona = (personaId) =>
    personalPorId.get(String(personaId))?.nombre || String(personaId || "Sin persona asignada");
  const transformacion = (motivo) => resultadoTransicion?.referenciasTransformadas?.find(
    (referencia) => referencia.motivo === motivo
  );
  const validacionConfiguracionV2 = validarConfiguracionPlanillaLicenciadosV2(
    borradorLicenciadosV2
  );
  const prioridadLista = validacionConfiguracionV2.errores.every(({ codigo }) =>
    !codigo.includes("PRIORIDAD")
  );
  const fijasRevisadas = fijasLegacyPendientes.length === 0;
  const configuracionV2Lista = validacionConfiguracionV2.ok &&
    (origenLicenciadosV2 || (
      resultadoTransicion?.ok === true &&
      resultadoTransicion?.aplicar === true &&
      resultadoTransicion?.finalizable !== false &&
      resultadoTransicion?.requierePrioridadV2 !== true &&
      resultadoTransicion?.requiereRevisionFijas !== true
    )) &&
    fijasLegacyPendientes.length === 0;
  const confirmarDesdePanel = () => {
    if (!configuracionV2Lista) return;
    onConfirmar?.({
      configuracionLicenciadosV2: {
        estructuraLicenciadosVersion: VERSION_ESTRUCTURA_LICENCIADOS_DINAMICA,
        filas: borradorLicenciadosV2.filas,
        prioridadCoberturaSectorIds: borradorLicenciadosV2.prioridadCoberturaSectorIds,
        asignacionesFijas: borradorLicenciadosV2.asignacionesFijas
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-preparar-mes"
    >
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <h3 id="titulo-preparar-mes" className="text-xl font-bold text-slate-900">
          Preparar mes siguiente
        </h3>
        <p className="mt-3 rounded-xl border border-purple-200 bg-purple-50 p-3 text-sm text-purple-950">
          Se copiará la base del mes anterior como referencia. Las semanas o
          bloques restantes quedarán vacíos hasta que revises el Personal y
          generes la rotación.
        </p>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <p><strong>Turno:</strong> {analisis.turnoNombre}</p>
          <p><strong>Origen:</strong> {analisis.mesOrigen}</p>
          <p><strong>Destino:</strong> {analisis.mesDestino}</p>
          <p><strong>Estado:</strong> {analisis.destino.clasificacion}</p>
          <p><strong>Revisión:</strong> {analisis.revisionDestino}</p>
        </div>

        <section className="mt-5 rounded-xl border border-slate-200 p-4">
          <h4 className="font-semibold text-slate-900">Personal</h4>
          <div className="mt-2 grid gap-2 text-sm sm:grid-cols-5">
            <p>Total: {analisis.conteosPersonal.total}</p>
            <p>Enfermeros: {analisis.conteosPersonal.enfermeros}</p>
            <p>Licenciados: {analisis.conteosPersonal.licenciados}</p>
            <p>Licencias vigentes: {analisis.licencias.length}</p>
            <p>Certificaciones vigentes: {analisis.certificaciones.length}</p>
          </div>
        </section>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
            <h4 className="font-semibold text-blue-950">Enfermeros</h4>
            <div className="mt-2 space-y-1 text-sm">
              <p>Estrategia: {enfermeros.estrategia.tipo === "cada_3_dias" ? "Cada tres días" : "Semanal"}</p>
              <p>Base: {enfermeros.claveBase}</p>
              <p>Posiciones: {enfermeros.filas.length}</p>
              <p>Personas válidas: {flex.cantidadPersonas}</p>
              <p>Posiciones vacías: {flex.filasVacias.join(", ") || "Ninguna"}</p>
              {enfermeros.estrategia.tipo === "semanal" ? (
                <>
                  <p>Se preparará Semana 1 con la última semana real del origen.</p>
                  <p>Semanas 2 a 6 quedarán vacías.</p>
                </>
              ) : (
                <>
                  <p>Se copiará asignacionBase como base editable.</p>
                  <p>
                    Bloques compartidos disponibles: {
                      enfermeros.bloquesDestino.filter((periodo) =>
                        Object.hasOwn(
                          analisis.rotacionEnfermerosOrigen.bloques || {},
                          periodo.clave
                        )
                      ).length
                    }
                  </p>
                  <p>Los bloques faltantes quedarán sin generar.</p>
                </>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
            <h4 className="font-semibold text-emerald-950">Licenciados</h4>
            <div className="mt-2 space-y-1 text-sm">
              <p>Estrategia: Semanal</p>
              <p>Base: {analisis.licenciados.claveBase}</p>
              <p>Posiciones: {analisis.licenciados.filas.length}</p>
              <p>Personas válidas: {analisis.licenciados.cantidadPersonas}</p>
              <p>Se preparará Semana 1 con la última semana real del origen.</p>
              <p>Semanas 2 a 6 quedarán vacías.</p>
              <p>Salud Mental conserva su comportamiento fijo.</p>
            </div>
          </section>
        </div>

        <section className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50/50 p-4">
          <h4 className="font-semibold text-emerald-950">Estructura de Licenciados v2</h4>
          <p className="mt-2 text-sm text-emerald-900">
            Se aplicará automáticamente al preparar el nuevo mes.
          </p>
          <div className="mt-4 space-y-3">
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <p className="rounded-lg bg-white p-3"><strong>Estructura:</strong> Lista</p>
                <p className="rounded-lg bg-white p-3"><strong>Prioridad:</strong> {prioridadLista ? "Lista" : "Pendiente"}</p>
                <p className="rounded-lg bg-white p-3"><strong>Fijas:</strong> {fijasRevisadas ? "Revisadas" : "Requieren revisión"}</p>
                <p className="rounded-lg bg-white p-3"><strong>Personas Sin asignar:</strong> {origenLicenciadosV2 ? 0 : resultadoTransicion?.personasSinAsignar?.length ?? "Pendiente"}</p>
              </div>
              {!prioridadLista && (
                <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  Falta configurar la prioridad de cobertura de Licenciados v2.
                </p>
              )}
              {!origenLicenciadosV2 && <div className="rounded-lg border border-emerald-200 bg-white p-3 text-sm">
                <p><strong>Explora → T3</strong></p>
                {transformacion("TRANSICION_EXPLORA_A_T3") && (
                  <p>{nombrePersona(transformacion("TRANSICION_EXPLORA_A_T3").personaId)} conservará su asignación.</p>
                )}
                {resultadoTransicion?.ok === true && !transformacion("TRANSICION_EXPLORA_A_T3") && (
                  <p>No hay una persona Licenciada elegible asignada a Explora en {analisis.licenciados.claveBase}.</p>
                )}
                {resultadoTransicion?.posicionesMensualesAdicionalesDestino?.includes("T4") && (
                  <div className="mt-2">
                    <p><strong>T3 adicional → T4</strong></p>
                    {transformacion("TRANSICION_T3_ADICIONAL_A_T4") && (
                      <p>{nombrePersona(transformacion("TRANSICION_T3_ADICIONAL_A_T4").personaId)} conservará su asignación.</p>
                    )}
                  </div>
                )}
                <p className="mt-2 font-medium text-amber-800">
                  La asignación actual de Reanimación + Sillones no se trasladará automáticamente a Reanimación.
                </p>
              </div>}
              {fijasLegacyPendientes.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
                  <p className="font-semibold text-amber-950">Fijas que requieren revisión</p>
                  <ul className="mt-2 space-y-2">
                    {fijasLegacyPendientes.map((fija) => (
                      <li key={`${fija.sectorId}:${fija.personaId}`} className="flex flex-wrap items-center justify-between gap-2 rounded bg-white p-2">
                        <span>{fija.sectorId} — {nombrePersona(fija.personaId)}</span>
                        <button type="button" className="min-h-11 rounded-lg border px-3" onClick={() =>
                          setFijasLegacyPendientes((actual) => actual.filter((item) => item !== fija))
                        }>Excluir de la transición</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {resultadoTransicion?.personasSinAsignar?.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                  <p className="font-semibold">Quedarán Sin asignar</p>
                  <ul className="mt-1 list-inside list-disc">
                    {resultadoTransicion.personasSinAsignar.map((persona) => (
                      <li key={persona.id}>{persona.nombre || persona.id}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
        </section>

        <section className="mt-4 rounded-xl border border-slate-200 p-4">
          <h4 className="font-semibold text-slate-900">Estructura de Planilla del mes a preparar</h4>
          <ConfiguracionPlanilla
            borradores={borradoresVisibles}
            onActualizarBorrador={actualizarBorradorVisible}
          />
        </section>

        <section className="mt-4 rounded-xl border border-slate-200 p-4">
          <h4 className="font-semibold text-slate-900">Prioridad de cobertura</h4>
          <p className="mt-2 text-sm text-slate-600">
            Define qué sectores se intentan cubrir primero cuando faltan funcionarios.
            No modifica la distribución base de la Planilla.
          </p>
          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            {CATEGORIAS_PRIORIDAD.map((categoria) => {
              const borrador = borradoresVisibles?.[categoria];
              return (
                <PrioridadCoberturaMes
                  key={categoria}
                  categoria={categoria}
                  filas={borrador?.filas || []}
                  prioridadCoberturaSectorIds={borrador?.prioridadCoberturaSectorIds || []}
                  versionEstructura={borrador}
                  onCambiarPrioridad={(prioridadCoberturaSectorIds) =>
                    actualizarBorradorVisible(categoria, (actual) => ({
                      ...actual,
                      prioridadCoberturaSectorIds
                    }))
                  }
                />
              );
            })}
          </div>
        </section>

        <section className="mt-4 rounded-xl border border-slate-200 p-4">
          <h4 className="font-semibold text-slate-900">Asignaciones fijas del mes</h4>
          <div className="mt-3">
            <AsignacionesFijasMes
              borradores={borradoresVisibles}
              personal={analisis.personal}
              onActualizarBorrador={actualizarBorradorVisible}
            />
          </div>
        </section>

        <section className="mt-4 rounded-xl border border-slate-200 p-4 text-sm">
          <h4 className="font-semibold text-slate-900">No se copiará</h4>
          <p className="mt-2">
            Extras, no disponibles, asistencia, cambios diarios, días de paro,
            cierres ni el calendario del mes anterior.
          </p>
        </section>

        {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancelar} className="rounded-lg border px-4 py-2">
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmarDesdePanel}
            disabled={!configuracionV2Lista}
            className="rounded-lg bg-purple-600 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Confirmar preparación
          </button>
          <p className={`text-sm sm:basis-full sm:text-right ${
              configuracionV2Lista ? "text-emerald-700" : "text-amber-800"
            }`}>
              {configuracionV2Lista
                ? "Estructura de Licenciados v2 lista para preparar."
                : !prioridadLista
                  ? "Configurá una prioridad v2 completa para continuar."
                  : !fijasRevisadas
                    ? "Revisá las asignaciones fijas incompatibles para continuar."
                    : "La configuración v2 requiere revisión antes de preparar."}
            </p>
        </div>
      </div>
    </div>
  );
}

export default PanelPrepararMes;
