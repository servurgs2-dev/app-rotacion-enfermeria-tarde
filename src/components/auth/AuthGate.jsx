import { useCallback } from "react";
import App from "../../App.jsx";
import {
  authEmailDomain,
  supabase,
  errorConfiguracionSupabase
} from "../../supabase.js";
import { useAuth } from "../../hooks/useAuth.js";
import { usePerfilUsuario } from "../../hooks/usePerfilUsuario.js";
import { obtenerVistaAutenticacion } from "../../utils/auth.js";
import Login from "./Login.jsx";

const PantallaMensaje = ({ mensaje, error = false, onCerrar }) => (
  <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <p className={error ? "text-red-700" : "text-slate-600"} role={error ? "alert" : undefined}>{mensaje}</p>
      {onCerrar && (
        <button
          type="button"
          onClick={onCerrar}
          className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
        >
          Cerrar sesión
        </button>
      )}
    </div>
  </main>
);

function AuthGate() {
  const { verificando, session, error } = useAuth(supabase);
  const estadoPerfil = usePerfilUsuario(supabase, session);
  const vista = obtenerVistaAutenticacion({
    errorConfiguracion: errorConfiguracionSupabase,
    verificando,
    error,
    session
  });
  const cerrarSesion = useCallback(async () => {
    const { error: errorCierre } = await supabase.auth.signOut();
    if (errorCierre) throw new Error("No se pudo cerrar sesión.");
  }, []);

  if (vista === "configuracion") return <PantallaMensaje mensaje={errorConfiguracionSupabase} error />;
  if (vista === "verificando") return <PantallaMensaje mensaje="Verificando sesión..." />;
  if (vista === "error") return <PantallaMensaje mensaje={error} error />;
  if (vista === "login") return <Login cliente={supabase} dominio={authEmailDomain} />;
  if (estadoPerfil.verificando) return <PantallaMensaje mensaje="Verificando permisos..." />;
  if (estadoPerfil.error || !estadoPerfil.perfil) {
    return (
      <PantallaMensaje
        mensaje={estadoPerfil.error || "No se pudo validar la configuración del usuario."}
        error
        onCerrar={cerrarSesion}
      />
    );
  }

  return <App perfil={estadoPerfil.perfil} onSignOut={cerrarSesion} />;
}

export default AuthGate;
