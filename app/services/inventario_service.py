from sqlalchemy.orm import Session, joinedload
from app.models.inventario import Activo, ActivoStatus
from app.schemas.inventario_schema import ActivoCreate, ActivoUpdate
from app.models.movimiento import MovimientoInventario

class InventarioService:
    @staticmethod
    def get_activos(db: Session, skip: int = 0, limit: int = 100) -> list[Activo]:
        return db.query(Activo).offset(skip).limit(limit).all()

    @staticmethod
    def create_activo(db: Session, activo_in: ActivoCreate) -> Activo:
        datos = activo_in.model_dump()
        db_activo = Activo(**datos)
        if db_activo.persona_id:
            db_activo.estado = ActivoStatus.ASIGNADO
        else:
            db_activo.estado = ActivoStatus.STOCK
        db.add(db_activo)
        db.commit()
        db.refresh(db_activo)
        return db_activo

    @staticmethod
    def asignar_activo(db: Session, activo_id: int, persona_id: int, usuario_autoriza_id: int) -> Activo | None:
        db_activo = db.query(Activo).filter(Activo.id == activo_id).first()
        if not db_activo:
            return None
        
        persona_anterior_id = db_activo.persona_id
        
        db_activo.persona_id = persona_id
        db_activo.estado = ActivoStatus.ASIGNADO
        
        nuevo_movimiento = MovimientoInventario(
            activo_id=activo_id,
            desde_persona_id=persona_anterior_id,
            hacia_persona_id=persona_id,
            usuario_id=usuario_autoriza_id,
            tipo="Asignación" if persona_anterior_id is None else "Transferencia",
            observaciones="Movimiento generado por el sistema"
        )
        
        db.add(nuevo_movimiento)
        db.commit()
        db.refresh(db_activo)
        return db_activo
    
    @staticmethod
    def get_historial_activo(db: Session, activo_id: int):
        return db.query(MovimientoInventario)\
                    .filter(MovimientoInventario.activo_id == activo_id)\
                    .order_by(MovimientoInventario.fecha.desc())\
                    .all()
    
    @staticmethod
    def get_movimiento(db: Session, movimiento_id: int):
        return db.query(MovimientoInventario)\
            .options(joinedload(MovimientoInventario.activo), joinedload(MovimientoInventario.persona_recibe))\
            .filter(MovimientoInventario.id == movimiento_id).first()
    
    @staticmethod
    def devolver_activo(db: Session, activo_id: int, usuario_autoriza_id: int, observaciones: str = "Devolución a bodega") -> Activo | None:
        db_activo = db.query(Activo).filter(Activo.id == activo_id).first()
        if not db_activo or not db_activo.persona_id:
            return None 
        
        persona_anterior_id = db_activo.persona_id
        
        db_activo.persona_id = None
        db_activo.estado = ActivoStatus.STOCK
        
        nuevo_movimiento = MovimientoInventario(
            activo_id=activo_id,
            desde_persona_id=persona_anterior_id,
            hacia_persona_id=None, # Vuelve a bodega
            usuario_id=usuario_autoriza_id,
            tipo="Devolución",
            observaciones=observaciones
        )
        
        db.add(nuevo_movimiento)
        db.commit()
        db.refresh(db_activo)
        return db_activo
    
    @staticmethod
    def cambiar_estado_activo(db: Session, activo_id: int, nuevo_estado: ActivoStatus, usuario_autoriza_id: int) -> Activo | None:
        db_activo = db.query(Activo).filter(Activo.id == activo_id).first()
        if not db_activo:
            return None
        
        estado_anterior = db_activo.estado
        db_activo.estado = nuevo_estado
        
        if nuevo_estado in [ActivoStatus.BAJA, ActivoStatus.MANTENIMIENTO]:
            db_activo.persona_id = None
            
        nuevo_movimiento = MovimientoInventario(
            activo_id=activo_id,
            desde_persona_id=db_activo.persona_id,
            hacia_persona_id=None,
            usuario_id=usuario_autoriza_id,
            tipo="Cambio de Estado",
            observaciones=f"El equipo pasó de {estado_anterior} a {nuevo_estado}"
        )
        
        db.add(nuevo_movimiento)
        db.commit()
        db.refresh(db_activo)
        return db_activo

inventario_service = InventarioService()
