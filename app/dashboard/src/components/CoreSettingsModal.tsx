import {
  ArrowPathIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  Bars3BottomLeftIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";
import { joinPaths } from "@remix-run/router";
import classNames from "classnames";
import { Badge } from "components/ui/badge";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "components/ui/tooltip";
import { useCoreSettings } from "contexts/CoreSettingsContext";
import { useDashboard } from "contexts/DashboardContext";
import { useNodesQuery } from "contexts/NodesContext";
import { cn } from "lib/utils";
import debounce from "lodash.debounce";
import { ComponentProps, FC, useCallback, useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useMutation } from "react-query";
import { ReadyState } from "react-use-websocket";
import { useWebSocket } from "react-use-websocket/dist/lib/use-websocket";
import { toast } from "sonner";
import { getAuthToken } from "utils/authStorage";
import { Icon } from "./Icon";
import { JsonEditor, JsonEditorHandle } from "./JsonEditor";

export const MAX_NUMBER_OF_LOGS = 500;

export const ReloadIcon = ({
  className,
  ...props
}: ComponentProps<typeof ArrowPathIcon>) => (
  <ArrowPathIcon className={cn("h-4 w-4", className)} {...props} />
);

export const FullScreenIcon = ({
  className,
  ...props
}: ComponentProps<typeof ArrowsPointingOutIcon>) => (
  <ArrowsPointingOutIcon className={cn("h-4 w-4", className)} {...props} />
);

export const ExitFullScreenIcon = ({
  className,
  ...props
}: ComponentProps<typeof ArrowsPointingInIcon>) => (
  <ArrowsPointingInIcon className={cn("h-3 w-3", className)} {...props} />
);

export const FormatIcon = ({
  className,
  ...props
}: ComponentProps<typeof Bars3BottomLeftIcon>) => (
  <Bars3BottomLeftIcon className={cn("h-4 w-4", className)} {...props} />
);

const Spinner = ({ className }: { className?: string }) => (
  <svg
    className={cn("h-4 w-4 animate-spin", className)}
    viewBox="0 0 24 24"
    fill="none"
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
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
    />
  </svg>
);

const getStatus = (status: string) => {
  return {
    [ReadyState.CONNECTING]: "connecting",
    [ReadyState.OPEN]: "connected",
    [ReadyState.CLOSING]: "closed",
    [ReadyState.CLOSED]: "closed",
    [ReadyState.UNINSTANTIATED]: "closed",
  }[status];
};

const getWebsocketUrl = (nodeID: string) => {
  try {
    let baseURL = new URL(
      import.meta.env.VITE_BASE_API.startsWith("/")
        ? window.location.origin + import.meta.env.VITE_BASE_API
        : import.meta.env.VITE_BASE_API
    );

    return (
      (baseURL.protocol === "https:" ? "wss://" : "ws://") +
      joinPaths([
        baseURL.host + baseURL.pathname,
        !nodeID ? "/core/logs" : `/node/${nodeID}/logs`,
      ]) +
      "?interval=1&token=" +
      getAuthToken()
    );
  } catch (e) {
    console.error("Unable to generate websocket url");
    console.error(e);
    return null;
  }
};

let logsTmp: string[] = [];
function toJsonText(config: unknown): string {
  if (typeof config === "string") {
    return config.trim() ? config : "{\n}";
  }
  return JSON.stringify(config ?? {}, null, 4);
}

const CoreSettingModalContent: FC = () => {
  const { data: nodes } = useNodesQuery();
  const disabled = false;
  const [selectedNode, setNode] = useState<string>("");

  const handleLog = (id: string, title: string) => {
    if (id === selectedNode) return;
    else if (id === "host") {
      setNode("");
      setLogs([]);
    } else {
      setNode(id);
      setLogs([]);
    }
  };

  const { isEditingCore } = useDashboard();
  const {
    fetchCoreSettings,
    updateConfig,
    isLoading,
    config,
    isPostLoading,
    version,
    restartCore,
  } = useCoreSettings();
  const logsDiv = useRef<HTMLDivElement | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const { t } = useTranslation();
  const form = useForm({
    defaultValues: { config: toJsonText(config) },
  });

  useEffect(() => {
    form.setValue("config", toJsonText(config));
  }, [config]);

  useEffect(() => {
    if (isEditingCore) fetchCoreSettings();
  }, [isEditingCore]);
  "".startsWith;
  const scrollShouldStayOnEnd = useRef(true);
  const updateLogs = useCallback(
    debounce((logs: string[]) => {
      const isScrollOnEnd =
        Math.abs(
          (logsDiv.current?.scrollTop || 0) -
            (logsDiv.current?.scrollHeight || 0) +
            (logsDiv.current?.offsetHeight || 0)
        ) < 10;
      if (logsDiv.current && isScrollOnEnd)
        scrollShouldStayOnEnd.current = true;
      else scrollShouldStayOnEnd.current = false;
      if (logs.length < 40) setLogs(logs);
    }, 300),
    []
  );

  const { readyState } = useWebSocket(getWebsocketUrl(selectedNode), {
    onMessage: (e: MessageEvent) => {
      logsTmp.push(e.data);
      if (logsTmp.length > MAX_NUMBER_OF_LOGS)
        logsTmp = logsTmp.splice(0, logsTmp.length - MAX_NUMBER_OF_LOGS);
      updateLogs([...logsTmp]);
    },
    shouldReconnect: () => true,
    reconnectAttempts: 10,
    reconnectInterval: 1000,
  });

  useEffect(() => {
    if (logsDiv.current && scrollShouldStayOnEnd.current)
      logsDiv.current.scrollTop = logsDiv.current?.scrollHeight;
  }, [logs]);

  useEffect(() => {
    return () => {
      logsTmp = [];
    };
  }, []);

  const status = getStatus(readyState.toString());

  const { mutate: handleRestartCore, isLoading: isRestarting } =
    useMutation(restartCore);

  const jsonEditorApiRef = useRef<JsonEditorHandle>(null);
  const handleOnSave = async () => {
    const text = form.getValues("config");
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text);
    } catch {
      toast.error(t("core.invalidJson"), { duration: 3000 });
      return;
    }
    await jsonEditorApiRef.current?.format();
    const formatted = form.getValues("config");
    const body =
      formatted !== text
        ? (JSON.parse(formatted) as Record<string, unknown>)
        : parsed;
    updateConfig(body)
      .then(() => {
        toast.success(t("core.successMessage"), { duration: 3000 });
      })
      .catch((e) => {
        let message = t("core.generalErrorMessage");
        if (typeof e.response._data.detail === "object")
          message =
            e.response._data.detail[Object.keys(e.response._data.detail)[0]];
        if (typeof e.response._data.detail === "string")
          message = e.response._data.detail;

        toast.error(message, { duration: 3000 });
      });
  };
  const editorRef = useRef<HTMLDivElement>(null);
  const [isFullScreen, setFullScreen] = useState(false);
  const handleFullScreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      setFullScreen(false);
    } else {
      editorRef.current?.requestFullscreen();
      setFullScreen(true);
    }
  };
  return (
    <form onSubmit={form.handleSubmit(handleOnSave)}>
      <div className="overflow-visible">
        <div>
          <div className="flex flex-row items-start justify-between gap-2">
            <Label>
              {t("core.configuration")}{" "}
              {isLoading && <Spinner className="inline h-[15px] w-[15px]" />}
            </Label>
            <div className="flex flex-row items-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className="h-full lowercase">
                    {version && `v${version}`}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Xray Version</TooltipContent>
              </Tooltip>
            </div>
          </div>
          <div
            className="relative h-[300px] min-h-[300px] [&:fullscreen]:h-full [&:fullscreen]:min-h-full"
            ref={editorRef}
          >
            <Controller
              control={form.control}
              name="config"
              render={({ field }) => (
                <JsonEditor
                  ref={jsonEditorApiRef}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={t("core.format")}
                  className="absolute right-10 top-2 h-6 w-6"
                  onClick={() => jsonEditorApiRef.current?.format()}
                >
                  <FormatIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("core.format")}</TooltipContent>
            </Tooltip>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="full screen"
              className="absolute right-4 top-2 h-6 w-6"
              onClick={handleFullScreen}
            >
              {!isFullScreen ? <FullScreenIcon /> : <ExitFullScreenIcon />}
            </Button>
          </div>
        </div>
        <div className="mt-4">
          <div
            className="flex flex-row items-center justify-between"
            style={{ paddingBottom: "1rem" }}
          >
            <div className="flex flex-row items-center gap-2">
              {nodes?.[0] && (
                <Select
                  value={selectedNode || "host"}
                  disabled={disabled}
                  onValueChange={(value) => {
                    const node = nodes?.find((s) => String(s.id) === value);
                    handleLog(
                      value,
                      value === "host" ? "Master" : node ? t(node.name) : value
                    );
                  }}
                >
                  <SelectTrigger className="h-9 w-auto">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="host">Master</SelectItem>
                    {nodes &&
                      nodes.map((s) => {
                        return (
                          <SelectItem key={s.address} value={String(s.id)}>
                            {t(s.name)}
                          </SelectItem>
                        );
                      })}
                  </SelectContent>
                </Select>
              )}
              <Label className="w-au">{t("core.logs")}</Label>
            </div>
            <Label>{t(`core.socket.${status}`)}</Label>
          </div>
          <div
            className="max-h-[250px] min-h-[200px] overflow-y-auto rounded-[5px] border border-gray-300 bg-[#F9F9F9] p-2 dark:border-gray-500 dark:bg-[#2e3440]"
            ref={logsDiv}
          >
            {logs.map((message, i) => (
              <p className="whitespace-pre-line text-xs opacity-80" key={i}>
                {message}
              </p>
            ))}
          </div>
        </div>
      </div>
      <DialogFooter className="mt-4 sm:justify-between">
        <div className="flex flex-row items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => handleRestartCore()}
          >
            <ReloadIcon
              className={classNames({
                "animate-spin": isRestarting,
              })}
            />
            {t(isRestarting ? "core.restarting" : "core.restartCore")}
          </Button>
        </div>
        <Button
          size="sm"
          className="px-5"
          type="submit"
          disabled={isLoading || isPostLoading}
        >
          {isPostLoading && <Spinner />}
          {t("core.save")}
        </Button>
      </DialogFooter>
    </form>
  );
};
export const CoreSettingsModal: FC = () => {
  const { isEditingCore } = useDashboard();
  const onClose = useDashboard.setState.bind(null, { isEditingCore: false });
  const { t } = useTranslation();

  return (
    <Dialog
      open={isEditingCore}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-4xl overflow-visible overflow-y-visible">
        <DialogHeader>
          <DialogTitle className="flex flex-row items-center gap-2 text-lg font-semibold">
            <Icon color="primary">
              <Cog6ToothIcon className="h-5 w-5 text-white" />
            </Icon>
            {t("core.title")}
          </DialogTitle>
        </DialogHeader>
        <CoreSettingModalContent />
      </DialogContent>
    </Dialog>
  );
};
