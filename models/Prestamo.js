import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

const prestamoSchema = new mongoose.Schema(
  {
    equipoId: { type: ObjectId, ref: "Equipo", required: true },
    usuarioId: { type: ObjectId, ref: "Usuario", required: true },
    fechaPrestamo: { type: Date, default: Date.now },
    fechaLimite: { type: Date, required: true },
    fechaDevolucion: { type: Date, default: null },
    estado: {
      type: String,
      enum: ["activo", "devuelto"],
      default: "activo",
    },
    observaciones: { type: String, trim: true, maxlength: 300, default: "" },
  },
  { timestamps: true }
);

// Historial por usuario / por equipo, del más reciente al más antiguo
prestamoSchema.index({ usuarioId: 1, fechaPrestamo: -1 });
prestamoSchema.index({ equipoId: 1, fechaPrestamo: -1 });
// Vencidos: estado = "activo" y fechaLimite < ahora
prestamoSchema.index({ estado: 1, fechaLimite: 1 });
// Paginación de GET /api/prestamos?estado=&page=&limit= (bonus):
// igualdad en estado + orden por fecha desc (+ _id como desempate estable),
// así MongoDB recorre el índice en orden y no ordena en memoria.
prestamoSchema.index({ estado: 1, fechaPrestamo: -1, _id: -1 });

// Defensa en profundidad para R8: a nivel de base de datos, un equipo
// no puede tener dos préstamos "activo" a la vez.
prestamoSchema.index(
  { equipoId: 1 },
  { unique: true, partialFilterExpression: { estado: "activo" } }
);

export default mongoose.model("Prestamo", prestamoSchema);
