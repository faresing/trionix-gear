// Error de negocio con código HTTP propio: throw new ApiError(409, "mensaje")
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Express 4 no captura errores de funciones async: este wrapper los envía a next()
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// 404 para rutas /api que no existen
export function notFound(req, res) {
  res
    .status(404)
    .json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
}

// Qué entidad y qué nombre de campo mostrar cuando se duplica un índice único
const ENTIDAD = {
  codigo: "un equipo",
  documento: "un usuario",
  email: "un usuario",
  username: "un administrador",
};
const ETIQUETA = {
  codigo: "código",
  documento: "documento",
  email: "email",
  username: "nombre de usuario",
};

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // 1. Error de negocio lanzado a propósito (ApiError)
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message });
  }

  // 2. Joi (validación del body / query): se unen los mensajes para que
  //    el frontend pueda mostrarlos tal cual en un solo texto legible.
  if (err.isJoi) {
    return res.status(400).json({
      error: err.details.map((d) => d.message).join(". "),
      detalles: err.details.map((d) => ({
        campo: d.path.join("."),
        mensaje: d.message,
      })),
    });
  }

  // 3. Mongoose ValidationError (runValidators, required, enum, match...)
  if (err.name === "ValidationError") {
    return res.status(400).json({
      error: Object.values(err.errors)
        .map((e) => e.message)
        .join(". "),
      detalles: Object.values(err.errors).map((e) => ({
        campo: e.path,
        mensaje: e.message,
      })),
    });
  }

  // 4. CastError (ObjectId o tipo mal formado)
  if (err.name === "CastError") {
    return res
      .status(400)
      .json({ error: `El valor del campo '${err.path}' no es válido` });
  }

  // 5. Clave duplicada de MongoDB (índice unique) -> 409, nunca 500
  if (err.code === 11000) {
    const campo = Object.keys(err.keyValue ?? err.keyPattern ?? {})[0];
    if (campo === "equipoId") {
      // índice único parcial de prestamos (R8)
      return res
        .status(409)
        .json({ error: "El equipo ya tiene un préstamo activo" });
    }
    const entidad = ENTIDAD[campo] ?? "un registro";
    const etiqueta = ETIQUETA[campo] ?? campo;
    return res.status(409).json({
      error: etiqueta
        ? `Ya existe ${entidad} con ese ${etiqueta}`
        : `Ya existe ${entidad} con esos datos`,
      campo,
    });
  }

  // 6. JSON malformado en el body
  if (err.type === "entity.parse.failed") {
    return res
      .status(400)
      .json({ error: "El cuerpo de la solicitud no es un JSON válido" });
  }

  // 7. Errores con código HTTP propio (err.statusCode / err.status)
  const status = err.statusCode ?? err.status;
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return res.status(status).json({ error: err.message });
  }

  // 8. Cualquier otra cosa: 500 genérico (sin filtrar detalles internos)
  console.error("[error]", err);
  res.status(500).json({ error: "Error interno del servidor" });
}
