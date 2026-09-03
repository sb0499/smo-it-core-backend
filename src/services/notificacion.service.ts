import nodemailer from 'nodemailer';
import { config } from '../core/config';
import { pool } from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import path from 'path';
import fs from 'fs';

const getFaviconPath = (): string | null => {
  const p1 = path.join(__dirname, '../assets/favicon.svg');
  if (fs.existsSync(p1)) return p1;
  const p2 = path.join(process.cwd(), 'src/assets/favicon.svg');
  if (fs.existsSync(p2)) return p2;
  const p3 = path.join(process.cwd(), 'dist/assets/favicon.svg');
  if (fs.existsSync(p3)) return p3;
  return null;
};

const transporter = nodemailer.createTransport({
  host: config.MAIL_HOST,
  port: config.MAIL_PORT,
  secure: config.MAIL_PORT === 465 || config.MAIL_SECURE,
  auth: {
    user: config.MAIL_USER,
    pass: config.MAIL_PASSWORD
  },
  tls: {
    rejectUnauthorized: false
  }
});

const getFaviconContent = (): string => {
  const faviconPath = getFaviconPath();
  if (faviconPath && fs.existsSync(faviconPath)) {
    try {
      const content = fs.readFileSync(faviconPath, 'utf8');
      return content.replace('<svg ', '<svg width="42" height="42" style="display: block;" ');
    } catch (e) {
      console.error('Error leyendo favicon.svg:', e);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="42" height="42" style="display: block;">
    <path d="M50 16 L80 26 V52 C80 69 68 82 50 87 C32 82 20 69 20 52 V26 Z" fill="none" stroke="#6366f1" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" />
    <path d="M35 36 H65" stroke="#6366f1" stroke-width="5" stroke-linecap="round" />
    <circle cx="35" cy="36" r="3.5" fill="#6366f1" />
    <circle cx="65" cy="36" r="3.5" fill="#6366f1" />
    <circle cx="50" cy="27" r="3.5" fill="#6366f1" />
    <line x1="50" y1="27" x2="50" y2="40" stroke="#6366f1" stroke-width="2" />
    <rect x="40" y="46" width="5" height="16" rx="2.5" fill="#6366f1" />
    <rect x="47.5" y="42" width="5" height="26" rx="2.5" fill="#6366f1" />
    <rect x="55" y="51" width="5" height="11" rx="2.5" fill="#6366f1" />
  </svg>`;
};

export const generarPlantillaHTML = (subject: string, bodyText: string): string => {
  const lineas = bodyText.split('\n');
  
  let contenidoHTML = '';
  let enBloque = false;
  let lineasBloque: string[] = [];

  for (const linea of lineas) {
    const trimmed = linea.trim();
    if (!trimmed) {
      if (enBloque && lineasBloque.length > 0) {
        contenidoHTML += `<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #2563eb; border-radius: 8px; padding: 14px 18px; margin: 16px 0; font-size: 14px; color: #334155; line-height: 1.6;">${lineasBloque.join('<br />')}</div>`;
        lineasBloque = [];
        enBloque = false;
      }
      continue;
    }

    if (trimmed.includes(':') && (trimmed.startsWith('Sede') || trimmed.startsWith('Fecha') || trimmed.startsWith('Observaciones') || trimmed.startsWith('Estado') || trimmed.startsWith('Creador') || trimmed.startsWith('Detalle') || trimmed.startsWith('Técnico') || trimmed.startsWith('Usuario') || trimmed.startsWith('Categoría') || trimmed.startsWith('Prioridad') || trimmed.startsWith('Motivo') || trimmed.startsWith('Dominio') || trimmed.startsWith('Hosting'))) {
      enBloque = true;
      const partes = trimmed.split(':');
      const clave = partes[0].trim();
      const valor = partes.slice(1).join(':').trim();
      lineasBloque.push(`<strong style="color: #0f172a;">${clave}:</strong> <span style="color: #334155; font-weight: 500;">${valor}</span>`);
    } else {
      if (enBloque && lineasBloque.length > 0) {
        contenidoHTML += `<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #2563eb; border-radius: 8px; padding: 14px 18px; margin: 16px 0; font-size: 14px; color: #334155; line-height: 1.6;">${lineasBloque.join('<br />')}</div>`;
        lineasBloque = [];
        enBloque = false;
      }
      if (trimmed.startsWith('Hola')) {
        contenidoHTML += `<p style="font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 12px;">${trimmed}</p>`;
      } else if (trimmed.startsWith('Por favor') || trimmed.startsWith('Saludos') || trimmed.startsWith('Sistema TISMO') || trimmed.startsWith('Nos complace')) {
        contenidoHTML += `<p style="font-size: 14px; color: #475569; margin-top: 14px; margin-bottom: 6px; line-height: 1.5;">${trimmed}</p>`;
      } else {
        contenidoHTML += `<p style="font-size: 14px; color: #334155; line-height: 1.6; margin: 8px 0;">${trimmed}</p>`;
      }
    }
  }

  if (enBloque && lineasBloque.length > 0) {
    contenidoHTML += `<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #2563eb; border-radius: 8px; padding: 14px 18px; margin: 16px 0; font-size: 14px; color: #334155; line-height: 1.6;">${lineasBloque.join('<br />')}</div>`;
  }

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 0; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 32px 0;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 6px 18px rgba(15,23,42,0.06); border: 1px solid #e2e8f0;">
          <!-- ENCABEZADO TISMO CORPORATIVO SOLO TIPOGRAFIA -->
          <tr>
            <td style="background-color: #0f172a; padding: 26px 30px; border-bottom: 4px solid #2563eb; text-align: left;">
              <div style="font-size: 24px; font-weight: 900; color: #ffffff; letter-spacing: 1.5px; font-family: 'Segoe UI', Arial, sans-serif; line-height: 1;">
                TISMO
              </div>
              <div style="font-size: 11px; font-weight: 700; color: #3b82f6; text-transform: uppercase; letter-spacing: 1.2px; margin-top: 5px; font-family: 'Segoe UI', Arial, sans-serif;">
                SISTEMA DE GESTIÓN TI
              </div>
              <div style="font-size: 9px; font-weight: 500; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; margin-top: 3px; font-family: 'Segoe UI', Arial, sans-serif;">
                SHOPPING MANAGEMENT OPERADORA
              </div>
            </td>
          </tr>

          <!-- CUERPO PRINCIPAL -->
          <tr>
            <td style="padding: 30px 28px; color: #334155;">
              <h2 style="font-size: 19px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 18px; padding-bottom: 12px; border-bottom: 1px solid #f1f5f9; line-height: 1.3;">
                ${subject}
              </h2>
              ${contenidoHTML}
            </td>
          </tr>

          <!-- PIE DE PÁGINA -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 28px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11.5px; color: #94a3b8;">
              <p style="margin: 0 0 4px 0;"><strong style="color: #475569;">Shopping Managements Operadora (SMO)</strong></p>
              <p style="margin: 0;">Plataforma TISMO • Departamento de Tecnología de la Información</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

