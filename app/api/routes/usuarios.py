from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api import deps
from app.schemas.usuario_schema import UsuarioResponse, UsuarioCreate, UsuarioUpdate
from app.services.usuario_service import usuario_service
from app.models.usuario import Usuario

router = APIRouter()

@router.get("/", response_model=list[UsuarioResponse])
def read_usuarios(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: Usuario = Depends(deps.get_current_active_admin) # Solo Admin puede ver a todos
) -> Any:
    return usuario_service.get_usuarios(db, skip=skip, limit=limit)

@router.post("/", response_model=UsuarioResponse)
def create_usuario(
    *,
    db: Session = Depends(deps.get_db),
    user_in: UsuarioCreate,
    current_user: Usuario = Depends(deps.get_current_active_admin) # Solo Admin crea usuarios
) -> Any:
    user = usuario_service.get_usuario_by_email(db, email=user_in.email)
    if user:
        raise HTTPException(status_code=400, detail="Este email ya está registrado.")
    return usuario_service.create_usuario(db, user_in)

@router.put("/{user_id}", response_model=UsuarioResponse)
def update_usuario(
    *,
    db: Session = Depends(deps.get_db),
    user_id: int,
    user_in: UsuarioUpdate,
    current_user: Usuario = Depends(deps.get_current_active_admin)
) -> Any:
    user = usuario_service.update_usuario(db, user_id, user_in)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return user