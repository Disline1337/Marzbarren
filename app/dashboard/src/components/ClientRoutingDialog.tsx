import {
  Alert,
  AlertIcon,
  Box,
  Button,
  chakra,
  FormControl,
  FormHelperText,
  FormLabel,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Spinner,
  Switch,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  Textarea,
  useToast,
  VStack,
} from "@chakra-ui/react";
import { MapIcon } from "@heroicons/react/24/outline";
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

const RoutingIcon = chakra(MapIcon, { baseStyle: { w: 5, h: 5 } });
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

const validationMessages = (error: any): string[] => {
  const detail = error?.response?._data?.detail ?? error?.data?.detail;
  if (typeof detail === "string") return [detail];
  if (Array.isArray(detail)) {
    return detail.map((item) => {
      const path = Array.isArray(item?.loc) ? item.loc.join(".") : "";
      return path ? `${path}: ${item?.msg}` : String(item?.msg || item);
    });
  }
  if (detail && typeof detail === "object") {
    return Object.entries(detail).map(
      ([key, message]) => `${key}: ${message}`
    );
  }
  return [];
};

const EnabledSwitch: FC<{
  form: RoutingForm;
  name: "happ.enabled" | "mihomo.enabled";
}> = ({ form, name }) => (
  <Controller
    name={name}
    control={form.control}
    render={({ field }) => (
      <Switch
        isChecked={field.value}
        onChange={(event) => field.onChange(event.target.checked)}
      />
    )}
  />
);

