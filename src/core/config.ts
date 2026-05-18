import dotenv from 'dotenv';

dotenv.config();

export const config = {
  PROJECT_NAME: "IT CORE SYSTEM - SMO",
  VERSION: "1.0.0",
  API_V1_STR: "/api/v1",
  
  DATABASE_URL: process.env.DATABASE_URL || "mysql://root:@localhost:3306/smo_it_core",
  
  JWT_SECRET: process.env.JWT_SECRET || "fallback_secret",
  ALGORITHM: process.env.ALGORITHM || "HS256",
  ACCESS_TOKEN_EXPIRE_MINUTES: parseInt(process.env.ACCESS_TOKEN_EXPIRE_MINUTES || "480", 10),
  
  SMTP_HOST: process.env.SMTP_HOST || "",
  SMTP_PORT: parseInt(process.env.SMTP_PORT || "587", 10),
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASS: process.env.SMTP_PASS || "",
  SMTP_FROM: process.env.SMTP_FROM || "",
  
  PORT: parseInt(process.env.PORT || "8000", 10)
};
