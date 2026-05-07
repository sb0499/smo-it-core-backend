from pydantic import BaseModel, ConfigDict

class ConsumibleBase(BaseModel):
    nombre: str
    descripcion: str | None = None
    stock_actual: int = 0
    stock_minimo: int = 5
    unidad_medida: str

class ConsumibleCreate(ConsumibleBase):
    pass

class ConsumibleUpdate(BaseModel):
    nombre: str | None = None
    stock_actual: int | None = None
    stock_minimo: int | None = None

class ConsumibleResponse(ConsumibleBase):
    id: int
    model_config = ConfigDict(from_attributes=True)