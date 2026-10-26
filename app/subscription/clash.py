import copy
import json
from random import choice
from uuid import UUID

import yaml
from jinja2.exceptions import TemplateNotFound

from app.subscription.funcs import get_grpc_gun
from app.models.proxy import legacy_client_cannot_represent, supports_vless_flow
from app.templates import render_template
from app.utils.helpers import yml_uuid_representer
from config import (
    CLASH_SETTINGS_TEMPLATE,
    CLASH_SUBSCRIPTION_TEMPLATE,
    MUX_TEMPLATE,
    USER_AGENT_TEMPLATE,
)


_XHTTP_DIRECT = {
    "headers": "headers",
    "noGRPCHeader": "no-grpc-header",
    "xPaddingBytes": "x-padding-bytes",
    "xPaddingObfsMode": "x-padding-obfs-mode",
    "xPaddingKey": "x-padding-key",
    "xPaddingHeader": "x-padding-header",
    "xPaddingPlacement": "x-padding-placement",
    "xPaddingMethod": "x-padding-method",
    "uplinkHTTPMethod": "uplink-http-method",
    "uplinkDataPlacement": "uplink-data-placement",
    "uplinkDataKey": "uplink-data-key",
    "uplinkChunkSize": "uplink-chunk-size",
    "sessionPlacement": "session-placement",
    "sessionKey": "session-key",
    "seqPlacement": "seq-placement",
    "seqKey": "seq-key",
    "scMaxEachPostBytes": "sc-max-each-post-bytes",
    "scMinPostsIntervalMs": "sc-min-posts-interval-ms",
}
_XMUX_MAP = {
    "maxConcurrency": "max-concurrency",
    "maxConnections": "max-connections",
    "cMaxReuseTimes": "c-max-reuse-times",
    "hMaxRequestTimes": "h-max-request-times",
    "hMaxReusableSecs": "h-max-reusable-secs",
    "hKeepAlivePeriod": "h-keep-alive-period",
}
_RANGE_FIELDS = {
    "xPaddingBytes", "uplinkChunkSize", "scMaxEachPostBytes", "scMinPostsIntervalMs",
    "maxConcurrency", "maxConnections", "cMaxReuseTimes", "hMaxRequestTimes", "hMaxReusableSecs",
}


def _mihomo_scalar(key, value):
    if key in _RANGE_FIELDS:
        if isinstance(value, bool) or not isinstance(value, (int, str)):
            return None
        return str(value) if isinstance(value, int) else value
    return value

def _mihomo_download(value):
    if not isinstance(value, dict):
        return None
    allowed = {"address", "port", "security", "network", "tlsSettings", "realitySettings", "xhttpSettings", "splithttpSettings"}
    if set(value) - allowed:
        return None
    if value.get("network", "xhttp") not in ("xhttp", "splithttp", "", None):
        return None
    security = value.get("security", "none")
    if security not in ("none", "tls", "reality"):
        return None
    out = {"tls": security != "none"}
    if "address" in value:
        out["server"] = value["address"]
    if "port" in value:
        out["port"] = value["port"]
    tls = value.get("tlsSettings") or {}
    if tls and set(tls) - {"serverName", "alpn", "allowInsecure", "fingerprint"}:
        return None
    if tls.get("serverName"):
        out["servername"] = tls["serverName"]
    if tls.get("alpn"):
        out["alpn"] = tls["alpn"]
    if "allowInsecure" in tls:
        out["skip-cert-verify"] = tls["allowInsecure"]
    if tls.get("fingerprint"):
        out["client-fingerprint"] = tls["fingerprint"]
    reality = value.get("realitySettings") or {}
    if reality and set(reality) - {"password", "publicKey", "shortId", "serverName", "fingerprint"}:
        return None
    reality_opts = {}
    public = reality.get("password") or reality.get("publicKey")
    if public:
        reality_opts["public-key"] = public
    if "shortId" in reality:
        reality_opts["short-id"] = reality["shortId"]
    if reality_opts:
        out["reality-opts"] = reality_opts
    if reality.get("serverName"):
        out["servername"] = reality["serverName"]
    if reality.get("fingerprint"):
        out["client-fingerprint"] = reality["fingerprint"]
    nested = value.get("xhttpSettings") or value.get("splithttpSettings") or {}
    if nested:
        if set(nested) - {"path", "host", "headers", "xmux", "mode"}:
            return None
        nested_extra = {key: item for key, item in nested.items() if key not in ("path", "host", "mode")}
        nested_opts = mihomo_xhttp_opts(
            nested_extra, nested.get("path") or "", nested.get("host") or "", nested.get("mode") or ""
        )
        if nested_opts is None:
            return None
        out.update({key: item for key, item in nested_opts.items() if key not in out or key in ("path", "host", "mode", "headers", "reuse-settings")})
    return out



