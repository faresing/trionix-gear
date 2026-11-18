// Datos de prueba. Dentro del contenedor:  docker compose exec api node seed.js
// En local:                                  npm run seed
// OJO: borra y recrea equipos, usuarios, préstamos y admin.
import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "./db.js";
import Equipo from "./models/Equipo.js";
import Usuario from "./models/Usuario.js";
import Prestamo from "./models/Prestamo.js";
import Admin from "./models/Admin.js";

const DIA = 24 * 60 * 60 * 1000;
const haceDias = (n) => new Date(Date.now() - n * DIA);
const enDias = (n) => new Date(Date.now() + n * DIA);

async function seed() {
  const adminUser = process.env.ADMIN_USERNAME || "admin";
  const adminPass = process.env.ADMIN_PASSWORD;
  if (!adminPass || adminPass.length < 8) {
    throw new Error("Define ADMIN_PASSWORD (mínimo 8 caracteres) en el .env");
  }

  await connectDB();

  // Asegura que los índices (unique, parcial) existan antes de insertar
  await Promise.all([Equipo.init(), Usuario.init(), Prestamo.init(), Admin.init()]);

  await Promise.all([
    Equipo.deleteMany({}),
    Usuario.deleteMany({}),
    Prestamo.deleteMany({}),
    Admin.deleteMany({}),
  ]);
  console.log("✔ Colecciones limpiadas");

  // Admin para el login (la contraseña se hashea en el hook del modelo)
  await Admin.create({
    nombre: "Administrador Trionix",
    username: adminUser,
    email: "admin@trionix.edu.co",
    password: adminPass,
  });
  console.log(`✔ Admin creado (usuario: ${adminUser})`);

  // 8 equipos de varias categorías. Los "prestado" tienen un préstamo activo abajo.
  const [e1, e2, e3, , , e6, e7] = await Equipo.insertMany([
    { codigo: "EQ-0001", nombre: "Portátil Dell Latitude 5420", categoria: "portatil", estado: "disponible", ubicacion: "Almacen principal" },
    { codigo: "EQ-0002", nombre: "Portátil Lenovo ThinkPad E14", categoria: "portatil", estado: "prestado", ubicacion: "Almacen principal" },
    { codigo: "EQ-0003", nombre: "Proyector Epson PowerLite", categoria: "proyector", estado: "disponible", ubicacion: "Sala de juntas" },
    { codigo: "EQ-0004", nombre: "Cámara Sony Alpha a6400", categoria: "camara", estado: "mantenimiento", ubicacion: "Laboratorio multimedia" },
    { codigo: "EQ-0005", nombre: "Kit de audio Shure inalámbrico", categoria: "audio", estado: "disponible", ubicacion: "Almacen principal" },
    { codigo: "EQ-0006", nombre: "Switch Cisco Catalyst 2960", categoria: "redes", estado: "prestado", ubicacion: "Rack de comunicaciones" },
    { codigo: "EQ-0007", nombre: "Portátil MacBook Air M1", categoria: "portatil", estado: "prestado", ubicacion: "Almacen principal" },
    { codigo: "EQ-0008", nombre: "Proyector BenQ MX550", categoria: "proyector", estado: "disponible", ubicacion: "Auditorio" },
  ]);
  console.log("✔ 8 equipos creados");

  // 5 usuarios de los tres tipos (uno inactivo)
  const [u1, u2, u3, u4] = await Usuario.insertMany([
    { nombre: "Carlos Estudiante", documento: "1002003001", email: "carlos.estudiante@trionix.edu.co", tipo: "estudiante", activo: true },
    { nombre: "Ana Docente", documento: "1002003002", email: "ana.docente@trionix.edu.co", tipo: "docente", activo: true },
    { nombre: "Pedro Administrativo", documento: "1002003003", email: "pedro.admin@trionix.edu.co", tipo: "administrativo", activo: true },
    { nombre: "Sofía Estudiante", documento: "1002003004", email: "sofia.estudiante@trionix.edu.co", tipo: "estudiante", activo: true },
    { nombre: "Luis Inactivo", documento: "1002003005", email: "luis.inactivo@trionix.edu.co", tipo: "estudiante", activo: false },
  ]);
  console.log("✔ 5 usuarios creados");

  // 6 préstamos: 3 activos (1 vencido) y 3 devueltos
  await Prestamo.insertMany([
    // activos
    { equipoId: e2._id, usuarioId: u1._id, fechaPrestamo: haceDias(1), fechaLimite: enDias(3), estado: "activo", observaciones: "Para proyecto de grado" },
    { equipoId: e6._id, usuarioId: u2._id, fechaPrestamo: haceDias(10), fechaLimite: haceDias(3), estado: "activo", observaciones: "Práctica de redes (VENCIDO)" },
    { equipoId: e7._id, usuarioId: u4._id, fechaPrestamo: haceDias(2), fechaLimite: enDias(4), estado: "activo", observaciones: "Trabajo final" },
    // devueltos (EQ-0001 dos veces para que el top tenga datos)
    { equipoId: e1._id, usuarioId: u3._id, fechaPrestamo: haceDias(12), fechaLimite: haceDias(6), fechaDevolucion: haceDias(9), estado: "devuelto", observaciones: "Devuelto a tiempo" },
    { equipoId: e1._id, usuarioId: u1._id, fechaPrestamo: haceDias(8), fechaLimite: haceDias(2), fechaDevolucion: haceDias(6), estado: "devuelto", observaciones: "Sin novedades" },
    { equipoId: e3._id, usuarioId: u2._id, fechaPrestamo: haceDias(6), fechaLimite: haceDias(1), fechaDevolucion: haceDias(4), estado: "devuelto", observaciones: "Clase magistral" },
  ]);
  console.log("✔ 6 préstamos creados (3 activos, 1 de ellos vencido; 3 devueltos)");

  console.log("¡Base de datos sembrada!");
}

seed()
  .then(() => mongoose.disconnect())
  .catch(async (err) => {
    console.error("Error al sembrar:", err.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
