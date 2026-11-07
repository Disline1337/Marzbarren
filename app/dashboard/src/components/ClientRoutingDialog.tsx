import {
  ExclamationTriangleIcon,
  InformationCircleIcon,
  MapIcon,
} from "@heroicons/react/24/outline";
import { Input } from "components/Input";
import { Textarea } from "components/Textarea";
import { Button } from "components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "components/ui/dialog";
import { Label } from "components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "components/ui/select";
import { Switch } from "components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "components/ui/tabs";
import { useClientRouting } from "contexts/ClientRoutingContext";
import { useDashboard } from "contexts/DashboardContext";
import { FC, useEffect, useState } from "react";
import {
  Controller,
  UseFieldArrayReturn,
  UseFormReturn,
  useFieldArray,
  useForm,
} from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  ClientRoutingResponse,
  ClientRoutingUpdate,
  DomainStrategy,
  HappDefaultAction,
  MihomoRuleType,
  RoutingAction,
} from "types/ClientRouting";
import {
  generateErrorMessage,
  generateSuccessMessage,
} from "utils/toastHandler";
import { Icon } from "./Icon";

const RULE_TYPES: MihomoRuleType[] = [
  "domain",
  "domain_suffix",
  "geosite",
  "geoip",
  "ip_cidr",
];
const RULE_ACTIONS: RoutingAction[] = ["proxy", "direct", "block"];
const HAPP_ACTIONS: HappDefaultAction[] = ["proxy", "direct"];
const DOMAIN_STRATEGIES: DomainStrategy[] = [
  "AsIs",
  "IPIfNonMatch",
  "IPOnDemand",
];

type FormValues = {
  happ: {
    enabled: boolean;
    default_action: HappDefaultAction;
    domain_strategy: DomainStrategy;
    geoip_url: string;
    geosite_url: string;
    direct_sites: string;
    direct_ips: string;
    proxy_sites: string;
    proxy_ips: string;
    block_sites: string;
    block_ips: string;
  };
  mihomo: {
    enabled: boolean;
    default_action: RoutingAction;
    geoip_url: string;
    geosite_url: string;
    rules: {
      type: MihomoRuleType;
      value: string;
      action: RoutingAction;
    }[];
  };
};

type RoutingForm = UseFormReturn<FormValues>;
type RoutingRules = UseFieldArrayReturn<FormValues, "mihomo.rules">;
type HappListName =
  | "happ.direct_sites"
  | "happ.direct_ips"
  | "happ.proxy_sites"
  | "happ.proxy_ips"
  | "happ.block_sites"
  | "happ.block_ips";

type DetailItem = { loc?: unknown; msg?: unknown };

const emptyForm: FormValues = {
  happ: {
    enabled: false,
    default_action: "proxy",
    domain_strategy: "IPIfNonMatch",
    geoip_url: "",
    geosite_url: "",
    direct_sites: "",
    direct_ips: "",
    proxy_sites: "",
    proxy_ips: "",
    block_sites: "",
    block_ips: "",
  },
  mihomo: {
    enabled: false,
    default_action: "proxy",
    geoip_url: "",
    geosite_url: "",
    rules: [],
  },
};

const joinLines = (items: string[]) => items.join("\n");

const splitLines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

const toForm = (settings: ClientRoutingResponse): FormValues => ({
  happ: {
    enabled: settings.happ.enabled,
    default_action: settings.happ.default_action,
    domain_strategy: settings.happ.domain_strategy,
    geoip_url: settings.happ.geoip_url,
    geosite_url: settings.happ.geosite_url,
    direct_sites: joinLines(settings.happ.direct_sites),
    direct_ips: joinLines(settings.happ.direct_ips),
    proxy_sites: joinLines(settings.happ.proxy_sites),
    proxy_ips: joinLines(settings.happ.proxy_ips),
    block_sites: joinLines(settings.happ.block_sites),
    block_ips: joinLines(settings.happ.block_ips),
  },
  mihomo: {
    enabled: settings.mihomo.enabled,
    default_action: settings.mihomo.default_action,
    geoip_url: settings.mihomo.geoip_url,
    geosite_url: settings.mihomo.geosite_url,
    rules: settings.mihomo.rules.map((rule) => ({ ...rule })),
  },
});

