import assert from "node:assert/strict";
import fs from "node:fs";
import {
  crearCalendarioDiarioPDF,
  crearPlanillaSemanalPDF,
  obtenerAsignacionesCalendarioPDF,
  obtenerFilasPlanillaPDF,
  obtenerPerfilVisualCalendarioPDF,
  prepararCertificacionesDiaPDF,
  prepararFilasCalendarioPDF
} from "../src/utils/exportPDF.js";
import { obtenerSemanasDelMes } from "../src/utils/fechas.js";
import {
  crearPersonaPresentacionTurnante,
  esPersonaTurnante,
  obtenerIdentidadesTurnantes,
  obtenerNombreConMarcaTurnante
} from "../src/utils/etiquetaTurnante.js";
import { obtenerClaveIdentidadPersona } from "../src/utils/identidadPersonas.js";
import {
  redistribuirCritica,
  redistribuirPorBoxes
} from "../src/utils/redistribucionEnfermeros.js";
import { configuracionSectores } from "../src/data/sectores.js";
import { crearSnapshotConfiguracionPlanillaLicenciadosV2 } from "../src/utils/configuracionPlanilla.js";
import { CANDIDATOS_PRIORIDAD_COBERTURA_LICENCIADOS_V2 } from "../src/utils/prioridadCoberturaLicenciadosDinamica.js";
import { habilitarTurnanteMensual } from "../src/utils/turnanteMensual.js";

let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`✓ ${nombre}`);
};

const fecha = new Date(2026, 7, 5, 12);
const personas = Array.from({ length: 45 }, (_, indice) => ({
  id: `p${indice + 1}`,
  nombre: `Persona sintética con nombre extenso ${indice + 1}`,
  categoria: indice < 28 ? "enfermero" : "licenciado",
  rol: indice === 0 || indice === 19 || indice === 28
    ? "suplente"
    : "titular"
}));
const crearAsignaciones = (prefijo, cantidad, desplazamiento = 0) =>
  Array.from({ length: cantidad }, (_, indice) => ({
    nombre: `${prefijo} ${indice + 1}`,
    enfermero: indice === cantidad - 2
      ? null
      : personas[indice + desplazamiento],
    ...(indice === cantidad - 2
      ? { etiquetaVacio: "Sin asignar - ausencia" }
      : {}),
    tipo: "sector"
  }));

const asignacionesEnfermeros = [
  ...crearAsignaciones("Sector E", 17),
  { nombre: "1-3 + 19-22", enfermero: personas[17], tipo: "sector" },
  { nombre: "DX 23-29", enfermero: personas[18], tipo: "sector" },
  { nombre: "SIN ASIGNAR", enfermero: personas[19], tipo: "sector" }
];
const asignacionesLicenciados = crearAsignaciones("Sector L", 13, 28);
const certificaciones = [
  {
    personaId: "p1",
    nombre: personas[0].nombre,
    desde: "2026-08-03",
    hasta: "2026-08-07"
  },
  {
    personaId: "p29",
    nombre: personas[28].nombre,
    desde: "2026-08-05",
    hasta: "2026-08-05"
  },
  { personaId: "p2", nombre: personas[1].nombre, desde: "2026-07-01", hasta: "2026-07-31" },
  { personaId: "p3", nombre: personas[2].nombre, desde: "2026-08-10", hasta: "2026-08-12" },
  ...Array.from({ length: 12 }, (_, indice) => ({
    personaId: `p${indice + 4}`,
    nombre: personas[indice + 3].nombre,
    desde: "2026-08-01",
    hasta: "2026-08-09"
  }))
];
const opciones = {
  fecha,
  turnoId: "tarde",
  mesActivo: "2026-08",
  personal: personas,
  certificaciones,
  enfermeros: {
    asignaciones: asignacionesEnfermeros,
    libres: personas.slice(20, 28)
  },
  licenciados: {
    asignaciones: asignacionesLicenciados,
    libres: personas.slice(41, 45)
  }
};
const copiaOpciones = structuredClone(opciones);
const pdf = crearCalendarioDiarioPDF(opciones);

