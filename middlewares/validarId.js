import { ApiError } from "./errorHandler.js";

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

// Se usa con router.param("id", validarId): corre en toda ruta que lleve :id
export function validarId(req, res, next, id) {
  if (!OBJECT_ID.test(id)) {
    return next(new ApiError(400, "El id no es un ObjectId válido"));
  }
  next();
}
