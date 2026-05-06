from fastapi import APIRouter
from app.api.routes import auth, tickets, inventarios, proyectos, usuarios, guardias

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(usuarios.router, prefix="/usuarios", tags=["usuarios"])
api_router.include_router(tickets.router, prefix="/tickets", tags=["tickets"])
api_router.include_router(inventarios.router, prefix="/inventarios", tags=["inventarios"])
api_router.include_router(proyectos.router, prefix="/proyectos", tags=["proyectos"])
api_router.include_router(guardias.router, prefix="/guardias", tags=["guardias"])
