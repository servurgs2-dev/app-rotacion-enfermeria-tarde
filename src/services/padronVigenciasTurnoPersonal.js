import { cargarVigenciasTurnoMes } from "./vigenciasTurnoPersonal.js";
import { crearCargadorPadronPersonalEfectivoMes } from "./servicioPadronVigenciasTurnoPersonal.js";

export const cargarPadronPersonalEfectivoMes = crearCargadorPadronPersonalEfectivoMes({
  cargarVigenciasMes: cargarVigenciasTurnoMes
});
