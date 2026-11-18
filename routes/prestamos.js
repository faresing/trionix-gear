import { Router } from "express";
import Joi from "joi";
import Prestamo from "../models/Prestamo.js";
import Equipo from "../models/Equipo.js";
import Usuario from "../models/Usuario.js";
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

// R3: máximo de préstamos activos simultáneos por tipo de usuario
const TOPES = { estudiante: 2, docente: 4, administrativo: 3 };
// R4: días máximos entre el préstamo y la fecha límite
const MAX_DIAS = { estudiante: 7, administrativo: 7, docente: 15 };
const DIA_MS = 24 * 60 * 60 * 1000;

// En la respuesta de POST/PATCH se incluye también el estado actual del equipo
const POPULATE_EQUIPO_CON_ESTADO = {
  path: "equipoId",
  select: "codigo nombre categoria estado",
};

const objectId = Joi.string()
  .pattern(/^[0-9a-fA-F]{24}$/)
  .messages({ "string.pattern.base": "{{#label}} no es un ObjectId válido" });

const crearSchema = Joi.object({
  equipoId: objectId.required(),
  usuarioId: objectId.required(),
  fechaLimite: Joi.date().iso().required(),
  observaciones: Joi.string().trim().max(300).allow(""),
});

const listarSchema = Joi.object({
  estado: Joi.string().valid("activo", "devuelto"),
  vencidos: Joi.boolean(),
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
});

// GET /api/prestamos?estado=&vencidos=&page=&limit=
// Sin page/limit responde un arreglo; con alguno de los dos responde
// { data, page, limit, total } (bonus de paginación).
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { estado, vencidos, page, limit } = await validar(
      listarSchema,
      req.query
    );
    const ahora = new Date();

    // R6: "vencido" no se guarda, se calcula: activo y fechaLimite ya pasó
    const condiciones = [];
    if (estado) condiciones.push({ estado });
    if (vencidos === true) {
      condiciones.push({ estado: "activo", fechaLimite: { $lt: ahora } });
    }
    if (vencidos === false) {
      condiciones.push({
        $or: [{ estado: "devuelto" }, { fechaLimite: { $gte: ahora } }],
      });
    }
    const filtro = condiciones.length ? { $and: condiciones } : {};

    const consulta = Prestamo.find(filtro)
      .sort({ fechaPrestamo: -1, _id: -1 })
      .populate([POPULATE_EQUIPO, POPULATE_USUARIO])
      .lean();

    if (page !== undefined || limit !== undefined) {
      const p = page ?? 1;
      const l = limit ?? 10;
      const [datos, total] = await Promise.all([
        consulta.skip((p - 1) * l).limit(l),
        Prestamo.countDocuments(filtro),
      ]);
      return res.json({
        data: datos.map((x) => serializarPrestamo(x, ahora)),
        page: p,
        limit: l,
        total,
      });
    }

    const datos = await consulta;
    res.json(datos.map((x) => serializarPrestamo(x, ahora)));
  })
);

// GET /api/prestamos/:id
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const prestamo = await Prestamo.findById(req.params.id)
      .populate([POPULATE_EQUIPO, POPULATE_USUARIO])
      .lean();
    if (!prestamo) throw new ApiError(404, "Préstamo no encontrado");
    res.json(serializarPrestamo(prestamo));
  })
);

