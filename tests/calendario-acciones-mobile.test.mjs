import assert from "node:assert/strict";
import fs from "node:fs";
import { quitarPersonaDeListaReferencias } from "../src/utils/referenciasPersonas.js";
import {
  crearCertificacionPorElDia,
  eliminarCertificacionPorElDia
} from "../src/utils/certificacionesPersonas.js";

let aprobadas = 0;
const probar = (nombre, fn) => {
  fn();
  aprobadas += 1;
  console.log(`✓ ${aprobadas}. ${nombre}`);
};

const calendario = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
const vista = fs.readFileSync("src/components/calendario/mobile/VistaDistribucionMobile.jsx", "utf8");
const bloques = fs.readFileSync("src/components/calendario/mobile/BloquesOperativosMobile.jsx", "utf8");

probar("ya no existe menú ni botón de puntos suspensivos", () => {
  assert.equal(fs.existsSync("src/components/calendario/mobile/AccionesPersonaMobile.jsx"), false);
  assert.doesNotMatch(vista, /AccionesPersonaMobile|⋯|role="menu"|aria-expanded/);
  assert.doesNotMatch(calendario, /accionesRapidas/);
});

probar("la acción ámbar sólo se monta para una persona elegible", () => {
  assert.match(vista, /\{fila\.puedeMarcarNoDisponible && \(/);
  assert.match(calendario, /const puedeMarcarNoDisponible = !soloLecturaEfectiva/);
  assert.match(calendario, /personaPersonal &&[\s\S]*!esExtraDelDia/);
  assert.match(calendario, /!estaCertificadoHoy\(personaPersonal\)/);
});

probar("el ícono abre directamente el PanelNoDisponible existente", () => {
  assert.match(vista, /onGestionarNoDisponible\(fila\.personaGestionNoDisponible, fila\.registroNoDisponible\)/);
  assert.match(calendario, /onGestionarNoDisponible=\{abrirFormularioNoDisponible\}/);
  assert.equal((calendario.match(/<PanelNoDisponible/g) || []).length, 1);
  assert.match(vista, /Marcar a \$\{fila\.textoPersona\} como no disponible/);
});

probar("el ícono no dispara selección ni elimina Personal o Planilla", () => {
  assert.match(vista, /onClick=\{\(evento\) => \{[\s\S]*evento\.stopPropagation\(\);[\s\S]*onGestionarNoDisponible/);
  assert.match(vista, /onClick=\{\(\) => onSeleccionar\(fila\.original\)\}/);
  assert.doesNotMatch(vista, /setPersonal|setPlanilla|eliminarPersona|borrarPersona/);
});

probar("Extras e histórico quedan fuera por decisión productiva", () => {
  assert.match(calendario, /const esExtraDelDia = item\.enfermero && extrasDia\.some/);
  assert.match(calendario, /!esExtraDelDia/);
  assert.match(calendario, /!soloLecturaEfectiva/);
});

probar("SIN ASIGNAR usa identidad y no una regla por nombre", () => {
  const inicio = calendario.indexOf("const personaPersonal =");
  const fin = calendario.indexOf("return {", inicio);
  const elegibilidad = calendario.slice(inicio, fin);
  assert.match(elegibilidad, /personasCompartenIdentidad/);
  assert.doesNotMatch(elegibilidad, /SIN ASIGNAR|item\.nombre|normalizar/);
});

probar("el bloque inferior reutiliza la eliminación productiva", () => {
  const inicioHelper = calendario.indexOf("const aplicarQuitarNoDisponible =");
  const finHelper = calendario.indexOf("const quitarNoDisponible =", inicioHelper);
  const helper = calendario.slice(inicioHelper, finHelper);
  assert.match(bloques, />Quitar<\/button>/);
  assert.match(calendario, /onQuitarNoDisponible=\{quitarNoDisponibleDesdeBloque\}/);
  assert.match(helper, /quitarPersonaDeListaReferencias/);
  assert.doesNotMatch(bloques, /setCalendario|quitarPersonaDeListaReferencias|filter\(/);
});

probar("el ícono es el único iniciador mobile y el bloque sólo gestiona registros existentes", () => {
  assert.doesNotMatch(bloques, /Gestionar personal|candidatosNoDisponibles|onGestionarNoDisponible/);
  assert.doesNotMatch(calendario, /candidatosNoDisponiblesMobile/);
  assert.match(bloques, /Editar motivo/);
  assert.match(bloques, />Quitar<\/button>/);
  assert.match(bloques, /Eliminar certificación del día/);
  assert.match(vista, /Marcar a \$\{fila\.textoPersona\} como no disponible/);
});

probar("la acción usa un SVG local de persona con salida y no una X", () => {
  const inicio = vista.indexOf("function IconoSacarDeDistribucion");
  const fin = vista.indexOf("function TarjetaSectorMobile", inicio);
  const icono = vista.slice(inicio, fin);
  assert.match(icono, /<svg/);
  assert.match(icono, /aria-hidden="true"/);
  assert.match(icono, /viewBox="0 0 24 24"/);
  assert.match(icono, /width="22"/);
  assert.match(icono, /height="22"/);
  assert.match(icono, /<circle/);
  assert.ok((icono.match(/<path/g) || []).length >= 2);
  assert.doesNotMatch(icono, />\s*X\s*</);
});

probar("el botón conserva accesibilidad, área táctil y cambia rojo por ámbar", () => {
  const inicio = vista.indexOf('aria-label={`Marcar a ${fila.textoPersona} como no disponible`}');
  const fin = vista.indexOf("</button>", inicio);
  const boton = vista.slice(inicio, fin);
  assert.match(boton, /title="Marcar no disponible"/);
  assert.match(boton, /min-h-11/);
  assert.match(boton, /min-w-11/);
  assert.match(boton, /border-amber-300/);
  assert.match(boton, /bg-amber-50/);
  assert.match(boton, /text-amber-800/);
  assert.doesNotMatch(boton, /red-/);
  assert.match(boton, /<IconoSacarDeDistribucion \/>/);
});

probar("no se agrega una dependencia de íconos ni se modifica desktop", () => {
  const paquete = fs.readFileSync("package.json", "utf8");
  assert.doesNotMatch(vista, /from ["'](?:lucide-react|react-icons|@heroicons)/);
  assert.doesNotMatch(paquete, /lucide-react|react-icons|@heroicons/);
  assert.doesNotMatch(calendario, /IconoSacarDeDistribucion/);
});

probar("quitar una referencia vuelve a hacer elegible a esa persona", () => {
  const persona = { id: "persona-1", nombre: "Persona Uno" };
  const otra = { id: "persona-2", nombre: "Persona Dos" };
  const lista = [
    { personaId: persona.id, nombre: persona.nombre },
    { personaId: otra.id, nombre: otra.nombre }
  ];
  const resultado = quitarPersonaDeListaReferencias(lista, persona, [persona, otra]);
  assert.deepEqual(resultado, [{ personaId: otra.id, nombre: otra.nombre }]);
  assert.equal(resultado.some((registro) => registro.personaId === persona.id), false);
});

probar("un Extra vinculado conserva la confirmación del panel existente", () => {
  assert.match(calendario, /if \(item\.registro\.personaCoberturaId\) \{[\s\S]*abrirFormularioNoDisponible/);
  assert.match(calendario, /confirmarEliminacion: true/);
  assert.match(calendario, /eliminarNoDisponibleVinculado/);
});

probar("eliminar certificación rápida vuelve a quitar el bloqueo certificado", () => {
  const persona = { id: "persona-1", nombre: "Persona Uno", categoria: "enfermero" };
  const certificacionDia = crearCertificacionPorElDia({
    persona,
    fecha: "2026-08-18",
    categoria: "enfermero"
  }).certificacion;
  const certificaciones = [
    certificacionDia,
    { id: "cert-2", personaId: "persona-2", desde: "2026-08-18", hasta: "2026-08-18" }
  ];
  assert.deepEqual(
    eliminarCertificacionPorElDia({ certificaciones, certificacionId: certificacionDia.id }),
    [certificaciones[1]]
  );
  assert.match(calendario, /onQuitarCertificacionRapida=\{\(item\) => quitarCertificacionRapida\(item\.registro\)\}/);
  assert.match(bloques, /Eliminar certificación del día/);
});

probar("asistencia y Turnante conservan sus flujos previos", () => {
  assert.match(vista, /<select[\s\S]*onCambiarAsistencia\(fila\.persona/);
  assert.match(calendario, /const textoPersona = item\.enfermero[\s\S]*obtenerNombreConMarcaTurnante/);
});

console.log(`\n${aprobadas} pruebas del acceso directo mobile pasaron.`);
