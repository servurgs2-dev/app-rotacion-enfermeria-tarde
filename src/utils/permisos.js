import { TURNOS } from "../config/turnos.js";
import { normalizarUsuarioAuth } from "./auth.js";

export const ROLES_APLICACION = Object.freeze({
  SUPERVISION: "supervision",
  LICENCIADO: "licenciado",
  ENFERMERIA: "enfermeria"
});

export const validarPerfil = (perfil) => {
  if (!perfil || typeof perfil !== "object" || Array.isArray(perfil)) return null;

  const usuario = normalizarUsuarioAuth(perfil.usuario);
  const rol = String(perfil.rol ?? "").trim().toLowerCase();
  const turno = perfil.turno === null || perfil.turno === undefined
    ? null
    : String(perfil.turno).trim().toLowerCase();
  const activo = perfil.activo === true;
  const usuarioValido = Boolean(usuario && /^[a-z0-9._-]+$/.test(usuario));

  if (!usuarioValido || !Object.values(ROLES_APLICACION).includes(rol)) return null;
  if (rol === ROLES_APLICACION.LICENCIADO && !Object.hasOwn(TURNOS, turno)) {
    return null;
  }
  if (rol !== ROLES_APLICACION.LICENCIADO && turno !== null) return null;

  return { usuario, rol, turno, activo };
};

export const puedeLeerAplicacion = (perfil) =>
  Boolean(validarPerfil(perfil)?.activo);

export const puedeEditarTurno = (perfil, turno) => {
  const valido = validarPerfil(perfil);
  if (!valido?.activo || !Object.hasOwn(TURNOS, turno)) return false;
  if (valido.rol === ROLES_APLICACION.SUPERVISION) return true;
  return valido.rol === ROLES_APLICACION.LICENCIADO && valido.turno === turno;
};

export const esSoloLectura = (perfil, turno) =>
  puedeLeerAplicacion(perfil) && !puedeEditarTurno(perfil, turno);

export const esPerfilSupervision = (perfil) => {
  const valido = validarPerfil(perfil);
  return Boolean(valido?.activo && valido.rol === ROLES_APLICACION.SUPERVISION);
};

export const obtenerEtiquetaPerfil = (perfil) => {
  const valido = validarPerfil(perfil);
  if (!valido) return "";
  if (valido.rol === ROLES_APLICACION.SUPERVISION) return "Supervisión";
  if (valido.rol === ROLES_APLICACION.ENFERMERIA) {
    return "Enfermería · Solo lectura";
  }
  return `Licenciado · ${TURNOS[valido.turno].nombre}`;
};

export const obtenerMensajeSoloLectura = (perfil) => {
  const valido = validarPerfil(perfil);
  if (!valido || valido.rol === ROLES_APLICACION.SUPERVISION) return "";
  if (valido.rol === ROLES_APLICACION.ENFERMERIA) return "Modo solo lectura.";
  return `Modo solo lectura. Este usuario solamente puede modificar el turno ${TURNOS[valido.turno].nombre}.`;
};

export const aplicarActualizacionAutorizada = ({
  perfil,
  turno,
  estado,
  actualizar
}) => puedeEditarTurno(perfil, turno) && typeof actualizar === "function"
  ? actualizar(estado)
  : estado;
