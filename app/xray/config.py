from __future__ import annotations

import json
from collections import defaultdict
from copy import deepcopy
from pathlib import PosixPath
from typing import Union

import commentjson
from sqlalchemy import func

from app.db import GetDB
from app.db import models as db_models
from app.models.proxy import ProxyTypes, supports_vless_flow
from app.models.user import UserStatus
from app.utils.crypto import get_cert_SANs
from config import DEBUG, XRAY_EXCLUDE_INBOUND_TAGS, XRAY_FALLBACKS_INBOUND_TAG


def merge_dicts(a, b):  # B will override A dictionary key and values
    for key, value in b.items():
        if isinstance(value, dict) and key in a and isinstance(a[key], dict):
            merge_dicts(a[key], value)  # Recursively merge nested dictionaries
        else:
            a[key] = value
    return a


def _vless_encryption_required(inbound: dict) -> bool:
    decryption = inbound.get("settings", {}).get("decryption")
    return (
        inbound.get("protocol") == ProxyTypes.VLESS
        and isinstance(decryption, str)
        and decryption.strip() not in ("", "none")
    )

_XHTTP_CONTROL_KEYS = {"host", "path", "mode", "extra"}
_XHTTP_SERVER_ONLY_KEYS = {
    "scMaxBufferedPosts",
    "scStreamUpServerSecs",
    "serverMaxHeaderBytes",
    "noSSEHeader",
}
_XHTTP_SECRET_KEYS = {"privateKey", "mldsa65Seed", "decryption", "clients", "certificates"}


def _named_settings(stream: dict, *names: str) -> dict:
    for name in names:
        value = stream.get(name)
        if isinstance(value, dict):
            return value
    return {}


def _text_setting(value) -> str:
    return value.strip() if isinstance(value, str) else ""


def _without_server_only(value):
    if isinstance(value, dict):
        return {
            key: _without_server_only(item)
            for key, item in value.items()
            if key not in _XHTTP_SERVER_ONLY_KEYS
        }
    if isinstance(value, list):
        return [_without_server_only(item) for item in value]
    return value


def _client_xhttp_extra(tag: str, net_settings: dict):
    from app.models.proxy import validate_xhttp_extra

    if "extra" in net_settings and net_settings.get("extra") is not None:
        extra = net_settings.get("extra")
        if not isinstance(extra, dict):
            raise ValueError(f"Invalid XHTTP extra in inbound {tag}")
        projected = deepcopy(extra)
    else:
        projected = {}
        for key, value in net_settings.items():
            if key in _XHTTP_CONTROL_KEYS or key in _XHTTP_SERVER_ONLY_KEYS or key in _XHTTP_SECRET_KEYS:
                continue
            projected[key] = deepcopy(value)
        if not projected:
            return None
    try:
        validate_xhttp_extra(projected)
    except ValueError:
        raise ValueError(f"Invalid XHTTP extra in inbound {tag}") from None
    return _without_server_only(projected)



