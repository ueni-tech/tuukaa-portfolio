from fastapi import APIRouter, HTTPException, Header

from ..core.config import settings
from ..models.schemas import TenantInfo, TenantListResponse


router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/tenants", response_model=TenantListResponse)
async def list_tenants(
    x_admin_api_secret: str = Header(default="", convert_underscores=True),
) -> TenantListResponse:
    if x_admin_api_secret != settings.admin_api_secret:
        raise HTTPException(401, "unauthorized")
    
    items = [
        TenantInfo(name=name, key=key)
        for name, key in settings.embed_api_keys_map.items()
    ]
    return TenantListResponse(tenants=items)
