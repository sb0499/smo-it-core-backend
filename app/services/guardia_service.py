from sqlalchemy.orm import Session
from datetime import date
from app.models.guardia import GuardiaFeriado
from app.schemas.guardia_schema import GuardiaCreate, GuardiaUpdate

class GuardiaService:
    @staticmethod
    def get_guardias(db: Session, skip: int = 0, limit: int = 100):
        return db.query(GuardiaFeriado).offset(skip).limit(limit).all()

    @staticmethod
    def create_guardia(db: Session, guardia_in: GuardiaCreate) -> GuardiaFeriado:
        # Evitar duplicados para la misma fecha
        existente = db.query(GuardiaFeriado).filter(GuardiaFeriado.fecha == guardia_in.fecha).first()
        if existente:
            # Si ya existe, actualizamos el técnico
            existente.tecnico_id = guardia_in.tecnico_id
            existente.observaciones = guardia_in.observaciones
            db.commit()
            db.refresh(existente)
            return existente
            
        db_guardia = GuardiaFeriado(**guardia_in.model_dump())
        db.add(db_guardia)
        db.commit()
        db.refresh(db_guardia)
        return db_guardia

    @staticmethod
    def delete_guardia(db: Session, guardia_id: int):
        db_guardia = db.query(GuardiaFeriado).filter(GuardiaFeriado.id == guardia_id).first()
        if db_guardia:
            db.delete(db_guardia)
            db.commit()
        return db_guardia

guardia_service = GuardiaService()