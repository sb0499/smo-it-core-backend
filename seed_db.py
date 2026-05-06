from sqlalchemy.orm import Session
from app.db.session import SessionLocal, engine

# Importamos Base y TODOS los modelos para que SQLAlchemy los conozca y los cree
from app.db.base import Base
from app.models.usuario import Usuario, UserRole
from app.models.empresa import Empresa # <--- NUEVO: Importamos el catálogo
from app.models.ticket import Ticket, TicketPriority, TicketStatus, MedioSolicitud
from app.models.inventario import Activo
from app.models.proyecto import Proyecto, TareaInterna
from app.models.guardia import GuardiaFeriado 
from app.models.plantilla import PlantillaRecurrente 

from app.core.security import get_password_hash, verify_password

def force_seed():
    print("Destruyendo tablas viejas...")
    Base.metadata.drop_all(bind=engine)
    
    print("Creando/Actualizando tablas en la Base de Datos...")
    Base.metadata.create_all(bind=engine)
    
    db: Session = SessionLocal()
    try:
        admin_email = "admin@smo.com"
        password_plano = "admin123"

        # 1. Crear nuevo hash con la lógica actual
        nuevo_hash = get_password_hash(password_plano)
        print(f"Nuevo hash generado: {nuevo_hash}")

        # 2. Crear el usuario Admin
        admin_user = Usuario(
            email=admin_email,
            hashed_password=nuevo_hash,
            nombre_completo="Administrador Sistema",
            rol=UserRole.ADMIN,
            is_active=True
        )
        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)
        
        # 3. Inyectar las Empresas Automáticamente  <--- NUEVO
        empresas_base = [
            "CONDADO", "SCALA", "POMASQUI", "CCI", "SMO", 
            "PORTOSHOPPING", "GAMETOWN", "APPARCA", "DATATRUST", "EL TEATRO"
        ]
        
        print("Inyectando catálogo de empresas...")
        for nombre_empresa in empresas_base:
            nueva_empresa = Empresa(nombre=nombre_empresa)
            db.add(nueva_empresa)
            
        db.commit() # Guardamos todas las empresas juntas
        
        # 4. Verificación inmediata en el script
        is_valid = verify_password(password_plano, admin_user.hashed_password)
        if is_valid:
            print("¡ÉXITO! Base de datos lista con Usuario Admin y Catálogo de Empresas.")
        else:
            print("ERROR: El hash generado no coincide con la verificación. Revisa security.py.")
            
    except Exception as e:
        print(f"Error crítico en el seed: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    force_seed()