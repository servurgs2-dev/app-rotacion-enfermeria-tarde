import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { configuracionSectores } from "../src/data/sectores.js";
import { crearSnapshotConfiguracionPlanilla } from "../src/utils/configuracionPlanilla.js";
import { crearEstadoMensualVacio } from "../src/utils/estadoMensual.js";
import {
  obtenerAsignacionesCalendarioPDF,
  obtenerDocumentoCalendarioPDF,
  obtenerDocumentoPlanillaPDF,
  obtenerFilasPlanillaPDF,
  prepararFilasCalendarioPDF,
  prepararTablaPlanillaPDF
} from "../src/utils/exportPDF.js";

const clonar = (valor) => JSON.parse(JSON.stringify(valor));
const legacy = crearEstadoMensualVacio();
const contexto = { estadoMensual: legacy, turnoId: "tarde", mesActivo: "2026-08" };
const filasPlanilla = (tipo, estadoMensual = legacy, turnoId = "tarde", mesActivo = "2026-08") =>
  obtenerFilasPlanillaPDF({
    estadoMensual, turnoId, mesActivo, tipo,
    ordenLegacy: configuracionSectores[tipo].ordenPDF
  });

let total = 0;
const probar = async (nombre, prueba) => {
  await prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};

await probar("1 PDF Enfermeros legacy obtiene estructura 34A", () => {
  assert.equal(filasPlanilla("enfermero").length, 20);
});
await probar("2 PDF Licenciados legacy obtiene estructura 34A", () => {
  assert.equal(filasPlanilla("licenciado").length, 12);
});
await probar("3 leer legacy no crea configuracionPlanilla", () => {
  filasPlanilla("enfermero");
  assert.equal(Object.hasOwn(legacy, "configuracionPlanilla"), false);
});
await probar("4 T6 legacy se conserva", () => {
  const estado = crearEstadoMensualVacio();
  estado.planillas.enfermeros.posicionesMensualesAdicionales = ["T6"];
  assert.equal(filasPlanilla("enfermero", estado).at(-1), "T6");
});
await probar("5 T3 legacy se conserva", () => {
  const estado = crearEstadoMensualVacio();
  estado.planillas.licenciados.posicionesMensualesAdicionales = ["T3"];
  assert.equal(filasPlanilla("licenciado", estado).at(-1), "T3");
});

const septiembre = crearEstadoMensualVacio();
const snapshotEnfermero = crearSnapshotConfiguracionPlanilla({
  turno: "tarde", categoria: "enfermero", mes: "2026-09",
  posicionesMensualesAdicionales: ["T6"]
});
const snapshotLicenciado = crearSnapshotConfiguracionPlanilla({
  turno: "tarde", categoria: "licenciado", mes: "2026-09",
  posicionesMensualesAdicionales: ["T3"]
});
[snapshotEnfermero.filas[0].orden, snapshotEnfermero.filas[1].orden] =
  [snapshotEnfermero.filas[1].orden, snapshotEnfermero.filas[0].orden];
[snapshotLicenciado.filas[0].orden, snapshotLicenciado.filas[1].orden] =
  [snapshotLicenciado.filas[1].orden, snapshotLicenciado.filas[0].orden];
snapshotEnfermero.filas[2].activo = false;
septiembre.configuracionPlanilla = {
  enfermero: snapshotEnfermero,
  licenciado: snapshotLicenciado
};

