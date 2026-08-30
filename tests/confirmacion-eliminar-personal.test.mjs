import assert from "node:assert/strict";
import fs from "node:fs";

const lista = fs.readFileSync("src/components/personal/ListaPersonal.jsx", "utf8");
const app = fs.readFileSync("src/App.jsx", "utf8");
const integridad = fs.readFileSync("src/utils/integridadPersonas.js", "utf8");
let total = 0;
const probar = (nombre, prueba) => {
  prueba();
  total += 1;
  console.log(`OK ${total} ${nombre}`);
};

const bloqueBoton = lista.slice(
  lista.indexOf('aria-label={`Eliminar a ${p.nombre}`}'),
  lista.indexOf("</button>", lista.indexOf('aria-label={`Eliminar a ${p.nombre}`}'))
);
const bloqueSolicitar = lista.slice(
  lista.indexOf("const solicitarEliminarPersona"),
  lista.indexOf("const cancelarEliminarPersona")
);
const bloqueCancelar = lista.slice(
  lista.indexOf("const cancelarEliminarPersona"),
  lista.indexOf("const confirmarEliminarPersona")
);
const bloqueConfirmar = lista.slice(
  lista.indexOf("const confirmarEliminarPersona"),
  lista.indexOf("const iniciarEdicionNombre")
);

probar("click en eliminar abre la confirmación sin ejecutar el callback", () => {
  assert.match(bloqueBoton, /solicitarEliminarPersona\(personaOperacion\)/);
  assert.doesNotMatch(bloqueBoton, /onEliminarPersona/);
});
probar("la persona pendiente inicia en null", () =>
  assert.match(lista, /personaPendienteEliminar, setPersonaPendienteEliminar\] = useState\(null\)/));
probar("abrir conserva la misma persona real", () => {
  assert.match(bloqueSolicitar, /persona,/);
  assert.match(bloqueSolicitar, /personalEsperado: personal/);
});
probar("el modal común se reutiliza", () =>
  assert.match(lista, /personaPendienteEliminar[\s\S]*<PanelConfirmacionLimpieza/));
probar("la confirmación muestra el nombre", () =>
  assert.match(lista, /¿Eliminar a \$\{personaPendienteEliminar\.persona\.nombre\} de Personal\?/));
probar("la confirmación muestra funcionario cuando existe", () =>
  assert.match(lista, /personaPendienteEliminar\.persona\.funcionario[\s\S]*Funcionario:/));
probar("cancelar cierra sin ejecutar la eliminación", () => {
  assert.match(bloqueCancelar, /setPersonaPendienteEliminar\(null\)/);
  assert.doesNotMatch(bloqueCancelar, /onEliminarPersona/);
});
probar("confirmar llama una sola vez al callback existente", () =>
  assert.equal((bloqueConfirmar.match(/onEliminarPersona\(pendiente\.persona\)/g) || []).length, 1));
probar("el guard one-shot bloquea una segunda confirmación", () => {
  assert.match(bloqueConfirmar, /if \(eliminacionPersonaEnCursoRef\.current\) return/);
  assert.match(bloqueConfirmar, /eliminacionPersonaEnCursoRef\.current = true/);
});
probar("una confirmación nueva reinicia el guard", () =>
  assert.match(bloqueSolicitar, /eliminacionPersonaEnCursoRef\.current = false/));
probar("la identidad se valida exclusivamente por persona id", () => {
  assert.match(bloqueConfirmar, /pendiente\?\.persona\?\.id/);
  assert.match(bloqueConfirmar, /coincidencias\.length !== 1/);
  assert.doesNotMatch(bloqueConfirmar, /\.nombre\s*===/);
});
probar("el componente no modifica nombre ni identidad", () => {
  assert.doesNotMatch(bloqueConfirmar, /\.nombre\s*=|\.id\s*=/);
  assert.match(bloqueConfirmar, /onEliminarPersona\(pendiente\.persona\)/);
});
probar("solo lectura bloquea apertura y confirmación", () => {
  assert.match(bloqueSolicitar, /if \(soloLectura\) return/);
  assert.match(bloqueConfirmar, /soloLectura/);
  assert.match(lista, /disabled=\{soloLectura \|\| !esFisicaEnTurnoVisualizado\}[\s\S]{0,180}aria-label=\{`Eliminar a/);
});
probar("la validación de pertenencia física permanece antes del modal", () =>
  assert.match(bloqueBoton, /if \(!esFisicaEnTurnoVisualizado\) return/));
probar("la validación de identidad duplicada permanece antes del modal", () =>
  assert.match(bloqueBoton, /idsDuplicados\.has/));
probar("turno mes y modo invalidan la confirmación pendiente", () =>
  assert.match(lista, /setPersonaPendienteEliminar\(null\)[\s\S]*\[claveContextoLimpieza\]/));
probar("un cambio del padrón invalida una confirmación stale", () => {
  assert.match(bloqueConfirmar, /pendiente\.personalEsperado !== personal/);
  assert.match(bloqueConfirmar, /coincidencias\[0\] !== pendiente\.persona/);
});
probar("el modal y botón mantienen contrato mobile y accesible", () => {
  assert.match(lista, /aria-label=\{`Eliminar a \$\{p\.nombre\}`\}/);
  assert.match(lista, /textoConfirmar="Eliminar"/);
  assert.match(lista, /onCancelar=\{cancelarEliminarPersona\}/);
});
probar("App e integridad conservan la única lógica destructiva", () => {
  assert.match(app, /const eliminarPersona = \(persona\) =>/);
  assert.match(app, /limpiarReferenciasDePersona\(actual, personaActual\)/);
  assert.match(integridad, /export const limpiarReferenciasDePersona/);
  assert.doesNotMatch(lista, /limpiarReferenciasDePersona|limpiarPersonaDePlanilla|limpiarPersonaDeCalendario/);
});

console.log(`Confirmación de eliminación de Personal: ${total}/${total} comprobaciones OK.`);
