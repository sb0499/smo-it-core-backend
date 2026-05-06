from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api import deps
from app.schemas.guardia_schema import GuardiaResponse, GuardiaCreate
from app.services.guardia_service import guardia_service
from app.models.usuario import Usuario

router = APIRouter()

@router.get("/", response_model=list[GuardiaResponse])
def read_guardias(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: Usuario = Depends(deps.get_current_user)
) -> Any:
    return guardia_service.get_guardias(db, skip=skip, limit=limit)

@router.post("/", response_model=GuardiaResponse)
def create_guardia(
    *,
    db: Session = Depends(deps.get_db),
    guardia_in: GuardiaCreate,
    current_user: Usuario = Depends(deps.get_current_active_admin) # Solo tú programas turnos
) -> Any:
    return guardia_service.create_guardia(db, guardia_in)

@router.delete("/{guardia_id}")
def delete_guardia(
    *,
    db: Session = Depends(deps.get_db),
    guardia_id: int,
    current_user: Usuario = Depends(deps.get_current_active_admin)
) -> Any:
    guardia = guardia_service.delete_guardia(db, guardia_id)
    if not guardia:
        raise HTTPException(status_code=404, detail="Guardia no encontrada")
    return {"message": "Guardia eliminada correctamente"}