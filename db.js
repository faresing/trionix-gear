import mongoose from "mongoose";

export async function connectDB(uri = process.env.MONGODB_URI) {
  if (!uri) throw new Error("MONGODB_URI no está definida en el entorno");

  mongoose.connection.on("disconnected", () =>
    console.warn("[mongo] conexión perdida")
  );
  mongoose.connection.on("reconnected", () =>
    console.log("[mongo] reconectado")
  );

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  console.log("[mongo] conectado");
}

// readyState 1 = connected. Lo usa GET /api/health.
export const dbConnected = () => mongoose.connection.readyState === 1;