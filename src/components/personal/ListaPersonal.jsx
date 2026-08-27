import { useEffect, useRef, useState } from "react";
import { obtenerDiasLibresDelMes } from "../../utils/fechas";
import {
  TIPOS_MATERNAL,
  normalizarMaternal,
  obtenerEtiquetaMaternal
} from "../../utils/maternal.js";
import { asegurarIdPersona, crearIdPersonaNueva } from "../../utils/identidadPersonas.js";
import {
  existeNombrePersona,
  limpiarNombrePersona,
  obtenerNombresDuplicados
} from "../../utils/nombresPersonas.js";
import {
  existeFuncionarioDuplicado,
  obtenerClaveRenderPersona,
  obtenerIdsPersonalDuplicados
} from "../../utils/validacionPersonal.js";
import PanelConfirmacionLimpieza from "../ui/PanelConfirmacionLimpieza.jsx";
import EstadoVigenciasTurnoPersona from "./EstadoVigenciasTurnoPersona.jsx";
import EditorVigenciasTurnoPropio from "./EditorVigenciasTurnoPropio.jsx";
import EditorVigenciasSupervision from "./EditorVigenciasSupervision.jsx";
import MoverTurnoBaseSupervision from "./MoverTurnoBaseSupervision.jsx";
import { ROLES_APLICACION, validarPerfil } from "../../utils/permisos.js";
import { resolverPersonalMensualPorTurno } from "../../utils/padronVigenciasTurnoPersonal.js";
import { TURNOS } from "../../config/turnos.js";

const MENSAJE_NOMBRE_DUPLICADO =
  "Ya existe una persona con ese nombre. Agregá el segundo apellido para poder diferenciarla.";
const MENSAJE_FUNCIONARIO_DUPLICADO =
  "Ya existe una persona con ese número de funcionario en este turno y mes.";
const MENSAJE_IDENTIDAD_DUPLICADA =
  "Hay registros con la misma identidad interna. Revisá los números de funcionario antes de eliminar o modificar estas personas.";