def mihomo_xhttp_opts(extra, path, host, mode):
    opts = {}
    if path:
        opts["path"] = path
    if host:
        opts["host"] = host
    if mode:
        opts["mode"] = mode
    extra = extra or {}
    for key, value in extra.items():
        if key == "xmux":
            if not isinstance(value, dict):
                return None
            reuse = {}
            for source, target in _XMUX_MAP.items():
                if source not in value:
                    continue
                mapped = _mihomo_scalar(source, value[source])
                if mapped is None:
                    return None
                reuse[target] = mapped
            if set(value) - set(_XMUX_MAP):
                return None
            if reuse:
                opts["reuse-settings"] = reuse
        elif key == "downloadSettings":
            mapped = _mihomo_download(value)
            if mapped is None:
                return None
            opts["download-settings"] = mapped
        elif key in _XHTTP_DIRECT:
            mapped = _mihomo_scalar(key, value)
            if mapped is None:
                return None
            opts[_XHTTP_DIRECT[key]] = mapped
        else:
            return None
    return opts




class ClashConfiguration(object):
    def __init__(self):
        self.data = {
            'proxies': [],
            'proxy-groups': [],
            # Some clients rely on "rules" option and will fail without it.
            'rules': []
        }
        self.proxy_remarks = []
        self.mux_template = render_template(MUX_TEMPLATE)
        user_agent_data = json.loads(render_template(USER_AGENT_TEMPLATE))

        if 'list' in user_agent_data and isinstance(user_agent_data['list'], list):
            self.user_agent_list = user_agent_data['list']
        else:
            self.user_agent_list = []

        try:
            self.settings = yaml.load(render_template(CLASH_SETTINGS_TEMPLATE), Loader=yaml.SafeLoader)
        except TemplateNotFound:
            self.settings = {}

        del user_agent_data

    def render(self, reverse=False):
        if reverse:
            self.data['proxies'].reverse()

        yaml.add_representer(UUID, yml_uuid_representer)
        return yaml.dump(
            yaml.load(
                render_template(
                    CLASH_SUBSCRIPTION_TEMPLATE,
                    {"conf": self.data, "proxy_remarks": self.proxy_remarks}
                ),
                Loader=yaml.SafeLoader

            ),
            sort_keys=False,
            allow_unicode=True,
        )

    def __str__(self) -> str:
        return self.render()

    def __repr__(self) -> str:
        return self.render()

    def _remark_validation(self, remark):
        if not remark in self.proxy_remarks:
            return remark
        c = 2
        while True:
            new = f'{remark} ({c})'
            if not new in self.proxy_remarks:
                return new
            c += 1

    def http_config(
            self,
            path="",
            host="",
            random_user_agent: bool = False,
    ):
        config = copy.deepcopy(self.settings.get("http-opts", {
            'headers': {}
        }))

        if path:
            config["path"] = [path]
        if host:
            config["Host"] = host
        if random_user_agent:
            if "headers" not in config:
                config["headers"] = {}
            config["header"]["User-Agent"] = choice(self.user_agent_list)

        return config

    def ws_config(
            self,
            path="",
            host="",
            max_early_data=None,
            early_data_header_name="",
            is_httpupgrade: bool = False,
            random_user_agent: bool = False,
    ):
        config = copy.deepcopy(self.settings.get("ws-opts", {}))
        if (host or random_user_agent) and "headers" not in config:
            config["headers"] = {}
        if path:
            config["path"] = path
        if host:
            config["headers"]["Host"] = host
        if random_user_agent:
            config["headers"]["User-Agent"] = choice(self.user_agent_list)
        if max_early_data and not is_httpupgrade:
            config["max-early-data"] = max_early_data
            config["early-data-header-name"] = early_data_header_name
        if is_httpupgrade:
            config["v2ray-http-upgrade"] = True
            config["v2ray-http-upgrade-fast-open"] = True

        return config

    def grpc_config(self, path=""):
        config = copy.deepcopy(self.settings.get("grpc-opts", {}))
        if path:
            config["grpc-service-name"] = path

        return config

    def h2_config(self, path="", host=""):
        config = copy.deepcopy(self.settings.get("h2-opts", {}))
        if path:
            config["path"] = path
        if host:
            config["host"] = [host]

        return config

    def tcp_config(self, path="", host=""):
        config = copy.deepcopy(self.settings.get("tcp-opts", {}))
        if path:
            config["path"] = [path]
        if host:
            if "headers" not in config:
                config["headers"] = {}
            config["headers"]["Host"] = host

        return config

    def make_node(self,
                  name: str,
                  remark: str,
                  type: str,
                  server: str,
                  port: int,
                  network: str,
                  tls: bool,
                  sni: str,
                  host: str,
                  path: str,
                  headers: str = '',
                  udp: bool = True,
                  alpn: str = '',
                  ais: bool = '',
                  mux_enable: bool = False,
                  random_user_agent: bool = False):

        if network in ["grpc", "gun"]:
            path = get_grpc_gun(path)

        if type == 'shadowsocks':
            type = 'ss'
        if network in ("http", "h2", "h3"):
            network = "h2"
        if network in ('tcp', 'raw') and headers == 'http':
            network = 'http'
        if network == 'httpupgrade':
            network = 'ws'
            is_httpupgrade = True
        else:
            is_httpupgrade = False
        if network == 'raw':
            network = 'tcp'
        node = {
            'name': remark,
            'type': type,
            'server': server,
            'port': port,
            'network': network,
            'udp': udp
        }

        if "?ed=" in path:
            path, max_early_data = path.split("?ed=")
            max_early_data, = max_early_data.split("/")
            max_early_data = int(max_early_data)
            early_data_header_name = "Sec-WebSocket-Protocol"
        else:
            max_early_data = None
            early_data_header_name = ""

        if type == 'ss':  # shadowsocks
            return node

        if tls:
            node['tls'] = True
            if type == 'trojan':
                node['sni'] = sni
            else:
                node['servername'] = sni
            if alpn:
                node['alpn'] = alpn.split(',')
            if ais:
                node['skip-cert-verify'] = ais

        if network == 'http':
            net_opts = self.http_config(
                path=path,
                host=host,
                random_user_agent=random_user_agent,
            )

        elif network == 'ws':
            net_opts = self.ws_config(
                path=path,
                host=host,
                max_early_data=max_early_data,
                early_data_header_name=early_data_header_name,
                is_httpupgrade=is_httpupgrade,
                random_user_agent=random_user_agent,
            )

        elif network == 'grpc' or network == 'gun':
            net_opts = self.grpc_config(path=path)

        elif network == 'h2':
            net_opts = self.h2_config(path=path, host=host)

        elif network in ('tcp', 'raw'):
            net_opts = self.tcp_config(path=path, host=host)

        else:
            net_opts = {}

        node[f'{network}-opts'] = net_opts

        mux_json = json.loads(self.mux_template)
        mux_config = mux_json["clash"]

        if mux_enable:
            node['smux'] = mux_config

        return node

    def add(self, remark: str, address: str, inbound: dict, settings: dict):
        if legacy_client_cannot_represent(inbound):
            return
        # not supported by clash
        if inbound['network'] in ("kcp", "splithttp", "xhttp"):
            return

        proxy_remark = self._remark_validation(remark)

        node = self.make_node(
            name=remark,
            remark=proxy_remark,
            type=inbound['protocol'],
            server=address,
            port=inbound['port'],
            network=inbound['network'],
            tls=(inbound['tls'] == 'tls'),
            sni=inbound['sni'],
            host=inbound['host'],
            path=inbound['path'],
            headers=inbound['header_type'],
            udp=True,
            alpn=inbound.get('alpn', ''),
            ais=inbound.get('ais', False),
            mux_enable=inbound.get('mux_enable', False),
            random_user_agent=inbound.get("random_user_agent")
        )

        if inbound['protocol'] == 'vmess':
            node['uuid'] = settings['id']
            node['alterId'] = 0
            node['cipher'] = 'auto'

        elif inbound['protocol'] == 'trojan':
            node['password'] = settings['password']

        elif inbound['protocol'] == 'shadowsocks':
            node['password'] = settings['password']
            node['cipher'] = settings['method']

        else:
            return

        self.data['proxies'].append(node)
        self.proxy_remarks.append(proxy_remark)


