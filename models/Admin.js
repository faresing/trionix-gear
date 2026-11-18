import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const adminSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // Se guarda el hash, nunca el texto plano. select:false evita que salga
    // en las consultas salvo que se pida con .select("+password").
    password: { type: String, required: true, minlength: 8, select: false },
  },
  { timestamps: true }
);

// Hashea solo cuando la contraseña es nueva o cambió
adminSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

adminSchema.methods.compararPassword = function (passwordIngresada) {
  return bcrypt.compare(passwordIngresada, this.password);
};

export default mongoose.model("Admin", adminSchema);
