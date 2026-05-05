from sqlalchemy.orm import Session
from app.db.session import SessionLocal

# Importamos Base y TODOS los modelos para que SQLAlchemy los conozca
from app.db.base import Base
from app.models.usuario import Usuario, UserRole
from app.models.ticket import Ticket, TicketPriority, TicketStatus
from app.models.inventario import Activo
from app.models.proyecto import Proyecto, TareaInterna

from app.core.security import get_password_hash, verify_password
def force_seed():
    db: Session = SessionLocal()
    try:
        admin_email = "admin@smo.com"
        password_plano = "admin123"
        
        # 1. Buscar y eliminar si existe para limpiar hashes antiguos
        user = db.query(Usuario).filter(Usuario.email == admin_email).first()
        if user:
            print(f"Eliminando usuario antiguo {admin_email} para limpiar el hash...")
            db.delete(user)
            db.commit()

        # 2. Crear nuevo hash con la lógica actual de Python 3.13
        nuevo_hash = get_password_hash(password_plano)
        print(f"Nuevo hash generado: {nuevo_hash}")

        # 3. Crear el usuario
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
        
        # 4. Verificación inmediata en el script
        is_valid = verify_password(password_plano, admin_user.hashed_password)
        if is_valid:
            print("¡ÉXITO! El nuevo usuario ha sido creado y el password es verificable.")
        else:
            print("ERROR: El hash generado no coincide con la verificación. Revisa security.py.")
            
    except Exception as e:
        print(f"Error crítico en el seed: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    force_seed()
