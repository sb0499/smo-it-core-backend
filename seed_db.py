from sqlalchemy.orm import Session
from app.db.session import SessionLocal, engine
from app.db.base import Base

from app.models.rol import Rol
from app.models.empresa import Empresa
from app.models.usuario import Usuario
from app.models.persona import Persona  # <--- Asegúrate que este nombre sea exacto
from app.models.inventario import Activo, ActivoStatus
from app.models.consumible import Consumible
from app.models.ticket import Ticket, TicketPriority, TicketStatus, MedioSolicitud
from app.models.proyecto import Proyecto, TareaInterna
from app.models.guardia import GuardiaFeriado 
from app.models.plantilla import PlantillaRecurrente 

from app.core.security import get_password_hash, verify_password

from sqlalchemy import text

def force_seed():
    with engine.connect() as connection:
        print("Destruyendo tablas viejas (Nuke Total)...")
        connection.execute(text("SET FOREIGN_KEY_CHECKS = 0;"))
        
        try:
            Base.metadata.drop_all(bind=connection)
            print("Tablas eliminadas con éxito.")
        except Exception as e:
            print(f"Aviso: El drop_all falló, pero continuaremos... {e}")
        
        print("Reconstruyendo la Base de Datos...")
        Base.metadata.create_all(bind=connection)
        
        connection.execute(text("SET FOREIGN_KEY_CHECKS = 1;"))
        connection.commit()

    db: Session = SessionLocal()
    try:
        print("Inyectando Roles...")
        nombres_roles = ["ADMIN", "TECNICO", "USUARIO"]
        for nombre in nombres_roles:
            db.add(Rol(nombre=nombre, descripcion=f"Rol de {nombre}"))
        db.commit()

        print("Inyectando Empresas...")
        empresas_base = ["CONDADO", "SCALA", "POMASQUI", "CCI", "SMO", "PORTOSHOPPING", "GAMETOWN", "APPARCA", "DATATRUST", "EL TEATRO"]
        empresas_creadas = []
        for nombre_empresa in empresas_base:
            nueva_empresa = Empresa(nombre=nombre_empresa)
            db.add(nueva_empresa)
            empresas_creadas.append(nueva_empresa)
        db.commit()

        rol_admin = db.query(Rol).filter(Rol.nombre == "ADMIN").first()
        nuevo_hash = get_password_hash("admin123")
        admin_user = Usuario(
            email="admin@smo.com",
            hashed_password=nuevo_hash,
            nombre_completo="Administrador Sistema",
            rol_id=rol_admin.id,
            is_active=True
        )
        admin_user.empresas = empresas_creadas
        db.add(admin_user)
        db.commit()

        print("¡ÉXITO TOTAL! Sistema reiniciado con Inventarios y Personas.")
        
    except Exception as e:
        print(f"Error crítico en la inyección: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    force_seed()