await probar("6 snapshot Enfermeros prevalece", () => {
  assert.equal(filasPlanilla("enfermero", septiembre, "tarde", "2026-09")[0], snapshotEnfermero.filas[1].etiqueta);
});
await probar("7 snapshot Licenciados prevalece", () => {
  assert.equal(filasPlanilla("licenciado", septiembre, "tarde", "2026-09")[0], snapshotLicenciado.filas[1].etiqueta);
});
await probar("8 PDF respeta orden propio del snapshot", () => {
  assert.deepEqual(
    filasPlanilla("enfermero", septiembre, "tarde", "2026-09").slice(0, 2),
    [snapshotEnfermero.filas[1].etiqueta, snapshotEnfermero.filas[0].etiqueta]
  );
});
await probar("9 fila inactiva no se incluye", () => {
  assert.equal(
    filasPlanilla("enfermero", septiembre, "tarde", "2026-09")
      .includes(snapshotEnfermero.filas[2].etiqueta),
    false
  );
});
await probar("10 snapshot de otro mes no se usa", () => {
  assert.equal(filasPlanilla("enfermero", septiembre, "tarde", "2026-10")[0], configuracionSectores.enfermero.ordenPDF[0]);
});
await probar("11 snapshot de otro turno no se usa", () => {
  assert.equal(filasPlanilla("enfermero", septiembre, "noche", "2026-09")[0], configuracionSectores.enfermero.ordenPDF[0]);
});
await probar("12 lectura no muta estadoMensual", () => {
  const antes = clonar(septiembre);
  filasPlanilla("enfermero", septiembre, "tarde", "2026-09");
  assert.deepEqual(septiembre, antes);
});
await probar("13 lectura no muta configuracionSectores", () => {
  const antes = clonar(configuracionSectores);
  filasPlanilla("licenciado", septiembre, "tarde", "2026-09");
  assert.deepEqual(configuracionSectores, antes);
});
await probar("14 exportPDF no crea snapshots", async () => {
  const fuente = await readFile(new URL("../src/utils/exportPDF.js", import.meta.url), "utf8");
  assert.match(fuente, /obtenerConfiguracionPlanillaEfectiva\(\{/);
  assert.doesNotMatch(fuente, /crearSnapshotConfiguracionPlanilla/);
});
await probar("15 PDF diario sigue generándose", () => {
  const documento = obtenerDocumentoCalendarioPDF({
    ...contexto,
    fecha: new Date(2026, 7, 10, 12),
    enfermeros: { asignaciones: [], libres: [] },
    licenciados: { asignaciones: [], libres: [] }
  });
  assert.equal(documento.pdf.getNumberOfPages(), 1);
});
await probar("16 PDF de Planilla sigue generándose", () => {
  const documento = obtenerDocumentoPlanillaPDF({
    ...contexto,
    planillaEnfermeros: legacy.planillas.enfermeros,
    planillaLicenciados: legacy.planillas.licenciados,
    personal: []
  });
  assert.equal(documento.pdf.getNumberOfPages(), 3);
});
await probar("17 turnantes mantienen tratamiento visual", () => {
  const filas = prepararFilasCalendarioPDF([{
    nombre: "REA 1",
    enfermero: { id: "t1", nombre: "Titular", esTurnante: true },
    tipo: "sector"
  }]);
  assert.match(filas[0][1], /\(T\)/);
  assert.equal(filasPlanilla("enfermero", septiembre, "tarde", "2026-09").includes("T6"), true);
  assert.equal(filasPlanilla("licenciado", septiembre, "tarde", "2026-09").includes("T3"), true);
});
await probar("18 PDF legacy mantiene orden histórico", () => {
  assert.deepEqual(
    filasPlanilla("enfermero").slice(0, configuracionSectores.enfermero.ordenPDF.length),
    configuracionSectores.enfermero.ordenPDF
  );
});
await probar("19 PDF diario con snapshot usa estructura nueva", () => {
  const asignaciones = snapshotEnfermero.filas
    .filter((fila) => fila.tipo === "sector")
    .map((fila) => ({ nombre: fila.etiqueta, enfermero: null, tipo: "sector" }));
  const ordenadas = obtenerAsignacionesCalendarioPDF({
    asignaciones,
    estadoMensual: septiembre,
    turnoId: "tarde",
    mesActivo: "2026-09",
    tipo: "enfermero"
  });
  assert.deepEqual(ordenadas.slice(0, 2).map((fila) => fila.nombre), [
    snapshotEnfermero.filas[1].etiqueta,
    snapshotEnfermero.filas[0].etiqueta
  ]);
  assert.equal(ordenadas.some((fila) => fila.nombre === snapshotEnfermero.filas[2].etiqueta), false);
});
await probar("20 PDF de Planilla usa etiqueta de boxes por turno", () => {
  assert.equal(filasPlanilla("enfermero", legacy, "manana").includes("14-18"), true);
  assert.equal(filasPlanilla("enfermero", legacy, "manana").includes("19-22+24"), true);
  for (const turnoId of ["tarde", "vespertino", "noche"]) {
    assert.equal(filasPlanilla("enfermero", legacy, turnoId).includes("14-19"), true);
    assert.equal(filasPlanilla("enfermero", legacy, turnoId).includes("20-22+24"), true);
  }
});

await probar("20b PDF mensual conserva asignación histórica 14-19 con etiqueta Mañana", () => {
  const tabla = prepararTablaPlanillaPDF({
    planilla: { semana1: { "14-19": { personaId: "persona-14" } } },
    periodos: [{ clave: "semana1", desde: new Date(2026, 7, 1), hasta: new Date(2026, 7, 7) }],
    estrategia: { tipo: "semanal" }, tipo: "enfermero",
    personal: [{ id: "persona-14", nombre: "Persona 14" }],
    ordenFilas: configuracionSectores.enfermero.ordenPDF,
    estadoMensual: legacy, turnoId: "manana", mesActivo: "2026-08"
  });
  const fila = tabla.cuerpo.find(([etiqueta]) => etiqueta === "14-18");
  assert.equal(fila[1], "Persona 14");
});

await probar("21 PDF mensual conserva asignación guardada con alias histórico", () => {
  const tabla = prepararTablaPlanillaPDF({
    planilla: { semana1: { "20-22-24": { personaId: "persona-boxes" } } },
    periodos: [{ clave: "semana1", desde: new Date(2026, 7, 1), hasta: new Date(2026, 7, 7) }],
    estrategia: { tipo: "semanal" }, tipo: "enfermero",
    personal: [{ id: "persona-boxes", nombre: "Persona Boxes" }],
    ordenFilas: configuracionSectores.enfermero.ordenPDF,
    estadoMensual: legacy, turnoId: "manana", mesActivo: "2026-08"
  });
  const fila = tabla.cuerpo.find(([etiqueta]) => etiqueta === "19-22+24");
  assert.equal(fila[1], "Persona Boxes");
});

await probar("22 correo reutiliza los generadores actualizados", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const modal = await readFile(new URL("../src/components/correo/ModalEnviarPDF.jsx", import.meta.url), "utf8");
  assert.match(app, /obtenerAdjuntoPlanillaPDF\(\{[\s\S]*?estadoMensual: mesData/);
  assert.match(app, /obtenerAdjuntoCalendarioPDF\(\{[\s\S]*?estadoMensual: mesData/);
  assert.match(modal, /const adjunto = await generarPDF\(\)/);
  assert.doesNotMatch(app, /enviarPDFCorreo/);
});

console.log(`\nEtapa 34B3C: ${total} pruebas de PDF con configuración efectiva aprobadas.`);
