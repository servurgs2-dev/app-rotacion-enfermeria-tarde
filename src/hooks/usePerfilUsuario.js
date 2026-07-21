import { useEffect, useState } from "react";
import { validarPerfil } from "../utils/permisos.js";

const ERROR_CONFIGURACION = "No se pudo validar la configuración del usuario.";

export const usePerfilUsuario = (cliente, session) => {
  const [estado, setEstado] = useState({
    userId: null,
    perfil: null,
    error: ""
  });

  useEffect(() => {
    let vigente = true;
    if (!session?.user?.id || !cliente) return () => { vigente = false; };
    const userId = session.user.id;

    cliente
      .from("perfiles_usuario")
      .select("usuario, rol, turno, activo")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!vigente) return;
        if (error) {
          setEstado({ userId, perfil: null, error: ERROR_CONFIGURACION });
          return;
        }
        if (!data) {
          setEstado({ userId, perfil: null, error: "No hay permisos configurados para este usuario." });
          return;
        }
        const perfil = validarPerfil(data);
        if (!perfil) {
          setEstado({ userId, perfil: null, error: ERROR_CONFIGURACION });
          return;
        }
        if (!perfil.activo) {
          setEstado({ userId, perfil: null, error: "Este usuario está desactivado." });
          return;
        }
        setEstado({ userId, perfil, error: "" });
      })
      .catch(() => {
        if (vigente) setEstado({ userId, perfil: null, error: ERROR_CONFIGURACION });
      });

    return () => { vigente = false; };
  }, [cliente, session]);

  if (!session?.user?.id) return { verificando: false, perfil: null, error: "" };
  if (estado.userId !== session.user.id) {
    return { verificando: true, perfil: null, error: "" };
  }
  return { verificando: false, perfil: estado.perfil, error: estado.error };
};
