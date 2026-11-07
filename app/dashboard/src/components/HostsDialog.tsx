import {
  ArrowDownIcon,
  ArrowUpIcon,
  DocumentDuplicateIcon,
  InformationCircleIcon,
  LinkIcon,
} from "@heroicons/react/24/outline";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "components/ui/accordion";
import { Badge } from "components/ui/badge";
import { Button } from "components/ui/button";
import { Checkbox } from "components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "components/ui/dialog";
import { Label } from "components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "components/ui/select";
import { Switch } from "components/ui/switch";
import { Textarea } from "components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "components/ui/tooltip";
import {
  proxyALPN,
  proxyFingerprint,
  proxyHostSecurity,
} from "constants/Proxies";
import { useHosts } from "contexts/HostsContext";
import { cn } from "lib/utils";
import { FC, ReactNode, useEffect, useState } from "react";
import {
  Controller,
  FieldErrors,
  FormProvider,
  useFieldArray,
  useForm,
  useFormContext,
} from "react-hook-form";
import { Trans, useTranslation } from "react-i18next";
import { z } from "zod";
import {
  generateErrorMessage,
  generateSuccessMessage,
} from "utils/toastHandler";
import { useDashboard } from "../contexts/DashboardContext";
import { DeleteIcon } from "./DeleteUserModal";
import { Icon } from "./Icon";
import { Input } from "./Input";

const iconClass = "h-5 w-5";

export const DuplicateIcon = ({ className }: { className?: string }) => (
  <DocumentDuplicateIcon className={cn(iconClass, className)} />
);

export const UpIcon = ({ className }: { className?: string }) => (
  <ArrowUpIcon className={cn(iconClass, className)} />
);

export const DownIcon = ({ className }: { className?: string }) => (
  <ArrowDownIcon className={cn(iconClass, className)} />
);

const EMPTY_OPTION = "__empty__";

const hostsSchema = z.record(
  z.string().min(1),
  z.array(
    z.object({
      remark: z.string().min(1, "Remark is required"),
      address: z.string().min(1, "Address is required"),
      port: z
        .string()
        .or(z.number())
        .nullable()
        .transform((value) => {
          if (typeof value === "number") return value;
          if (value !== null && !isNaN(parseInt(value)))
            return Number(parseInt(value));
          return null;
        }),
      path: z.string().nullable(),
      sni: z.string().nullable(),
      host: z.string().nullable(),
      mux_enable: z.boolean().default(false),
      allowinsecure: z.boolean().nullable().default(false),
      is_disabled: z.boolean().default(true),
      fragment_setting: z.string().nullable(),
      noise_setting: z.string().nullable(),
      random_user_agent: z.boolean().default(false),
      security: z.string(),
      alpn: z.string(),
      fingerprint: z.string(),
      use_sni_as_host: z.boolean().default(false),
      vless_encryption: z.string().nullable().default(""),
      xhttp_mode: z.string().nullable().default(""),
      xhttp_extra: z.string().nullable().default(""),
      finalmask: z.string().nullable().default(""),
    })
  )
);

type HostValues = z.infer<typeof hostsSchema>;

type HostFieldError = { message?: string };

const fieldMessage = (
  errors: Record<string, HostFieldError | undefined>[] | undefined,
  index: number,
  key: string
) => errors?.[index]?.[key]?.message;

const hostFieldErrors = (
  errors: FieldErrors<HostValues>,
  hostKey: string
): Record<string, HostFieldError | undefined>[] | undefined => {
  const entry = errors[hostKey];
  if (!Array.isArray(entry)) return undefined;
  return entry as unknown as Record<string, HostFieldError | undefined>[];
};

const InfoButton = ({ children }: { children: ReactNode }) => (
  <Popover>
    <PopoverTrigger asChild>
      <button type="button" className="inline-flex" aria-label="info">
        <InformationCircleIcon className="h-4 w-4 cursor-pointer text-gray-400" />
      </button>
    </PopoverTrigger>
    <PopoverContent side="right" className="w-80 text-xs">
      {children}
    </PopoverContent>
  </Popover>
);

