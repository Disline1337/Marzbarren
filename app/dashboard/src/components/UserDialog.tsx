import {
  ChartPieIcon,
  ExclamationTriangleIcon,
  PencilIcon,
  UserPlusIcon,
} from "@heroicons/react/24/outline";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "components/ui/button";
import { Label } from "components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "components/ui/select";
import { Switch } from "components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "components/ui/dialog";
import { resetStrategy } from "constants/UserSettings";
import { FilterUsageType, useDashboard } from "contexts/DashboardContext";
import dayjs from "dayjs";
import classNames from "classnames";
import { useTheme } from "next-themes";
import { FC, useEffect, useState } from "react";
import ReactApexChart from "react-apexcharts";
import ReactDatePicker from "react-datepicker";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  ProxyKeys,
  ProxyType,
  User,
  UserCreate,
  UserInbounds,
} from "types/User";
import { relativeExpiryDate } from "utils/dateFormatter";
import { generateSuccessMessage } from "utils/toastHandler";
import { z } from "zod";
import { DeleteIcon } from "./DeleteUserModal";
import { ReloadIcon } from "./Filters";
import { HwidDevices } from "./HwidDevices";
import { Icon } from "./Icon";
import { Input } from "./Input";
import { RadioGroup } from "./RadioGroup";
import { Textarea } from "./Textarea";
import { UsageFilter, createUsageConfig } from "./UsageFilter";

export type UserDialogProps = {};

export type FormType = Pick<UserCreate, keyof UserCreate> & {
  selected_proxies: ProxyKeys;
};

const formatUser = (user: User): FormType => {
  return {
    ...user,
    data_limit: user.data_limit
      ? Number((user.data_limit / 1073741824).toFixed(5))
      : user.data_limit,
    on_hold_expire_duration: user.on_hold_expire_duration
      ? Number(user.on_hold_expire_duration / (24 * 60 * 60))
      : user.on_hold_expire_duration,
    selected_proxies: Object.keys(user.proxies) as ProxyKeys,
  };
};
const getDefaultValues = (): FormType => {
  const defaultInbounds = Object.fromEntries(useDashboard.getState().inbounds);
  const inbounds: UserInbounds = {};
  for (const key in defaultInbounds) {
    inbounds[key] = defaultInbounds[key].map((i) => i.tag);
  }
  return {
    selected_proxies: Object.keys(defaultInbounds) as ProxyKeys,
    data_limit: null,
    expire: null,
    username: "",
    data_limit_reset_strategy: "no_reset",
    status: "active",
    on_hold_expire_duration: null,
    note: "",
    hwid_device_limit: null,
    inbounds,
    proxies: {
      vless: { id: "", flow: "" },
      vmess: { id: "" },
      trojan: { password: "" },
      shadowsocks: { password: "", method: "chacha20-ietf-poly1305" },
      hysteria: { auth: "" },
    },
  };
};

const mergeProxies = (
  proxyKeys: ProxyKeys,
  proxyType: ProxyType | undefined
): ProxyType => {
  const proxies: ProxyType = proxyKeys.reduce(
    (ac, a) => ({ ...ac, [a]: {} }),
    {}
  );
  if (!proxyType) return proxies;
  proxyKeys.forEach((proxy) => {
    if (proxyType[proxy]) {
      proxies[proxy] = proxyType[proxy];
    }
  });
  return proxies;
};

const baseSchema = {
  username: z.string().min(1, { message: "Required" }),
  selected_proxies: z.array(z.string()).refine((value) => value.length > 0, {
    message: "userDialog.selectOneProtocol",
  }),
  note: z.string().nullable(),
  proxies: z
    .record(z.string(), z.record(z.string(), z.any()))
    .transform((ins) => {
      const deleteIfEmpty = (obj: unknown, key: string) => {
        if (!obj || typeof obj !== "object" || !(key in obj)) return;
        const record = obj as Record<string, unknown>;
        if (record[key] === "") delete record[key];
      };
      deleteIfEmpty(ins.vmess, "id");
      deleteIfEmpty(ins.vless, "id");
      deleteIfEmpty(ins.trojan, "password");
      deleteIfEmpty(ins.shadowsocks, "password");
      deleteIfEmpty(ins.shadowsocks, "method");
      deleteIfEmpty(ins.hysteria, "auth");
      return ins;
    }),
  data_limit: z
    .string()
    .min(0)
    .or(z.number())
    .nullable()
    .transform((str) => {
      if (str) return Number((parseFloat(String(str)) * 1073741824).toFixed(5));
      return 0;
    }),
  expire: z.number().nullable(),
  data_limit_reset_strategy: z.string(),
  inbounds: z.record(z.string(), z.array(z.string())).transform((ins) => {
    Object.keys(ins).forEach((protocol) => {
      if (Array.isArray(ins[protocol]) && !ins[protocol]?.length)
        delete ins[protocol];
    });
    return ins;
  }),
  hwid_device_limit: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v) => {
      if (v === "" || v === undefined || v === null) return null;
      return Number(v);
    })
    .refine((v) => v === null || (Number.isSafeInteger(v) && v >= 0), {
      message: "userDialog.hwidInvalidLimit",
    }),
};

