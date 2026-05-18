from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api import deps
from app.models.inventario import ActivoStatus
from app.models.usuario import Usuario
from app.schemas.inventario_schema import Activo, ActivoCreate, ActivoUpdate
from app.services.inventario_service import inventario_service
from app.schemas.movimiento_schema import MovimientoResponse
from fastapi.responses import StreamingResponse
from app.utils.pdf_generator import generar_acta_movimiento
from app.models.movimiento import MovimientoInventario


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
    persona_id: int, 
    current_user: Usuario = Depends(deps.get_current_active_admin)
) -> Any:
    activo = inventario_service.asignar_activo(db, activo_id, persona_id, current_user.id)
    if not activo:
        raise HTTPException(status_code=404, detail="Activo no encontrado")
    return activo

@router.get("/{activo_id}/historial", response_model=list[MovimientoResponse])
def obtener_historial_activo(
    activo_id: int,
    db: Session = Depends(deps.get_db),
    current_user: Usuario = Depends(deps.get_current_active_admin)
) -> Any:
    historial = inventario_service.get_historial_activo(db, activo_id)
    if not historial:
        return []
    return historial

@router.get("/movimientos/{movimiento_id}/acta", response_class=StreamingResponse)
def descargar_acta_movimiento(
    movimiento_id: int,
    db: Session = Depends(deps.get_db),
    current_user: Usuario = Depends(deps.get_current_active_admin)
) -> Any:
    movimiento = inventario_service.get_movimiento(db, movimiento_id)
    
    if not movimiento:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")
        
    if not movimiento.persona_recibe:
        raise HTTPException(status_code=400, detail="Este movimiento no tiene una persona receptora (¿fue una devolución a bodega?)")

    pdf_buffer = generar_acta_movimiento(movimiento)

    nombre_archivo = f"Acta_{movimiento.activo.codigo}_{movimiento.persona_recibe.cedula}.pdf"
    
    headers = {
        'Content-Disposition': f'attachment; filename="{nombre_archivo}"'
    }
    
    return StreamingResponse(pdf_buffer, media_type="application/pdf", headers=headers)

@router.post("/{activo_id}/devolver", response_model=Activo)
def devolver_activo(
    *,
    db: Session = Depends(deps.get_db),
    activo_id: int,
    observaciones: str | None = None,
    current_user: Usuario = Depends(deps.get_current_active_admin)
) -> Any:
    obs = observaciones or "Devolución estándar a bodega"
    activo = inventario_service.devolver_activo(db, activo_id, current_user.id, obs)
    if not activo:
        raise HTTPException(status_code=400, detail="Activo no encontrado o ya se encuentra en bodega")
    return activo

@router.patch("/{activo_id}/estado", response_model=Activo)
def cambiar_estado(
    *,
    db: Session = Depends(deps.get_db),
    activo_id: int,
    nuevo_estado: ActivoStatus,
    current_user: Usuario = Depends(deps.get_current_active_admin)
) -> Any:
    activo = inventario_service.cambiar_estado_activo(db, activo_id, nuevo_estado, current_user.id)
    if not activo:
        raise HTTPException(status_code=404, detail="Activo no encontrado")
    return activo