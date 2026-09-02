import { useEffect, useState } from "react";
import { CORREO_INSTITUCIONAL } from "../../config/destinatariosCorreo.js";
import { enviarPDFCorreo } from "../../services/enviarPDFCorreo.js";
import ModalMobileShell from "../ui/ModalMobileShell.jsx";

const formatearTamano = (bytes) => {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} bytes`;
  return `${(bytes / 1024).toFixed(1)} KB`;
};

export default function ModalEnviarPDF({
  abierto,
  generarPDF,
  informacion,
  asuntoInicial,
  onCerrar
}) {
  const [mensaje, setMensaje] = useState("");
  const [estado, setEstado] = useState("normal");
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const [tamanoAdjunto, setTamanoAdjunto] = useState(null);

  useEffect(() => {
    if (!abierto) return undefined;

    let cancelado = false;
    queueMicrotask(() => {
      if (cancelado) return;
      setMensaje("");
      setEstado("normal");
      setError("");
      setExito("");
      setTamanoAdjunto(null);
    });

    return () => {
      cancelado = true;
    };
  }, [abierto, asuntoInicial]);

  if (!abierto) return null;
  const procesando = estado === "preparando" || estado === "enviando";

  const enviar = async () => {
    if (procesando) return;
    setEstado("preparando");
    setError("");
    try {
      const adjunto = await generarPDF();
      setTamanoAdjunto(adjunto.blob?.size ?? null);
      setEstado("enviando");
      await enviarPDFCorreo({
        destinatario: CORREO_INSTITUCIONAL,
        asunto: asuntoInicial,
        mensaje,
        blob: adjunto.blob,
        nombreArchivo: adjunto.nombreArchivo,
        contexto: adjunto.contexto
      });
      setExito(`Correo enviado correctamente a ${CORREO_INSTITUCIONAL}.`);
      setEstado("exito");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar el correo. Intentá nuevamente.");
      setEstado("normal");
    }
  };

  const cerrar = () => {
    if (procesando) return;
    onCerrar();
  };

  return (
    <ModalMobileShell
      ariaLabelledby="titulo-envio-pdf"
      backdropClassName="bg-slate-950/50"
      maxWidthClassName="max-w-xl"
      panelClassName="px-5 pt-5 sm:px-5 sm:pt-5 sm:pb-5"
    >
        <h2 id="titulo-envio-pdf" className="text-lg font-semibold text-slate-900">
          Enviar PDF por correo
        </h2>
        <dl className="mt-4 grid gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          <div>
            <dt className="inline font-medium">Destinatario: </dt>
            <dd className="inline">{CORREO_INSTITUCIONAL}</dd>
          </div>
          <div>
            <dt className="inline font-medium">Asunto: </dt>
            <dd className="inline">{asuntoInicial}</dd>
          </div>
          <div>
            <dt className="inline font-medium">Archivo: </dt>
            <dd className="inline">{informacion.nombreArchivo}</dd>
          </div>
          {tamanoAdjunto !== null && (
            <div>
              <dt className="inline font-medium">Tamaño: </dt>
              <dd className="inline">{formatearTamano(tamanoAdjunto)}</dd>
            </div>
          )}
          <div><dt className="inline font-medium">Tipo: </dt><dd className="inline">{informacion.tipo}</dd></div>
          <div><dt className="inline font-medium">Mes: </dt><dd className="inline">{informacion.mes}</dd></div>
          <div><dt className="inline font-medium">Turno: </dt><dd className="inline">{informacion.turno}</dd></div>
          {informacion.categoria && <div><dt className="inline font-medium">Categoría: </dt><dd className="inline">{informacion.categoria}</dd></div>}
        </dl>
        <label className="mt-4 block text-sm font-medium text-slate-700">
          Mensaje opcional
          <textarea
            maxLength={2000}
            rows={4}
            value={mensaje}
            placeholder="Agregar un mensaje opcional"
            disabled={procesando}
            onChange={(evento) => setMensaje(evento.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
        {exito && <p aria-live="polite" className="mt-4 text-sm font-medium text-emerald-700">{exito}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={procesando} onClick={cerrar} className="rounded-lg border px-4 py-2 text-sm">
            {exito ? "Cerrar" : "Cancelar"}
          </button>
          {!exito && (
            <button
              type="button"
              disabled={procesando}
              onClick={enviar}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:bg-slate-300"
            >
              {estado === "preparando" ? "Preparando…" : estado === "enviando" ? "Enviando…" : "Enviar"}
            </button>
          )}
        </div>
    </ModalMobileShell>
  );
}