export const ClientRoutingDialog: FC = () => {
  const { isEditingClientRouting } = useDashboard();
  const { settings, isPostLoading, fetchSettings, saveSettings } =
    useClientRouting();
  const { t } = useTranslation();
  const toast = useToast();
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
      generateSuccessMessage(t("clientRouting.saved"), toast);
      useDashboard.setState({ isEditingClientRouting: false });
    } catch (error) {
      const messages = validationMessages(error);
      setValidationErrors(messages);
      generateErrorMessage(error, toast);
    }
  });

  const canSave = ready && !fetchError && !isPostLoading;
  return (
    <Modal
      isOpen={isEditingClientRouting}
      onClose={close}
      size="3xl"
      closeOnOverlayClick={!isPostLoading}
      closeOnEsc={!isPostLoading}
    >
      <ModalOverlay bg="blackAlpha.300" backdropFilter="blur(10px)" />
      <ModalContent mx="3" w="full">
        <ModalHeader pt={6}>
          <HStack gap={2}>
            <Icon color="primary">
              <RoutingIcon color="white" />
            </Icon>
            <Text fontWeight="semibold" fontSize="lg">
              {t("clientRouting.title")}
            </Text>
          </HStack>
        </ModalHeader>
        <ModalCloseButton mt={3} isDisabled={isPostLoading} />
        <form onSubmit={onSubmit}>
          <ModalBody maxH="70vh" overflowY="auto">
            {!ready && !fetchError && (
              <HStack py={8} justify="center">
                <Spinner />
                <Text>{t("clientRouting.loading")}</Text>
              </HStack>
            )}
            {!!fetchError && (
              <Alert status="error" borderRadius="md">
                <AlertIcon />
                <Box flex="1">
                  <Text>{t("clientRouting.loadError")}</Text>
                  <Button mt={3} size="sm" onClick={retry} type="button">
                    {t("clientRouting.retry")}
                  </Button>
                </Box>
              </Alert>
            )}
            {ready && !fetchError && (
              <VStack align="stretch" spacing={4}>
                <Alert status="info" borderRadius="md" alignItems="start">
                  <AlertIcon />
                  <Box>
                    <Text fontSize="sm">{t("clientRouting.hint.effect")}</Text>
                    <Text fontSize="sm" mt={1}>
                      {t("clientRouting.hint.geo")}
                    </Text>
                  </Box>
                </Alert>
                <fieldset
                  disabled={isPostLoading}
                  style={{ border: 0, padding: 0, margin: 0 }}
                >
                  <Tabs isFitted variant="enclosed" colorScheme="primary">
                    <TabList overflowX="auto">
                      <Tab>{t("clientRouting.happTab")}</Tab>
                      <Tab>{t("clientRouting.mihomoTab")}</Tab>
                    </TabList>
                    <TabPanels>
                      <TabPanel px={{ base: 0, md: 4 }}>
                        <HappFields form={form} />
                      </TabPanel>
                      <TabPanel px={{ base: 0, md: 4 }}>
                        <MihomoFields form={form} rules={rules} />
                      </TabPanel>
                    </TabPanels>
                  </Tabs>
                </fieldset>
                {validationErrors.length > 0 && (
                  <Alert status="error" borderRadius="md" alignItems="start">
                    <AlertIcon />
                    <Box>
                      <Text fontWeight="semibold">
                        {t("clientRouting.validationErrors")}
                      </Text>
                      {validationErrors.map((message, index) => (
                        <Text key={`${index}-${message}`} fontSize="sm">
                          {message}
                        </Text>
                      ))}
                    </Box>
                  </Alert>
                )}
              </VStack>
            )}
          </ModalBody>
          <ModalFooter>
            <Button
              type="button"
              variant="outline"
              mr={3}
              onClick={close}
              isDisabled={isPostLoading}
            >
              {t("clientRouting.cancel")}
            </Button>
            <Button
              type="submit"
              colorScheme="primary"
              isLoading={isPostLoading}
              loadingText={t("clientRouting.saving")}
              isDisabled={!canSave}
            >
              {t("clientRouting.save")}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

const HappFields: FC<{ form: RoutingForm }> = ({ form }) => {
  const { t } = useTranslation();
  const sections = ["direct", "proxy", "block"] as const;
  return (
    <VStack align="stretch" spacing={4}>
      <Text fontSize="sm">{t("clientRouting.hint.happJson")}</Text>
      <FormControl display="flex" alignItems="center">
        <FormLabel mb={0}>{t("clientRouting.enabled")}</FormLabel>
        <EnabledSwitch form={form} name="happ.enabled" />
      </FormControl>
      <HStack align="start" flexDir={{ base: "column", md: "row" }}>
        <FormControl>
          <FormLabel>{t("clientRouting.defaultAction")}</FormLabel>
          <Select {...form.register("happ.default_action")}>
            {HAPP_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {t(`clientRouting.action.${action}`)}
              </option>
            ))}
          </Select>
        </FormControl>
        <FormControl>
          <FormLabel>{t("clientRouting.domainStrategy")}</FormLabel>
          <Select {...form.register("happ.domain_strategy")}>
            {DOMAIN_STRATEGIES.map((strategy) => (
              <option key={strategy} value={strategy}>
                {strategy}
              </option>
            ))}
          </Select>
        </FormControl>
      </HStack>
      <UrlFields
        geoipName="happ.geoip_url"
        geositeName="happ.geosite_url"
        form={form}
      />
      {sections.map((section) => (
        <Box key={section}>
          <Text fontWeight="semibold" mb={2}>
            {t(`clientRouting.section.${section}`)}
          </Text>
          <ListField
            label={t("clientRouting.sites")}
            example={t("clientRouting.sitesExample")}
            name={`happ.${section}_sites`}
            form={form}
          />
          <ListField
            label={t("clientRouting.ips")}
            example={t("clientRouting.ipsExample")}
            name={`happ.${section}_ips`}
            form={form}
          />
        </Box>
      ))}
    </VStack>
  );
};