const toUpdate = (values: FormValues): ClientRoutingUpdate => ({
  happ: {
    enabled: values.happ.enabled,
    default_action: values.happ.default_action,
    domain_strategy: values.happ.domain_strategy,
    geoip_url: values.happ.geoip_url.trim(),
    geosite_url: values.happ.geosite_url.trim(),
    direct_sites: splitLines(values.happ.direct_sites),
    direct_ips: splitLines(values.happ.direct_ips),
    proxy_sites: splitLines(values.happ.proxy_sites),
    proxy_ips: splitLines(values.happ.proxy_ips),
    block_sites: splitLines(values.happ.block_sites),
    block_ips: splitLines(values.happ.block_ips),
  },
  mihomo: {
    enabled: values.mihomo.enabled,
    default_action: values.mihomo.default_action,
    geoip_url: values.mihomo.geoip_url.trim(),
    geosite_url: values.mihomo.geosite_url.trim(),
    rules: values.mihomo.rules.map((rule) => ({
      type: rule.type,
      value: rule.value.trim(),
      action: rule.action,
    })),
  },
});

const readDetail = (error: unknown): unknown => {
  if (!error || typeof error !== "object") return undefined;
  const response = "response" in error ? error.response : undefined;
  if (response && typeof response === "object" && "_data" in response) {
    const data = response._data;
    if (data && typeof data === "object" && "detail" in data) return data.detail;
  }
  if ("data" in error) {
    const data = error.data;
    if (data && typeof data === "object" && "detail" in data) return data.detail;
  }
  return undefined;
};

const validationMessages = (error: unknown): string[] => {
  const detail = readDetail(error);
  if (typeof detail === "string") return [detail];
  if (Array.isArray(detail)) {
    return detail.map((item) => {
      const entry = item as DetailItem;
      const path = Array.isArray(entry?.loc) ? entry.loc.join(".") : "";
      return path ? `${path}: ${entry?.msg}` : String(entry?.msg || item);
    });
  }
  if (detail && typeof detail === "object") {
    return Object.entries(detail).map(
      ([key, message]) => `${key}: ${message}`
    );
  }
  return [];
};