const VariableHints = () => {
  const { t } = useTranslation();
  const rows: { token: string; label: string }[] = [
    { token: "SERVER_IP", label: t("hostsDialog.currentServer") },
    { token: "SERVER_IPV6", label: t("hostsDialog.currentServerv6") },
    { token: "USERNAME", label: t("hostsDialog.username") },
    { token: "DATA_USAGE", label: t("hostsDialog.dataUsage") },
    { token: "DATA_LEFT", label: t("hostsDialog.remainingData") },
    { token: "DATA_LIMIT", label: t("hostsDialog.dataLimit") },
    { token: "DAYS_LEFT", label: t("hostsDialog.remainingDays") },
    { token: "EXPIRE_DATE", label: t("hostsDialog.expireDate") },
    { token: "JALALI_EXPIRE_DATE", label: t("hostsDialog.jalaliExpireDate") },
    { token: "TIME_LEFT", label: t("hostsDialog.remainingTime") },
    { token: "STATUS_TEXT", label: t("hostsDialog.statusText") },
    { token: "STATUS_EMOJI", label: t("hostsDialog.statusEmoji") },
    { token: "PROTOCOL", label: t("hostsDialog.proxyProtocol") },
    { token: "TRANSPORT", label: t("hostsDialog.proxyMethod") },
  ];
  return (
    <div className="space-y-1 text-xs">
      <p className="pr-5">{t("hostsDialog.desc")}</p>
      {rows.map((row) => (
        <p key={row.token}>
          <Badge variant="secondary">
            {"{"}
            {row.token}
            {"}"}
          </Badge>{" "}
          {row.label}
        </p>
      ))}
    </div>
  );
};

const HostWildcardHints = () => (
  <>
    <p className="mt-2 text-xs">
      <Trans
        i18nKey="hostsDialog.host.wildcard"
        components={{ badge: <Badge variant="secondary" /> }}
      />
    </p>
    <p className="text-xs">
      <Trans
        i18nKey="hostsDialog.host.multiHost"
        components={{ badge: <Badge variant="secondary" /> }}
      />
    </p>
  </>
);

const FieldLabel = ({
  label,
  info,
}: {
  label: string;
  info?: ReactNode;
}) => (
  <div className="mb-1 flex items-center justify-between gap-1">
    <Label>{label}</Label>
    {info}
  </div>
);

