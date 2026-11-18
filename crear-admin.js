// Crea el admin inicial a partir de ADMIN_USERNAME / ADMIN_PASSWORD (.env).
// Uso temporal hasta tener seed.js:  node --env-file=.env crear-admin.js
import mongoose from "mongoose";
import { connectDB } from "./db.js";
import Admin from "./models/Admin.js";

const username = process.env.ADMIN_USERNAME;
const password = process.env.ADMIN_PASSWORD;
if (!username || !password) {
  console.error("Define ADMIN_USERNAME y ADMIN_PASSWORD en el .env");
  process.exit(1);
}

await connectDB();
const existe = await Admin.exists({ username: username.toLowerCase() });
if (existe) {
  console.log(`El admin '${username}' ya existe`);
} else {
  await Admin.create({ username, password });
  console.log(`Admin '${username}' creado`);
}
await mongoose.disconnect();
