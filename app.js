import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectDB, dbConnected } from "./db.js";
import { protegerEscrituras } from "./middlewares/auth.js";
import { errorHandler, notFound } from "./middlewares/errorHandler.js";
import authRoutes from "./routes/auth.js";
import equiposRoutes from "./routes/equipos.js";
import usuariosRoutes from "./routes/usuarios.js";
import prestamosRoutes from "./routes/prestamos.js";
import reportesRoutes from "./routes/reportes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.disable("x-powered-by");
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Público: lo usa el healthcheck de Docker
app.get("/api/health", (req, res) => {
  if (dbConnected()) {
    return res.status(200).json({ status: "ok", db: "connected" });
  }
  res.status(503).json({ status: "error", db: "disconnected" });
});

// Público: login
app.use("/api/auth", authRoutes);

// Escrituras (POST/PUT/PATCH/DELETE) exigen JWT; los GET quedan públicos
app.use(
  ["/api/equipos", "/api/usuarios", "/api/prestamos"],
  protegerEscrituras
);

// Rutas habilitadas
app.use("/api/equipos", equiposRoutes);
app.use("/api/usuarios", usuariosRoutes);
app.use("/api/prestamos", prestamosRoutes);
app.use("/api/reportes", reportesRoutes);

app.use("/api", notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

async function start() {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET no está definida en el entorno");
  }
  await connectDB();
  app.listen(PORT, () => console.log(`[api] escuchando en el puerto ${PORT}`));
}

start().catch((err) => {
  console.error("[api] no se pudo iniciar:", err.message);
  process.exit(1);
});