from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class HwidDeviceResponse(BaseModel):
    hwid: str
    user_id: int
    username: Optional[str] = None
    platform: Optional[str] = None
    os_version: Optional[str] = None
    device_model: Optional[str] = None
    user_agent: Optional[str] = None
    request_ip: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class HwidDeviceListResponse(BaseModel):
    total: int
    devices: List[HwidDeviceResponse]


class HwidDeviceCreate(BaseModel):
    hwid: str = Field(..., min_length=10, max_length=64, pattern=r"^[a-zA-Z0-9=-]{10,64}$")
    platform: Optional[str] = Field(None, max_length=64)
    os_version: Optional[str] = Field(None, max_length=64)
    device_model: Optional[str] = Field(None, max_length=128)
    user_agent: Optional[str] = Field(None, max_length=512)
