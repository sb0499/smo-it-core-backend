import dotenv from 'dotenv';

dotenv.config();

export const config = {
  PROJECT_NAME: "IT CORE SYSTEM - SMO",
  VERSION: "1.0.0",
  API_V1_STR: "/api/v1",
  
  DB_HOST: process.env.DB_HOST || "localhost",
  DB_USER: process.env.DB_USER || "root",
  DB_PASSWORD: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : "",
  DB_NAME: process.env.DB_NAME || "vehiculos_db",
  DB_PORT: parseInt(process.env.DB_PORT || "3306", 10),
  
  JWT_SECRET: process.env.JWT_SECRET || "fallback_secret",
  ALGORITHM: process.env.ALGORITHM || "HS256",
  ACCESS_TOKEN_EXPIRE_MINUTES: parseInt(process.env.ACCESS_TOKEN_EXPIRE_MINUTES || "480", 10),
  
  MAIL_HOST: process.env.MAIL_HOST || "smtp.gmail.com",
  MAIL_PORT: parseInt(process.env.MAIL_PORT || "465", 10),
  MAIL_SECURE: process.env.MAIL_SECURE === 'true',
  MAIL_USER: process.env.MAIL_USER || "",
  MAIL_PASSWORD: process.env.MAIL_PASSWORD || "",
  
  PORT: parseInt(process.env.PORT || "5000", 10)
};
