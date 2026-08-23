const ETIQUETAS_CAUSA = Object.freeze({
  licencia: "Licencia",
  certificacion: "Certificaci\u00f3n",
  suspension: "Suspensi\u00f3n",
  adhesion_paro: "Adhesi\u00f3n a paro",
  no_disponible: "No disponible"
});

const nombrePersona = (persona) =>
  String(persona?.nombre || "").trim() ||
  (persona?.funcionario ? `Funcionario ${persona.funcionario}` : "Persona sin identificar");

const clavePersona = (persona, indice, prefijo) =>
  persona?.personaId || persona?.id || persona?.funcionario || `${prefijo}-${indice}`;

function ListaPersonas({ personas, vacio, prefijo, mostrarCausas = false }) {
  if (!Array.isArray(personas) || personas.length === 0) {
    return <p className="text-sm text-slate-500">{vacio}</p>;
  }

  return (
    <ul className="space-y-2 text-sm text-slate-700">
      {personas.map((persona, indice) => (
        <li key={clavePersona(persona, indice, prefijo)} className="min-w-0 rounded-lg bg-white px-3 py-2">
          <span className="block break-words font-semibold">{nombrePersona(persona)}</span>
          {mostrarCausas && Array.isArray(persona?.causas) && persona.causas.length > 0 && (
            <span className="mt-0.5 block break-words text-xs text-slate-500">
              {persona.causas.map((causa) => ETIQUETAS_CAUSA[causa] || causa).join(" · ")}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function FilaMetrica({ etiqueta, metrica, destacada = false }) {
  return (
    <div className={`flex items-center justify-between gap-3 py-1.5 ${destacada ? "font-extrabold text-slate-950" : "text-slate-700"}`}>
      <dt className="min-w-0 text-sm">{etiqueta}</dt>
      <dd className="shrink-0 text-sm tabular-nums">{metrica?.cantidad}</dd>
    </div>
  );
}

function DetalleCategoriaSupervision({ proyeccion, disponible, id }) {
  if (!disponible || !proyeccion) {
    return (
      <div id={id} className="mt-3 border-t border-slate-200 pt-3 text-sm text-slate-600">
        Sin datos suficientes para calcular esta dotaci&oacute;n.
      </div>
    );
  }

  const asistencia = proyeccion.asistenciaRegistrada;

  return (
    <div id={id} className="mt-3 space-y-4 border-t border-current/15 pt-3">
      <section aria-label="Composición de la dotación">
        <h4 className="text-sm font-extrabold text-slate-900">Composici&oacute;n</h4>
        <dl className="mt-1 divide-y divide-slate-200/70">
          <FilaMetrica etiqueta="Previstos base" metrica={proyeccion.previstosBase} />
          <FilaMetrica etiqueta="Libres programados" metrica={proyeccion.libresProgramados} />
          <FilaMetrica etiqueta="Bajas conocidas" metrica={proyeccion.bajasConocidas} />
          <FilaMetrica etiqueta="Base disponible" metrica={proyeccion.baseDisponible} />
          <FilaMetrica etiqueta="Extras registrados" metrica={proyeccion.extrasRegistrados} />
          <FilaMetrica etiqueta="Extras que aportan" metrica={proyeccion.extrasQueAportan} />
          <FilaMetrica etiqueta="Dotación prevista operativa" metrica={proyeccion.dotacionPrevistaOperativa} destacada />
        </dl>
      </section>

      <section className="rounded-xl bg-slate-100/80 p-3" aria-label="Bajas conocidas">
        <h4 className="mb-2 text-sm font-extrabold text-slate-900">Bajas conocidas</h4>
        <ListaPersonas
          personas={proyeccion.bajasConocidas?.personas}
          vacio="Sin bajas conocidas"
          prefijo="baja"
          mostrarCausas
        />
      </section>

      <section className="rounded-xl bg-slate-100/80 p-3" aria-label="Extras que aportan">
        <h4 className="mb-2 text-sm font-extrabold text-slate-900">Extras que aportan</h4>
        <ListaPersonas
          personas={proyeccion.extrasQueAportan?.personas}
          vacio="Sin Extras que aporten"
          prefijo="extra"
        />
      </section>

      <section className="rounded-xl bg-slate-100/80 p-3" aria-label="Asistencia registrada">
        <h4 className="text-sm font-extrabold text-slate-900">Asistencia registrada</h4>
        {asistencia == null ? (
          <p className="mt-2 text-sm text-slate-500">Asistencia sin datos</p>
        ) : (
          <>
            <dl className="mt-1 divide-y divide-slate-200">
              <FilaMetrica etiqueta="Personas consideradas" metrica={asistencia.personasConsideradas} />
              <FilaMetrica etiqueta="Presentes" metrica={asistencia.presentes} />
              <FilaMetrica etiqueta="Ausentes" metrica={asistencia.ausentes} />
              <FilaMetrica etiqueta="Pendientes" metrica={asistencia.pendientes} />
            </dl>
            {asistencia.ausentes?.cantidad > 0 && (
              <div className="mt-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Ausentes registrados</p>
                <ListaPersonas
                  personas={asistencia.ausentes.personas}
                  vacio=""
                  prefijo="ausente"
                />
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

export default DetalleCategoriaSupervision;