export const enviarCorreo = async (emailTo: string, subject: string, body: string, customHtml?: string): Promise<void> => {
  const htmlToSend = customHtml || generarPlantillaHTML(subject, body);

  if (!config.MAIL_HOST || !config.MAIL_USER || !config.MAIL_PASSWORD || config.MAIL_PASSWORD === 'password_falso_123') {
    console.log(`DEBUG: Simulación envío correo HTML TISMO a ${emailTo}. Asunto: ${subject}`);
    return;
  }

  try {
    await transporter.sendMail({
      from: `TISMO <${config.MAIL_USER}>`,
      to: emailTo,
      subject,
      text: body,
      html: htmlToSend
    });
  } catch (e) {
    console.error(`Error enviando correo: ${e}`);
  }
};

// In-app Notifications
export const crearNotificacion = async (usuarioId: number, titulo: string, mensaje: string): Promise<void> => {
  try {
    await pool.query(
      `INSERT INTO notificacion (usuario_id, titulo, mensaje) VALUES (?, ?, ?)`,
      [usuarioId, titulo, mensaje]
    );
  } catch (e) {
    console.error(`Error al crear notificación interna para usuario ID ${usuarioId}:`, e);
  }
};

export const getNotificaciones = async (usuarioId: number): Promise<any[]> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM notificacion 
     WHERE usuario_id = ? 
     ORDER BY created_at DESC 
     LIMIT 50`,
    [usuarioId]
  );
  return rows;
};

export const marcarLeida = async (notificacionId: number, usuarioId: number): Promise<boolean> => {
  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE notificacion 
     SET leido = TRUE 
     WHERE id = ? AND usuario_id = ?`,
    [notificacionId, usuarioId]
  );
  return result.affectedRows > 0;
};

export const marcarTodasLeidas = async (usuarioId: number): Promise<void> => {
  await pool.query(
    `UPDATE notificacion 
     SET leido = TRUE 
     WHERE usuario_id = ?`,
    [usuarioId]
  );
};
