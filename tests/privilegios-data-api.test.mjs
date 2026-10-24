import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directorioMigraciones = path.join(raiz, "supabase", "migrations");
const archivoNormalizacion = "20261024090000_normalizar_privilegios_data_api.sql";
const sqlNormalizacion = fs.readFileSync(
  path.join(directorioMigraciones, archivoNormalizacion),
  "utf8"
);
const migraciones = fs.readdirSync(directorioMigraciones)
  .filter((archivo) => archivo.endsWith(".sql"))
  .sort();

const contratos = Object.freeze({
  estado_por_turno_mes: { authenticated: ["select", "insert", "update", "delete"], serviceRole: [] },
  estado_por_mes: { authenticated: ["select", "insert", "update", "delete"], serviceRole: [] },
  perfiles_usuario: { authenticated: ["select"], serviceRole: [] },
  historial_estado_turno_mes: { authenticated: ["select"], serviceRole: [] },
  envios_correo_pdf: { authenticated: [], serviceRole: ["insert"] },
  novedades_personal: { authenticated: ["select", "insert", "update", "delete"], serviceRole: [] },
  configuracion_dotacion_supervision_mes: { authenticated: ["select"], serviceRole: [] },
  historial_configuracion_dotacion_supervision_mes: { authenticated: ["select"], serviceRole: [] },
  vigencias_turno_personal_mes: { authenticated: ["select"], serviceRole: [] },
  historial_vigencias_turno_personal_mes: { authenticated: ["select"], serviceRole: [] }
});

const escapar = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const bloquePrivilegios = (tabla) => {
  const patron = new RegExp(
    `revoke\\s+all\\s+privileges\\s+on\\s+table\\s+public\\.${escapar(tabla)}[\\s\\S]*?(?=revoke\\s+all\\s+privileges\\s+on\\s+table|commit\\s*;)`,
    "i"
  );
  return sqlNormalizacion.match(patron)?.[0] || "";
};
const privilegiosConcedidos = (bloque, rol) => {
  const encontrados = [...bloque.matchAll(
    new RegExp(`grant\\s+([^;]+?)\\s+on\\s+table\\s+public\\.[a-z0-9_]+\\s+to\\s+${rol}\\s*;`, "gi")
  )];
  return encontrados.flatMap((coincidencia) =>
    coincidencia[1].split(",").map((privilegio) => privilegio.trim().toLowerCase())
  ).sort();
};

let aprobadas = 0;
const probar = (nombre, prueba) => {
  prueba();
  aprobadas += 1;
  console.log(`OK ${nombre}`);
};

probar("inventario conocido coincide con las tablas public administradas", () => {
  const creadas = new Set();
  migraciones.forEach((archivo) => {
    const sql = fs.readFileSync(path.join(directorioMigraciones, archivo), "utf8");
    for (const coincidencia of sql.matchAll(/create\s+table(?:\s+if\s+not\s+exists)?\s+public\.([a-z0-9_]+)/gi)) {
      creadas.add(coincidencia[1].toLowerCase());
    }
  });
  assert.deepEqual(
    [...creadas].sort(),
    Object.keys(contratos).filter((tabla) => tabla !== "estado_por_mes").sort()
  );
});

Object.entries(contratos).forEach(([tabla, contrato]) => {
  probar(`${tabla} revoca defaults de los cuatro roles`, () => {
    const bloque = bloquePrivilegios(tabla);
    assert.ok(bloque, `Falta el bloque de privilegios de ${tabla}`);
    assert.match(bloque, /from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role\s*;/i);
  });

  probar(`${tabla} conserva mínimo privilegio explícito`, () => {
    const bloque = bloquePrivilegios(tabla);
    assert.deepEqual(privilegiosConcedidos(bloque, "authenticated"), [...contrato.authenticated].sort());
    assert.deepEqual(privilegiosConcedidos(bloque, "service_role"), [...contrato.serviceRole].sort());
    assert.doesNotMatch(bloque, /\bto\s+anon\b/i);
  });
});

probar("tablas RPC-only no conceden escritura directa authenticated", () => {
  for (const tabla of [
    "configuracion_dotacion_supervision_mes",
    "historial_configuracion_dotacion_supervision_mes",
    "vigencias_turno_personal_mes",
    "historial_vigencias_turno_personal_mes",
    "historial_estado_turno_mes"
  ]) {
    assert.doesNotMatch(
      bloquePrivilegios(tabla),
      /grant\s+[^;]*(?:insert|update|delete)[^;]*\s+to\s+authenticated/i,
      `${tabla} no debe admitir escritura directa`
    );
  }
});

probar("service_role queda limitado al INSERT de auditoría de correo", () => {
  const grants = [...sqlNormalizacion.matchAll(/grant\s+([^;]+?)\s+on\s+table\s+public\.([a-z0-9_]+)\s+to\s+service_role\s*;/gi)]
    .map((coincidencia) => `${coincidencia[2]}:${coincidencia[1].trim().toLowerCase()}`);
  assert.deepEqual(grants, ["envios_correo_pdf:insert"]);
});

probar("migraciones futuras con CREATE TABLE declaran privilegios de cada rol", () => {
  const posteriores = migraciones.filter((archivo) => archivo > archivoNormalizacion);
  posteriores.forEach((archivo) => {
    const sql = fs.readFileSync(path.join(directorioMigraciones, archivo), "utf8");
    const tablas = [...sql.matchAll(/create\s+table(?:\s+if\s+not\s+exists)?\s+public\.([a-z0-9_]+)/gi)]
      .map((coincidencia) => coincidencia[1]);
    tablas.forEach((tabla) => {
      for (const rol of ["anon", "authenticated", "service_role"]) {
        assert.match(
          sql,
          new RegExp(`(?:grant|revoke)[^;]*on\\s+table\\s+public\\.${escapar(tabla)}[^;]*(?:to|from)[^;]*\\b${rol}\\b`, "i"),
          `${archivo}: falta definir acceso de ${rol} para ${tabla}`
        );
      }
    });
  });
});

console.log(`\n${aprobadas} comprobaciones de privilegios Data API pasaron.`);