const MihomoFields: FC<{ form: RoutingForm; rules: RoutingRules }> = ({
  form,
  rules,
}) => {
  const { t } = useTranslation();
  return (
    <VStack align="stretch" spacing={4}>
      <Text fontSize="sm">{t("clientRouting.hint.mihomo")}</Text>
      <FormControl display="flex" alignItems="center">
        <FormLabel mb={0}>{t("clientRouting.enabled")}</FormLabel>
        <EnabledSwitch form={form} name="mihomo.enabled" />
      </FormControl>
      <FormControl>
        <FormLabel>{t("clientRouting.defaultAction")}</FormLabel>
        <Select {...form.register("mihomo.default_action")}>
          {RULE_ACTIONS.map((action) => (
            <option key={action} value={action}>
              {t(`clientRouting.action.${action}`)}
            </option>
          ))}
        </Select>
        <FormHelperText>{t("clientRouting.matchHint")}</FormHelperText>
      </FormControl>
      <UrlFields
        geoipName="mihomo.geoip_url"
        geositeName="mihomo.geosite_url"
        form={form}
      />
      <Text fontWeight="semibold">{t("clientRouting.rules")}</Text>
      {rules.fields.map((field, index) => (
        <HStack
          key={field.id}
          align="end"
          flexDir={{ base: "column", md: "row" }}
        >
          <FormControl>
            <FormLabel>{t("clientRouting.ruleType")}</FormLabel>
            <Select {...form.register(`mihomo.rules.${index}.type`)}>
              {RULE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`clientRouting.type.${type}`)}
                </option>
              ))}
            </Select>
          </FormControl>
          <FormControl>
            <FormLabel>{t("clientRouting.ruleValue")}</FormLabel>
            <Input {...form.register(`mihomo.rules.${index}.value`)} />
          </FormControl>
          <FormControl>
            <FormLabel>{t("clientRouting.ruleAction")}</FormLabel>
            <Select {...form.register(`mihomo.rules.${index}.action`)}>
              {RULE_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {t(`clientRouting.action.${action}`)}
                </option>
              ))}
            </Select>
          </FormControl>
          <HStack>
            <Button
              type="button"
              size="sm"
              onClick={() => rules.move(index, index - 1)}
              isDisabled={index === 0}
            >
              {t("clientRouting.up")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => rules.move(index, index + 1)}
              isDisabled={index === rules.fields.length - 1}
            >
              {t("clientRouting.down")}
            </Button>
            <Button
              type="button"
              size="sm"
              colorScheme="red"
              variant="outline"
              onClick={() => rules.remove(index)}
            >
              {t("clientRouting.delete")}
            </Button>
          </HStack>
        </HStack>
      ))}
      <Button
        type="button"
        alignSelf="start"
        size="sm"
        onClick={() =>
          rules.append({ type: "domain", value: "", action: "proxy" })
        }
      >
        {t("clientRouting.add")}
      </Button>
    </VStack>
  );
};

const UrlFields: FC<{
  form: RoutingForm;
  geoipName: "happ.geoip_url" | "mihomo.geoip_url";
  geositeName: "happ.geosite_url" | "mihomo.geosite_url";
}> = ({ form, geoipName, geositeName }) => {
  const { t } = useTranslation();
  return (
    <VStack align="stretch">
      <FormControl>
        <FormLabel>{t("clientRouting.geoipUrl")}</FormLabel>
        <Input {...form.register(geoipName)} />
      </FormControl>
      <FormControl>
        <FormLabel>{t("clientRouting.geositeUrl")}</FormLabel>
        <Input {...form.register(geositeName)} />
      </FormControl>
    </VStack>
  );
};

const ListField: FC<{
  form: RoutingForm;
  name: HappListName;
  label: string;
  example: string;
}> = ({ form, name, label, example }) => {
  const { t } = useTranslation();
  return (
    <FormControl mb={3}>
      <FormLabel>{label}</FormLabel>
      <Textarea rows={4} {...form.register(name)} />
      <FormHelperText>
        {t("clientRouting.onePerLine")} {example}
      </FormHelperText>
    </FormControl>
  );
};
