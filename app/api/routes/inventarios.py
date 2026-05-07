from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api import deps
from app.models.usuario import Usuario
from app.schemas.inventario_schema import Activo, ActivoCreate, ActivoUpdate
from app.services.inventario_service import inventario_service

router = APIRouter()

@router.get("/", response_model=list[Activo])
def read_activos(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: Usuario = Depends(deps.get_current_user)
) -> Any:
    return inventario_service.get_activos(db, skip=skip, limit=limit)

@router.post("/", response_model=Activo)
def create_activo(
    *,
    db: Session = Depends(deps.get_db),
    activo_in: ActivoCreate,
    current_user: Usuario = Depends(deps.get_current_active_admin)
) -> Any:
    return inventario_service.create_activo(db, activo_in)

@router.post("/{activo_id}/asignar/{persona_id}", response_model=Activo)
def asignar_activo(
    *,
    db: Session = Depends(deps.get_db),
    activo_id: int,
    persona_id: int, # <--- CAMBIO AQUÍ
    current_user: Usuario = Depends(deps.get_current_active_admin)
) -> Any:
    activo = inventario_service.asignar_activo(db, activo_id, persona_id)
    if not activo:
        raise HTTPException(status_code=404, detail="Activo no encontrado")
    return activo
