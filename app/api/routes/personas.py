from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api import deps
from app.schemas.persona_schema import PersonaResponse, PersonaCreate, PersonaUpdate
from app.services.persona_service import persona_service
from app.models.usuario import Usuario

router = APIRouter()

@router.get("/", response_model=list[PersonaResponse])
def read_personas(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: Usuario = Depends(deps.get_current_user)
) -> Any:
    return persona_service.get_personas(db, skip=skip, limit=limit)

@router.post("/", response_model=PersonaResponse)
def create_persona(
    *,
    db: Session = Depends(deps.get_db),
    persona_in: PersonaCreate,
    current_user: Usuario = Depends(deps.get_current_user)
) -> Any:
    persona = persona_service.get_persona_by_cedula(db, cedula=persona_in.cedula)
    if persona:
        raise HTTPException(status_code=400, detail="Esta cédula ya está registrada.")
    return persona_service.create_persona(db, persona_in)

@router.put("/{persona_id}", response_model=PersonaResponse)
def update_persona(
    *,
    db: Session = Depends(deps.get_db),
    persona_id: int,
    persona_in: PersonaUpdate,
    current_user: Usuario = Depends(deps.get_current_user)
) -> Any:
    persona = persona_service.update_persona(db, persona_id, persona_in)
    if not persona:
        raise HTTPException(status_code=404, detail="Persona no encontrada")
    return persona