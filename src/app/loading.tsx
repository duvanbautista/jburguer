/** Esqueleto neutro mientras carga cualquier ruta (portada, plato…). */
export default function Loading() {
  return (
    <main
      id="contenido"
      aria-busy="true"
      aria-label="Cargando"
      className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16 pt-14 sm:px-6 sm:pt-20 lg:px-8"
    >
      <div className="flex flex-col items-center gap-5">
        <div className="skeleton h-7 w-56 rounded-full" />
        <div className="skeleton h-14 w-72 rounded-2xl sm:h-16 sm:w-96" />
        <div className="skeleton h-5 w-full max-w-2xl rounded-full" />
        <div className="skeleton h-5 w-2/3 max-w-xl rounded-full" />
      </div>

      <div className="mt-16 grid gap-5 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton aspect-4/5 rounded-3xl md:aspect-3/4" />
        ))}
      </div>
    </main>
  );
}
