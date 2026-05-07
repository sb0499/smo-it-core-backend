from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api import deps
from app.schemas.consumible_schema import ConsumibleResponse, ConsumibleCreate
from app.services.consumible_service import consumible_service

router = APIRouter()

@router.get("/", response_model=list[ConsumibleResponse])
def read_consumibles(db: Session = Depends(deps.get_db)):
    return consumible_service.get_all(db)

@router.post("/", response_model=ConsumibleResponse)
def create_consumible(obj_in: ConsumibleCreate, db: Session = Depends(deps.get_db)):
    return consumible_service.create(db, obj_in)

@router.patch("/{consumible_id}/stock", response_model=ConsumibleResponse)
def update_stock(consumible_id: int, cantidad: int, db: Session = Depends(deps.get_db)):
    return consumible_service.ajustar_stock(db, consumible_id, cantidad)