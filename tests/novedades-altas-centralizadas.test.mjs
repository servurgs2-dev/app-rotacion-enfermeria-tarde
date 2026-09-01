import assert from "node:assert/strict";
import fs from "node:fs";
import { crearLicenciaPersona } from "../src/utils/licenciasPersonas.js";
import { crearCertificacionPersona } from "../src/utils/certificacionesPersonas.js";
import {
  crearNovedadesLegacy,
  eliminarRegistroLegacyProyectado,
  evaluarDisponibilidadPorNovedades,
  reemplazarRegistroLegacyProyectado
} from "../src/utils/novedadesPersonal.js";

let aprobadas = 0;
const probar = (nombre, fn) => {
  fn(); aprobadas += 1; console.log(`✓ ${nombre}`);
};

const persona = { id: "persona-1", nombre: "Persona Uno", categoria: "enfermero" };

probar("la barra contiene seis acciones específicas en el orden previsto", () => {
  const fuente = fs.readFileSync("src/components/novedades/Novedades.jsx", "utf8");
  const acciones = ["Licencia", "Certificación", "Suspensión", "Lista de paro", "Cambio de horario", "Olvido de tarjeta"];
  let posicion = -1;
  acciones.forEach((accion) => {
    const siguiente = fuente.indexOf(`\"${accion}\"`, posicion + 1);
    assert.ok(siguiente > posicion, `${accion} debe existir y conservar el orden`);
    posicion = siguiente;
  });
  assert.doesNotMatch(fuente, /Suspensión \/ otra novedad|OPCIONES_ALTA_NOVEDAD|formularioAbierto/);
  assert.doesNotMatch(fuente, /FormularioExcedente|Editar Excedente|Guardar novedad/);
});

