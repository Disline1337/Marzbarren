"""Load real HWID/database code without application startup side effects.

The app initializer imports jobs, starts Xray setup, and discovers public IPs.
These unit tests supply only the application shell; database operations and
models are real. Run in a dedicated unittest process, not a running server.
"""
import importlib
import importlib.util
import logging
import os
from pathlib import Path
import sys
import types
from unittest.mock import patch

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI

ROOT = Path(__file__).resolve().parents[1]
os.environ["SQLALCHEMY_DATABASE_URL"] = "sqlite:///:memory:"
app = types.ModuleType("app")
app.__path__ = [str(ROOT / "app")]
app.app = FastAPI()
app.scheduler = BackgroundScheduler()
app.logger = logging.getLogger("hwid-tests")
app.xray = types.ModuleType("app.xray")
sys.modules["app"] = app
sys.modules["app.xray"] = app.xray

system = importlib.import_module("app.utils.system")
with patch.object(system, "get_public_ip", return_value="127.0.0.1"), patch.object(
    system, "get_public_ipv6", return_value="::1"
):
    from app.db import Base, crud
    from app.db.models import HwidUserDevice, User


def load_file(name, relative_path):
    """Import an individual module without the routers package initializer."""
    spec = importlib.util.spec_from_file_location(name, ROOT / relative_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module