function ListaPersonal({
  personal,
  setPersonal,
  mesActivo,
  configTurno,
  onActualizarPersona,
  onRenombrarPersona,
  onEliminarPersona,
  onLimpiarPersonal,
  onValidarExclusividadTurno,
  vigenciasPersonal,
  onAnalizarMovimientoPadronBase,
  onMoverPadronBase,
  perfil,
  modoHistorico = false,
  soloLectura = false
}) {
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("enfermero");
  const [rol, setRol] = useState("titular");
  const [libre, setLibre] = useState(1);
  const [horario, setHorario] = useState("normal");
  const [maternal, setMaternal] = useState(TIPOS_MATERNAL.NINGUNO);
  const [funcionario, setFuncionario] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [errorNombre, setErrorNombre] = useState("");
  const [errorIdentidad, setErrorIdentidad] = useState("");
  const [personaEditandoId, setPersonaEditandoId] = useState("");
  const [nombreEdicion, setNombreEdicion] = useState("");
  const [errorEdicion, setErrorEdicion] = useState("");
  const [verificandoExclusividad, setVerificandoExclusividad] = useState(false);
  const [limpiezaPersonal, setLimpiezaPersonal] = useState(null);
  const [editorVigencias, setEditorVigencias] = useState(null);
  const [editorVigenciasSupervision, setEditorVigenciasSupervision] = useState(null);
  const [movimientoPadronBase, setMovimientoPadronBase] = useState(null);
  const validacionNombreIdRef = useRef(0);
  const validacionEnCursoRef = useRef(false);
  const perfilValido = validarPerfil(perfil);
  const puedeEditarVigenciasPropias = Boolean(
    perfilValido?.activo && perfilValido.rol === ROLES_APLICACION.LICENCIADO
  );
  const puedeEditarVigenciasCompletas = Boolean(
    perfilValido?.activo && perfilValido.rol === ROLES_APLICACION.SUPERVISION
  );

  const formatearDias = (dias) => {
    if (dias.length === 0) return "Sin días";
    if (dias.length === 1) return String(dias[0]);
    if (dias.length === 2) return `${dias[0]} y ${dias[1]}`;

    return `${dias.slice(0, -1).join(", ")} y ${dias[dias.length - 1]}`;
  };

  const nombreMes = (() => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mesActivo || "")) return "";

    const [anio, mes] = mesActivo.split("-").map(Number);
    const nombre = new Intl.DateTimeFormat("es-UY", { month: "long" }).format(
      new Date(anio, mes - 1, 1, 12)
    );

    return nombre.charAt(0).toUpperCase() + nombre.slice(1);
  })();
  const periodoVisible = nombreMes && mesActivo
    ? `${nombreMes.toLowerCase()} de ${mesActivo.slice(0, 4)}`
    : mesActivo;
  const claveContextoLimpieza = [
    configTurno?.id,
    mesActivo,
    soloLectura ? "lectura" : "edicion"
  ].join("|");

  useEffect(() => {
    const timeout = setTimeout(() => setLimpiezaPersonal(null), 0);
    return () => clearTimeout(timeout);
  }, [claveContextoLimpieza]);

  const textoDiasGrupo = (grupo) => {
    const dias = obtenerDiasLibresDelMes(grupo, mesActivo);
    return nombreMes ? `${nombreMes}: ${formatearDias(dias)}` : "";
  };

  const idsDuplicados = obtenerIdsPersonalDuplicados(personal);

  const actualizarPersona = (personaAnterior, cambios) => {
    if (soloLectura) return;
    if (idsDuplicados.has(String(personaAnterior?.id ?? "").trim())) {
      setErrorIdentidad(MENSAJE_IDENTIDAD_DUPLICADA);
      return;
    }
    if (
      Object.hasOwn(cambios, "funcionario") &&
      existeFuncionarioDuplicado(
        personal,
        cambios.funcionario,
        personaAnterior.id
      )
    ) {
      setErrorIdentidad(MENSAJE_FUNCIONARIO_DUPLICADO);
      return;
    }

    setErrorIdentidad("");
    onActualizarPersona(personaAnterior, { ...personaAnterior, ...cambios });
  };

  const agregar = async () => {
    if (soloLectura) return;
    if (validacionEnCursoRef.current) return;

    const nombreLimpio = limpiarNombrePersona(nombre);

    if (!nombreLimpio) {
      setErrorNombre("Ingresá un nombre.");
      return;
    }

    if (existeNombrePersona(personal, nombreLimpio)) {
      setErrorNombre(MENSAJE_NOMBRE_DUPLICADO);
      return;
    }
    if (existeFuncionarioDuplicado(personal, funcionario)) {
      setErrorNombre(MENSAJE_FUNCIONARIO_DUPLICADO);
      return;
    }

    const validacionId = validacionNombreIdRef.current + 1;
    validacionNombreIdRef.current = validacionId;
    validacionEnCursoRef.current = true;
    setVerificandoExclusividad(true);
    setErrorNombre("");

    try {
      const resultado = await onValidarExclusividadTurno({
        nombre: nombreLimpio,
        funcionario: funcionario.trim()
      });

      if (validacionNombreIdRef.current !== validacionId || resultado.cancelada) {
        return;
      }

      if (resultado.existeEnOtroTurno) {
        setErrorNombre(
          `${nombreLimpio} ya pertenece al Turno ${resultado.turnoNombre} en ${periodoVisible}.`
        );
        return;
      }
    } catch {
      if (validacionNombreIdRef.current === validacionId) {
        setErrorNombre(
          "No se pudo verificar en qué turno está esta persona. Intentá nuevamente."
        );
      }
      return;
    } finally {
      validacionEnCursoRef.current = false;
      setVerificandoExclusividad(false);
    }

    if (validacionNombreIdRef.current !== validacionId) return;

    const datosNuevaPersona = {
      nombre: nombreLimpio,
      categoria,
      rol,
      libre: Number(libre),
      horario,
      maternal,
      funcionario: funcionario.trim()
    };
    const nuevo = {
      id: crearIdPersonaNueva(datosNuevaPersona),
      ...datosNuevaPersona
    };

    const nuevaLista = [...personal, nuevo].sort((a, b) =>
      a.nombre.localeCompare(b.nombre)
    );

    setPersonal(nuevaLista);

    // reset
    setNombre("");
    setFuncionario("");
    setMaternal(TIPOS_MATERNAL.NINGUNO);
    setHorario("normal");
    setErrorNombre("");
  };

  

  const limpiarTodo = () => {
    if (soloLectura || personal.length === 0) return;
    if (idsDuplicados.size > 0) {
      setErrorIdentidad(MENSAJE_IDENTIDAD_DUPLICADA);
      return;
    }
    setLimpiezaPersonal({
      contextoClave: claveContextoLimpieza,
      personalEsperado: personal,
      cantidad: personal.length,
      error: ""
    });
  };

  const confirmarLimpiezaPersonal = () => {
    if (
      !limpiezaPersonal ||
      limpiezaPersonal.contextoClave !== claveContextoLimpieza ||
      limpiezaPersonal.personalEsperado !== personal ||
      soloLectura
    ) {
      setLimpiezaPersonal((actual) => actual
        ? {
            ...actual,
            error: "El Personal cambió mientras confirmabas la limpieza. Revisá nuevamente."
          }
        : actual);
      return;
    }
    onLimpiarPersonal();
    setLimpiezaPersonal(null);
  };

  const iniciarEdicionNombre = (persona) => {
    if (soloLectura) return;
    if (idsDuplicados.has(String(persona?.id ?? "").trim())) {
      setErrorIdentidad(MENSAJE_IDENTIDAD_DUPLICADA);
      return;
    }
    setPersonaEditandoId(String(persona.id));
    setNombreEdicion(persona.nombre);
    setErrorEdicion("");
  };

  const cancelarEdicionNombre = () => {
    setPersonaEditandoId("");
    setNombreEdicion("");
    setErrorEdicion("");
  };

  const guardarEdicionNombre = (persona) => {
    if (soloLectura) return;
    const nombreLimpio = limpiarNombrePersona(nombreEdicion);
    if (!nombreLimpio) {
      setErrorEdicion("Ingresá un nombre.");
      return;
    }
    if (existeNombrePersona(personal, nombreLimpio, persona.id)) {
      setErrorEdicion(MENSAJE_NOMBRE_DUPLICADO);
      return;
    }

    onRenombrarPersona(persona, nombreLimpio);
    cancelarEdicionNombre();
  };

  const personalVisible = resolverPersonalMensualPorTurno({
    padron: vigenciasPersonal?.padron,
    turno: configTurno.id,
    personalFisico: personal
  });
  const personalFisicoPorId = new Map(personal.map((personaFisica) => [
    String(asegurarIdPersona(personaFisica)?.id ?? "").trim(),
    personaFisica
  ]));
  const filtrados = personalVisible.filter(({ persona: p }) =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );
  const hayNombresDuplicados = obtenerNombresDuplicados(personal).size > 0;

  const horariosTurno = configTurno.horarios;
  const opcionesHorario = Object.values(horariosTurno);
  const textoHorario = (horarioId) =>
    (horariosTurno[horarioId] || horariosTurno.normal).textoVisible;

  return (
    <div className="space-y-4">
      {/* 🔍 BUSCADOR */}
      <input className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        placeholder="Buscar..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        />

      {/* ➕ FORMULARIO */}
      <div className="flex flex-wrap gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
        <input className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
          placeholder="Nombre"
          value={nombre}
          onChange={(e) => {
            validacionNombreIdRef.current += 1;
            setNombre(e.target.value);
            setErrorNombre("");
          }}
        />

        <input className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
          placeholder="N° funcionario"
          value={funcionario}
          onChange={(e) => setFuncionario(e.target.value)}
        />

        <select className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="enfermero">Enfermero</option>
          <option value="licenciado">Licenciado</option>
        </select>

        <select className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm" value={rol} onChange={(e) => setRol(e.target.value)}>
          <option value="titular">Titular</option>
          <option value="suplente">Suplente</option>
        </select>

        <select className="max-w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm" value={libre} onChange={(e) => setLibre(e.target.value)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              Grupo {n} — {textoDiasGrupo(n)}
            </option>
          ))}
        </select>

        <select className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm" value={horario} onChange={(e) => setHorario(e.target.value)}>
          {opcionesHorario.map((opcion) => (
            <option key={opcion.id} value={opcion.id}>
              {opcion.nombre}: {opcion.textoVisible}
            </option>
          ))}
        </select>

        <label className="flex flex-col gap-1 text-sm text-slate-700">
          <span>Horario maternal</span>
          <select
            className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
            value={maternal}
            onChange={(e) => setMaternal(normalizarMaternal(e.target.value))}
          >
            {Object.values(TIPOS_MATERNAL).map((tipoMaternal) => (
              <option key={tipoMaternal} value={tipoMaternal}>
                {obtenerEtiquetaMaternal(tipoMaternal)}
              </option>
            ))}
          </select>
        </label>

        <button
  type="button"
  onClick={agregar}
  disabled={soloLectura || verificandoExclusividad}
  className="bg-blue-600 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 text-white px-3 py-1.5 rounded-lg text-sm transition"
