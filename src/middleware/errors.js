export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function notFound(_req, _res, next) {
  next(new HttpError(404, "Ruta no encontrada."));
}

export function errorHandler(error, _req, res, next) {
  void next; // Express reconoce los manejadores de errores por sus cuatro argumentos.
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ detail: "El cuerpo JSON no es válido." });
  }
  if (error.type === "entity.too.large") {
    return res.status(413).json({ detail: "El cuerpo de la solicitud es demasiado grande." });
  }
  if (error instanceof HttpError) {
    return res.status(error.status).json({ detail: error.message });
  }
  // pg puede entregar un AggregateError cuando fallan IPv4 e IPv6.
  if (error.code === "ECONNREFUSED" || error.code === "P1001") {
    console.error(error);
    return res.status(503).json({ detail: "La base de datos no está disponible. Inténtalo de nuevo más tarde." });
  }
  console.error(error);
  return res.status(500).json({ detail: "Error interno del servidor." });
}
