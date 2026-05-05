import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.core.config import settings

class NotificacionService:
    @staticmethod
    def enviar_correo(email_to: str, subject: str, body: str) -> None:
        if not all([settings.SMTP_HOST, settings.SMTP_USER, settings.SMTP_PASS]):
            print(f"DEBUG: Simulación envío correo a {email_to}. Asunto: {subject}")
            return

        message = MIMEMultipart()
        message["From"] = settings.SMTP_FROM
        message["To"] = email_to
        message["Subject"] = subject
        message.attach(MIMEText(body, "plain"))

        try:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                server.starttls()
                server.login(settings.SMTP_USER, settings.SMTP_PASS)
                server.sendmail(settings.SMTP_FROM, email_to, message.as_string())
        except Exception as e:
            print(f"Error enviando correo: {e}")

notificacion_service = NotificacionService()
