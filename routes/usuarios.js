import { Router } from "express";
import Joi from "joi";
import Usuario from "../models/Usuario.js";
import Prestamo from "../models/Prestamo.js";
import { validarId } from "../middlewares/validarId.js";
import { ApiError, asyncHandler } from "../middlewares/errorHandler.js";
import {
  validar,
  serializarPrestamo,
  POPULATE_EQUIPO,
  POPULATE_USUARIO,
} from "../utils/helpers.js";

const router = Router();
router.param("id", validarId);

const TIPOS = ["estudiante", "docente", "administrativo"];

const campos = {
  nombre: Joi.string().trim().min(3).max(100),
  documento: Joi.string()
    .trim()
    .pattern(/^\d{6,12}$/)
    .messages({ "string.pattern.base": "El documento debe tener entre 6 y 12 dígitos" }),
  email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }),
  tipo: Joi.string().valid(...TIPOS),
  activo: Joi.boolean(),
};

const crearSchema = Joi.object({
  nombre: campos.nombre.required(),
  documento: campos.documento.required(),
  email: campos.email.required(),
  tipo: campos.tipo.required(),
  activo: campos.activo,
});

const actualizarSchema = Joi.object(campos).min(1);

const listarSchema = Joi.object({
  tipo: campos.tipo,
  activo: campos.activo,
});

// GET /api/usuarios?tipo=&activo=
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const filtros = await validar(listarSchema, req.query);
    res.json(await Usuario.find(filtros).sort({ nombre: 1 }));
  })
);

// GET /api/usuarios/:id
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const usuario = await Usuario.findById(req.params.id);
    if (!usuario) throw new ApiError(404, "Usuario no encontrado");
    res.json(usuario);
  })
);

// GET /api/usuarios/:id/prestamos  (del más reciente al más antiguo)
router.get(
  "/:id/prestamos",
  asyncHandler(async (req, res) => {
    if (!(await Usuario.exists({ _id: req.params.id }))) {
      throw new ApiError(404, "Usuario no encontrado");
    }
    const prestamos = await Prestamo.find({ usuarioId: req.params.id })
      .sort({ fechaPrestamo: -1, _id: -1 })
      .populate([POPULATE_EQUIPO, POPULATE_USUARIO])
      .lean();
    const ahora = new Date();
    res.json(prestamos.map((p) => serializarPrestamo(p, ahora)));
  })
);

// POST /api/usuarios
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const datos = await validar(crearSchema, req.body);
    const usuario = await Usuario.create(datos);
    res.status(201).json(usuario);
  })
);

// PUT /api/usuarios/:id
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const datos = await validar(actualizarSchema, req.body);
    const usuario = await Usuario.findByIdAndUpdate(req.params.id, datos, {
      new: true,
      runValidators: true,
    });
    if (!usuario) throw new ApiError(404, "Usuario no encontrado");
    res.json(usuario);
  })
);

// DELETE /api/usuarios/:id  (R7: no se elimina con préstamos activos)
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!(await Usuario.exists({ _id: req.params.id }))) {
      throw new ApiError(404, "Usuario no encontrado");
    }
    const tieneActivos = await Prestamo.exists({
      usuarioId: req.params.id,
      estado: "activo",
    });
    if (tieneActivos) {
      throw new ApiError(
        409,
        "No se puede eliminar un usuario que tiene préstamos activos"
      );
    }
    await Usuario.findByIdAndDelete(req.params.id);
    res.json({ mensaje: "Usuario eliminado" });
  })
);

export default router;