const Spinner = () => (
  <svg
    className="h-4 w-4 animate-spin"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

const EnabledSwitch: FC<{
  form: RoutingForm;
  name: "happ.enabled" | "mihomo.enabled";
}> = ({ form, name }) => (
  <Controller
    name={name}
    control={form.control}
    render={({ field }) => (
      <Switch
        checked={field.value}
        onCheckedChange={(checked) => field.onChange(checked)}
      />
    )}
  />
);

const FieldSelect: FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}> = ({ label, value, onChange, options }) => (
  <div className="w-full">
    <Label className="mb-2 block">{label}</Label>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

export const ClientRoutingDialog: FC = () => {
  const { isEditingClientRouting } = useDashboard();
  const { settings, isPostLoading, fetchSettings, saveSettings } =
    useClientRouting();
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);
  const [fetchError, setFetchError] = useState<unknown>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const form = useForm<FormValues>({ defaultValues: emptyForm });
  const rules = useFieldArray({ control: form.control, name: "mihomo.rules" });

  const close = () => {
    if (isPostLoading) return;
    useDashboard.setState({ isEditingClientRouting: false });
  };

  useEffect(() => {
    if (!isEditingClientRouting) {
      setReady(false);
      setFetchError(null);
      setValidationErrors([]);
      return;
    }
    let active = true;
    setReady(false);
    setFetchError(null);
    setValidationErrors([]);
    fetchSettings()
      .then(() => {
        if (active) setReady(true);
      })
      .catch((error) => {
        if (active) setFetchError(error);
      });
    return () => {
      active = false;
    };
  }, [isEditingClientRouting]);

  useEffect(() => {
    if (ready && settings) form.reset(toForm(settings));
  }, [ready, settings]);

  const retry = () => {
    setFetchError(null);
    setReady(false);
    fetchSettings()
      .then(() => setReady(true))
      .catch((error) => setFetchError(error));
  };

  const onSubmit = form.handleSubmit(async (values) => {
    if (!ready || fetchError || isPostLoading) return;
    setValidationErrors([]);
    try {
      await saveSettings(toUpdate(values));
      generateSuccessMessage(t("clientRouting.saved"));
      useDashboard.setState({ isEditingClientRouting: false });
    } catch (error) {
      const messages = validationMessages(error);
      setValidationErrors(messages);
      generateErrorMessage(error);
    }
  });

  const canSave = ready && !fetchError && !isPostLoading;
  return (
    <Dialog
      open={isEditingClientRouting}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className="max-w-4xl"
        onPointerDownOutside={(event) => {
          if (isPostLoading) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (isPostLoading) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex flex-row items-center gap-2 pr-6">
            <Icon color="primary">
              <MapIcon className="h-5 w-5 text-white" />
            </Icon>
            {t("clientRouting.title")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <div className="max-h-[70vh] overflow-y-auto">
            {!ready && !fetchError && (
              <div className="flex flex-row items-center justify-center gap-2 py-8">
                <Spinner />
                <p>{t("clientRouting.loading")}</p>
              </div>
            )}
            {!!fetchError && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-destructive">
                <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="flex-1">
                  <p>{t("clientRouting.loadError")}</p>
                  <Button
                    className="mt-3"
                    size="sm"
                    onClick={retry}
                    type="button"
                  >
                    {t("clientRouting.retry")}
                  </Button>
                </div>
              </div>
            )}
            {ready && !fetchError && (
              <div className="flex flex-col gap-4">
                <div className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/10 p-3">
                  <InformationCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm">{t("clientRouting.hint.effect")}</p>
                    <p className="mt-1 text-sm">{t("clientRouting.hint.geo")}</p>
                  </div>
                </div>
                <fieldset
                  disabled={isPostLoading}
                  style={{ border: 0, padding: 0, margin: 0 }}
                >
                  <Tabs defaultValue="happ">
                    <TabsList className="w-full overflow-x-auto">
                      <TabsTrigger className="flex-1" value="happ">
                        {t("clientRouting.happTab")}
                      </TabsTrigger>
                      <TabsTrigger className="flex-1" value="mihomo">
                        {t("clientRouting.mihomoTab")}
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="happ" className="px-0 md:px-4">
                      <HappFields form={form} />
                    </TabsContent>
                    <TabsContent value="mihomo" className="px-0 md:px-4">
                      <MihomoFields form={form} rules={rules} />
                    </TabsContent>
                  </Tabs>
                </fieldset>
                {validationErrors.length > 0 && (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-destructive">
                    <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                      <p className="font-semibold">
                        {t("clientRouting.validationErrors")}
                      </p>
                      {validationErrors.map((message, index) => (
                        <p key={`${index}-${message}`} className="text-sm">
                          {message}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={isPostLoading}
            >
              {t("clientRouting.cancel")}
            </Button>
            <Button type="submit" disabled={!canSave}>
              {isPostLoading && <Spinner />}
              {t("clientRouting.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const HappFields: FC<{ form: RoutingForm }> = ({ form }) => {
  const { t } = useTranslation();
  const sections = ["direct", "proxy", "block"] as const;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">{t("clientRouting.hint.happJson")}</p>
      <div className="flex items-center gap-2">
        <span>{t("clientRouting.enabled")}</span>
        <EnabledSwitch form={form} name="happ.enabled" />
      </div>
      <div className="flex flex-col items-start gap-4 md:flex-row">
        <div className="w-full">
          <Controller
            control={form.control}
            name="happ.default_action"
            render={({ field }) => (
              <FieldSelect
                label={t("clientRouting.defaultAction")}
                value={field.value}
                onChange={field.onChange}
                options={HAPP_ACTIONS.map((action) => ({
                  value: action,
                  label: t(`clientRouting.action.${action}`),
                }))}
              />
            )}
          />
          <p className="mt-1 text-sm text-muted-foreground">
            {t("clientRouting.defaultActionHint")}
          </p>
        </div>
        <Controller
          control={form.control}
          name="happ.domain_strategy"
          render={({ field }) => (
            <FieldSelect
              label={t("clientRouting.domainStrategy")}
              value={field.value}
              onChange={field.onChange}
              options={DOMAIN_STRATEGIES.map((strategy) => ({
                value: strategy,
                label: strategy,
              }))}
            />
          )}
        />
      </div>
      <UrlFields
        geoipName="happ.geoip_url"
        geositeName="happ.geosite_url"
        form={form}
      />
      {sections.map((section) => (
        <div key={section}>
          <p className="font-semibold">
            {t(`clientRouting.section.${section}`)}
          </p>
          <p className="mb-2 text-sm text-muted-foreground">
            {t(`clientRouting.section.${section}Help`)}
          </p>
          <ListField
            label={t("clientRouting.sites")}
            example={t("clientRouting.sitesExample")}
            hint={t("clientRouting.happSitesHint")}
            name={`happ.${section}_sites`}
            form={form}
          />
          <ListField
            label={t("clientRouting.ips")}
            example={t("clientRouting.ipsExample")}
            hint={t("clientRouting.happIpsHint")}
            name={`happ.${section}_ips`}
            form={form}
          />
        </div>
      ))}
    </div>
  );
};

const MihomoFields: FC<{ form: RoutingForm; rules: RoutingRules }> = ({
  form,
  rules,
}) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">{t("clientRouting.hint.mihomo")}</p>
      <div className="flex items-center gap-2">
        <span>{t("clientRouting.enabled")}</span>
        <EnabledSwitch form={form} name="mihomo.enabled" />
      </div>
      <div>
        <Controller
          control={form.control}
          name="mihomo.default_action"
          render={({ field }) => (
            <FieldSelect
              label={t("clientRouting.defaultAction")}
              value={field.value}
              onChange={field.onChange}
              options={RULE_ACTIONS.map((action) => ({
                value: action,
                label: t(`clientRouting.action.${action}`),
              }))}
            />
          )}
        />
        <p className="mt-1 text-sm text-muted-foreground">
          {t("clientRouting.defaultActionHint")} {t("clientRouting.matchHint")}
        </p>
      </div>
      <UrlFields
        geoipName="mihomo.geoip_url"
        geositeName="mihomo.geosite_url"
        form={form}
      />
      <p className="font-semibold">{t("clientRouting.rules")}</p>
      <p className="text-sm text-muted-foreground">
        {t("clientRouting.suffixHint")}
      </p>
      {rules.fields.map((field, index) => (
        <div
          key={field.id}
          className="flex flex-col items-end gap-2 md:flex-row"
        >
          <Controller
            control={form.control}
            name={`mihomo.rules.${index}.type`}
            render={({ field: typeField }) => (
              <FieldSelect
                label={t("clientRouting.ruleType")}
                value={typeField.value}
                onChange={typeField.onChange}
                options={RULE_TYPES.map((type) => ({
                  value: type,
                  label: t(`clientRouting.type.${type}`),
                }))}
              />
            )}
          />
          <Input
            className="w-full"
            label={t("clientRouting.ruleValue")}
            placeholder={t(
              `clientRouting.rulePlaceholder.${form.watch(
                `mihomo.rules.${index}.type`
              )}`
            )}
            {...form.register(`mihomo.rules.${index}.value`)}
          />
          <Controller
            control={form.control}
            name={`mihomo.rules.${index}.action`}
            render={({ field: actionField }) => (
              <FieldSelect
                label={t("clientRouting.ruleAction")}
                value={actionField.value}
                onChange={actionField.onChange}
                options={RULE_ACTIONS.map((action) => ({
                  value: action,
                  label: t(`clientRouting.action.${action}`),
                }))}
              />
            )}
          />
          <div className="flex flex-row items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => rules.move(index, index - 1)}
              disabled={index === 0}
            >
              {t("clientRouting.up")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => rules.move(index, index + 1)}
              disabled={index === rules.fields.length - 1}
            >
              {t("clientRouting.down")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => rules.remove(index)}
            >
              {t("clientRouting.delete")}
            </Button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        className="self-start"
        size="sm"
        variant="secondary"
        onClick={() =>
          rules.append({ type: "domain_suffix", value: "", action: "direct" })
        }
      >
        {t("clientRouting.add")}
      </Button>
    </div>
  );
};

const UrlFields: FC<{
  form: RoutingForm;
  geoipName: "happ.geoip_url" | "mihomo.geoip_url";
  geositeName: "happ.geosite_url" | "mihomo.geosite_url";
}> = ({ form, geoipName, geositeName }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <Input
        label={t("clientRouting.geoipUrl")}
        {...form.register(geoipName)}
      />
      <Input
        label={t("clientRouting.geositeUrl")}
        {...form.register(geositeName)}
      />
    </div>
  );
};

const ListField: FC<{
  form: RoutingForm;
  name: HappListName;
  label: string;
  example: string;
  hint?: string;
}> = ({ form, name, label, example, hint }) => {
  const { t } = useTranslation();
  return (
    <div className="mb-3">
      <Textarea
        rows={4}
        label={label}
        placeholder={example}
        {...form.register(name)}
      />
      <p className="mt-1 text-sm text-muted-foreground">
        {t("clientRouting.onePerLine")} {example}
        {hint ? ` ${hint}` : ""}
      </p>
    </div>
  );
};