// POST /api/prestamos  (R1-R4 + R8)
router.post(
  "/",
  asyncHandler(async (req, res) => {
    // 1. Joi: formato de ambos ObjectId y de la fecha -> 400
    const { equipoId, usuarioId, fechaLimite, observaciones } = await validar(
      crearSchema,
      req.body
    );

    // 2. Usuario: debe existir (404) y estar activo (400) -> R2
    const usuario = await Usuario.findById(usuarioId).lean();
    if (!usuario) throw new ApiError(404, "El usuario no existe");
    if (!usuario.activo) {
      throw new ApiError(400, "El usuario está inactivo y no puede recibir préstamos");
    }

    // 3. Equipo: debe existir (404) y estar disponible (409) -> R1
    const equipo = await Equipo.findById(equipoId).select("estado").lean();
    if (!equipo) throw new ApiError(404, "El equipo no existe");
    if (equipo.estado !== "disponible") {
      throw new ApiError(
        409,
        `El equipo no está disponible (estado actual: ${equipo.estado})`
      );
    }

    // 4. Tope de préstamos activos del usuario -> R3
    const tope = TOPES[usuario.tipo];
    const activos = await Prestamo.countDocuments({ usuarioId, estado: "activo" });
    if (activos >= tope) {
      throw new ApiError(
        409,
        `El usuario alcanzó su tope de ${tope} préstamos activos (${usuario.tipo})`
      );
    }

    // 5. Fecha límite: en el futuro y a máximo 7 días (15 si es docente) -> R4
    const ahora = new Date();
    const limite = new Date(fechaLimite);
    const maxDias = MAX_DIAS[usuario.tipo];
    if (limite <= ahora) {
      throw new ApiError(400, "La fecha límite debe estar en el futuro");
    }
    if (limite - ahora > maxDias * DIA_MS) {
      throw new ApiError(
        400,
        `La fecha límite no puede superar ${maxDias} días desde hoy (${usuario.tipo})`
      );
    }

    // 6. R8: cambio de estado ATÓMICO. Una sola operación condicional: solo
    //    pasa a "prestado" si en ese instante sigue "disponible". Si otra
    //    solicitud ganó la carrera, devuelve null y respondemos 409.
    const tomado = await Equipo.findOneAndUpdate(
      { _id: equipoId, estado: "disponible" },
      { estado: "prestado" },
      { new: true }
    );
    if (!tomado) {
      const actual = await Equipo.findById(equipoId).select("estado").lean();
      if (!actual) throw new ApiError(404, "El equipo no existe");
      throw new ApiError(
        409,
        `El equipo no está disponible (estado actual: ${actual.estado})`
      );
    }

    // 7. Crear el préstamo; si falla la escritura, compensación: el equipo
    //    vuelve a "disponible" y se propaga el error original.
    let prestamo;
    try {
      prestamo = await Prestamo.create({
        equipoId,
        usuarioId,
        fechaPrestamo: ahora,
        fechaLimite: limite,
        observaciones: observaciones ?? "",
      });
    } catch (err) {
      await Equipo.updateOne(
        { _id: equipoId, estado: "prestado" },
        { estado: "disponible" }
      );
      throw err;
    }

    // 8. 201 con préstamo, equipo y usuario resueltos
    const completo = await Prestamo.findById(prestamo._id)
      .populate([POPULATE_EQUIPO_CON_ESTADO, POPULATE_USUARIO])
      .lean();
    res.status(201).json(serializarPrestamo(completo, ahora));
  })
);

// PATCH /api/prestamos/:id/devolver  (R5)
router.patch(
  "/:id/devolver",
  asyncHandler(async (req, res) => {
    const ahora = new Date();

    // Condicional y atómico: solo devuelve si sigue "activo"
    const prestamo = await Prestamo.findOneAndUpdate(
      { _id: req.params.id, estado: "activo" },
      { estado: "devuelto", fechaDevolucion: ahora },
      { new: true, runValidators: true }
    );

    if (!prestamo) {
      if (await Prestamo.exists({ _id: req.params.id })) {
        throw new ApiError(409, "El préstamo ya fue devuelto");
      }
      throw new ApiError(404, "Préstamo no encontrado");
    }

    // El equipo vuelve a disponible
    await Equipo.updateOne(
      { _id: prestamo.equipoId, estado: "prestado" },
      { estado: "disponible" }
    );

    const completo = await Prestamo.findById(prestamo._id)
      .populate([POPULATE_EQUIPO_CON_ESTADO, POPULATE_USUARIO])
      .lean();
    res.json(serializarPrestamo(completo, ahora));
  })
);

export default router;
