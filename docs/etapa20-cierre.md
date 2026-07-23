# Etapa 20 — cierre técnico de Estadísticas

## Estado

- 20A implementada: estadísticas históricas basadas en snapshots de cierres.
- 20B-1 implementada: filtros, indicadores, series y gráficos históricos.
- 20B-2 implementada: comparación entre turnos, caché local y actualización manual.
- 20C implementada como cierre técnico: suite permanente de regresión y documentación.

## Funcionalidad incluida

- Lectura de snapshots históricos de cierres actualmente cerrados.
- Resolución de la revisión vigente y fallback seguro a la última versión.
- Filtros por Enfermeros, Licenciados, ambas categorías y rango de fechas.
- Indicadores, porcentaje de asistencia, series, gráficos y tabla detallada.
- Agrupación histórica por responsable y cuenta compartida.
- Comparación de Noche, Mañana, Tarde y Vespertino.
- Caché local durante la vida del componente, prioridad del estado activo,
  actualización manual y descarte de respuestas obsoletas.
- Compatibilidad con snapshots de cierres creados a partir de la rotación
  nocturna de Enfermeros cada tres días.

## Funcionalidad fuera de alcance

- PDF de Estadísticas.
- Exportación CSV.
- Comparación entre meses.
- Tendencias multimensuales.
- Navegación directa desde Estadísticas al detalle del cierre.

Estas funciones deberán tratarse como etapas futuras independientes.

## Regresión manual

- [ ] Abrir `Turno actual`.
- [ ] Cambiar entre Enfermeros, Licenciados y ambas categorías.
- [ ] Aplicar y limpiar un rango de fechas.
- [ ] Abrir `Comparar turnos`.
- [ ] Pulsar `Actualizar comparación`.
- [ ] Salir y volver a comparación; confirmar que se reutiliza el resultado.
- [ ] Comprobar un turno con estado pero sin cierres.
- [ ] Comprobar un mes sin datos para uno o más turnos.
- [ ] Simular un error de carga y comprobar `Reintentar`.
- [ ] Reabrir un cierre y confirmar que desaparece de Estadísticas.
- [ ] Volver a cerrarlo y confirmar que cuenta una sola revisión.
- [ ] Comprobar por separado Enfermeros y Licenciados.
- [ ] Comprobar un cierre de Noche posterior a julio de 2026.

El ciclo real del hook React (montaje, limpieza del efecto y ejecución de la
consulta) permanece en esta lista manual porque el proyecto no incorpora una
infraestructura de pruebas de componentes. Sus decisiones puras de caché,
prioridad y vigencia sí están cubiertas por la suite Node.

## Comandos

```powershell
npm.cmd run test:etapa20
npm.cmd run lint
npm.cmd run build
```
