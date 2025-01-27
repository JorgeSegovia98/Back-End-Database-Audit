import sql from "mssql";
import dotenv from "dotenv";

dotenv.config();

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
};

export const connectToDatabase = async () => {
  try {
    return await sql.connect(config);
  } catch (error) {
    throw new Error("Error conectando a la base de datos: " + error.message);
  }
};