import { FC, useState } from "react";
import { useQuery } from "react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { fetch } from "service/http";
import { HwidDevice } from "types/User";
import { Button } from "components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "components/ui/table";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "components/ui/alert-dialog";
import { Input } from "components/Input";

function deviceUsage(
  count?: number | null,
  limit?: number | string | null
): string {
  const used = count ?? 0;
  const value = limit === "" || limit === null || limit === undefined ? null : Number(limit);
  const cap = Number.isInteger(value) && (value ?? -1) >= 0 ? value : null;
  if (cap === 0) return `${used}/∞`;
  if (cap === null) return String(used);
  return `${used}/${cap}`;
}

type HwidDevicesProps = {
  username: string;
  disabled?: boolean;
  limit?: number | string | null;
};
const emptyDevice = {
  hwid: "",
  platform: "",
  os_version: "",
  device_model: "",
};

export const HwidDevices: FC<HwidDevicesProps> = ({
  username,
  disabled,
  limit,
}) => {
  const { t, i18n } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(emptyDevice);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<HwidDevice | "all" | null>(null);
  const path = `/user/${encodeURIComponent(username)}/hwid/devices`;
  const { data, isLoading, isFetching, isError, refetch } = useQuery(
    ["hwid-devices", username],
    () => fetch<{ total: number; devices: HwidDevice[] }>(path),
    { retry: false }
  );
  const devices = data?.devices || [];
  const locked = busy || disabled;
  const validHwid = /^[a-zA-Z0-9=-]{10,64}$/.test(draft.hwid.trim());
  const date = (value?: string | null) => {
    if (!value) return "—";
    const parsed = new Date(
      /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`
    );
    return Number.isNaN(parsed.getTime())
      ? "—"
      : parsed.toLocaleString(i18n.language);
  };
  const notify = (key: string, status: "success" | "error") => {
    const message = t(`userDialog.${key}`);
    if (status === "success") toast.success(message, { duration: 3000 });
    else toast.error(message, { duration: 3000 });
  };
  const add = async () => {
    setSubmitted(true);
    if (!validHwid || locked) return;
    setBusy(true);
    try {
      await fetch(path, {
        method: "POST",
        body: Object.fromEntries(
          Object.entries(draft).map(([key, value]) => [
            key,
            value.trim() || null,
          ])
        ),
      });
      setDraft(emptyDevice);
      setAdding(false);
      setSubmitted(false);
      notify("hwidDeviceAdded", "success");
      await refetch();
    } catch (error: unknown) {
      const record = error && typeof error === "object" ? error : undefined;
      const response =
        record && "response" in record && record.response && typeof record.response === "object"
          ? record.response
          : undefined;
      const status =
        record && "status" in record && typeof record.status === "number"
          ? record.status
          : record && "statusCode" in record && typeof record.statusCode === "number"
            ? record.statusCode
            : response && "status" in response && typeof response.status === "number"
              ? response.status
              : undefined;
      notify(status === 409 ? "hwidDuplicate" : "hwidAddError", "error");
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!target || locked) return;
    setBusy(true);
    try {
      await fetch(
        target === "all" ? path : `${path}/${encodeURIComponent(target.hwid)}`,
        { method: "DELETE" }
      );
      notify(
        target === "all" ? "hwidAllDeleted" : "hwidDeviceDeleted",
        "success"
      );
      setTarget(null);
      await refetch();
    } catch {
      notify("hwidDeleteError", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 flex w-full flex-col gap-3 border-t pt-4">
      <div className="flex flex-row flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          {t("userDialog.hwidDevices")} ({deviceUsage(data?.total, limit)})
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={locked || isFetching}
          onClick={() => refetch()}
        >
          {isFetching && (
            <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" aria-hidden>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          )}
          {t("userDialog.hwidRefresh")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("userDialog.hwidImmediateHelp")}
      </p>
      {isError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t("userDialog.hwidLoadError")}
        </div>
      )}
      {isLoading ? (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" aria-hidden>
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      ) : !isError && devices.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("userDialog.hwidNoDevices")}
        </p>
      ) : (
        devices.length > 0 && (
          <div className="max-h-[280px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("userDialog.hwid")}</TableHead>
                  <TableHead>{t("userDialog.hwidPlatform")}</TableHead>
                  <TableHead>{t("userDialog.hwidLastSeen")}</TableHead>
                  <TableHead>
                    <span className="sr-only">{t("delete")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((device) => (
                  <TableRow key={device.hwid}>
                    <TableCell>
                      <p className="max-w-[180px] select-all break-all font-mono text-xs">
                        {device.hwid}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {device.request_ip || "—"}
                      </p>
                    </TableCell>
                    <TableCell className="text-xs">
                      <p>
                        {[device.platform, device.os_version]
                          .filter(Boolean)
                          .join(" ") || "—"}
                      </p>
                      <p className="text-muted-foreground">{device.device_model || "—"}</p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {date(device.updated_at)}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={locked}
                        onClick={() => setTarget(device)}
                      >
                        {t("delete")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      )}
      <div className="flex flex-row flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          size="sm"
          disabled={locked || adding}
          onClick={() => setAdding(true)}
        >
          {t("userDialog.hwidAdd")}
        </Button>
        {devices.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-destructive text-destructive"
            disabled={locked}
            onClick={() => setTarget("all")}
          >
            {t("userDialog.hwidDeleteAll")}
          </Button>
        )}
      </div>
      {adding && (
        <div
          className="flex flex-col gap-3 rounded-md border p-3"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              void add();
            }
          }}
        >
          <Input
            id="hwid-new-id"
            label={t("userDialog.hwid")}
            value={draft.hwid}
            maxLength={64}
            disabled={locked}
            error={submitted && !validHwid ? t("userDialog.hwidInvalid") : undefined}
            onChange={(event) =>
              setDraft({ ...draft, hwid: event.target.value })
            }
          />
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {(["platform", "os_version", "device_model"] as const).map(
              (key) => (
                <Input
                  key={key}
                  id={`hwid-new-${key}`}
                  label={t(
                    `userDialog.${
                      {
                        platform: "hwidPlatform",
                        os_version: "hwidOsVersion",
                        device_model: "hwidModel",
                      }[key]
                    }`
                  )}
                  value={draft[key]}
                  maxLength={key === "device_model" ? 128 : 64}
                  disabled={locked}
                  onChange={(event) =>
                    setDraft({ ...draft, [key]: event.target.value })
                  }
                />
              )
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("userDialog.hwidManualHelp")}
          </p>
          <div className="flex flex-row items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={locked}
              onClick={() => {
                setAdding(false);
                setDraft(emptyDevice);
                setSubmitted(false);
              }}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={disabled || busy}
              onClick={add}
            >
              {busy && (
                <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" aria-hidden>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              {t("userDialog.hwidAdd")}
            </Button>
          </div>
        </div>
      )}
      <AlertDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setTarget(null);
        }}
      >
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(target === "all" ? "userDialog.hwidDeleteAll" : "delete")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                target === "all"
                  ? "userDialog.hwidConfirmAll"
                  : "userDialog.hwidConfirmDelete"
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {target && target !== "all" && (
            <p className="break-all font-mono text-sm">{target.hwid}</p>
          )}
          <p className="text-sm">{t("userDialog.hwidDeleteHelp")}</p>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setTarget(null)}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={disabled || busy}
              onClick={remove}
            >
              {busy && (
                <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" aria-hidden>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              {t("delete")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