const schema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("active"),
    ...baseSchema,
  }),
  z.object({
    status: z.literal("disabled"),
    ...baseSchema,
  }),
  z.object({
    status: z.literal("limited"),
    ...baseSchema,
  }),
  z.object({
    status: z.literal("expired"),
    ...baseSchema,
  }),
  z.object({
    status: z.literal("on_hold"),
    on_hold_expire_duration: z.coerce
      .number()
      .min(0.1, "Required")
      .transform((d) => {
        return d * (24 * 60 * 60);
      }),
    ...baseSchema,
  }),
]);

const ErrorAlert = ({
  error,
  className,
}: {
  error: string;
  className?: string;
}) => (
  <div
    className={classNames(
      "flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive",
      className
    )}
  >
    <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
    <span>{error}</span>
  </div>
);

export const UserDialog: FC<UserDialogProps> = () => {
  const {
    editingUser,
    isCreatingNewUser,
    onCreateUser,
    editUser,
    fetchUserUsage,
    onEditingUser,
    createUser,
    onDeletingUser,
  } = useDashboard();
  const isEditing = !!editingUser;
  const isOpen = isCreatingNewUser || isEditing;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>("");
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const colorMode = theme === "dark" ? "dark" : "light";

  const [usageVisible, setUsageVisible] = useState(false);
  const handleUsageToggle = () => {
    setUsageVisible((current) => !current);
  };

  const form = useForm<FormType>({
    defaultValues: getDefaultValues(),
    resolver: zodResolver(schema),
  });

  useEffect(
    () =>
      useDashboard.subscribe(
        (state) => state.inbounds,
        () => {
          form.reset(getDefaultValues());
        }
      ),
    []
  );

  const [dataLimit, userStatus] = useWatch({
    control: form.control,
    name: ["data_limit", "status"],
  });

  const usageTitle = t("userDialog.total");
  const [usage, setUsage] = useState(createUsageConfig(colorMode, usageTitle));
  const [usageFilter, setUsageFilter] = useState("1m");
  const fetchUsageWithFilter = (query: FilterUsageType) => {
    fetchUserUsage(editingUser!, query).then((data: unknown) => {
      const usages =
        data &&
        typeof data === "object" &&
        "usages" in data &&
        data.usages &&
        typeof data.usages === "object"
          ? (data.usages as Record<
              string,
              { used_traffic: number; node_name: string }
            >)
          : {};
      const labels = [];
      const series = [];
      for (const key in usages) {
        series.push(usages[key].used_traffic);
        labels.push(usages[key].node_name);
      }
      setUsage(createUsageConfig(colorMode, usageTitle, series, labels));
    });
  };

  useEffect(() => {
    if (editingUser) {
      form.reset(formatUser(editingUser));

      fetchUsageWithFilter({
        start: dayjs().utc().subtract(30, "day").format("YYYY-MM-DDTHH:00:00"),
      });
    }
  }, [editingUser]);

  const submit = (values: FormType) => {
    setLoading(true);
    const methods = { edited: editUser, created: createUser };
    const method = isEditing ? "edited" : "created";
    setError(null);

    const { selected_proxies, ...rest } = values;

    let body: UserCreate = {
      ...rest,
      data_limit: values.data_limit,
      proxies: mergeProxies(selected_proxies, values.proxies),
      data_limit_reset_strategy:
        values.data_limit && values.data_limit > 0
          ? values.data_limit_reset_strategy
          : "no_reset",
      status:
        values.status === "active" ||
        values.status === "disabled" ||
        values.status === "on_hold"
          ? values.status
          : "active",
    };

    methods[method](body)
      .then(() => {
        generateSuccessMessage(
          t(isEditing ? "userDialog.userEdited" : "userDialog.userCreated", {
            username: values.username,
          })
        );
        onClose();
      })
      .catch((err) => {
        if (err?.response?.status === 409 || err?.response?.status === 400)
          setError(err?.response?._data?.detail);
        if (err?.response?.status === 422) {
          Object.keys(err.response._data.detail).forEach((key) => {
            setError(err?.response._data.detail[key] as string);
            form.setError(
              key as "proxies" | "username" | "data_limit" | "expire",
              {
                type: "custom",
                message: err.response._data.detail[key],
              }
            );
          });
        }
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const onClose = () => {
    form.reset(getDefaultValues());
    onCreateUser(false);
    onEditingUser(null);
    setError(null);
    setUsageVisible(false);
    setUsageFilter("1m");
  };

  const handleResetUsage = () => {
    useDashboard.setState({ resetUsageUser: editingUser });
  };

  const handleRevokeSubscription = () => {
    useDashboard.setState({ revokeSubscriptionUser: editingUser });
  };

  const disabled = loading;
  const isOnHold = userStatus === "on_hold";

  const [randomUsernameLoading, setrandomUsernameLoading] = useState(false);

  const createRandomUsername = (): string => {
    setrandomUsernameLoading(true);
    let result = "";
    const characters =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < 6) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
      counter += 1;
    }
    return result;
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-4xl">
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(submit)}>
            <DialogHeader>
              <DialogTitle className="flex flex-row items-center gap-2">
                <Icon color="primary">
                  {isEditing ? (
                    <PencilIcon className="h-5 w-5 text-white" />
                  ) : (
                    <UserPlusIcon className="h-5 w-5 text-white" />
                  )}
                </Icon>
                <span>
                  {isEditing
                    ? t("userDialog.editUserTitle")
                    : t("createNewUser")}
                </span>
              </DialogTitle>
            </DialogHeader>
            <div className="mt-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <div className="flex flex-col justify-between gap-4">
                    <div className="flex w-full flex-col">
                      <div className="flex w-full flex-row gap-2">
                        <div className="mb-2.5 w-full">
                          <Label className="mb-2 flex items-center gap-2">
                            {t("username")}
                            {!isEditing && (
                              <ReloadIcon
                                className={classNames("cursor-pointer", {
                                  "animate-spin": randomUsernameLoading,
                                })}
                                onClick={() => {
                                  const randomUsername = createRandomUsername();
                                  form.setValue("username", randomUsername);
                                  setTimeout(() => {
                                    setrandomUsernameLoading(false);
                                  }, 350);
                                }}
                              />
                            )}
                          </Label>
                          <div className="flex flex-row items-center gap-2">
                            <Input
                              type="text"
                              error={form.formState.errors.username?.message}
                              disabled={disabled || isEditing}
                              {...form.register("username")}
                            />
                            {isEditing && (
                              <div className="flex items-center px-1">
                                <Controller
                                  name="status"
                                  control={form.control}
                                  render={({ field }) => {
                                    return (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="inline-flex capitalize">
                                            <Switch
                                              checked={field.value === "active"}
                                              onCheckedChange={(checked) => {
                                                field.onChange(
                                                  checked
                                                    ? "active"
                                                    : "disabled"
                                                );
                                              }}
                                            />
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          {"status: " +
                                            t(`status.${field.value}`)}
                                        </TooltipContent>
                                      </Tooltip>
                                    );
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                        {!isEditing && (
                          <div className="flex-1">
                            <Label className="mb-2 block whitespace-nowrap">
                              {t("userDialog.onHold")}
                            </Label>
                            <Controller
                              name="status"
                              control={form.control}
                              render={({ field }) => {
                                const status = field.value;
                                return (
                                  <Switch
                                    checked={status === "on_hold"}
                                    onCheckedChange={(checked) => {
                                      field.onChange(
                                        checked ? "on_hold" : "active"
                                      );
                                    }}
                                  />
                                );
                              }}
                            />
                          </div>
                        )}
                      </div>
                      <div className="mb-2.5">
                        <Label className="mb-2 block">
                          {t("userDialog.dataLimit")}
                        </Label>
                        <Controller
                          control={form.control}
                          name="data_limit"
                          render={({ field }) => {
                            return (
                              <Input
                                endAdornment="GB"
                                type="number"
                                onChange={field.onChange}
                                disabled={disabled}
                                error={
                                  form.formState.errors.data_limit?.message
                                }
                                value={field.value ? String(field.value) : ""}
                              />
                            );
                          }}
                        />
                      </div>
                      {!!(dataLimit && Number(dataLimit) > 0) && (
                        <div className="mb-2.5 h-[66px] w-full">
                          <Label className="mb-2 block">
                            {t("userDialog.periodicUsageReset")}
                          </Label>
                          <Controller
                            control={form.control}
                            name="data_limit_reset_strategy"
                            render={({ field }) => {
                              return (
                                <Select
                                  value={field.value}
                                  onValueChange={field.onChange}
                                  disabled={disabled}
                                >
                                  <SelectTrigger
                                    className={
                                      disabled ? "bg-muted" : "bg-transparent"
                                    }
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {resetStrategy.map((s) => {
                                      return (
                                        <SelectItem
                                          key={s.value}
                                          value={s.value}
                                        >
                                          {t(
                                            "userDialog.resetStrategy" + s.title
                                          )}
                                        </SelectItem>
                                      );
                                    })}
                                  </SelectContent>
                                </Select>
                              );
                            }}
                          />
                        </div>
                      )}

                      <div className="mb-2.5">
                        <Label className="mb-2 block">
                          {isOnHold
                            ? t("userDialog.onHoldExpireDuration")
                            : t("userDialog.expiryDate")}
                        </Label>

                        {isOnHold && (
                          <Controller
                            control={form.control}
                            name="on_hold_expire_duration"
                            render={({ field }) => {
                              return (
                                <Input
                                  endAdornment="Days"
                                  type="number"
                                  onChange={(event) => {
                                    form.setValue("expire", null);
                                    field.onChange(event);
                                  }}
                                  disabled={disabled}
                                  error={
                                    form.formState.errors
                                      .on_hold_expire_duration?.message
                                  }
                                  value={field.value ? String(field.value) : ""}
                                />
                              );
                            }}
                          />
                        )}
                        {!isOnHold && (
                          <Controller
                            name="expire"
                            control={form.control}
                            render={({ field }) => {
                              function createDateAsUTC(num: number) {
                                return dayjs(
                                  dayjs(num * 1000).utc()
                                  // .format("MMMM D, YYYY") // exception with: dayjs.locale(lng);
                                ).toDate();
                              }
                              const { status, time } = relativeExpiryDate(
                                field.value
                              );
                              return (
                                <>
                                  <ReactDatePicker
                                    locale={i18n.language.toLocaleLowerCase()}
                                    dateFormat={t("dateFormat")}
                                    minDate={new Date()}
                                    selected={
                                      field.value
                                        ? createDateAsUTC(field.value)
                                        : undefined
                                    }
                                    onChange={(date: Date) => {
                                      form.setValue(
                                        "on_hold_expire_duration",
                                        null
                                      );
                                      field.onChange({
                                        target: {
                                          value: date
                                            ? dayjs(
                                                dayjs(date)
                                                  .set("hour", 23)
                                                  .set("minute", 59)
                                                  .set("second", 59)
                                              )
                                                .utc()
                                                .valueOf() / 1000
                                            : 0,
                                          name: "expire",
                                        },
                                      });
                                    }}
                                    customInput={
                                      <Input
                                        type="text"
                                        clearable
                                        disabled={disabled}
                                        error={
                                          form.formState.errors.expire?.message
                                        }
                                      />
                                    }
                                  />
                                  {field.value ? (
                                    <p className="mt-1 text-sm text-muted-foreground">
                                      {t(status, { time: time })}
                                    </p>
                                  ) : (
                                    ""
                                  )}
                                </>
                              );
                            }}
                          />
                        )}
                      </div>

                      <div className="mb-2.5">
                        <Label className="mb-2 block">
                          {t("userDialog.note")}
                        </Label>
                        <Textarea
                          error={form.formState.errors?.note?.message}
                          {...form.register("note")}
                        />
                      </div>

                      <div className="mb-2.5">
                        <Label htmlFor="hwid-device-limit" className="mb-2 block">
                          {t("userDialog.hwidDeviceLimit")}
                        </Label>
                        <Controller
                          control={form.control}
                          name="hwid_device_limit"
                          render={({ field }) => (
                            <Input
                              id="hwid-device-limit"
                              type="number"
                              placeholder={t(
                                "userDialog.hwidDeviceLimitPlaceholder"
                              )}
                              disabled={disabled}
                              value={
                                field.value === null ||
                                field.value === undefined
                                  ? ""
                                  : String(field.value)
                              }
                              onChange={(e) => {
                                const v = e.target.value;
                                field.onChange(v === "" ? null : v);
                              }}
                              error={
                                form.formState.errors.hwid_device_limit
                                  ? t("userDialog.hwidInvalidLimit")
                                  : undefined
                              }
                            />
                          )}
                        />
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t("userDialog.hwidDeviceLimitHelp")}
                        </p>
                      </div>
                    </div>
                    {error && (
                      <ErrorAlert error={error} className="hidden md:flex" />
                    )}
                  </div>
                </div>
                <div>
                  <Label className="mb-2 block">
                    {t("userDialog.protocols")}
                  </Label>
                  <Controller
                    control={form.control}
                    name="selected_proxies"
                    render={({ field }) => {
                      return (
                        <RadioGroup
                          list={[
                            {
                              title: "vmess",
                              description: t("userDialog.vmessDesc"),
                            },
                            {
                              title: "vless",
                              description: t("userDialog.vlessDesc"),
                            },
                            {
                              title: "trojan",
                              description: t("userDialog.trojanDesc"),
                            },
                            {
                              title: "shadowsocks",
                              description: t("userDialog.shadowsocksDesc"),
                            },
                            {
                              title: "hysteria",
                              description: t("userDialog.hysteriaDesc"),
                            },
                          ]}
                          disabled={disabled}
                          {...field}
                        />
                      );
                    }}
                  />
                  {form.formState.errors.selected_proxies?.message && (
                    <p className="mt-1 text-sm text-destructive">
                      {t(
                        form.formState.errors.selected_proxies
                          ?.message as string
                      )}
                    </p>
                  )}
                </div>
                {isEditing && usageVisible && (
                  <div className="pt-6 md:col-span-2">
                    <div className="flex flex-col items-center gap-4">
                      <UsageFilter
                        defaultValue={usageFilter}
                        onChange={(filter, query) => {
                          setUsageFilter(filter);
                          fetchUsageWithFilter(query);
                        }}
                      />
                      <div className="w-full justify-self-center md:w-[70%]">
                        <ReactApexChart
                          options={usage.options}
                          series={usage.series}
                          type="donut"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {isEditing && editingUser?.username && (
                <HwidDevices
                  key={editingUser.username}
                  username={editingUser.username}
                  disabled={disabled}
                  limit={form.watch("hwid_device_limit")}
                />
              )}
              {error && <ErrorAlert error={error} className="mt-3 md:hidden" />}
            </div>
            <DialogFooter className="mt-3 sm:justify-between">
              <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex w-full flex-row flex-wrap items-center justify-start gap-2 sm:w-auto">
                  {isEditing && (
                    <>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label="Delete"
                            onClick={() => {
                              onDeletingUser(editingUser);
                              onClose();
                            }}
                          >
                            <DeleteIcon />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("delete")}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label="usage"
                            onClick={handleUsageToggle}
                          >
                            <ChartPieIcon className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("userDialog.usage")}</TooltipContent>
                      </Tooltip>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleResetUsage}
                      >
                        {t("userDialog.resetUsage")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleRevokeSubscription}
                      >
                        {t("userDialog.revokeSubscription")}
                      </Button>
                    </>
                  )}
                </div>
                <div className="flex w-full justify-end md:max-w-[50%]">
                  <Button
                    type="submit"
                    size="sm"
                    className="px-8"
                    disabled={disabled}
                  >
                    {loading && (
                      <svg
                        className="h-3 w-3 animate-spin"
                        viewBox="0 0 24 24"
                        fill="none"
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
                    {isEditing ? t("userDialog.editUser") : t("createUser")}
                  </Button>
                </div>
              </div>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
};
