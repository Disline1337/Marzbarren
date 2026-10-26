export type HappDefaultAction = "proxy" | "direct";
export type RoutingAction = "proxy" | "direct" | "block";
export type DomainStrategy = "AsIs" | "IPIfNonMatch" | "IPOnDemand";
export type MihomoRuleType =
  | "domain"
  | "domain_suffix"
  | "geosite"
  | "geoip"
  | "ip_cidr";

export type HappRoutingProfile = {
  enabled: boolean;
  default_action: HappDefaultAction;
  domain_strategy: DomainStrategy;
  geoip_url: string;
  geosite_url: string;
  direct_sites: string[];
  direct_ips: string[];
  proxy_sites: string[];
  proxy_ips: string[];
  block_sites: string[];
  block_ips: string[];
};

export type MihomoRoutingRule = {
  type: MihomoRuleType;
  value: string;
  action: RoutingAction;
};

export type MihomoRoutingProfile = {
  enabled: boolean;
  default_action: RoutingAction;
  geoip_url: string;
  geosite_url: string;
  rules: MihomoRoutingRule[];
};

export type ClientRoutingUpdate = {
  happ: HappRoutingProfile;
  mihomo: MihomoRoutingProfile;
};

export type ClientRoutingResponse = ClientRoutingUpdate & {
  happ_updated_at: number;
};