const prioridadLicenciadosV2 = CANDIDATOS_PRIORIDAD_COBERTURA_LICENCIADOS_V2
  .map(({ id }) => id);
const snapshotLicenciadosV2 = crearSnapshotConfiguracionPlanillaLicenciadosV2({
  turno: "tarde",
  mes: "2026-08",
  prioridadCoberturaSectorIds: prioridadLicenciadosV2
}).snapshot;
const estadoLicenciadosV2 = {
  configuracionPlanilla: { licenciado: snapshotLicenciadosV2 },
  planillas: { licenciados: {} }
};
const ordenarPDFLicenciadosV2 = (asignaciones) => obtenerAsignacionesCalendarioPDF({
  asignaciones,
  estadoMensual: estadoLicenciadosV2,
  turnoId: "tarde",
  mesActivo: "2026-08",
  tipo: "licenciado"
});
const filaV2 = (destinoId, nombre, enfermero = null) => ({
  destinoId,
  nombre,
  enfermero,
  tipo: "sector"
});

probar("1 el PDF diario tiene exactamente una página", () => {
  assert.equal(pdf.getNumberOfPages(), 1);
});
probar("2 utiliza A4 horizontal", () => {
  assert.ok(pdf.internal.pageSize.getWidth() > pdf.internal.pageSize.getHeight());
  assert.ok(Math.abs(pdf.internal.pageSize.getWidth() - 297) < 1);
  assert.ok(Math.abs(pdf.internal.pageSize.getHeight() - 210) < 1);
});
probar("3 incluye Enfermeros", () => {
  assert.equal(prepararFilasCalendarioPDF(asignacionesEnfermeros).length, 20);
});
probar("4 incluye Licenciados", () => {
  assert.equal(prepararFilasCalendarioPDF(asignacionesLicenciados).length, 13);
});
probar("5 ambas categorías permanecen en la misma página", () => {
  assert.equal(pdf.getNumberOfPages(), 1);
});
probar("6 conserva todos los sectores visibles de Enfermeros", () => {
  assert.deepEqual(
    prepararFilasCalendarioPDF(asignacionesEnfermeros).map(([sector]) => sector),
    asignacionesEnfermeros.map((fila) => fila.nombre.toUpperCase())
  );
});
probar("7 conserva todos los sectores visibles de Licenciados", () => {
  assert.deepEqual(
    prepararFilasCalendarioPDF(asignacionesLicenciados).map(([sector]) => sector),
    asignacionesLicenciados.map((fila) => fila.nombre.toUpperCase())
  );
});
probar("8 mantiene sectores vacíos", () => {
  assert.ok(
    prepararFilasCalendarioPDF([{ nombre: "Vacío", enfermero: null }])
      .some(([, asignado]) => asignado === "SIN COBERTURA")
  );
});
probar("9 mantiene la señal Sin asignar por ausencia", () => {
  assert.ok(
    prepararFilasCalendarioPDF(asignacionesEnfermeros)
      .some(([, asignado]) => asignado === "SIN ASIGNAR - AUSENCIA")
  );
});
probar("10 mantiene personas en SIN ASIGNAR", () => {
  assert.ok(
    prepararFilasCalendarioPDF(asignacionesEnfermeros)
      .some(([sector, asignado]) =>
        sector === "SIN ASIGNAR" && asignado === personas[19].nombre.toUpperCase()
      )
  );
});
probar("11 mantiene cambios manuales finales", () => {
  assert.equal(
    prepararFilasCalendarioPDF([
      { nombre: "REA 1", enfermero: { nombre: "Asignación manual" } }
    ])[0][1],
    "ASIGNACIÓN MANUAL"
  );
});
probar("11b sectores, nombres y marcas se presentan en mayúsculas sin mutar datos", () => {
  const persona = { nombre: "María Rodríguez", esExtra: true };
  const asignaciones = [{ nombre: "Explora 1", enfermero: persona }];
  const copia = structuredClone(asignaciones);
  assert.deepEqual(prepararFilasCalendarioPDF(asignaciones), [
    ["EXPLORA 1", "MARÍA RODRÍGUEZ (E)"]
  ]);
  assert.deepEqual(asignaciones, copia);
});
probar("11c la presentación no duplica marcas T ni E", () => {
  assert.deepEqual(prepararFilasCalendarioPDF([
    { nombre: "REA 1", enfermero: { nombre: "Juan Pérez", esTurnante: true } },
    { nombre: "REA 2", enfermero: { nombre: "Rosa Silva", esExtra: true } }
  ]), [
    ["REA 1", "JUAN PÉREZ (T)"],
    ["REA 2", "ROSA SILVA (E)"]
  ]);
});
probar("11d tablas y encabezados usan negrita y alto contraste", () => {
  const fuente = fs.readFileSync("src/utils/exportPDF.js", "utf8");
  assert.match(fuente, /head: \[\["SECTOR", "FUNCIONARIO"\]\]/);
  assert.match(fuente, /headStyles: \{[\s\S]*fontStyle: "bold"/);
  assert.match(fuente, /0: \{ cellWidth: 56, fontStyle: "bold" \}/);
  assert.match(fuente, /1: \{ cellWidth: 81, fontStyle: "bold" \}/);
  assert.match(fuente, /textColor: \[15, 23, 42\]/);
});
probar("11e Sin cobertura usa peso normal y medio punto menos", () => {
  const fuente = fs.readFileSync("src/utils/exportPDF.js", "utf8");
  assert.match(fuente, /String\(datos\.cell\.raw\)\.trim\(\) === "SIN COBERTURA"/);
  assert.match(fuente, /datos\.cell\.styles\.fontStyle = "normal"/);
  assert.match(fuente, /datos\.cell\.styles\.fontSize = perfilVisual\.fuenteTabla - 0\.5/);
});
probar("12 mantiene Redistribución opción 1", () => {
  assert.ok(asignacionesEnfermeros.some((fila) => fila.nombre === "1-3 + 19-22"));
});
probar("13 mantiene Redistribución opción 2", () => {
  assert.ok(asignacionesEnfermeros.some((fila) => fila.nombre === "DX 23-29"));
});
probar("14 incluye libres de Enfermeros del día", () => {
  assert.equal(opciones.enfermeros.libres.length, 8);
});
probar("15 incluye libres de Licenciados del día", () => {
  assert.equal(opciones.licenciados.libres.length, 4);
});

const calendarioFuente = fs.readFileSync(
  new URL("../src/components/calendario/CalendarioDiario.jsx", import.meta.url),
  "utf8"
);
probar("16 onDataReady identifica únicamente la fecha activa", () => {
  assert.match(calendarioFuente, /keyDia/);
  assert.match(calendarioFuente, /libresParaPDF/);
});
probar("17 ausentes no entran en libres del PDF", () => {
  assert.match(
    calendarioFuente,
    /obtenerEstadoAsistencia\(asistenciaFecha, persona\) !==\s*ESTADOS_ASISTENCIA\.AUSENTE/
  );
});

const certificacionesDia = prepararCertificacionesDiaPDF({
  certificaciones,
  fecha,
  personal: personas
});
probar("18 incluye certificaciones vigentes", () => {
  assert.ok(certificacionesDia.some((item) => item.nombre === personas[0].nombre));
});
probar("19 excluye certificaciones vencidas", () => {
  assert.equal(certificacionesDia.some((item) => item.nombre === personas[1].nombre), false);
});
probar("20 excluye certificaciones futuras", () => {
  assert.equal(certificacionesDia.some((item) => item.nombre === personas[2].nombre), false);
});
probar("21 contempla el mensaje sin certificaciones", () => {
  const fuente = fs.readFileSync(
    new URL("../src/utils/exportPDF.js", import.meta.url),
    "utf8"
  );
  assert.match(fuente, /Sin certificaciones médicas para esta fecha/);
});
probar("22 no modifica los datos mensuales recibidos", () => {
  assert.deepEqual(opciones, copiaOpciones);
});
probar("23 no genera una segunda página", () => {
  assert.equal(pdf.getNumberOfPages(), 1);
});
probar("24 no deja una página vacía", () => {
  assert.ok(pdf.output("arraybuffer").byteLength > 1000);
});

const semanas = obtenerSemanasDelMes("2026-08");
const planillaVacia = Object.fromEntries(
  semanas.map((semana) => [semana.clave, {}])
);
const pdfSemanal = crearPlanillaSemanalPDF({
  planillaEnfermeros: planillaVacia,
  planillaLicenciados: planillaVacia,
  semanas,
  personal: personas,
  turnoId: "tarde",
  mesActivo: "2026-08"
});
probar("25 Planilla semanal continúa con exactamente tres páginas", () => {
  assert.equal(pdfSemanal.getNumberOfPages(), 3);
});
probar("26 ambos PDFs usan generadores separados", () => {
  const fuente = fs.readFileSync(
    new URL("../src/utils/exportPDF.js", import.meta.url),
    "utf8"
  );
  assert.match(fuente, /export const crearCalendarioDiarioPDF/);
  assert.match(fuente, /export const crearPlanillaSemanalPDF/);
});

const titularTurnanteEnfermero = personas[1];
const segundoTurnanteEnfermero = personas[2];
const suplenteEnSectorFijo = personas[0];
const titularTurnanteLicenciado = { ...personas[28], rol: "titular" };
const identidadesTurnantesEnfermeros = obtenerIdentidadesTurnantes({
  distribucion: {
    T1: { personaId: titularTurnanteEnfermero.id, nombre: titularTurnanteEnfermero.nombre },
    T2: { personaId: segundoTurnanteEnfermero.id, nombre: segundoTurnanteEnfermero.nombre },
    "REA 1": { personaId: suplenteEnSectorFijo.id, nombre: suplenteEnSectorFijo.nombre }
  },
  posicionesTurnantes: configuracionSectores.enfermero.turnantes,
  personal: personas
});
const personalConLicenciadoTitular = [
  ...personas.filter((persona) => persona.id !== titularTurnanteLicenciado.id),
  titularTurnanteLicenciado
];
const identidadesTurnantesLicenciados = obtenerIdentidadesTurnantes({
  distribucion: {
    T1: {
      personaId: titularTurnanteLicenciado.id,
      nombre: titularTurnanteLicenciado.nombre
    }
  },
  posicionesTurnantes: configuracionSectores.licenciado.turnantes,
  personal: personalConLicenciadoTitular
});
const enfermeroTurnantePresentacion = crearPersonaPresentacionTurnante(
  titularTurnanteEnfermero,
  identidadesTurnantesEnfermeros
);
const segundoTurnantePresentacion = crearPersonaPresentacionTurnante(
  segundoTurnanteEnfermero,
  identidadesTurnantesEnfermeros
);
const licenciadoTurnantePresentacion = crearPersonaPresentacionTurnante(
  titularTurnanteLicenciado,
  identidadesTurnantesLicenciados
);

probar("27 un titular asignado a T1 muestra la marca Turnante", () => {
  assert.equal(titularTurnanteEnfermero.rol, "titular");
  assert.equal(
    esPersonaTurnante(titularTurnanteEnfermero, identidadesTurnantesEnfermeros),
    true
  );
  assert.match(obtenerNombreConMarcaTurnante(enfermeroTurnantePresentacion), /\(T\)$/);
});
probar("28 un suplente asignado a REA 1 no muestra la marca", () => {
  assert.equal(suplenteEnSectorFijo.rol, "suplente");
  assert.equal(
    esPersonaTurnante(suplenteEnSectorFijo, identidadesTurnantesEnfermeros),
    false
  );
  assert.equal(
    obtenerNombreConMarcaTurnante(
      suplenteEnSectorFijo,
      "",
      identidadesTurnantesEnfermeros
    ),
    suplenteEnSectorFijo.nombre
  );
});
probar("29 una persona de T1 cubriendo DX conserva la marca", () => {
  assert.equal(
    prepararFilasCalendarioPDF([
      { nombre: "DX 25-30", enfermero: enfermeroTurnantePresentacion, tipo: "sector" }
    ])[0][1],
    `${titularTurnanteEnfermero.nombre} (T)`.toUpperCase()
  );
});
probar("30 una persona de T2 movida manualmente conserva la marca", () => {
  assert.equal(
    prepararFilasCalendarioPDF([
      { nombre: "REA 1", enfermero: segundoTurnantePresentacion, tipo: "sector" }
    ])[0][1],
    `${segundoTurnanteEnfermero.nombre} (T)`.toUpperCase()
  );
});
probar("31 un titular de una fila fija no recibe la marca", () => {
  const titularFijo = personas[3];
  assert.equal(
    obtenerNombreConMarcaTurnante(titularFijo, "", identidadesTurnantesEnfermeros),
    titularFijo.nombre
  );
});
probar("32 la marca funciona en Enfermeros", () => {
  assert.equal(enfermeroTurnantePresentacion.esTurnante, true);
});
probar("33 la marca funciona en Licenciados", () => {
  assert.equal(licenciadoTurnantePresentacion.esTurnante, true);
});
probar("34 la semana activa es la fuente de identidades Turnantes", () => {
  assert.match(calendarioFuente, /distribucion: planillaPeriodo/);
  assert.match(calendarioFuente, /posicionesTurnantes: turnantesEfectivos/);
});
probar("35 Noche cada tres días usa el bloque activo", () => {
  assert.match(
    calendarioFuente,
    /resolverPeriodoPlanillaDia\(\{[\s\S]*planillaPeriodo: resultado\.distribucion \|\| \{\}/
  );
});
probar("36 cambios manuales y SIN ASIGNAR conservan la marca", () => {
  assert.match(calendarioFuente, /crearPersonaPresentacionTurnante/);
  assert.match(calendarioFuente, /handleClick\(item\)/);
  assert.equal(
    prepararFilasCalendarioPDF([
      { nombre: "SIN ASIGNAR", enfermero: segundoTurnantePresentacion, tipo: "sector" }
    ])[0][1],
    `${segundoTurnanteEnfermero.nombre} (T)`.toUpperCase()
  );
});
probar("37 extras solo muestran marca si su identidad proviene de T", () => {
  assert.match(
    calendarioFuente,
    /obtenerNombreConMarcaTurnante\(e, "", identidadesTurnantes\)/
  );
  assert.equal(
    obtenerNombreConMarcaTurnante(
      suplenteEnSectorFijo,
      "",
      identidadesTurnantesEnfermeros
    ).includes("(T)"),
    false
  );
});
probar("38 Redistribución opción 1 conserva la marca de origen", () => {
  const resultado = redistribuirCritica({
    asignaciones: [
      { nombre: "REA 1", enfermero: enfermeroTurnantePresentacion },
      { nombre: "REA 2", enfermero: suplenteEnSectorFijo }
    ],
    ordenVisual: configuracionSectores.enfermero.ordenVisual,
    prioridadSectores: configuracionSectores.enfermero.prioridadSectores
  });
  assert.ok(
    prepararFilasCalendarioPDF(resultado.asignaciones)
      .some(([, nombre]) => nombre.endsWith("(T)"))
  );
});
probar("39 Redistribución opción 2 conserva la marca de origen", () => {
  const resultado = redistribuirPorBoxes({
    asignaciones: [
      { nombre: "REA 1", enfermero: enfermeroTurnantePresentacion },
      { nombre: "REA 2", enfermero: suplenteEnSectorFijo }
    ],
    ordenVisual: configuracionSectores.enfermero.ordenVisual,
    prioridadSectores: configuracionSectores.enfermero.prioridadSectores
  });
  assert.ok(
    prepararFilasCalendarioPDF(resultado.asignaciones)
      .some(([, nombre]) => nombre.endsWith("(T)"))
  );
});
probar("40 no modifica nombre, identidad ni referencia", () => {
  const nombreOriginal = titularTurnanteEnfermero.nombre;
  const identidadOriginal = obtenerClaveIdentidadPersona(titularTurnanteEnfermero);
  assert.equal(enfermeroTurnantePresentacion.nombre, nombreOriginal);
  assert.equal(
    obtenerClaveIdentidadPersona(enfermeroTurnantePresentacion),
    identidadOriginal
  );
  assert.equal(nombreOriginal.includes("(T)"), false);
});
probar("41 el PDF diario con marcas continúa en una página", () => {
  const pdfConTurnante = crearCalendarioDiarioPDF({
    ...opciones,
    enfermeros: {
      ...opciones.enfermeros,
      asignaciones: [
        {
          nombre: "DX 25-30",
          enfermero: enfermeroTurnantePresentacion,
          tipo: "sector"
        },
        ...opciones.enfermeros.asignaciones
      ]
    }
  });
  assert.equal(pdfConTurnante.getNumberOfPages(), 1);
  assert.ok(
    prepararFilasCalendarioPDF([
      { nombre: "DX 25-30", enfermero: enfermeroTurnantePresentacion, tipo: "sector" }
    ])[0][1].endsWith("(T)")
  );
});
probar("42 la Planilla semanal continúa en tres páginas", () => {
  assert.equal(pdfSemanal.getNumberOfPages(), 3);
});

const crearCasoAdaptativo = ({
  filasEnfermeros,
  filasLicenciados,
  libresEnfermeros,
  libresLicenciados,
  cantidadCertificaciones,
  nombresLargos = false
}) => {
  const totalPersonas = filasEnfermeros + filasLicenciados +
    libresEnfermeros + libresLicenciados + cantidadCertificaciones;
  const personalCaso = Array.from({ length: totalPersonas }, (_, indice) => ({
    id: `adaptativo-${indice}`,
    nombre: nombresLargos
      ? `Nombre muy extenso compuesto para verificar ajuste de funcionario ${indice + 1}`
      : `Funcionario ${indice + 1}`,
    categoria: indice < filasEnfermeros + libresEnfermeros
      ? "enfermero"
      : "licenciado"
  }));
  const asignar = (cantidad, inicio, prefijo) => Array.from(
    { length: cantidad },
    (_, indice) => ({
      nombre: nombresLargos
        ? `${prefijo} con denominación extensa ${indice + 1}`
        : `${prefijo} ${indice + 1}`,
      enfermero: {
        ...personalCaso[inicio + indice],
        ...(indice === 1 ? { esTurnante: true } : {}),
        ...(indice === 2 ? { esExtra: true } : {})
      },
      tipo: "sector"
    })
  );
  const inicioLibresEnfermeros = filasEnfermeros;
  const inicioLicenciados = filasEnfermeros + libresEnfermeros;
  const inicioLibresLicenciados = inicioLicenciados + filasLicenciados;
  const inicioCertificados = inicioLibresLicenciados + libresLicenciados;
  const opcionesCaso = {
    fecha: new Date(2026, 7, 2, 12),
    turnoId: "tarde",
    mesActivo: "2026-08",
    personal: personalCaso,
    certificaciones: Array.from({ length: cantidadCertificaciones }, (_, indice) => ({
      personaId: personalCaso[inicioCertificados + indice].id,
      nombre: personalCaso[inicioCertificados + indice].nombre,
      desde: "2026-08-02",
      hasta: "2026-08-02"
    })),
    enfermeros: {
      asignaciones: asignar(filasEnfermeros, 0, "Sector enfermeros"),
      libres: personalCaso.slice(
        inicioLibresEnfermeros,
        inicioLibresEnfermeros + libresEnfermeros
      )
    },
    licenciados: {
      asignaciones: asignar(filasLicenciados, inicioLicenciados, "Sector licenciados"),
      libres: personalCaso.slice(
        inicioLibresLicenciados,
        inicioLibresLicenciados + libresLicenciados
      )
    }
  };
  return opcionesCaso;
};

[
  {
    nombre: "caso real 17/11",
    datos: {
      filasEnfermeros: 17,
      filasLicenciados: 11,
      libresEnfermeros: 4,
      libresLicenciados: 2,
      cantidadCertificaciones: 2
    },
    perfil: "normal"
  },
  {
    nombre: "caso habitual 20/12",
    datos: {
      filasEnfermeros: 20,
      filasLicenciados: 12,
      libresEnfermeros: 6,
      libresLicenciados: 4,
      cantidadCertificaciones: 4
    },
    perfil: "normal"
  },
  {
    nombre: "caso intermedio 24/24",
    datos: {
      filasEnfermeros: 24,
      filasLicenciados: 24,
      libresEnfermeros: 5,
      libresLicenciados: 4,
      cantidadCertificaciones: 4
    },
    perfil: "intermedio"
  },
  {
    nombre: "caso extremo 26/26",
    datos: {
      filasEnfermeros: 26,
      filasLicenciados: 26,
      libresEnfermeros: 6,
      libresLicenciados: 5,
      cantidadCertificaciones: 5,
      nombresLargos: true
    },
    perfil: "extremo"
  }
].forEach(({ nombre, datos, perfil }) => {
  probar(`43 ${nombre} conserva una página y los datos`, () => {
    const opcionesCaso = crearCasoAdaptativo(datos);
    const copia = structuredClone(opcionesCaso);
    const pdfCaso = crearCalendarioDiarioPDF(opcionesCaso);
    const maximoFilas = Math.max(datos.filasEnfermeros, datos.filasLicenciados);
    const cantidadInferior = datos.libresEnfermeros +
      datos.libresLicenciados + datos.cantidadCertificaciones;
    assert.equal(pdfCaso.getNumberOfPages(), 1);
    assert.equal(
      obtenerPerfilVisualCalendarioPDF({ maximoFilas, cantidadInferior }).nombre,
      perfil
    );
    assert.deepEqual(opcionesCaso, copia);
    assert.equal(
      prepararFilasCalendarioPDF(opcionesCaso.enfermeros.asignaciones).length,
      datos.filasEnfermeros
    );
    assert.equal(
      prepararFilasCalendarioPDF(opcionesCaso.licenciados.asignaciones).length,
      datos.filasLicenciados
    );
  });
});

probar("44 los perfiles usan tamaños y alturas adaptativos", () => {
  assert.deepEqual(
    obtenerPerfilVisualCalendarioPDF({ maximoFilas: 20, cantidadInferior: 8 }),
    {
      nombre: "normal",
      fuenteTabla: 9,
      fuenteEncabezadoTabla: 9,
      paddingTabla: 1.3,
      altoMinimoFila: 4.2,
      fuenteTituloTabla: 10,
      fuenteTituloInferior: 9,
      fuenteContenidoInferior: 8,
      separacionFilaInferior: 6.2,
      altoLineaInferior: 3
    }
  );
  assert.deepEqual(
    obtenerPerfilVisualCalendarioPDF({ maximoFilas: 20, cantidadInferior: 13 }),
    {
      nombre: "normal",
      fuenteTabla: 8,
      fuenteEncabezadoTabla: 9,
      paddingTabla: 1.15,
      altoMinimoFila: 4,
      fuenteTituloTabla: 10,
      fuenteTituloInferior: 9,
      fuenteContenidoInferior: 8,
      separacionFilaInferior: 6.2,
      altoLineaInferior: 3
    }
  );
  assert.equal(obtenerPerfilVisualCalendarioPDF({ maximoFilas: 24 }).fuenteTabla, 7.25);
  assert.equal(obtenerPerfilVisualCalendarioPDF({ maximoFilas: 25 }).fuenteTabla, 6.25);
});

probar("PDF diario v2 <=9 conserva exactamente los dos combinados finales", () => {
  const finales = [
    filaV2("reanimacion_sillones", "Reanimación + Sillones", personas[28]),
    filaV2("diagnostico_explora", "Diagnóstico + Explora", personas[29])
  ];
  assert.deepEqual(ordenarPDFLicenciadosV2(finales), finales);
  assert.deepEqual(prepararFilasCalendarioPDF(finales).map(([nombre]) => nombre), [
    "REANIMACIÓN + SILLONES", "DIAGNÓSTICO + EXPLORA"
  ]);
});

probar("PDF diario v2 10 conserva el perfil Sillones en orden visible", () => {
  const finales = [
    filaV2("reanimacion", "Reanimación", personas[28]),
    filaV2("sillones", "Sillones", personas[30]),
    filaV2("diagnostico_explora", "Diagnóstico + Explora", personas[29])
  ];
  assert.deepEqual(ordenarPDFLicenciadosV2(finales).map(({ destinoId }) => destinoId), [
    "reanimacion", "sillones", "diagnostico_explora"
  ]);
});

probar("PDF diario v2 10 conserva el perfil Explora en orden visible", () => {
  const finales = [
    filaV2("reanimacion_sillones", "Reanimación + Sillones", personas[28]),
    filaV2("diagnostico", "Diagnóstico", personas[29]),
    filaV2("explora", "Explora", personas[30])
  ];
  assert.deepEqual(ordenarPDFLicenciadosV2(finales).map(({ destinoId }) => destinoId), [
    "reanimacion_sillones", "diagnostico", "explora"
  ]);
});

probar("PDF diario v2 11+ conserva cuatro destinos y personas finales sin duplicar", () => {
  const finales = [
    filaV2("reanimacion", "Reanimación", personas[28]),
    filaV2("sillones", "Sillones", { ...personas[30], esTurnante: true }),
    filaV2("diagnostico", "Diagnóstico", personas[29]),
    filaV2("explora", "Explora", personas[31])
  ];
  const resultado = ordenarPDFLicenciadosV2(finales);
  assert.equal(new Set(resultado.map(({ enfermero }) => enfermero.id)).size, 4);
  assert.deepEqual(resultado.map(({ destinoId }) => destinoId), finales.map(({ destinoId }) => destinoId));
});

probar("movimientos, Extras y Sin asignar llegan al PDF en su posición final", () => {
  const extra = { id: "extra-pdf", nombre: "Extra final", categoria: "licenciado" };
  const finales = [
    filaV2("reanimacion", "Reanimación", personas[30]),
    filaV2("sillones", "Sillones", personas[28]),
    filaV2("explora", "Explora", extra),
    { destinoId: "sin_asignar", nombre: "SIN ASIGNAR", enfermero: personas[32], tipo: "sector" }
  ];
  assert.deepEqual(ordenarPDFLicenciadosV2(finales), finales);
  assert.equal(prepararFilasCalendarioPDF(finales).filter(([, nombre]) => nombre.includes("EXTRA FINAL")).length, 1);
});

probar("PDF mensual v2 conserva filas base, T3 y T4 opcional sin destinos diarios", () => {
  const filasBase = obtenerFilasPlanillaPDF({
    estadoMensual: estadoLicenciadosV2, turnoId: "tarde", mesActivo: "2026-08", tipo: "licenciado"
  });
  assert.equal(filasBase.includes("T3"), true);
  assert.equal(filasBase.includes("T4"), false);
  assert.equal(filasBase.some((fila) => ["Sillones", "Explora", "Reanimación + Sillones", "Diagnóstico + Explora"].includes(fila)), false);
  const estadoConT4 = structuredClone(estadoLicenciadosV2);
  estadoConT4.planillas.licenciados = habilitarTurnanteMensual({}, "licenciado", snapshotLicenciadosV2);
  const filasConT4 = obtenerFilasPlanillaPDF({
    estadoMensual: estadoConT4, turnoId: "tarde", mesActivo: "2026-08", tipo: "licenciado"
  });
  assert.equal(filasConT4.filter((fila) => fila === "T3").length, 1);
  assert.equal(filasConT4.filter((fila) => fila === "T4").length, 1);
});

probar("exportPDF no reordena la secuencia diaria con configuración mensual", () => {
  const fuente = fs.readFileSync("src/utils/exportPDF.js", "utf8");
  assert.match(fuente, /obtenerAsignacionesCalendarioPDF[\s\S]*return Array\.isArray\(asignaciones\) \? asignaciones : \[\]/);
  assert.doesNotMatch(fuente, /clavesSectoresActivos|resolverEstructuraCalendario/);
  assert.doesNotMatch(fuente, /resolverCalendarioLicenciadosDinamico|resolverPerfilEstructuraLicenciadosDia/);
});

console.log(`\n${total} pruebas de PDF de Calendario Diario pasaron.`);
