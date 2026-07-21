import { useRef, useState } from "react";
import {
  crearBloqueoSolicitud,
  credencialesCompletas,
  ejecutarSolicitudProtegida,
  obtenerMensajeErrorLogin,
  prepararCredenciales
} from "../../utils/auth.js";

function Login({ cliente, dominio }) {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const bloqueoEnvioRef = useRef(crearBloqueoSolicitud());

  const enviar = async (evento) => {
    evento.preventDefault();
    const credenciales = prepararCredenciales(usuario, password, dominio);
    if (!credencialesCompletas(credenciales)) {
      setError("Usuario o contraseña incorrectos.");
      return;
    }
    const solicitud = ejecutarSolicitudProtegida(
      bloqueoEnvioRef.current,
      () => cliente.auth.signInWithPassword({
        email: credenciales.email,
        password: credenciales.password
      })
    );
    if (!solicitud) return;

    setProcesando(true);
    setError("");
    try {
      const { error: errorLogin } = await solicitud;
      if (errorLogin) setError(obtenerMensajeErrorLogin(errorLogin));
    } catch (errorLogin) {
      setError(obtenerMensajeErrorLogin(errorLogin));
    } finally {
      setProcesando(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <form onSubmit={enviar} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <h1 className="text-2xl font-bold text-slate-800">App Urgencias</h1>
        <p className="mt-2 text-sm text-slate-600">Ingresá para acceder a la planificación del servicio</p>

        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="login-usuario" className="text-sm font-medium text-slate-700">Usuario</label>
            <input
              id="login-usuario"
              type="text"
              autoComplete="username"
              value={usuario}
              disabled={procesando}
              onChange={(evento) => { setUsuario(evento.target.value); setError(""); }}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
            />
          </div>
          <div>
            <label htmlFor="login-password" className="text-sm font-medium text-slate-700">Contraseña</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              disabled={procesando}
              onChange={(evento) => { setPassword(evento.target.value); setError(""); }}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
            />
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-red-600" role="alert">{error}</p>}
        <button
          type="submit"
          disabled={procesando}
          className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:cursor-not-allowed disabled:bg-blue-300"
        >
          {procesando ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
    </main>
  );
}

export default Login;
