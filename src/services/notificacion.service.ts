import nodemailer from 'nodemailer';
import { config } from '../core/config';

const transporter = nodemailer.createTransport({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  secure: false,
  auth: {
    user: config.SMTP_USER,
    pass: config.SMTP_PASS
  }
});

export const enviarCorreo = async (emailTo: string, subject: string, body: string): Promise<void> => {
  if (!config.SMTP_HOST || !config.SMTP_USER || !config.SMTP_PASS || config.SMTP_PASS === 'password_falso_123') {
    console.log(`DEBUG: Simulación envío correo a ${emailTo}. Asunto: ${subject}`);
    return;
  }
  try {
    await transporter.sendMail({
      from: config.SMTP_FROM,
      to: emailTo,
      subject,
      text: body
    });
  } catch (e) {
    console.error(`Error enviando correo: ${e}`);
  }
};
