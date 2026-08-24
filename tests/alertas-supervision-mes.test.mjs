import assert from "node:assert/strict";
import fs from "node:fs";
import { construirAlertasSupervisionMes } from "../src/utils/alertasSupervisionMes.js";

let total = 0;
const probar = (nombre, fn) => { fn(); total += 1; console.log(`OK ${total} ${nombre}`); };
const copiar = (valor) => JSON.parse(JSON.stringify(valor));
const dia = (fecha, advertencias = [], errores = []) => ({ fecha, advertencias, errores, turnos: {} });
const resultado = (dias = [], extra = {}) => ({ ok: true, mes: "2026-08", fechas: dias.map((d) => d.fecha), dias, cantidadDias: 31, errores: [], ...extra });
const buscar = (salida, codigo) => salida.alertas.find((a) => a.codigo === codigo);
const fuente = fs.readFileSync("src/utils/alertasSupervisionMes.js", "utf8");

const warnings = [
  { codigo: "EXTRA_ORIGEN_NO_VERIFICABLE", turno: "tarde", categoria: "licenciado", personaId: "p1", turnoOrigen: "manana", motivo: "PERSONA_ID_NO_ENCONTRADA" },
  { codigo: "EXTRA_INDISPONIBLE_EN_TURNO_ORIGEN", turno: "tarde", categoria: "enfermero", personaId: "p2", turnoOrigen: "noche", causas: ["licencia"] },
  { codigo: "ASISTENCIA_FUERA_DE_DOTACION", turno: "manana", categoria: "enfermero", cantidad: 2 },
  { codigo: "IDENTIDAD_AMBIGUA", turno: "noche", categoria: "licenciado" }
];
const base = construirAlertasSupervisionMes(resultado([dia("2026-08-24", warnings)]));

