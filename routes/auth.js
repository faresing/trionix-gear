import { Router } from "express";
import Joi from "joi";
import jwt from "jsonwebtoken";
import Admin from "../models/Admin.js";
import { requireAuth } from "../middlewares/auth.js";
import { ApiError, asyncHandler } from "../middlewares/errorHandler.js";

const router = Router();

const loginSchema = Joi.object({
  username: Joi.string().trim().lowercase().required(),
  password: Joi.string().required(),
});

// POST /api/auth/login
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { username, password } = await loginSchema.validateAsync(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    const admin = await Admin.findOne({ username }).select("+password");

    if (!admin || !(await admin.compararPassword(password))) {
      throw new ApiError(401, "Credenciales inválidas");
    }

    const expiresIn = process.env.JWT_EXPIRES_IN || "2h";
    const token = jwt.sign(
      { sub: admin._id.toString(), username: admin.username },
      process.env.JWT_SECRET,
      { algorithm: "HS256", expiresIn }
    );

    res.json({ token, tipo: "Bearer", expiresIn, username: admin.username });
  })
);

// GET /api/auth/me
router.get("/me", requireAuth, (req, res) => {
  res.json({ username: req.admin.username });
});

export default router;