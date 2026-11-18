import jwt from "jsonwebtoken";

// Exige un JWT válido en el header: Authorization: Bearer <token>
export function requireAuth(req, res, next) {
  const [esquema, token] = (req.headers.authorization ?? "").split(" ");
  if (esquema !== "Bearer" || !token) {
    return res.status(401).json({ error: "Token requerido" });
  }
  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
    next();
  } catch (err) {
    const mensaje =
      err.name === "TokenExpiredError" ? "Token expirado" : "Token inválido";
    res.status(401).json({ error: mensaje });
  }
}

const METODOS_DE_LECTURA = new Set(["GET", "HEAD", "OPTIONS"]);

// Deja pasar las lecturas y exige token en POST/PUT/PATCH/DELETE.
// Se monta una sola vez en app.js sobre /api/equipos, /api/usuarios y /api/prestamos.
export function protegerEscrituras(req, res, next) {
  if (METODOS_DE_LECTURA.has(req.method)) return next();
  return requireAuth(req, res, next);
}