const HostSelect = ({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { title: string; value: string }[];
}) => (
  <Select
    value={value ? value : EMPTY_OPTION}
    onValueChange={(next) => onChange(next === EMPTY_OPTION ? "" : next)}
  >
    <SelectTrigger className="h-9 bg-white dark:bg-gray-700">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {options.map((option) => (
        <SelectItem
          key={option.value || EMPTY_OPTION}
          value={option.value === "" ? EMPTY_OPTION : option.value}
        >
          {option.title || "—"}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

const CheckRow = ({
  checked,
  onCheckedChange,
  label,
  error,
}: {
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  label: string;
  error?: string;
}) => (
  <div className="w-full">
    <label className="inbound-item flex w-full cursor-pointer items-center gap-2 text-sm">
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <span className="w-full">{label}</span>
    </label>
    {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
  </div>
);

type AccordionInboundType = {
  hostKey: string;
  index: number;
  isOpen: boolean;
  toggleAccordion: () => void;
};

const AccordionInbound: FC<AccordionInboundType> = ({
  hostKey,
  index: inboundIndex,
  isOpen,
  toggleAccordion,
}) => {
  const { inbounds } = useDashboard();
  const inbound = [...inbounds.values()]
    .flat()
    .filter((item) => item.tag === hostKey)[0];
  const form = useFormContext<HostValues>();
  const {
    fields: hosts,
    append: addHost,
    remove: removeHost,
    insert: insertHost,
    move: moveHost,
  } = useFieldArray({
    control: form.control,
    name: hostKey as never,
  });
  const { errors } = form.formState;
  const { t } = useTranslation();
  const accordionErrors = hostFieldErrors(errors, hostKey);

  const handleAddHost = () => {
    addHost({
      host: "",
      sni: "",
      port: null,
      path: null,
      address: "",
      remark: "",
      mux_enable: false,
      allowinsecure: false,
      is_disabled: false,
      fragment_setting: "",
      noise_setting: "",
      random_user_agent: false,
      security: "inbound_default",
      alpn: "",
      fingerprint: "",
      use_sni_as_host: false,
      vless_encryption: "",
      xhttp_mode: "",
      xhttp_extra: "",
      finalmask: "",
    } as never);
  };

  const duplicateHost = (index: number) => {
    if (index < 0 || index >= hosts.length) return;
    insertHost(index + 1, hosts[index] as never);
  };

  useEffect(() => {
    if (accordionErrors && !isOpen) {
      toggleAccordion();
    }
  }, [accordionErrors]);

  const moveHostPosition = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index > 0) {
      moveHost(index, index - 1);
    } else if (direction === "down" && index < hosts.length - 1) {
      moveHost(index, index + 1);
    }
  };

  const path = (index: number, key: string) =>
    `${hostKey}.${index}.${key}` as never;

  return (
    <AccordionItem
      value={String(inboundIndex)}
      className="w-full rounded border border-gray-200 p-1 dark:border-gray-600"
    >
      <AccordionTrigger className="rounded-sm px-2 py-2 hover:no-underline">
        <span className="flex-1 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
          {hostKey}
        </span>
      </AccordionTrigger>
      <AccordionContent className="px-2 pb-2">
        <div className="flex flex-col gap-3">
          {hosts.map((host, index) => {
            const remarkError = fieldMessage(accordionErrors, index, "remark");
            const addressError = fieldMessage(accordionErrors, index, "address");
            return (
              <div key={host.id} id={host.id} className="w-full">
                <div
                  id={host.id}
                  className="flex w-full flex-col gap-3 rounded border border-gray-200 bg-[#fcfbfb] p-2 dark:border-gray-600 dark:bg-[#273142]"
                >
                  <Input
                    placeholder="Remark"
                    className="h-9"
                    endAdornment={
                      <InfoButton>
                        <VariableHints />
                      </InfoButton>
                    }
                    error={remarkError}
                    {...form.register(path(index, "remark"))}
                  />
                  <Input
                    placeholder="Address (e.g. example.com)"
                    className="h-9"
                    endAdornment={
                      <InfoButton>
                        <VariableHints />
                      </InfoButton>
                    }
                    error={addressError}
                    {...form.register(path(index, "address"))}
                  />

                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="advanced" className="border-0">
                      <div className="flex items-center">
                        <AccordionTrigger className="w-auto flex-none justify-start gap-1 px-1 py-1 hover:no-underline">
                          <span className="text-xs text-gray-600 dark:text-gray-500">
                            {t("hostsDialog.advancedOptions")}
                          </span>
                        </AccordionTrigger>
                        <Controller
                          control={form.control}
                          name={path(index, "is_disabled")}
                          render={({ field }) => (
                            <Switch
                              className="mx-1.5"
                              checked={!field.value}
                              onCheckedChange={(checked) =>
                                field.onChange(!checked)
                              }
                            />
                          )}
                        />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              aria-label="Delete"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive"
                              onClick={removeHost.bind(null, index)}
                            >
                              <DeleteIcon />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              aria-label="Duplicate"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => duplicateHost(index)}
                            >
                              <DuplicateIcon />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Duplicate</TooltipContent>
                        </Tooltip>
                        {index < hosts.length - 1 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                aria-label="DownIcon"
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => moveHostPosition(index, "down")}
                              >
                                <DownIcon />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Move Down</TooltipContent>
                          </Tooltip>
                        )}
                        {index > 0 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                aria-label="UpIcon"
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => moveHostPosition(index, "up")}
                              >
                                <UpIcon />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Move Up</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      <AccordionContent className="p-1">
                        <div className="flex w-full flex-col gap-3">
                          <div>
                            <FieldLabel
                              label={t("hostsDialog.port")}
                              info={
                                <InfoButton>
                                  <p className="pr-5 text-xs">
                                    {t("hostsDialog.port.info")}
                                  </p>
                                </InfoButton>
                              }
                            />
                            <Input
                              className="h-9"
                              placeholder={String(inbound?.port || "8080")}
                              type="number"
                              {...form.register(path(index, "port"))}
                            />
                          </div>
                          <div>
                            <FieldLabel
                              label={t("hostsDialog.sni")}
                              info={
                                <InfoButton>
                                  <p className="pr-5 text-xs">
                                    {t("hostsDialog.sni.info")}
                                  </p>
                                  <HostWildcardHints />
                                </InfoButton>
                              }
                            />
                            <Input
                              className="h-9"
                              placeholder="SNI (e.g. example.com)"
                              error={fieldMessage(accordionErrors, index, "sni")}
                              {...form.register(path(index, "sni"))}
                            />
                          </div>
                          <div>
                            <FieldLabel
                              label={t("hostsDialog.host")}
                              info={
                                <InfoButton>
                                  <p className="pr-5 text-xs">
                                    {t("hostsDialog.host.info")}
                                  </p>
                                  <HostWildcardHints />
                                </InfoButton>
                              }
                            />
                            <Input
                              className="h-9"
                              placeholder="Host (e.g. example.com)"
                              error={fieldMessage(accordionErrors, index, "host")}
                              {...form.register(path(index, "host"))}
                            />
                          </div>
                          <div>
                            <FieldLabel
                              label={t("hostsDialog.path")}
                              info={
                                <InfoButton>
                                  <p className="pr-5 text-xs">
                                    {t("hostsDialog.path.info")}
                                  </p>
                                </InfoButton>
                              }
                            />
                            <Input
                              className="h-9"
                              placeholder="path (e.g. /vless)"
                              error={fieldMessage(accordionErrors, index, "path")}
                              {...form.register(path(index, "path"))}
                            />
                          </div>
                          <div>
                            <FieldLabel
                              label={t("hostsDialog.security")}
                              info={
                                <InfoButton>
                                  <p className="pr-5 text-xs">
                                    {t("hostsDialog.security.info")}
                                  </p>
                                </InfoButton>
                              }
                            />
                            <Controller
                              control={form.control}
                              name={path(index, "security")}
                              render={({ field }) => (
                                <HostSelect
                                  value={field.value || ""}
                                  onChange={field.onChange}
                                  options={proxyHostSecurity}
                                />
                              )}
                            />
                          </div>
                          <div>
                            <FieldLabel label={t("hostsDialog.alpn")} />
                            <Controller
                              control={form.control}
                              name={path(index, "alpn")}
                              render={({ field }) => (
                                <HostSelect
                                  value={field.value || ""}
                                  onChange={field.onChange}
                                  options={proxyALPN}
                                />
                              )}
                            />
                          </div>
                          <div>
                            <FieldLabel label={t("hostsDialog.fingerprint")} />
                            <Controller
                              control={form.control}
                              name={path(index, "fingerprint")}
                              render={({ field }) => (
                                <HostSelect
                                  value={field.value || ""}
                                  onChange={field.onChange}
                                  options={proxyFingerprint}
                                />
                              )}
                            />
                          </div>
                          <div>
                            <FieldLabel
                              label={t("hostsDialog.fragment")}
                              info={
                                <InfoButton>
                                  <p className="pr-5 text-xs">
                                    {t("hostsDialog.fragment.info")}
                                  </p>
                                  <p className="pb-1 pr-5 pt-2 text-xs">
                                    {t("hostsDialog.fragment.info.examples")}
                                  </p>
                                  <p className="pr-5 text-xs">100-200,10-20,tlshello</p>
                                  <p className="pr-5 text-xs">100-200,10-20,1-3</p>
                                  <p className="pr-5 pt-3 text-xs">
                                    {t("hostsDialog.fragment.info.attention")}
                                  </p>
                                </InfoButton>
                              }
                            />
                            <Input
                              className="h-9"
                              placeholder="Fragment settings by pattern"
                              error={fieldMessage(
                                accordionErrors,
                                index,
                                "fragment_setting"
                              )}
                              {...form.register(path(index, "fragment_setting"))}
                            />
                          </div>
                          <div>
                            <FieldLabel
                              label={t("hostsDialog.noise")}
                              info={
                                <InfoButton>
                                  <p className="pr-5 text-xs">
                                    {t("hostsDialog.noise.info")}
                                  </p>
                                  <p className="pb-1 pr-5 pt-2 text-xs">
                                    {t("hostsDialog.noise.info.examples")}
                                  </p>
                                  <p className="pr-5 text-xs">rand:10-20,10-20</p>
                                  <p className="pr-5 text-xs">
                                    rand:10-20,10-20&base64:7nQBAAABAAAAAAAABnQtcmluZwZtc2VkZ2UDbmV0AAABAAE=,10-25
                                  </p>
                                  <p className="pr-5 pt-3 text-xs">
                                    {t("hostsDialog.noise.info.attention")}
                                  </p>
                                </InfoButton>
                              }
                            />
                            <Input
                              className="h-9"
                              placeholder="Noise settings by pattern"
                              error={fieldMessage(
                                accordionErrors,
                                index,
                                "noise_setting"
                              )}
                              {...form.register(path(index, "noise_setting"))}
                            />
                          </div>
                          <Controller
                            control={form.control}
                            name={path(index, "use_sni_as_host")}
                            render={({ field }) => (
                              <CheckRow
                                checked={!!field.value}
                                onCheckedChange={field.onChange}
                                label={t("hostsDialog.useSniAsHost")}
                                error={fieldMessage(
                                  accordionErrors,
                                  index,
                                  "use_sni_as_host"
                                )}
                              />
                            )}
                          />
                          <Controller
                            control={form.control}
                            name={path(index, "allowinsecure")}
                            render={({ field }) => (
                              <CheckRow
                                checked={!!field.value}
                                onCheckedChange={field.onChange}
                                label={t("hostsDialog.allowinsecure")}
                                error={fieldMessage(
                                  accordionErrors,
                                  index,
                                  "allowinsecure"
                                )}
                              />
                            )}
                          />
                          <Controller
                            control={form.control}
                            name={path(index, "mux_enable")}
                            render={({ field }) => (
                              <CheckRow
                                checked={!!field.value}
                                onCheckedChange={field.onChange}
                                label={t("hostsDialog.muxEnable")}
                                error={fieldMessage(
                                  accordionErrors,
                                  index,
                                  "mux_enable"
                                )}
                              />
                            )}
                          />
                          <Controller
                            control={form.control}
                            name={path(index, "random_user_agent")}
                            render={({ field }) => (
                              <CheckRow
                                checked={!!field.value}
                                onCheckedChange={field.onChange}
                                label={t("hostsDialog.randomUserAgent")}
                                error={fieldMessage(
                                  accordionErrors,
                                  index,
                                  "random_user_agent"
                                )}
                              />
                            )}
                          />
                          {inbound?.protocol === "vless" && (
                            <div>
                              <Label className="mb-1 block">
                                {t("hostsDialog.vlessEncryption")}
                              </Label>
                              <Input
                                className="h-9"
                                error={fieldMessage(
                                  accordionErrors,
                                  index,
                                  "vless_encryption"
                                )}
                                {...form.register(path(index, "vless_encryption"))}
                              />
                              <p className="mt-1 text-xs text-muted-foreground">
                                {t("hostsDialog.vlessEncryptionInfo")}
                              </p>
                              {inbound.vless_encryption_required && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {t("hostsDialog.vlessEncryptionRequired")}
                                </p>
                              )}
                            </div>
                          )}
                          {(inbound?.network === "xhttp" ||
                            inbound?.network === "splithttp") && (
                            <>
                              <div>
                                <Label className="mb-1 block">
                                  {t("hostsDialog.xhttpMode")}
                                </Label>
                                <Controller
                                  control={form.control}
                                  name={path(index, "xhttp_mode")}
                                  render={({ field }) => (
                                    <HostSelect
                                      value={field.value || ""}
                                      onChange={field.onChange}
                                      options={[
                                        {
                                          title: t("hostsDialog.xhttpInherit"),
                                          value: "",
                                        },
                                        { title: "auto", value: "auto" },
                                        { title: "packet-up", value: "packet-up" },
                                        { title: "stream-up", value: "stream-up" },
                                        {
                                          title: "stream-one",
                                          value: "stream-one",
                                        },
                                      ]}
                                    />
                                  )}
                                />
                              </div>
                              <div>
                                <Label className="mb-1 block">
                                  {t("hostsDialog.xhttpExtra")}
                                </Label>
                                <Textarea
                                  rows={5}
                                  {...form.register(path(index, "xhttp_extra"))}
                                />
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {t("hostsDialog.xhttpExtraInfo")}
                                </p>
                                {fieldMessage(
                                  accordionErrors,
                                  index,
                                  "xhttp_extra"
                                ) && (
                                  <p className="mt-1 text-sm text-destructive">
                                    {fieldMessage(
                                      accordionErrors,
                                      index,
                                      "xhttp_extra"
                                    )}
                                  </p>
                                )}
                              </div>
                            </>
                          )}
                          <div>
                            <Label className="mb-1 block">
                              {t("hostsDialog.finalmask")}
                            </Label>
                            <Textarea
                              rows={5}
                              {...form.register(path(index, "finalmask"))}
                            />
                            <p className="mt-1 text-xs text-muted-foreground">
                              {t("hostsDialog.finalmaskInfo")}
                            </p>
                            {fieldMessage(accordionErrors, index, "finalmask") && (
                              <p className="mt-1 text-sm text-destructive">
                                {fieldMessage(accordionErrors, index, "finalmask")}
                              </p>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">
                            {t("hostsDialog.modernXrayCompatibility")}
                          </p>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full font-normal"
            onClick={handleAddHost}
          >
            {t("hostsDialog.addHost")}
          </Button>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};

export const HostsDialog: FC = () => {
  const { isEditingHosts, onEditingHosts, refetchUsers, inbounds } =
    useDashboard();
  const { isLoading, hosts, fetchHosts, isPostLoading, setHosts } = useHosts();
  const { t } = useTranslation();
  const [openAccordions, setOpenAccordions] = useState<Record<string, object>>(
    {}
  );

  useEffect(() => {
    if (isEditingHosts) fetchHosts();
  }, [isEditingHosts]);

  const form = useForm<HostValues>({
    resolver: zodResolver(hostsSchema),
  });

  useEffect(() => {
    if (hosts && isEditingHosts) {
      const converted = Object.fromEntries(
        Object.entries(hosts).map(([tag, list]) => [
          tag,
          list.map((host) => ({
            ...host,
            vless_encryption: host.vless_encryption ?? "",
            xhttp_mode: host.xhttp_mode ?? "",
            xhttp_extra:
              host.xhttp_extra == null
                ? ""
                : JSON.stringify(host.xhttp_extra, null, 2),
            finalmask:
              host.finalmask == null
                ? ""
                : JSON.stringify(host.finalmask, null, 2),
          })),
        ])
      );
      form.reset(converted as HostValues);
    }
  }, [hosts]);

  const onClose = () => {
    setOpenAccordions({});
    onEditingHosts(false);
  };

  const handleFormSubmit = (values: HostValues) => {
    let invalid = false;
    const payload = Object.fromEntries(
      Object.entries(values).map(([tag, list]) => {
        const inbound = [...inbounds.values()]
          .flat()
          .find((item) => item.tag === tag);
        return [
          tag,
          list.map((host, index) => {
            const encryption = host.vless_encryption?.trim()
              ? host.vless_encryption.trim()
              : null;
            const mode = host.xhttp_mode?.trim() ? host.xhttp_mode : null;
            let extra: Record<string, unknown> | null = null;
            const raw = host.xhttp_extra?.trim() ?? "";
            if (raw) {
              try {
                const parsed = JSON.parse(raw);
                if (
                  !parsed ||
                  typeof parsed !== "object" ||
                  Array.isArray(parsed)
                ) {
                  invalid = true;
                  form.setError(`${tag}.${index}.xhttp_extra` as never, {
                    message: t("hostsDialog.xhttpExtraInvalid"),
                  });
                } else {
                  extra = parsed;
                }
              } catch {
                invalid = true;
                form.setError(`${tag}.${index}.xhttp_extra` as never, {
                  message: t("hostsDialog.xhttpExtraInvalid"),
                });
              }
            }
            let mask: Record<string, unknown> | null = null;
            const rawMask = host.finalmask?.trim() ?? "";
            if (rawMask) {
              try {
                const parsed = JSON.parse(rawMask);
                if (
                  !parsed ||
                  typeof parsed !== "object" ||
                  Array.isArray(parsed)
                ) {
                  invalid = true;
                  form.setError(`${tag}.${index}.finalmask` as never, {
                    message: t("hostsDialog.finalmaskInvalid"),
                  });
                } else {
                  mask = parsed;
                }
              } catch {
                invalid = true;
                form.setError(`${tag}.${index}.finalmask` as never, {
                  message: t("hostsDialog.finalmaskInvalid"),
                });
              }
            }
            if (
              inbound?.protocol === "vless" &&
              inbound.vless_encryption_required &&
              !host.is_disabled &&
              (!encryption || encryption === "none")
            ) {
              invalid = true;
              form.setError(`${tag}.${index}.vless_encryption` as never, {
                message: t("hostsDialog.vlessEncryptionRequired"),
              });
            }
            return {
              ...host,
              vless_encryption: encryption,
              xhttp_mode: mode,
              xhttp_extra: extra,
              finalmask: mask,
            };
          }),
        ];
      })
    );
    if (invalid) return;
    setHosts(payload)
      .then(() => {
        generateSuccessMessage(t("hostsDialog.savedSuccess"));
        refetchUsers();
      })
      .catch((err) => {
        generateErrorMessage(err, form);
      });
  };

  const toggleAccordion = (index: number) => {
    const key = String(index);
    if (openAccordions[key]) {
      const next = { ...openAccordions };
      delete next[key];
      setOpenAccordions(next);
      return;
    }
    setOpenAccordions({ ...openAccordions, [key]: {} });
  };

  return (
    <Dialog
      open={isEditingHosts}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <Icon color="primary">
            <LinkIcon className="h-5 w-5" />
          </Icon>
          <DialogTitle className="text-sm font-medium opacity-80">
            {t("hostsDialog.title")}
          </DialogTitle>
        </DialogHeader>
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)}>
            {isLoading && t("hostsDialog.loading")}
            {!isLoading &&
              hosts &&
              (Object.keys(hosts).length > 0 ? (
                <Accordion
                  type="multiple"
                  className="w-full"
                  value={Object.keys(openAccordions)}
                  onValueChange={(values) => {
                    const next: Record<string, object> = {};
                    values.forEach((value) => {
                      next[value] = {};
                    });
                    setOpenAccordions(next);
                  }}
                >
                  <div className="flex w-full flex-col gap-2">
                    {Object.keys(hosts).map((hostKey, index) => (
                      <AccordionInbound
                        toggleAccordion={() => toggleAccordion(index)}
                        isOpen={!!openAccordions[String(index)]}
                        key={hostKey}
                        hostKey={hostKey}
                        index={index}
                      />
                    ))}
                  </div>
                </Accordion>
              ) : (
                "No inbound found. Please check your Xray config file."
              ))}
            <div className="flex justify-end py-2">
              <Button
                type="submit"
                size="sm"
                className="mt-2 px-5"
                disabled={isPostLoading}
              >
                {isPostLoading && (
                  <svg
                    className="mr-2 h-4 w-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
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
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                    />
                  </svg>
                )}
                {t("hostsDialog.apply")}
              </Button>
            </div>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
};
