import { Router } from "express";
import Joi from "joi";
import Equipo from "../models/Equipo.js";
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

const CATEGORIAS = ["portatil", "proyector", "camara", "audio", "redes"];
const ESTADOS = ["disponible", "prestado", "mantenimiento"];

const campos = {
  codigo: Joi.string()
    .trim()
    .uppercase()
    .pattern(/^EQ-\d{4}$/)
    .messages({ "string.pattern.base": "El código debe tener el formato EQ-0000" }),
  nombre: Joi.string().trim().min(3).max(100),
  categoria: Joi.string().valid(...CATEGORIAS),
  estado: Joi.string().valid(...ESTADOS),
  ubicacion: Joi.string().trim().max(100).allow(""),
};

// Al crear, "prestado" no es válido: solo el flujo de préstamo lo asigna
const crearSchema = Joi.object({
  codigo: campos.codigo.required(),
  nombre: campos.nombre.required(),
  categoria: campos.categoria.required(),
  estado: Joi.string().valid("disponible", "mantenimiento"),
  ubicacion: campos.ubicacion,
});

// PUT parcial: todos opcionales, pero al menos uno
const actualizarSchema = Joi.object(campos).min(1);

const listarSchema = Joi.object({
  categoria: campos.categoria,
  estado: campos.estado,
});

// GET /api/equipos?categoria=&estado=
router.get(
  "/",
  asyncHandler(async (req, res) => {
    // Joi garantiza strings válidos: no entran operadores tipo ?estado[$ne]=x
    const filtros = await validar(listarSchema, req.query);
    res.json(await Equipo.find(filtros).sort({ codigo: 1 }));
  })
);

// GET /api/equipos/:id
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const equipo = await Equipo.findById(req.params.id);
    if (!equipo) throw new ApiError(404, "Equipo no encontrado");
    res.json(equipo);
  })
);

// GET /api/equipos/:id/prestamos
router.get(
  "/:id/prestamos",
  asyncHandler(async (req, res) => {
    if (!(await Equipo.exists({ _id: req.params.id }))) {
      throw new ApiError(404, "Equipo no encontrado");
    }
    const prestamos = await Prestamo.find({ equipoId: req.params.id })
      .sort({ fechaPrestamo: -1, _id: -1 })
      .populate([POPULATE_EQUIPO, POPULATE_USUARIO])
      .lean();
    const ahora = new Date();
    res.json(prestamos.map((p) => serializarPrestamo(p, ahora)));
  })
);

// POST /api/equipos
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const datos = await validar(crearSchema, req.body);
    if (!datos.ubicacion) delete datos.ubicacion; // aplica el default del modelo
    const equipo = await Equipo.create(datos);
    res.status(201).json(equipo);
  })
);

// PUT /api/equipos/:id
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const { estado, ...resto } = await validar(actualizarSchema, req.body);
    if (resto.ubicacion === "") delete resto.ubicacion;

    const actual = await Equipo.findById(req.params.id).select("estado").lean();
    if (!actual) throw new ApiError(404, "Equipo no encontrado");

    const update = { ...resto };
    const filtro = { _id: req.params.id };

    // Solo importa si el estado realmente cambia
    if (estado !== undefined && estado !== actual.estado) {
      if (estado === "prestado") {
        throw new ApiError(
          400,
          "El estado 'prestado' solo se asigna creando un préstamo"
        );
      }
      if (actual.estado === "prestado") {
        throw new ApiError(
          409,
          "El equipo está prestado: su estado cambia al registrar la devolución"
        );
      }
      update.estado = estado;
      // Condición en la propia escritura: si un préstamo lo tomó justo ahora, no actualiza
      filtro.estado = { $ne: "prestado" };
    }

    const equipo = await Equipo.findOneAndUpdate(filtro, update, {
      new: true,
      runValidators: true,
    });

    if (!equipo) {
      // O no existe, o fue prestado entre la lectura y la escritura
      if (await Equipo.exists({ _id: req.params.id })) {
        throw new ApiError(409, "El equipo fue prestado mientras se actualizaba");
      }
      throw new ApiError(404, "Equipo no encontrado");
    }
    res.json(equipo);
  })
);

// DELETE /api/equipos/:id  (R7: no se elimina si está prestado)
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    // Borrado condicional y atómico: nunca borra un equipo prestado
    const borrado = await Equipo.findOneAndDelete({
      _id: req.params.id,
      estado: { $ne: "prestado" },
    });

    if (!borrado) {
      if (await Equipo.exists({ _id: req.params.id })) {
        throw new ApiError(409, "No se puede eliminar un equipo que está prestado");
      }
      throw new ApiError(404, "Equipo no encontrado");
    }
    res.json({ mensaje: "Equipo eliminado" });
  })
);

export default router;