class XRayConfig(dict):
    def __init__(self,
                 config: Union[dict, str, PosixPath] = {},
                 api_host: str = "127.0.0.1",
                 api_port: int = 8080):
        if isinstance(config, str):
            try:
                # considering string as json
                config = commentjson.loads(config)
            except (json.JSONDecodeError, ValueError):
                # considering string as file path
                with open(config, 'r') as file:
                    config = commentjson.loads(file.read())

        if isinstance(config, PosixPath):
            with open(config, 'r') as file:
                config = commentjson.loads(file.read())

        if isinstance(config, dict):
            config = deepcopy(config)

        self.api_host = api_host
        self.api_port = api_port

        super().__init__(config)
        self._validate()

        self.inbounds = []
        self.inbounds_by_protocol = {}
        self.inbounds_by_tag = {}
        self._fallbacks_inbound = self.get_inbound(XRAY_FALLBACKS_INBOUND_TAG)
        self._resolve_inbounds()

        self._apply_api()

    def _apply_api(self):
        api_inbound = self.get_inbound("API_INBOUND")
        if api_inbound:
            api_inbound["listen"] = self.api_host
            api_inbound["listen"]["address"] = self.api_host
            api_inbound["port"] = self.api_port
            return

        self["api"] = {
            "services": [
                "HandlerService",
                "StatsService",
                "LoggerService"
            ],
            "tag": "API"
        }
        self["stats"] = {}
        forced_policies = {
            "levels": {
                "0": {
                    "statsUserUplink": True,
                    "statsUserDownlink": True
                }
            },
            "system": {
                "statsInboundDownlink": False,
                "statsInboundUplink": False,
                "statsOutboundDownlink": True,
                "statsOutboundUplink": True
            }
        }
        if self.get("policy"):
            self["policy"] = merge_dicts(self.get("policy"), forced_policies)
        else:
            self["policy"] = forced_policies
        inbound = {
            "listen": self.api_host,
            "port": self.api_port,
            "protocol": "dokodemo-door",
            "settings": {
                "address": self.api_host
            },
            "tag": "API_INBOUND"
        }
        try:
            self["inbounds"].insert(0, inbound)
        except KeyError:
            self["inbounds"] = []
            self["inbounds"].insert(0, inbound)

        rule = {
            "inboundTag": [
                "API_INBOUND"
            ],
            "outboundTag": "API",
            "type": "field"
        }
        try:
            self["routing"]["rules"].insert(0, rule)
        except KeyError:
            self["routing"] = {"rules": []}
            self["routing"]["rules"].insert(0, rule)

    def _validate(self):
        if not self.get("inbounds"):
            raise ValueError("config doesn't have inbounds")

        if not self.get("outbounds"):
            raise ValueError("config doesn't have outbounds")

        for inbound in self['inbounds']:
            if not inbound.get("tag"):
                raise ValueError("all inbounds must have a unique tag")
            if ',' in inbound.get("tag"):
                raise ValueError("character «,» is not allowed in inbound tag")
        for outbound in self['outbounds']:
            if not outbound.get("tag"):
                raise ValueError("all outbounds must have a unique tag")

    def _resolve_inbounds(self):
        for inbound in self['inbounds']:
            if not inbound['protocol'] in ProxyTypes._value2member_map_:
                continue

            if inbound['tag'] in XRAY_EXCLUDE_INBOUND_TAGS:
                continue

            if not inbound.get('settings'):
                inbound['settings'] = {}
            if not inbound['settings'].get('clients'):
                inbound['settings']['clients'] = []

            settings = {
                "tag": inbound["tag"],
                "protocol": inbound["protocol"],
                "port": None,
                "network": "tcp",
                "tls": 'none',
                "sni": [],
                "host": [],
                "path": "",
                "header_type": "",
                "is_fallback": False,
                "vless_encryption_required": _vless_encryption_required(inbound),
            }

            # port settings
            try:
                settings['port'] = inbound['port']
            except KeyError:
                if self._fallbacks_inbound:
                    try:
                        settings['port'] = self._fallbacks_inbound['port']
                        settings['is_fallback'] = True
                    except KeyError:
                        raise ValueError("fallbacks inbound doesn't have port")

            # stream settings
            if stream := inbound.get('streamSettings'):
                net = stream.get('network', 'tcp')
                if net in ('tcp', 'raw'):
                    net_settings = _named_settings(stream, 'rawSettings', 'tcpSettings')
                elif net in ('xhttp', 'splithttp'):
                    net_settings = _named_settings(stream, 'xhttpSettings', 'splithttpSettings')
                else:
                    candidate = stream.get(f"{net}Settings", {})
                    net_settings = candidate if isinstance(candidate, dict) else {}
                security = stream.get("security")
                tls_settings = stream.get(f"{security}Settings")

                if settings['is_fallback'] is True:
                    # probably this is a fallback
                    security = self._fallbacks_inbound.get(
                        'streamSettings', {}).get('security')
                    tls_settings = self._fallbacks_inbound.get(
                        'streamSettings', {}).get(f"{security}Settings", {})

                settings['network'] = 'xhttp' if net in ('xhttp', 'splithttp') else net

                if security == 'tls':
                    # settings['fp']
                    # settings['alpn']
                    settings['tls'] = 'tls'
                    for certificate in tls_settings.get('certificates', []):

                        if certificate.get("certificateFile", None):
                            with open(certificate['certificateFile'], 'rb') as file:
                                cert = file.read()
                                settings['sni'].extend(get_cert_SANs(cert))

                        if certificate.get("certificate", None):
                            cert = certificate['certificate']
                            if isinstance(cert, list):
                                cert = '\n'.join(cert)
                            if isinstance(cert, str):
                                cert = cert.encode()
                            settings['sni'].extend(get_cert_SANs(cert))

                elif security == 'reality':
                    tls_settings = tls_settings or {}
                    settings['fp'] = 'chrome'
                    settings['tls'] = 'reality'
                    settings['sni'] = tls_settings.get('serverNames', [])
                    password = _text_setting(tls_settings.get('password'))
                    public_key = _text_setting(tls_settings.get('publicKey'))
                    if password:
                        settings['pbk'] = password
                    elif public_key:
                        settings['pbk'] = public_key
                    else:
                        private_key = tls_settings.get('privateKey')
                        if not private_key:
                            raise ValueError(
                                f"You need to provide privateKey in realitySettings of {inbound['tag']}")
                        try:
                            from app.xray import core
                            x25519 = core.get_x25519(private_key)
                            settings['pbk'] = x25519['public_key']
                        except ImportError:
                            pass
                        if not settings.get('pbk'):
                            raise ValueError(
                                f"You need to provide publicKey in realitySettings of {inbound['tag']}")
                    seed = _text_setting(tls_settings.get('mldsa65Seed'))
                    verify = _text_setting(tls_settings.get('mldsa65Verify'))
                    if seed:
                        try:
                            from app.xray import core
                            settings['mldsa65Verify'] = core.get_mldsa65_verify(seed)
                        except Exception:
                            raise ValueError(
                                f"Unable to derive REALITY verification key for {inbound['tag']}") from None
                    elif verify:
                        from app.models.proxy import is_mldsa65_verify
                        if not is_mldsa65_verify(verify):
                            raise ValueError(f"Invalid REALITY verification key for {inbound['tag']}")
                        settings['mldsa65Verify'] = verify
                    try:
                        settings['sids'] = tls_settings.get('shortIds')
                        settings['sids'][0]  # check if there is any shortIds
                    except (IndexError, TypeError):
                        raise ValueError(
                            f"You need to define at least one shortID in realitySettings of {inbound['tag']}")
                    spider = tls_settings.get('spiderX')
                    if spider is None:
                        spider = tls_settings.get('SpiderX')
                    settings['spiderX'] = spider or ""
                    settings['spx'] = settings['spiderX']

                if net in ('tcp', 'raw'):
                    header = net_settings.get('header', {})
                    request = header.get('request', {})
                    path = request.get('path')
                    host = request.get('headers', {}).get('Host')

                    settings['header_type'] = header.get('type', '')

                    if isinstance(path, str) or isinstance(host, str):
                        raise ValueError(f"Settings of {inbound['tag']} for path and host must be list, not str\n"
                                         "https://xtls.github.io/config/transports/tcp.html#httpheaderobject")

                    if path and isinstance(path, list):
                        settings['path'] = path[0]

                    if host and isinstance(host, list):
                        settings['host'] = host

                elif net == 'ws':
                    path = net_settings.get('path', '')
                    host = net_settings.get('host', '') or net_settings.get('headers', {}).get('Host')

                    settings['header_type'] = ''

                    if isinstance(path, list) or isinstance(host, list):
                        raise ValueError(f"Settings of {inbound['tag']} for path and host must be str, not list\n"
                                         "https://xtls.github.io/config/transports/websocket.html#websocketobject")

                    if isinstance(path, str):
                        settings['path'] = path

                    if isinstance(host, str):
                        settings['host'] = [host]

                    settings["heartbeatPeriod"] = net_settings.get('heartbeatPeriod', 0)
                elif net == 'grpc' or net == 'gun':
                    settings['header_type'] = ''
                    settings['path'] = net_settings.get('serviceName', '')
                    host = net_settings.get('authority', '')
                    settings['host'] = [host]
                    settings['multiMode'] = net_settings.get('multiMode', False)

                elif net == 'quic':
                    settings['header_type'] = net_settings.get('header', {}).get('type', '')
                    settings['path'] = net_settings.get('key', '')
                    settings['host'] = [net_settings.get('security', '')]

                elif net == 'httpupgrade':
                    settings['path'] = net_settings.get('path', '')
                    host = net_settings.get('host', '')
                    settings['host'] = [host]

                elif net in ('splithttp', 'xhttp'):
                    settings['path'] = net_settings.get('path') or ""
                    host = net_settings.get('host') or ""
                    settings['host'] = [host] if isinstance(host, str) else host
                    settings['mode'] = net_settings.get('mode') or "auto"
                    settings['xhttp_extra'] = _client_xhttp_extra(inbound['tag'], net_settings)

                elif net == 'kcp':
                    header = net_settings.get('header', {})

                    settings['header_type'] = header.get('type', '')
                    settings['host'] = header.get('domain', '')
                    settings['path'] = net_settings.get('seed', '')

                elif net in ("http", "h2", "h3"):
                    net_settings = stream.get("httpSettings", {})

                    settings['host'] = net_settings.get('host') or net_settings.get('Host', '')
                    settings['path'] = net_settings.get('path', '')

                else:
                    settings['path'] = net_settings.get('path', '')
                    host = net_settings.get(
                        'host', {}) or net_settings.get('Host', {})
                    if host and isinstance(host, str):
                        settings['host'] = host
                    elif host and isinstance(host, list):
                        settings['host'] = host[0]

            self.inbounds.append(settings)
            self.inbounds_by_tag[inbound['tag']] = settings

            try:
                self.inbounds_by_protocol[inbound['protocol']].append(settings)
            except KeyError:
                self.inbounds_by_protocol[inbound['protocol']] = [settings]

    def get_inbound(self, tag) -> dict:
        for inbound in self['inbounds']:
            if inbound['tag'] == tag:
                return inbound

    def get_outbound(self, tag) -> dict:
        for outbound in self['outbounds']:
            if outbound['tag'] == tag:
                return outbound

    def to_json(self, **json_kwargs):
        return json.dumps(self, **json_kwargs)

    def copy(self):
        return deepcopy(self)

    def include_db_users(self) -> XRayConfig:
        config = self.copy()

        with GetDB() as db:
            query = db.query(
                db_models.User.id,
                db_models.User.username,
                func.lower(db_models.Proxy.type).label('type'),
                db_models.Proxy.settings,
                func.group_concat(db_models.excluded_inbounds_association.c.inbound_tag).label('excluded_inbound_tags')
            ).join(
                db_models.Proxy, db_models.User.id == db_models.Proxy.user_id
            ).outerjoin(
                db_models.excluded_inbounds_association,
                db_models.Proxy.id == db_models.excluded_inbounds_association.c.proxy_id
            ).filter(
                db_models.User.status.in_([UserStatus.active, UserStatus.on_hold])
            ).group_by(
                func.lower(db_models.Proxy.type),
                db_models.User.id,
                db_models.User.username,
                db_models.Proxy.settings,
            )
            result = query.all()

            grouped_data = defaultdict(list)

            for row in result:
                grouped_data[row.type].append((
                    row.id,
                    row.username,
                    row.settings,
                    [i for i in row.excluded_inbound_tags.split(',') if i] if row.excluded_inbound_tags else None
                ))

            for proxy_type, rows in grouped_data.items():

                inbounds = self.inbounds_by_protocol.get(proxy_type)
                if not inbounds:
                    continue

                for inbound in inbounds:
                    clients = config.get_inbound(inbound['tag'])['settings']['clients']

                    for row in rows:
                        user_id, username, settings, excluded_inbound_tags = row

                        if excluded_inbound_tags and inbound['tag'] in excluded_inbound_tags:
                            continue

                        # Copy before filtering so the next inbound still sees the stored flow.
                        client = {
                            "email": f"{user_id}.{username}",
                            **settings
                        }

                        if proxy_type == ProxyTypes.VLESS.value:
                            if client.get('flow') and not supports_vless_flow(inbound):
                                del client['flow']
                        elif client.get('flow') and (
                                inbound.get('network', 'tcp') not in ('tcp', 'raw', 'kcp')
                                or
                                (
                                    inbound.get('network', 'tcp') in ('tcp', 'raw', 'kcp')
                                    and
                                    inbound.get('tls') not in ('tls', 'reality')
                                )
                                or
                                inbound.get('header_type') == 'http'
                        ):
                            del client['flow']

                        clients.append(client)

        if DEBUG:
            with open('generated_config-debug.json', 'w') as f:
                f.write(config.to_json(indent=4))

        return config