probar("utilidad existe", () => assert.equal(typeof construirAlertasSupervisionMes, "function"));
probar("recibe resultado mensual", () => assert.match(fuente, /resultadoMensual/));
probar("erroresCarga son opcionales", () => assert.equal(construirAlertasSupervisionMes(resultado()).alertas.length, 0));
probar("fuente correcta", () => assert.equal(base.fuente, "proyeccion_supervision_mes"));
probar("warning conocido se normaliza", () => assert.equal(base.resumen.advertenciasPresentadas, 4));
probar("error conocido se normaliza", () => assert.equal(construirAlertasSupervisionMes(resultado([dia("2026-08-01", [], [{ codigo: "PLANILLA_NO_PREPARADA" }])])).resumen.erroresPresentados, 1));
probar("codigo desconocido no se pierde", () => assert.equal(buscar(construirAlertasSupervisionMes(resultado([dia("2026-08-01", [{ codigo: "W_NUEVO" }])])), "W_NUEVO").titulo, "Advertencia de calidad de datos"));
probar("titulo Extra no verificable", () => assert.equal(buscar(base, "EXTRA_ORIGEN_NO_VERIFICABLE").titulo, "Extra de otro turno sin verificaci\u00f3n completa"));
probar("titulo Extra bloqueado", () => assert.equal(buscar(base, "EXTRA_INDISPONIBLE_EN_TURNO_ORIGEN").titulo, "Extra bloqueado por indisponibilidad en origen"));
probar("titulo asistencia", () => assert.equal(buscar(base, "ASISTENCIA_FUERA_DE_DOTACION").titulo, "Asistencia registrada fuera de la dotaci\u00f3n"));
probar("titulo identidad ambigua", () => assert.equal(buscar(base, "IDENTIDAD_AMBIGUA").titulo, "Referencia con identidad ambigua"));
probar("titulo Planilla", () => { const s=construirAlertasSupervisionMes(resultado([dia("2026-08-01",[],[{codigo:"PLANILLA_NO_PREPARADA"}])])); assert.equal(buscar(s,"PLANILLA_NO_PREPARADA").titulo,"Planilla mensual no preparada"); });
probar("codigo queda metadata", () => assert.equal(buscar(base,"EXTRA_ORIGEN_NO_VERIFICABLE").codigo,"EXTRA_ORIGEN_NO_VERIFICABLE"));
probar("fecha viene del dia", () => assert.equal(buscar(base,"EXTRA_ORIGEN_NO_VERIFICABLE").fecha,"2026-08-24"));
probar("turno explicito", () => assert.equal(buscar(base,"EXTRA_ORIGEN_NO_VERIFICABLE").turno,"tarde"));
probar("categoria explicita", () => assert.equal(buscar(base,"EXTRA_ORIGEN_NO_VERIFICABLE").categoria,"licenciado"));
probar("personaId explicito", () => assert.equal(buscar(base,"EXTRA_ORIGEN_NO_VERIFICABLE").personaId,"p1"));
probar("turnoOrigen explicito", () => assert.equal(buscar(base,"EXTRA_ORIGEN_NO_VERIFICABLE").turnoOrigen,"manana"));
probar("causas se conservan", () => assert.deepEqual(buscar(base,"EXTRA_INDISPONIBLE_EN_TURNO_ORIGEN").causas,["licencia"]));
probar("motivo se conserva", () => assert.equal(buscar(base,"EXTRA_ORIGEN_NO_VERIFICABLE").motivo,"PERSONA_ID_NO_ENCONTRADA"));
probar("no resuelve personaNombre", () => assert.equal("personaNombre" in buscar(base,"EXTRA_ORIGEN_NO_VERIFICABLE"),false));
probar("warning global sin turno", () => { const a=construirAlertasSupervisionMes(resultado([dia("2026-08-01",[{codigo:"W"}])])).alertas[0]; assert.equal("turno" in a,false); });
probar("warning global sin categoria", () => { const a=construirAlertasSupervisionMes(resultado([dia("2026-08-01",[{codigo:"W"}])])).alertas[0]; assert.equal("categoria" in a,false); });
probar("error mensual sin fecha", () => { const a=construirAlertasSupervisionMes({ok:false,mes:"x",dias:[],errores:[{codigo:"MES_INVALIDO"}]}).alertas[0]; assert.equal("fecha" in a,false); });
probar("Extra no verificable informacion", () => assert.equal(buscar(base,"EXTRA_ORIGEN_NO_VERIFICABLE").severidad,"informacion"));
probar("Extra bloqueado atencion", () => assert.equal(buscar(base,"EXTRA_INDISPONIBLE_EN_TURNO_ORIGEN").severidad,"atencion"));
probar("identidad ambigua atencion", () => assert.equal(buscar(base,"IDENTIDAD_AMBIGUA").severidad,"atencion"));
probar("Planilla es error", () => { const s=construirAlertasSupervisionMes(resultado([dia("2026-08-01",[],[{codigo:"PLANILLA_NO_PREPARADA"}])])); assert.equal(buscar(s,"PLANILLA_NO_PREPARADA").severidad,"error"); });
probar("evento diario usa fecha en dedupe", () => assert.match(buscar(base,"IDENTIDAD_AMBIGUA").id,/2026-08-24/));
probar("warning diario duplicado se deduplica", () => { const w={codigo:"EXTRA_SIN_IDENTIDAD",turno:"tarde",categoria:"enfermero",indice:0}; const s=construirAlertasSupervisionMes(resultado([dia("2026-08-01",[w,w])])); assert.deepEqual([s.conteosCrudos.advertencias,s.alertas.length],[2,1]); });
probar("warning en fechas distintas no se fusiona", () => { const w={codigo:"EXTRA_SIN_IDENTIDAD",turno:"tarde",categoria:"enfermero",indice:0}; assert.equal(construirAlertasSupervisionMes(resultado([dia("2026-08-01",[w]),dia("2026-08-02",[w])])).alertas.length,2); });
probar("Planilla 31 veces se presenta una", () => { const ds=Array.from({length:31},(_,i)=>dia(`2026-08-${String(i+1).padStart(2,"0")}`,[],[{codigo:"PLANILLA_NO_PREPARADA",turno:"noche",categoria:"licenciado"}])); const s=construirAlertasSupervisionMes(resultado(ds)); assert.deepEqual([s.conteosCrudos.errores,s.alertas.length],[31,1]); });
probar("Estado inexistente se presenta una vez", () => { const ds=[1,2].map(i=>dia(`2026-08-0${i}`,[],[{codigo:"ESTADO_MENSUAL_INEXISTENTE",turno:"noche",categoria:"enfermero"}])); assert.equal(construirAlertasSupervisionMes(resultado(ds)).alertas.length,1); });
probar("periodo usa clavePeriodo", () => { const s=construirAlertasSupervisionMes(resultado([dia("2026-08-01",[],[{codigo:"PERIODO_NO_PREPARADO",turno:"tarde",categoria:"licenciado",clavePeriodo:"semana1"}])])); assert.equal(buscar(s,"PERIODO_NO_PREPARADO").clavePeriodo,"semana1"); });
probar("dos periodos producen dos alertas", () => { const ds=[dia("2026-08-01",[],[{codigo:"PERIODO_NO_PREPARADO",turno:"tarde",categoria:"licenciado",clavePeriodo:"semana1"}]),dia("2026-08-08",[],[{codigo:"PERIODO_NO_PREPARADO",turno:"tarde",categoria:"licenciado",clavePeriodo:"semana2"}])]; assert.equal(construirAlertasSupervisionMes(resultado(ds)).alertas.length,2); });
probar("umbral repetido se deduplica mensual", () => { const e={codigo:"MINIMO_INVALIDO",turno:"tarde",categoria:"licenciado"}; assert.equal(construirAlertasSupervisionMes(resultado([dia("2026-08-01",[],[e]),dia("2026-08-02",[],[e])])).alertas.length,1); });
const cargas=construirAlertasSupervisionMes(resultado(),{estados:"Fallaron estados",novedades:"Fallaron novedades"});
probar("carga estados produce global", () => assert.equal(cargas.alertas.filter(a=>a.origen==="carga_estados").length,1));
probar("carga novedades produce global", () => assert.equal(cargas.alertas.filter(a=>a.origen==="carga_novedades").length,1));
probar("carga no inventa turno", () => assert.equal(cargas.alertas.some(a=>a.origen.startsWith("carga_")&&"turno" in a),false));
probar("carga no inventa categoria", () => assert.equal(cargas.alertas.some(a=>a.origen.startsWith("carga_")&&"categoria" in a),false));
probar("carga usa codigo null", () => assert.equal(cargas.alertas.every(a=>a.codigo===null),true));
probar("conteos crudos preservan repeticiones", () => { const w={codigo:"IDENTIDAD_AMBIGUA"}; const s=construirAlertasSupervisionMes(resultado([dia("2026-08-01",[w,w])])); assert.equal(s.conteosCrudos.advertencias,2); });
probar("alertasPresentadas refleja dedupe", () => { const w={codigo:"IDENTIDAD_AMBIGUA"}; const s=construirAlertasSupervisionMes(resultado([dia("2026-08-01",[w,w])])); assert.equal(s.resumen.alertasPresentadas,1); });
probar("error mensual no inventa dias", () => assert.equal(construirAlertasSupervisionMes({ok:false,mes:"x",dias:[],errores:[{codigo:"MES_INVALIDO"}]}).resumen.diasAfectados,0));
probar("multiples eventos mismo dia cuentan uno", () => assert.equal(base.resumen.diasAfectados,1));
probar("dias distintos cuentan varios", () => { const s=construirAlertasSupervisionMes(resultado([dia("2026-08-01",[{codigo:"W1"}]),dia("2026-08-02",[{codigo:"W2"}])])); assert.equal(s.resumen.diasAfectados,2); });
probar("errores antes que atencion", () => { const s=construirAlertasSupervisionMes(resultado([dia("2026-08-01",[{codigo:"IDENTIDAD_AMBIGUA"}],[{codigo:"FECHA_INVALIDA"}])])); assert.equal(s.alertas[0].severidad,"error"); });
probar("atencion antes que informacion", () => assert.ok(base.alertas.findIndex(a=>a.severidad==="atencion")<base.alertas.findIndex(a=>a.severidad==="informacion")));
probar("fecha reciente primero", () => { const s=construirAlertasSupervisionMes(resultado([dia("2026-08-01",[{codigo:"W1"}]),dia("2026-08-02",[{codigo:"W2"}])])); assert.equal(s.alertas[0].fecha,"2026-08-02"); });
probar("ID deterministico", () => assert.deepEqual(construirAlertasSupervisionMes(resultado([dia("2026-08-01",warnings)])).alertas.map(a=>a.id),construirAlertasSupervisionMes(resultado([dia("2026-08-01",warnings)])).alertas.map(a=>a.id)));
probar("no usa random", () => assert.doesNotMatch(fuente,/Math\.random/));
probar("no usa Date.now", () => assert.doesNotMatch(fuente,/Date\.now/));
probar("no muta resultado", () => { const e=resultado([dia("2026-08-01",warnings)]); const antes=copiar(e); construirAlertasSupervisionMes(e); assert.deepEqual(e,antes); });
probar("no muta erroresCarga", () => { const e={estados:"x",novedades:"y"}; const antes=copiar(e); construirAlertasSupervisionMes(resultado(),e); assert.deepEqual(e,antes); });
probar("salida deterministica", () => { const e=resultado([dia("2026-08-01",warnings)]); assert.deepEqual(construirAlertasSupervisionMes(e),construirAlertasSupervisionMes(e)); });
probar("mes invalido ok false", () => assert.equal(construirAlertasSupervisionMes({ok:false,mes:"x",dias:[],errores:[{codigo:"MES_INVALIDO"}]}).ok,false));
probar("mes invalido sin dias ficticios", () => assert.equal(construirAlertasSupervisionMes({ok:false,mes:"x",dias:[],errores:[{codigo:"MES_INVALIDO"}]}).resumen.diasAfectados,0));
probar("CANTIDAD_INVALIDA no rompe", () => assert.equal(buscar(construirAlertasSupervisionMes(resultado([dia("2026-08-01",[],[{codigo:"CANTIDAD_INVALIDA"}])])),"CANTIDAD_INVALIDA").severidad,"error"));
probar("motivo Extra no es codigo", () => assert.equal(base.alertas.some(a=>a.codigo==="PERSONA_ID_NO_ENCONTRADA"),false));
probar("asistencia conserva cantidad", () => assert.equal(buscar(base,"ASISTENCIA_FUERA_DE_DOTACION").cantidad,2));
probar("no recalcula Extra", () => assert.doesNotMatch(fuente,/validarExtraOrigen|extrasQueAportan/));
probar("no recalcula identidad", () => assert.doesNotMatch(fuente,/resolverPersona|obtenerClaveIdentidad/));
probar("no consulta Personal", () => assert.doesNotMatch(fuente,/personalCompleto|estadoMensual\.personal/));
probar("no usa Planilla", () => assert.doesNotMatch(fuente,/resolverPeriodoPlanilla|obtenerPlanilla/));
probar("no usa alertas cobertura", () => assert.doesNotMatch(fuente,/sectoresSinCobertura|alertaSectoresCriticos|REA|Explora|Sillones/));
probar("no mete Novedades validas", () => assert.doesNotMatch(fuente,/TIPOS_NOVEDAD_PERSONAL|novedadAfectaDisponibilidad/));
probar("no importa React", () => assert.doesNotMatch(fuente,/from ["']react["']/i));
probar("no consulta Supabase", () => assert.doesNotMatch(fuente,/supabase|rpc\(|\.from\(/i));
probar("no modifica motores", () => assert.doesNotMatch(fuente,/proyectarSupervisionMes\(|proyectarSupervisionDia\(/));
probar("no modifica reductor", () => assert.doesNotMatch(fuente,/resumirEstadisticasSupervisionMes\(/));

console.log(`Alertas Supervision mes: ${total}/${total} comprobaciones OK.`);
