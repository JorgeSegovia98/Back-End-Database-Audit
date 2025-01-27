import express from "express";
import cors from "cors";
import { logger } from "./config/logger.js";
import auditoriaRoutes from "./routes/auditoria.js";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Rutas
app.use("/api/auditoria", auditoriaRoutes);

// Iniciar servidor
app.listen(port, () => {
  logger.info(`Servidor corriendo en el puerto ${port}`);
  console.log(`Servidor corriendo en http://localhost:${port}`);
});