probar("Otra y Excedente permanecen sólo en catálogo, no como acciones", () => {
  const fuente = fs.readFileSync("src/components/novedades/Novedades.jsx", "utf8");
  const modelo = fs.readFileSync("src/utils/novedadesPersonal.js", "utf8");
  assert.match(modelo, /OTRA: "otra"/);
  assert.match(modelo, /EXCEDENTE: "excedente"/);
  assert.doesNotMatch(fuente, /\["otra",|\["excedente",/);
  assert.match(fuente, /TIPOS_OCULTOS_EN_UI = new Set\(\[\s*TIPOS_NOVEDAD_PERSONAL\.OTRA,\s*TIPOS_NOVEDAD_PERSONAL\.EXCEDENTE/s);
  assert.match(fuente, /OPCIONES_TIPO_NOVEDAD_OPERATIVAS\.map/);
  assert.doesNotMatch(fuente, /\{OPCIONES_TIPO_NOVEDAD\.map/);
});

probar("Licencia usa el constructor legacy y una sola proyección", () => {
  const licencia = crearLicenciaPersona(persona, "2026-08-20", "2026-08-22");
  const proyectadas = crearNovedadesLegacy({ licencias: [licencia], certificaciones: [], personal: [persona] });
  assert.equal(proyectadas.length, 1);
  assert.equal(proyectadas[0].tipo, "licencia");
  assert.equal(proyectadas[0].origen, "licencias_legacy");
  assert.equal(evaluarDisponibilidadPorNovedades({ licencias: [licencia], personal: [persona], persona, fecha: "2026-08-21", turno: "tarde" }).disponible, false);
});

probar("Certificación usa el constructor legacy y una sola proyección", () => {
  const certificacion = crearCertificacionPersona(persona, { desde: "2026-08-20", hasta: "2026-08-22" });
  const proyectadas = crearNovedadesLegacy({ licencias: [], certificaciones: [certificacion], personal: [persona] });
  assert.equal(proyectadas.length, 1);
  assert.equal(proyectadas[0].tipo, "certificacion");
  assert.equal(proyectadas[0].origen, "certificaciones_legacy");
  assert.equal(evaluarDisponibilidadPorNovedades({ certificaciones: [certificacion], personal: [persona], persona, fecha: "2026-08-21", turno: "tarde" }).disponible, false);
});

probar("editar una Licencia reemplaza el registro original sin aumentar el array", () => {
  const licencia = crearLicenciaPersona(persona, "2026-08-20", "2026-08-22");
  const [proyeccion] = crearNovedadesLegacy({ licencias: [licencia], personal: [persona] });
  const actualizacion = crearLicenciaPersona(persona, "2026-08-21", "2026-08-22");
  const resultado = reemplazarRegistroLegacyProyectado({ registros: [licencia], novedad: proyeccion, actualizacion });
  assert.equal(resultado.error, "");
  assert.equal(resultado.registros.length, 1);
  assert.equal(resultado.registros[0].desde, "2026-08-21");
  assert.equal(crearNovedadesLegacy({ licencias: resultado.registros, personal: [persona] }).length, 1);
  assert.equal(evaluarDisponibilidadPorNovedades({ licencias: resultado.registros, personal: [persona], persona, fecha: "2026-08-20", turno: "tarde" }).disponible, true);
  assert.equal(evaluarDisponibilidadPorNovedades({ licencias: resultado.registros, personal: [persona], persona, fecha: "2026-08-21", turno: "tarde" }).disponible, false);
});

probar("eliminar una Licencia quita la única fuente legacy y restaura disponibilidad", () => {
  const licencia = crearLicenciaPersona(persona, "2026-08-20", "2026-08-22");
  const [proyeccion] = crearNovedadesLegacy({ licencias: [licencia], personal: [persona] });
  const resultado = eliminarRegistroLegacyProyectado({ registros: [licencia], novedad: proyeccion });
  assert.equal(resultado.error, "");
  assert.equal(resultado.registros.length, 0);
  assert.equal(crearNovedadesLegacy({ licencias: resultado.registros, personal: [persona] }).length, 0);
  assert.equal(evaluarDisponibilidadPorNovedades({ licencias: resultado.registros, personal: [persona], persona, fecha: "2026-08-21", turno: "tarde" }).disponible, true);
});

probar("editar y eliminar una Certificación operan sobre el mismo registro legacy", () => {
  const certificacion = { ...crearCertificacionPersona(persona, { desde: "2026-08-20", hasta: "2026-08-22" }), id: "cert-1" };
  const [proyeccion] = crearNovedadesLegacy({ certificaciones: [certificacion], personal: [persona] });
  assert.equal(proyeccion.registroOrigenId, "cert-1");
  const actualizacion = crearCertificacionPersona(persona, { desde: "2026-08-21", hasta: "2026-08-23" });
  const editada = reemplazarRegistroLegacyProyectado({ registros: [certificacion], novedad: proyeccion, actualizacion });
  assert.equal(editada.registros.length, 1);
  assert.equal(editada.registros[0].id, "cert-1");
  assert.equal(editada.registros[0].desde, "2026-08-21");
  const eliminada = eliminarRegistroLegacyProyectado({ registros: editada.registros, novedad: crearNovedadesLegacy({ certificaciones: editada.registros, personal: [persona] })[0] });
  assert.equal(eliminada.registros.length, 0);
});

probar("una Certificación legacy sin id usa índice validado, persona y rango", () => {
  const certificacion = crearCertificacionPersona(persona, { desde: "2026-08-20", hasta: "2026-08-22" });
  assert.equal(certificacion.id, undefined);
  const [proyeccion] = crearNovedadesLegacy({ certificaciones: [certificacion], personal: [persona] });
  assert.equal(proyeccion.registroOrigenId, null);
  assert.equal(proyeccion.registroOrigenIndice, 0);
  const actualizacion = crearCertificacionPersona(persona, { desde: "2026-08-21", hasta: "2026-08-23" });
  const resultado = reemplazarRegistroLegacyProyectado({ registros: [certificacion], novedad: proyeccion, actualizacion });
  assert.equal(resultado.error, "");
  assert.equal(resultado.registros.length, 1);
  assert.equal(resultado.registros[0].desde, "2026-08-21");
});

probar("una proyección obsoleta rechaza edición y eliminación sin cambiar el array", () => {
  const licencia = crearLicenciaPersona(persona, "2026-08-20", "2026-08-22");
  const [proyeccion] = crearNovedadesLegacy({ licencias: [licencia], personal: [persona] });
  const registrosActuales = [];
  const editada = reemplazarRegistroLegacyProyectado({
    registros: registrosActuales,
    novedad: proyeccion,
    actualizacion: crearLicenciaPersona(persona, "2026-08-21", "2026-08-22")
  });
  const eliminada = eliminarRegistroLegacyProyectado({ registros: registrosActuales, novedad: proyeccion });
  assert.equal(editada.error, "El registro original ya no está disponible.");
  assert.equal(eliminada.error, "El registro original ya no está disponible.");
  assert.equal(editada.registros, registrosActuales);
  assert.equal(eliminada.registros, registrosActuales);
});

probar("App actualiza estructuras mensuales sin registrar copias centrales", () => {
  const app = fs.readFileSync("src/App.jsx", "utf8");
  assert.match(app, /onGuardarLicencia=\{\(licencia\) => actualizarLicenciasMes/);
  assert.match(app, /onGuardarCertificacion=\{\(certificacion\) => actualizarCertificacionesMes/);
  assert.match(app, /onEditarLicencia=.*editarRegistroLegacyMes\("licencias"/);
  assert.match(app, /onEliminarCertificacion=.*eliminarRegistroLegacyMes\("certificaciones"/);
  assert.match(app, /const turnoOrigen = novedad\?\.turnoOrigenEstado \|\| turnoActivo;[\s\S]*const resultado = reemplazarRegistroLegacyProyectado\(\{ registros, novedad, actualizacion \}\);[\s\S]*\[claveOrigen\].*\[campo\]: resultado\.registros/);
  assert.match(app, /const turnoOrigen = novedad\?\.turnoOrigenEstado \|\| turnoActivo;[\s\S]*const resultado = eliminarRegistroLegacyProyectado\(\{ registros, novedad \}\);[\s\S]*\[claveOrigen\].*\[campo\]: resultado\.registros/);
  assert.match(app, /licencias: nuevas/);
  assert.match(app, /certificaciones: nuevas/);
  assert.doesNotMatch(app, /registrarNovedadPersonal\(licencia\)|registrarNovedadPersonal\(certificacion\)/);
  assert.doesNotMatch(app, /components\/licencias\/Licencias|components\/certificaciones\/Certificaciones|<Licencias|<Certificaciones/);
});

probar("un solo flujo de alta se muestra a la vez y solo lectura oculta acciones", () => {
  const fuente = fs.readFileSync("src/components/novedades/Novedades.jsx", "utf8");
  assert.match(fuente, /const \[accionAbierta, setAccionAbierta\]/);
  assert.match(fuente, /!soloLectura && \(/);
  assert.match(fuente, /accionAbierta === "licencia"/);
  assert.match(fuente, /accionAbierta === "certificacion"/);
  assert.match(fuente, /Editar \{novedad\.tipo === "licencia"/);
  assert.match(fuente, /Eliminar \$\{novedad\.tipo === "licencia"/);
  assert.match(fuente, /!soloLectura && puedeEditarRegistroLegacy\(novedad\) && \["licencia", "certificacion"\]/);
  assert.match(fuente, /filtrarNovedadesVisibles\(filtrarNovedadesPorTurnoActivo/);
  assert.doesNotMatch(fuente, /novedad\.estado === "cancelada" \? "border-slate/);
  assert.match(fuente, /Eliminar suspensión/);
  assert.match(fuente, /Eliminar cambio/);
  assert.match(fuente, /Eliminar olvido/);
});

console.log(`\n${aprobadas} pruebas de altas centralizadas en Novedades aprobadas.`);