class ClashMetaConfiguration(ClashConfiguration):
    def make_node(self,
                  name: str,
                  remark: str,
                  type: str,
                  server: str,
                  port: int,
                  network: str,
                  tls: bool,
                  sni: str,
                  host: str,
                  path: str,
                  headers: str = '',
                  udp: bool = True,
                  alpn: str = '',
                  fp: str = '',
                  pbk: str = '',
                  sid: str = '',
                  ais: bool = '',
                  mux_enable: bool = False,
                  random_user_agent: bool = False):
        node = super().make_node(
            name=name,
            remark=remark,
            type=type,
            server=server,
            port=port,
            network=network,
            tls=tls,
            sni=sni,
            host=host,
            path=path,
            headers=headers,
            udp=udp,
            alpn=alpn,
            ais=ais,
            mux_enable=mux_enable,
            random_user_agent=random_user_agent
        )
        if fp:
            node['client-fingerprint'] = fp
        if pbk:
            node['reality-opts'] = {"public-key": pbk, "short-id": sid}

        return node

    def add(self, remark: str, address: str, inbound: dict, settings: dict):
        network = "xhttp" if inbound["network"] == "splithttp" else inbound["network"]
        if inbound.get("mldsa65Verify") or network == "kcp" or (network == "quic" and inbound["header_type"] != "none"):
            return
        if network == "xhttp" and inbound.get("protocol") != "vless":
            return
        xhttp_opts = None
        if network == "xhttp":
            host = inbound.get("host") or ""
            if isinstance(host, list):
                host = host[0] if host else ""
            xhttp_opts = mihomo_xhttp_opts(
                inbound.get("xhttp_extra"), inbound.get("path") or "", host, inbound.get("mode") or "auto"
            )
            if xhttp_opts is None:
                return

        proxy_remark = self._remark_validation(remark)

        node = self.make_node(
            name=remark,
            remark=proxy_remark,
            type=inbound['protocol'],
            server=address,
            port=inbound['port'],
            network=network,
            tls=(inbound['tls'] in ('tls', 'reality')),
            sni=inbound['sni'],
            host=inbound['host'],
            path=inbound['path'],
            headers=inbound['header_type'],
            udp=True,
            alpn=inbound.get('alpn', ''),
            fp=inbound.get('fp', ''),
            pbk=inbound.get('pbk', ''),
            sid=inbound.get('sid', ''),
            ais=inbound.get('ais', False),
            mux_enable=inbound.get('mux_enable', False),
            random_user_agent=inbound.get("random_user_agent")
        )

        if inbound['protocol'] == 'vmess':
            node['uuid'] = settings['id']
            node['alterId'] = 0
            node['cipher'] = 'auto'

        elif inbound['protocol'] == 'vless':
            node['uuid'] = settings['id']

            if supports_vless_flow(inbound) and settings.get('flow'):
                node['flow'] = settings.get('flow', '')
            encryption = inbound.get("vless_encryption")
            if isinstance(encryption, str) and encryption not in ("", "none"):
                node["encryption"] = encryption
            if xhttp_opts is not None:
                node["network"] = "xhttp"
                node["xhttp-opts"] = xhttp_opts

        elif inbound['protocol'] == 'trojan':
            node['password'] = settings['password']

        elif inbound['protocol'] == 'shadowsocks':
            node['password'] = settings['password']
            node['cipher'] = settings['method']

        else:
            return

        self.data['proxies'].append(node)
        self.proxy_remarks.append(proxy_remark)
