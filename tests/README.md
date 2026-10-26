# Backend tests

Install `requirements.txt` in a Python 3.11, 3.12, or 3.14 virtual environment, then run
from the repository root:

```bash
venv/bin/python -m unittest discover -s tests -v
```

The suite uses Python's built-in `unittest`; pytest is not required.

HWID checks cover header validation, response flags, individual and fallback
limits, unlimited users, repeat registration, metadata updates, per-user
isolation, deletion, uniqueness, and subscription enforcement. The migration
test applies and reverses the HWID revision on a minimal existing users table,
checking that the existing user survives.

Client routing checks cover profile validation, atomic saves, Happ/INCY subscription
payloads, Mihomo rule overlays, HWID ordering, and the routing settings migration.
The migration test applies and reverses the new revision on a database that already
has user and HWID rows.

All database operations use in-memory SQLite. `hwid_support.py` bypasses the
application initializer and Xray initialization, and replaces public-IP lookup
with fixed local addresses. The actual HWID functions, schemas, ORM models,
and CRUD operations are imported unchanged. Run these tests in their own process.

These unit tests do not cover application startup, live Xray clients, MySQL,
or the complete historical migration chain.

## Docker HTTP checks

`docker_hwid_smoke.py` exercises the running HTTP API: authentication, device
registration/deletion, subscription enforcement, user deletion, and concurrent
registrations. Run only against a disposable container with `HWID_ENABLED=true`
and `SUDO_USERNAME`/`SUDO_PASSWORD` supplied through its environment. It creates
temporary users and removes them afterward; it never prints credentials.

```bash
docker exec marzbarren-hwid-smoke python tests/docker_hwid_smoke.py
docker exec -e HWID_RACE_ROUNDS=100 marzbarren-hwid-smoke python tests/docker_hwid_smoke.py
```

The server must listen on port 8000 inside the container. Each concurrency round
sends eight requests for different devices against a one-device limit and
requires exactly one successful response matching the stored device. A separate
check verifies repeated concurrent requests for the same HWID.

`docker_routing_smoke.py` checks sudo-only routing settings, Happ/INCY payloads,
Mihomo rule order, HWID hiding, and profile disable. Run it only inside a disposable
container; it never prints tokens or subscription URLs.

```bash
docker exec marzban-routing-smoke python tests/docker_routing_smoke.py
```
