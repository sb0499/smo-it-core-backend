from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api import deps
from app.models.usuario import Usuario
from app.schemas.proyecto_schema import Proyecto, ProyectoCreate, TareaInterna
from app.services.proyecto_service import proyecto_service

router = APIRouter()

@router.post("/", response_model=Proyecto)
def create_proyecto(
    *,
    db: Session = Depends(deps.get_db),
    proyecto_in: ProyectoCreate,
    current_user: Usuario = Depends(deps.get_current_active_admin)
) -> Any:
    return proyecto_service.create_proyecto(db, proyecto_in)

@router.post("/escalar-ticket/{ticket_id}", response_model=TareaInterna)
def escalar_ticket(
    *,
    db: Session = Depends(deps.get_db),
    ticket_id: int,
    proyecto_id: int,
    responsable_id: int,
    current_user: Usuario = Depends(deps.get_current_user)
) -> Any:
    tarea = proyecto_service.escalar_ticket_a_tarea(db, ticket_id, proyecto_id, responsable_id)
    if not tarea:
        raise HTTPException(status_code=404, detail="No se pudo escalar el ticket")
    return tarea
