import assert from "node:assert/strict";
import fs from "node:fs";
import {
  estaCertificado,
  keyDiaFromDate,
  parsearFechaLocal
} from "../src/utils/fechas.js";
import {
  crearEstadoMensualVacio,
  normalizarEstadoMensual
} from "../src/utils/estadoMensual.js";

let ejecutadas = 0;
const probar = (nombre, prueba) => {
  prueba();
  ejecutadas += 1;
  console.log(`✓ ${nombre}`);
};

const fecha = parsearFechaLocal("2026-08-01");
const persona = {
  id: "persona-milton",
  nombre: "Milton",
  categoria: "enfermero",
  libre: 5
};
const rosa = {
  id: "extra-rosa",
  nombre: "Rosa",
  categoria: "enfermero",
  temporal: true,
  esExtra: true
};
const certificada = {
  id: "persona-certificada",
  nombre: "Persona certificada",
  categoria: "enfermero",
  libre: 4
};

const inicial = crearEstadoMensualVacio();
const hidratado = normalizarEstadoMensual({
  ...inicial,
  personal: [persona, certificada],
  planillas: {
    ...inicial.planillas,
    enfermeros: {
      ...inicial.planillas.enfermeros,
      semana1: {
        "EXPLORA 1": { personaId: persona.id, nombre: persona.nombre },
        "REA 1": { personaId: certificada.id, nombre: certificada.nombre }
      }
    }
  },
  certificaciones: [{
    id: "certificacion-dia",
    personaId: certificada.id,
    nombre: certificada.nombre,
    categoria: "enfermero",
    desde: "2026-08-01",
    hasta: "2026-08-01",
    origen: "no_disponibles_dia"
  }],
  calendario: {
    ...inicial.calendario,
    enfermeros: {
      cambiosDia: {
        "2026-08-01": {
          "EXPLORA 1": { personaId: rosa.id, nombre: rosa.nombre }
        }
      },
      cambiosParoDia: {},
      noDisponibles: {
        "2026-08-01": [{
          personaId: "persona-no-disponible",
          nombre: "No disponible",
          motivo: "falta_con_aviso"
        }]
      },
      extras: {
        "2026-08-01": [{
          ...rosa,
          tipoExtra: "cobertura",
          personaCubiertaId: persona.id,
          personaCubiertaNombre: persona.nombre,
          sectorCubiertoNombre: "EXPLORA 1"
        }]
      },
      asistenciaDia: {
        "2026-08-01": {
          [persona.id]: {
            estado: "presente",
            persona: { personaId: persona.id, nombre: persona.nombre }
          }
        }
      },
      cierresDia: {}
    }
  }
});

probar("el estado inicial está vacío para la misma fecha", () => {
  assert.deepEqual(inicial.calendario.enfermeros.cambiosDia, {});
  assert.equal(keyDiaFromDate(fecha), "2026-08-01");
});

probar("la hidratación incorpora cambiosDia sin cambiar la fecha", () => {
  assert.equal(keyDiaFromDate(fecha), "2026-08-01");
  assert.equal(
    hidratado.calendario.enfermeros.cambiosDia["2026-08-01"]["EXPLORA 1"].personaId,
    rosa.id
  );
});

probar("la hidratación incorpora No disponibles", () => {
  assert.equal(
    hidratado.calendario.enfermeros.noDisponibles["2026-08-01"][0].motivo,
    "falta_con_aviso"
  );
});

probar("la hidratación incorpora Extras y coberturas", () => {
  const extra = hidratado.calendario.enfermeros.extras["2026-08-01"][0];
  assert.equal(extra.nombre, "Rosa");
  assert.equal(extra.personaCubiertaId, persona.id);
});

probar("la hidratación incorpora asistencia", () => {
  assert.equal(
    hidratado.calendario.enfermeros.asistenciaDia["2026-08-01"][persona.id].estado,
    "presente"
  );
});

probar("la certificación del día se evalúa con fecha local normalizada", () => {
  assert.equal(estaCertificado(hidratado.certificaciones, certificada, fecha, hidratado.personal), true);
});

probar("el inicio de la aplicación normaliza la hora de la fecha activa", () => {
  const app = fs.readFileSync("src/App.jsx", "utf8");
  assert.match(
    app,
    /useState\(\(\) => parsearFechaLocal\(keyDiaFromDate\(new Date\(\)\)\)\)/
  );
});

probar("la carga autoritativa sincroniza estado y ref en la misma actualización", () => {
  const app = fs.readFileSync("src/App.jsx", "utf8");
  assert.match(
    app,
    /\[claveCarga\]: clasificacion\.estado[\s\S]*estadoPorTurnoMesRef\.current = siguiente;[\s\S]*return siguiente;/
  );
});

probar("Calendario Diario deriva la distribución de las props actuales", () => {
  const calendario = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
  assert.match(calendario, /const \{[\s\S]*cambiosDia = \{\}[\s\S]*\} = calendario \|\| \{\};/);
  assert.match(calendario, /const asignacionOrdenada = \(\(\) => \{/);
  assert.doesNotMatch(calendario, /useState\([^\n]*(asignacionOrdenada|calendario|planilla)/);
});

probar("onDataReady depende de la distribución recalculada", () => {
  const calendario = fs.readFileSync("src/components/calendario/CalendarioDiario.jsx", "utf8");
  assert.match(
    calendario,
    /useEffect\(\(\) => \{[\s\S]*onDataReady\(datosParaPDF\)[\s\S]*\}, \[[\s\S]*asignacionOrdenada,[\s\S]*noDisponibles,[\s\S]*\]\);/
  );
});

console.log(`\n${ejecutadas} pruebas de hidratación completadas.`);
