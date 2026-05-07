from sqlalchemy.orm import Session
from app.models.consumible import Consumible
from app.schemas.consumible_schema import ConsumibleCreate, ConsumibleUpdate

class ConsumibleService:
    @staticmethod
    def get_all(db: Session):
        return db.query(Consumible).all()

    @staticmethod
    def create(db: Session, obj_in: ConsumibleCreate):
        db_obj = Consumible(**obj_in.model_dump())
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    @staticmethod
    def ajustar_stock(db: Session, consumible_id: int, cantidad: int):
        """cantidad puede ser positiva (entrada) o negativa (salida)"""
        db_obj = db.query(Consumible).filter(Consumible.id == consumible_id).first()
        if db_obj:
            db_obj.stock_actual += cantidad
            db.commit()
            db.refresh(db_obj)
        return db_obj

consumible_service = ConsumibleService()