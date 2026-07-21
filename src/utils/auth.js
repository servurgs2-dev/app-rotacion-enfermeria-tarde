const PATRON_USUARIO = /^[a-z0-9._-]+$/;

export const normalizarUsuarioAuth = (usuario) =>
  String(usuario ?? "").trim().toLowerCase();

export const prepararCredenciales = (usuario, password, dominio) => {
  const usuarioNormalizado = normalizarUsuarioAuth(usuario);
  const dominioNormalizado = String(dominio ?? "").trim().toLowerCase();
  const usuarioValido = Boolean(
    usuarioNormalizado &&
    dominioNormalizado &&
    !usuarioNormalizado.includes("@") &&
    PATRON_USUARIO.test(usuarioNormalizado)
  );

  return {
    usuario: usuarioNormalizado,
    email: usuarioValido ? `${usuarioNormalizado}@${dominioNormalizado}` : "",
    password: typeof password === "string" ? password : "",
    valido: usuarioValido
  };
};

export const credencialesCompletas = ({ valido = false, password = "" } = {}) =>
  Boolean(valido && password);

export const crearBloqueoSolicitud = () => {
  let enCurso = false;
  return {
    intentar: () => {
      if (enCurso) return false;
      enCurso = true;
      return true;
    },
    liberar: () => { enCurso = false; },
    estaEnCurso: () => enCurso
  };
};

export const ejecutarSolicitudProtegida = (bloqueo, accion) => {
  if (typeof accion !== "function" || !bloqueo?.intentar?.()) return null;

  return Promise.resolve()
    .then(accion)
    .finally(() => bloqueo.liberar());
};

export const obtenerVistaAutenticacion = ({
  errorConfiguracion = "",
  verificando = true,
  error = "",
  session = null
} = {}) => {
  if (errorConfiguracion) return "configuracion";
  if (verificando) return "verificando";
  if (error) return "error";
  return session ? "app" : "login";
};

export const obtenerMensajeErrorLogin = (error) => {
  const codigo = String(error?.code ?? "").toLowerCase();
  const mensaje = String(error?.message ?? "").toLowerCase();

  if (codigo === "invalid_credentials" || mensaje.includes("invalid login credentials")) {
    return "Usuario o contraseña incorrectos.";
  }
  if (
    error instanceof TypeError ||
    codigo.includes("network") ||
    mensaje.includes("fetch") ||
    mensaje.includes("network") ||
    mensaje.includes("conex")
  ) {
    return "No se pudo iniciar sesión. Revisá la conexión e intentá nuevamente.";
  }
  return "No se pudo iniciar sesión.";
};

export const evaluarCierreSesion = ({
  guardadoEnCurso = false,
  cantidadDebounces = 0,
  cantidadEnCola = 0,
  cantidadErroresGuardado = 0,
  cambiosSinProgramar = false
} = {}) => {
  if (cantidadErroresGuardado > 0 || cambiosSinProgramar) {
    return {
      permitido: false,
      mensaje: "Hay cambios pendientes de guardar. Reintentá el guardado antes de cerrar sesión."
    };
  }
  if (guardadoEnCurso || cantidadDebounces > 0 || cantidadEnCola > 0) {
    return {
      permitido: false,
      mensaje: "Esperá a que terminen de guardarse los cambios."
    };
  }
  return { permitido: true, mensaje: "" };
};

export const observarAutenticacion = (cliente, onEstado) => {
  if (!cliente?.auth || typeof onEstado !== "function") {
    onEstado?.({
      verificando: false,
      session: null,
      error: "No se pudo inicializar la autenticación."
    });
    return () => {};
  }

  let activo = true;
  let huboEvento = false;
  const { data } = cliente.auth.onAuthStateChange((_evento, session) => {
    if (!activo) return;
    huboEvento = true;
    onEstado({ verificando: false, session: session || null, error: "" });
  });

  Promise.resolve(cliente.auth.getSession())
    .then(({ data: datosSesion, error }) => {
      if (!activo || huboEvento) return;
      onEstado({
        verificando: false,
        session: error ? null : datosSesion?.session || null,
        error: error ? "No se pudo verificar la sesión." : ""
      });
    })
    .catch(() => {
      if (!activo || huboEvento) return;
      onEstado({
        verificando: false,
        session: null,
        error: "No se pudo verificar la sesión."
      });
    });

  return () => {
    activo = false;
    data?.subscription?.unsubscribe?.();
  };
};
