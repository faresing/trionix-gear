import { Router } from "express";
import Joi from "joi";
import Prestamo from "../models/Prestamo.js";
import Equipo from "../models/Equipo.js";
import { asyncHandler } from "../middlewares/errorHandler.js";
import { validar } from "../utils/helpers.js";

const router = Router();

const topSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(50).default(5),
});

// GET /api/reportes/top-equipos?limit=5
// aggregate sobre prestamos: $group -> $sort -> $limit -> $lookup a equipos
router.get(
  "/top-equipos",
  asyncHandler(async (req, res) => {
    const { limit } = await validar(topSchema, req.query);

    const top = await Prestamo.aggregate([
      { $group: { _id: "$equipoId", totalPrestamos: { $sum: 1 } } },
      { $sort: { totalPrestamos: -1, _id: 1 } },
      { $limit: limit },
      {
        $lookup: {
          from: "equipos",
          localField: "_id",
          foreignField: "_id",
          as: "equipo",
        },
      },
      { $unwind: "$equipo" },
      {
        $project: {
          _id: 0,
          equipoId: "$_id",
          codigo: "$equipo.codigo",
          nombre: "$equipo.nombre",
          categoria: "$equipo.categoria",
          totalPrestamos: 1,
        },
      },
    ]);

    res.json(top);
  })
);

// GET /api/reportes/resumen
// (a) equipos por estado, (b) préstamos activos, (c) vencidos, (d) activos por tipo de usuario
router.get(
  "/resumen",
  asyncHandler(async (req, res) => {
    const ahora = new Date();

    const [porEstado, [prestamos]] = await Promise.all([
      Equipo.aggregate([{ $group: { _id: "$estado", count: { $sum: 1 } } }]),
      Prestamo.aggregate([
        { $match: { estado: "activo" } },
        {
          $facet: {
            total: [{ $count: "n" }],
            vencidos: [
              { $match: { fechaLimite: { $lt: ahora } } },
              { $count: "n" },
            ],
            porTipo: [
              {
                $lookup: {
                  from: "usuarios",
                  localField: "usuarioId",
                  foreignField: "_id",
                  as: "u",
                },
              },
              { $unwind: "$u" },
              { $group: { _id: "$u.tipo", count: { $sum: 1 } } },
            ],
          },
        },
      ]),
    ]);

    const equiposPorEstado = { disponible: 0, prestado: 0, mantenimiento: 0 };
    porEstado.forEach((e) => {
      equiposPorEstado[e._id] = e.count;
    });

    const activosPorTipoUsuario = { estudiante: 0, docente: 0, administrativo: 0 };
    prestamos.porTipo.forEach((t) => {
      activosPorTipoUsuario[t._id] = t.count;
    });

    res.json({
      equiposPorEstado,
      prestamosActivos: prestamos.total[0]?.n ?? 0,
      prestamosVencidos: prestamos.vencidos[0]?.n ?? 0,
      activosPorTipoUsuario,
    });
  })
);

export default router;