>
  {verificandoExclusividad ? "Verificando…" : "Agregar"}
</button>

        {errorNombre && (
          <p className="w-full text-sm text-red-600" role="alert">
            {errorNombre}
          </p>
        )}
      </div>

      {/* 🧹 LIMPIAR */}
      <button
        type="button"
        onClick={limpiarTodo}
        disabled={soloLectura || personal.length === 0}
        className="bg-red-500 hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-slate-300 text-white px-3 py-1.5 rounded-lg text-sm transition"
      >
        Eliminar todo el Personal
      </button>

      {hayNombresDuplicados && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
          Hay personas con el mismo nombre. Agregá el segundo apellido para diferenciarlas.
        </p>
      )}

      {idsDuplicados.size > 0 && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {MENSAJE_IDENTIDAD_DUPLICADA}
        </p>
      )}
      {errorIdentidad && errorIdentidad !== MENSAJE_IDENTIDAD_DUPLICADA && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {errorIdentidad}
        </p>
      )}

      {vigenciasPersonal?.cargando && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600" role="status">
          Cargando información de turnos del mes…
        </p>
      )}
      {vigenciasPersonal?.error && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
          {vigenciasPersonal.error}
        </p>
      )}
      {!vigenciasPersonal?.error && vigenciasPersonal?.padron?.diagnosticos?.some(
        (diagnostico) => !diagnostico.personaId
      ) && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
          Hay problemas en la información mensual de turnos. No se aplicarán automáticamente.
        </p>
      )}

      {limpiezaPersonal?.contextoClave === claveContextoLimpieza && (
        <PanelConfirmacionLimpieza
          titulo="¿Eliminar todo el Personal?"
          descripcion={`Se eliminarán ${limpiezaPersonal.cantidad} personas del turno ${configTurno.nombre} de ${periodoVisible}.`}
          advertencia="La limpieza actual también elimina las referencias de esas personas en planillas, Calendario Diario, licencias y certificaciones. No elimina otros datos mensuales."
          error={limpiezaPersonal.error}
          textoConfirmar="Sí, eliminar todo el Personal"
          onCancelar={() => setLimpiezaPersonal(null)}
          onConfirmar={confirmarLimpiezaPersonal}
        />
      )}

      {editorVigencias && (
        <EditorVigenciasTurnoPropio
          key={`${mesActivo}|${editorVigencias.personaId}`}
          persona={editorVigencias.persona}
          personaId={editorVigencias.personaId}
          mes={mesActivo}
          turnoPerfil={perfilValido.turno}
          entrada={vigenciasPersonal?.padron?.porPersonaId?.[editorVigencias.personaId]}
          tieneDiagnostico={vigenciasPersonal?.padron?.diagnosticos?.some(
            (diagnostico) => diagnostico.personaId === editorVigencias.personaId
          )}
          historico={modoHistorico}
          onCerrar={() => setEditorVigencias(null)}
          onRecargar={vigenciasPersonal.recargar}
        />
      )}

      {editorVigenciasSupervision && (
        <EditorVigenciasSupervision
          key={`${mesActivo}|${editorVigenciasSupervision.personaId}`}
          persona={editorVigenciasSupervision.persona}
          personaId={editorVigenciasSupervision.personaId}
          mes={mesActivo}
          entrada={vigenciasPersonal?.padron?.porPersonaId?.[editorVigenciasSupervision.personaId]}
          tieneDiagnostico={vigenciasPersonal?.padron?.diagnosticos?.some(
            (diagnostico) => diagnostico.personaId === editorVigenciasSupervision.personaId
          )}
          historico={modoHistorico}
          onCerrar={() => setEditorVigenciasSupervision(null)}
          onRecargar={vigenciasPersonal.recargar}
        />
      )}

      {movimientoPadronBase && (
        <MoverTurnoBaseSupervision
          key={`${mesActivo}|${movimientoPadronBase.personaId}|${movimientoPadronBase.turnoOrigen}`}
          persona={movimientoPadronBase.persona}
          personaId={movimientoPadronBase.personaId}
          mes={mesActivo}
          turnoOrigen={movimientoPadronBase.turnoOrigen}
          historico={modoHistorico}
          onAnalizar={onAnalizarMovimientoPadronBase}
          onMover={onMoverPadronBase}
          onCerrar={() => setMovimientoPadronBase(null)}
        />
      )}

    <div className="overflow-x-auto">
  <table className="w-full text-sm">
    
    <thead className="bg-slate-100 text-slate-700">
      <tr>
        <th className="px-3 py-2 text-left">Nombre</th>
        <th className="px-3 py-2 text-left">Categoría</th>
        <th className="px-3 py-2 text-left">Rol</th>
        <th className="px-3 py-2 text-left">Grupo 4x1</th>
        <th className="px-3 py-2 text-left">Horario</th>
        <th className="px-3 py-2 text-left">Horario maternal</th>
        <th className="px-3 py-2 text-left">Func.</th>
        <th className="px-3 py-2 text-left">❌</th>
      </tr>
    </thead>

    <tbody className="divide-y divide-slate-100">
      {filtrados.map((entradaVisible) => {
        const p = entradaVisible.persona;
        const personaIdVigencias = entradaVisible.personaId;
        const personaFisica = personalFisicoPorId.get(personaIdVigencias);
        const esFisicaEnTurnoVisualizado = Boolean(personaFisica);
        const personaOperacion = personaFisica || p;
        const indicePersonal = personaFisica ? personal.indexOf(personaFisica) : -1;
        return (
        <tr
          key={esFisicaEnTurnoVisualizado
            ? obtenerClaveRenderPersona(personaOperacion, indicePersonal, idsDuplicados)
            : `vigencia-${personaIdVigencias}`}
          className="hover:bg-slate-50 transition"
        >
          <td className="px-3 py-2 font-medium text-slate-700">
  {personaEditandoId === String(p.id) ? (
    <div className="min-w-56 space-y-1">
      <input
        className="w-full border border-slate-200 rounded px-2 py-1 text-xs"
        value={nombreEdicion}
        onChange={(e) => {
          setNombreEdicion(e.target.value);
          setErrorEdicion("");
        }}
      />
      <div className="flex gap-2">
      <button type="button" disabled={soloLectura} className="text-xs text-blue-600" onClick={() => guardarEdicionNombre(p)}>Guardar</button>
        <button type="button" className="text-xs text-slate-500" onClick={cancelarEdicionNombre}>Cancelar</button>
      </div>
      {errorEdicion && <p className="text-xs text-red-600" role="alert">{errorEdicion}</p>}
    </div>
  ) : (
    <>
      {p.nombre}
      <span className="text-slate-400 text-xs ml-1">({textoHorario(p.horario)})</span>
      <button type="button" disabled={soloLectura || !esFisicaEnTurnoVisualizado} className="ml-2 text-xs text-blue-600 hover:text-blue-800 disabled:text-slate-400" onClick={() => iniciarEdicionNombre(personaOperacion)}>Editar</button>
      <EstadoVigenciasTurnoPersona
        mes={mesActivo}
        entrada={vigenciasPersonal?.padron?.porPersonaId?.[personaIdVigencias]}
        tieneDiagnostico={vigenciasPersonal?.padron?.diagnosticos?.some(
          (diagnostico) => diagnostico.personaId === personaIdVigencias
        )}
      />
      {!esFisicaEnTurnoVisualizado && (
        <p className="mt-1 text-xs text-slate-500">
          Esta persona pertenece al padrón base de {TURNOS[entradaVisible.turnoFuente]?.nombre || "otro turno"}.
        </p>
      )}
      {puedeEditarVigenciasPropias && (
        <button
          type="button"
          disabled={modoHistorico || vigenciasPersonal?.cargando || Boolean(vigenciasPersonal?.error)}
          className="ml-2 mt-1 rounded-md border border-blue-200 px-2 py-1 text-xs font-medium text-blue-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
          onClick={() => setEditorVigencias({ persona: asegurarIdPersona(p), personaId: personaIdVigencias })}
        >
          Editar mi turno
        </button>
      )}
      {puedeEditarVigenciasCompletas && (
        <>
          <button
            type="button"
            disabled={modoHistorico || vigenciasPersonal?.cargando || Boolean(vigenciasPersonal?.error)}
            className="ml-2 mt-1 rounded-md border border-violet-200 px-2 py-1 text-xs font-medium text-violet-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
            onClick={() => setEditorVigenciasSupervision({
              persona: asegurarIdPersona(p),
              personaId: personaIdVigencias
            })}
          >
            Editar vigencias
          </button>
          <button
            type="button"
            disabled={
              modoHistorico || vigenciasPersonal?.cargando || Boolean(vigenciasPersonal?.error) ||
              !TURNOS[entradaVisible.turnoFuente] || entradaVisible.invalida === true ||
              typeof onAnalizarMovimientoPadronBase !== "function" ||
              typeof onMoverPadronBase !== "function"
            }
            className="ml-2 mt-1 rounded-md border border-teal-200 px-2 py-1 text-xs font-medium text-teal-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
            onClick={() => setMovimientoPadronBase({
              persona: asegurarIdPersona(p),
              personaId: personaIdVigencias,
              turnoOrigen: entradaVisible.turnoFuente
            })}
          >
            Cambiar turno base
          </button>
        </>
      )}
    </>
  )}
</td>

<td className="px-3 py-2">
  <select
    className="border border-slate-200 rounded px-2 py-1 text-xs"
    disabled={soloLectura || !esFisicaEnTurnoVisualizado}
    value={p.categoria}
    onChange={(e) => {
      actualizarPersona(personaOperacion, { categoria: e.target.value });
    }}
  >
    <option value="enfermero">Enfermero</option>
    <option value="licenciado">Licenciado</option>
  </select>
</td>

<td className="px-3 py-2">
  <select
    className="border border-slate-200 rounded px-2 py-1 text-xs"
    disabled={soloLectura || !esFisicaEnTurnoVisualizado}
    value={p.rol}
    onChange={(e) => {
      actualizarPersona(personaOperacion, { rol: e.target.value });
    }}
  >
    <option value="titular">Titular</option>
    <option value="suplente">Suplente</option>
  </select>
</td>

<td className="px-3 py-2">
  <select
    className="border border-slate-200 rounded px-2 py-1 text-xs"
    disabled={soloLectura || !esFisicaEnTurnoVisualizado}
    value={p.libre}
    onChange={(e) => {
      actualizarPersona(personaOperacion, { libre: Number(e.target.value) });
    }}
  >
    {[1,2,3,4,5].map(n => (
      <option key={n} value={n}>Grupo {n}</option>
    ))}
  </select>
  <p className="mt-1 max-w-48 text-xs leading-4 text-slate-500">
    {textoDiasGrupo(p.libre)}
  </p>
</td>

<td className="px-3 py-2">
  <select
    className="border border-slate-200 rounded px-2 py-1 text-xs"
    disabled={soloLectura || !esFisicaEnTurnoVisualizado}
    value={p.horario}
    onChange={(e) => {
      actualizarPersona(personaOperacion, { horario: e.target.value });
    }}
  >
    {opcionesHorario.map((opcion) => (
      <option key={opcion.id} value={opcion.id}>
        {opcion.nombre}: {opcion.textoVisible}
      </option>
    ))}
  </select>
</td>

<td className="px-3 py-2">
  <select
    className="border border-slate-200 rounded px-2 py-1 text-xs"
    disabled={soloLectura || !esFisicaEnTurnoVisualizado}
    value={normalizarMaternal(p.maternal)}
    onChange={(e) => {
      actualizarPersona(personaOperacion, { maternal: normalizarMaternal(e.target.value) });
    }}
  >
    {Object.values(TIPOS_MATERNAL).map((tipoMaternal) => (
      <option key={tipoMaternal} value={tipoMaternal}>
        {obtenerEtiquetaMaternal(tipoMaternal)}
      </option>
    ))}
  </select>
</td>

<td className="px-3 py-2">
  <input
    className="w-20 border border-slate-200 rounded px-2 py-1 text-xs"
    disabled={soloLectura || !esFisicaEnTurnoVisualizado}
    value={p.funcionario || ""}
    onChange={(e) => {
      actualizarPersona(personaOperacion, { funcionario: e.target.value });
    }}
  />
</td>

<td className="px-3 py-2">
  <button
    disabled={soloLectura || !esFisicaEnTurnoVisualizado}
    className="text-red-500 hover:text-red-700 transition"
    onClick={() => {
      if (!esFisicaEnTurnoVisualizado) return;
      if (idsDuplicados.has(String(personaOperacion?.id ?? "").trim())) {
        setErrorIdentidad(MENSAJE_IDENTIDAD_DUPLICADA);
        return;
      }
      onEliminarPersona(personaOperacion);
    }}
  >
    ❌
  </button>
</td>
        </tr>
      );})}
    </tbody>
  </table>
</div>

    </div>
  );
}

export default ListaPersonal;
