from sqlalchemy.orm import Session
from app.models.inventario import Activo, ActivoStatus
from app.schemas.inventario_schema import ActivoCreate, ActivoUpdate

class InventarioService:
    @staticmethod
    def get_activos(db: Session, skip: int = 0, limit: int = 100) -> list[Activo]:
        return db.query(Activo).offset(skip).limit(limit).all()

    @staticmethod
    def create_activo(db: Session, activo_in: ActivoCreate) -> Activo:
        db_activo = Activo(**activo_in.model_dump())
        db.add(db_activo)
        db.commit()
        db.refresh(db_activo)
        return db_activo

    @staticmethod
    def asignar_activo(db: Session, activo_id: int, usuario_id: int) -> Activo | None:
        db_activo = db.query(Activo).filter(Activo.id == activo_id).first()
        if not db_activo:
            return None
        
        db_activo.usuario_id = usuario_id
        db_activo.estado = ActivoStatus.ASIGNADO
        db.commit()
        db.refresh(db_activo)
        return db_activo

inventario_service = InventarioService()
