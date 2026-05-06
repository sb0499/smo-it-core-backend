from sqlalchemy.orm import Session
from app.db.session import SessionLocal, engine

from app.db.base import Base
from app.models.rol import Rol
from app.models.empresa import Empresa
from app.models.usuario import Usuario
from app.models.ticket import Ticket, TicketPriority, TicketStatus, MedioSolicitud
from app.models.inventario import Activo
from app.models.proyecto import Proyecto, TareaInterna
from app.models.guardia import GuardiaFeriado 
from app.models.plantilla import PlantillaRecurrente 

from app.core.security import get_password_hash, verify_password

def force_seed():
    print("Destruyendo tablas viejas (Nuke)...")
    Base.metadata.drop_all(bind=engine)
    
    print("Reconstruyendo la Base de Datos con Arquitectura Avanzada...")
    Base.metadata.create_all(bind=engine)
    
    db: Session = SessionLocal()
    try:
        nombres_roles = ["ADMIN", "TECNICO", "USUARIO"]
        print("Inyectando Roles...")
        for nombre in nombres_roles:
            db.add(Rol(nombre=nombre, descripcion=f"Rol de {nombre}"))
        db.commit()

        empresas_base = [
            "CONDADO", "SCALA", "POMASQUI", "CCI", "SMO", 
            "PORTOSHOPPING", "GAMETOWN", "APPARCA", "DATATRUST", "EL TEATRO"
        ]
        empresas_creadas = []
        print("Inyectando Empresas...")
        for nombre_empresa in empresas_base:
            nueva_empresa = Empresa(nombre=nombre_empresa)
            db.add(nueva_empresa)
            empresas_creadas.append(nueva_empresa)
        db.commit()

        admin_email = "admin@smo.com"
        password_plano = "admin123"
        nuevo_hash = get_password_hash(password_plano)
        
        rol_admin = db.query(Rol).filter(Rol.nombre == "ADMIN").first()

        admin_user = Usuario(
            email=admin_email,
            hashed_password=nuevo_hash,
            nombre_completo="Administrador Sistema",
            rol_id=rol_admin.id,
            is_active=True
        )
        
        admin_user.empresas = empresas_creadas
        
        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)
        
        is_valid = verify_password(password_plano, admin_user.hashed_password)
        if is_valid:
            print("¡ÉXITO TOTAL! Base de datos inicializada con RBAC (Roles) y Multi-tenancy (Empresas).")
        else:
            print("ERROR: El hash generado no coincide con la verificación.")
            
    except Exception as e:
        print(f"Error crítico en el seed: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    force_seed()