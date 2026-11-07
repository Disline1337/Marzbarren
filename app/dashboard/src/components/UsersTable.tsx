import {
  CheckIcon,
  ChevronDownIcon,
  ClipboardIcon,
  LinkIcon,
  PencilIcon,
  QrCodeIcon,
} from "@heroicons/react/24/outline";
import { ReactComponent as AddFileIcon } from "assets/add_file.svg";
import classNames from "classnames";
import { Button } from "components/ui/button";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "components/ui/tooltip";
import { resetStrategy, statusColors } from "constants/UserSettings";
import { useDashboard } from "contexts/DashboardContext";
import { t } from "i18next";
import { cn } from "lib/utils";
import { ChangeEvent, CSSProperties, FC, Fragment, HTMLAttributes, TableHTMLAttributes, useEffect, useState } from "react";
import CopyToClipboard from "react-copy-to-clipboard";
import { useTranslation } from "react-i18next";
import { User } from "types/User";
import { formatBytes } from "utils/formatByte";
import { OnlineBadge } from "./OnlineBadge";
import { OnlineStatus } from "./OnlineStatus";
import { Pagination } from "./Pagination";
import { StatusBadge } from "./StatusBadge";

const iconClass = "h-4 w-4 md:h-5 md:w-5";

const Table = ({
  className,
  ...props
}: TableHTMLAttributes<HTMLTableElement>) => (
  <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
);

type UsageSliderProps = {
  used: number;
  total: number | null;
  dataLimitResetStrategy: string | null;
  totalUsedTraffic: number;
  colorScheme?: string;
};

const barColor: Record<string, string> = {
  primary: "bg-primary",
  gray: "bg-gray-400",
  orange: "bg-orange-400",
  purple: "bg-purple-400",
  red: "bg-red-500",
  green: "bg-green-500",
};

const getResetStrategy = (strategy: string): string => {
  for (var i = 0; i < resetStrategy.length; i++) {
    const entry = resetStrategy[i];
    if (entry.value == strategy) {
      return entry.title;
    }
  }
  return "No";
};

const UsageSliderCompact: FC<UsageSliderProps> = (props) => {
  const { used, total } = props;
  const isUnlimited = total === 0 || total === null;
  return (
    <div className="flex flex-row items-center justify-between text-xs font-medium text-muted-foreground">
      <span>
        {formatBytes(used)} /{" "}
        {isUnlimited ? (
          <span className="font-[system-ui]">∞</span>
        ) : (
          formatBytes(total)
        )}
      </span>
    </div>
  );
};

const UsageSlider: FC<UsageSliderProps> = (props) => {
  const { used, total, dataLimitResetStrategy, totalUsedTraffic, colorScheme } =
    props;
  const isUnlimited = total === 0 || total === null;
  const isReached = !isUnlimited && (used / total) * 100 >= 100;
  const pct = isUnlimited ? 100 : Math.min((used / total) * 100, 100);
  return (
    <>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            isReached
              ? "bg-red-500"
              : barColor[colorScheme || "primary"] || "bg-primary"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex flex-row items-center justify-between text-xs font-medium text-muted-foreground">
        <span>
          {formatBytes(used)} /{" "}
          {isUnlimited ? (
            <span className="font-[system-ui]">∞</span>
          ) : (
            formatBytes(total) +
            (dataLimitResetStrategy && dataLimitResetStrategy !== "no_reset"
              ? " " +
                t(
                  "userDialog.resetStrategy" +
                    getResetStrategy(dataLimitResetStrategy)
                )
              : "")
          )}
        </span>
        <span>
          {t("usersTable.total")}: {formatBytes(totalUsedTraffic)}
        </span>
      </div>
    </>
  );
};

export type SortType = {
  sort: string;
  column: string;
};

export const Sort: FC<SortType> = ({ sort, column }) => {
  if (sort.includes(column))
    return (
      <ChevronDownIcon
        className={cn(
          "h-[15px] w-[15px]",
          !sort.startsWith("-") && "rotate-180"
        )}
      />
    );
  return null;
};

function deviceCap(limit?: number | string | null): number | null {
  if (limit === "" || limit === null || limit === undefined) return null;
  const value = Number(limit);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function deviceUsage(
  count?: number | null,
  limit?: number | string | null
): string | null {
  const used = count ?? 0;
  const cap = deviceCap(limit);
  if (!used && cap === null) return null;
  if (cap === 0) return `${used}/∞`;
  if (cap === null) return String(used);
  return `${used}/${cap}`;
}

const DeviceUsage: FC<{ user: User }> = ({ user }) => {
  const label = deviceUsage(user.hwid_device_count, user.hwid_device_limit);
  if (!label) return null;
  const cap = deviceCap(user.hwid_device_limit);
  const full = cap !== null && cap > 0 && (user.hwid_device_count ?? 0) >= cap;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex rounded-full px-2 py-0.5 text-[0.65em] font-semibold",
            full
              ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
              : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
          )}
        >
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent>{t("usersTable.hwidDevices")}</TooltipContent>
    </Tooltip>
  );
};

const StatusFilter = ({
  value,
  onChange,
}: {
  value?: string;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
}) => (
  <select
    value={value || ""}
    onChange={onChange}
    onClick={(e) => e.stopPropagation()}
    className="h-7 max-w-[150px] cursor-pointer rounded-[6px] border border-input bg-transparent px-1.5 text-xs font-semibold uppercase text-muted-foreground dark:border-gray-600"
  >
    <option value="">{t("usersTable.status")}</option>
    <option value="active">active</option>
    <option value="on_hold">on_hold</option>
    <option value="disabled">disabled</option>
    <option value="limited">limited</option>
    <option value="expired">expired</option>
  </select>
);

type UsersTableProps = HTMLAttributes<HTMLDivElement>;

export const UsersTable: FC<UsersTableProps> = (props) => {
  const {
    filters,
    users: { users },
    users: totalUsers,
    onEditingUser,
    onFilterChange,
  } = useDashboard();

  const { t } = useTranslation();
  const [selectedRow, setSelectedRow] = useState<number | undefined>(undefined);
  const [top, setTop] = useState("72px");

  useEffect(() => {
    const calcTop = () => {
      const el = document.querySelectorAll("#filters")[0] as HTMLElement;
      if (el) setTop(`${el.offsetHeight}px`);
    };
    calcTop();
    window.addEventListener("scroll", calcTop);
    return () => window.removeEventListener("scroll", calcTop);
  }, []);

  const isFiltered = users.length !== totalUsers.total;

  const handleSort = (column: string) => {
    let newSort = filters.sort;
    if (newSort.includes(column)) {
      if (newSort.startsWith("-")) {
        newSort = "-created_at";
      } else {
        newSort = "-" + column;
      }
    } else {
      newSort = column;
    }
    onFilterChange({
      sort: newSort,
    });
  };
  const handleStatusFilter = (e: any) => {
    onFilterChange({
      status: e.target.value.length > 0 ? e.target.value : undefined,
    });
  };

  const toggleAccordion = (index: number) => {
    setSelectedRow(index === selectedRow ? undefined : index);
  };

  const stickyHead = { top } as CSSProperties;

  return (
    <div id="users-table" {...props}>
      <div className="block md:hidden">
        <Table>
          <TableHeader className="relative z-10">
            <TableRow>
              <TableHead
                className="sticky min-w-[120px] cursor-pointer px-4"
                style={stickyHead}
                onClick={handleSort.bind(null, "username")}
              >
                <div className="flex flex-row items-center gap-2">
                  <span>{t("users")}</span>
                  <Sort sort={filters.sort} column="username" />
                </div>
              </TableHead>
              <TableHead
                className="sticky w-[140px] min-w-[50px] px-2"
                style={stickyHead}
              >
                <StatusFilter
                  value={filters.status}
                  onChange={handleStatusFilter}
                />
              </TableHead>
              <TableHead
                className="sticky min-w-[100px] cursor-pointer pr-0"
                style={stickyHead}
                onClick={handleSort.bind(null, "used_traffic")}
              >
                <div className="flex flex-row items-center gap-2">
                  <span>{t("usersTable.dataUsage")}</span>
                  <Sort sort={filters.sort} column="used_traffic" />
                </div>
              </TableHead>
              <TableHead
                className="sticky w-8 min-w-[32px] cursor-pointer p-0"
                style={stickyHead}
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users?.map((user, i) => {
              return (
                <Fragment key={user.username}>
                  <TableRow
                    onClick={toggleAccordion.bind(null, i)}
                    className="cursor-pointer"
                  >
                    <TableCell className="min-w-[100px] border-b-0 px-4">
                      <div className="flex-status">
                        <OnlineBadge lastOnline={user.online_at} />
                        <span className="truncate">{user.username}</span>
                        <DeviceUsage user={user} />
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[50px] border-b-0 px-0">
                      <StatusBadge
                        compact
                        showDetail={false}
                        expiryDate={user.expire}
                        status={user.status}
                      />
                    </TableCell>
                    <TableCell className="min-w-[100px] border-b-0 pr-0">
                      <UsageSliderCompact
                        totalUsedTraffic={user.lifetime_used_traffic}
                        dataLimitResetStrategy={user.data_limit_reset_strategy}
                        used={user.used_traffic}
                        total={user.data_limit}
                        colorScheme={statusColors[user.status].bandWidthColor}
                      />
                    </TableCell>
                    <TableCell className="w-8 min-w-[32px] border-b-0 p-0">
                      <ChevronDownIcon
                        className={cn(
                          iconClass,
                          "text-muted-foreground transition-transform duration-200",
                          selectedRow === i && "rotate-180"
                        )}
                      />
                    </TableCell>
                  </TableRow>
                  {selectedRow === i && (
                    <TableRow
                      className="collapsible cursor-pointer"
                      onClick={toggleAccordion.bind(null, i)}
                    >
                      <TableCell className="p-0" colSpan={4}>
                        <div className="flex flex-col justify-between gap-4 px-6 py-3">
                          <div className="flex w-full flex-col items-start">
                            <p className="text-xs font-bold capitalize text-muted-foreground">
                              {t("usersTable.dataUsage")}
                            </p>
                            <div className="w-full min-w-[230px]">
                              <UsageSlider
                                totalUsedTraffic={user.lifetime_used_traffic}
                                dataLimitResetStrategy={
                                  user.data_limit_reset_strategy
                                }
                                used={user.used_traffic}
                                total={user.data_limit}
                                colorScheme={
                                  statusColors[user.status].bandWidthColor
                                }
                              />
                            </div>
                          </div>
                          <div className="flex w-full flex-row items-center justify-between">
                            <div className="w-full">
                              <StatusBadge
                                compact
                                expiryDate={user.expire}
                                status={user.status}
                              />
                              <OnlineStatus lastOnline={user.online_at} />
                            </div>
                            <div className="flex flex-row items-center gap-2">
                              <ActionButtons user={user} />
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 md:h-9 md:w-9"
                                    aria-label="Edit user"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onEditingUser(user);
                                    }}
                                  >
                                    <PencilIcon className={iconClass} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {t("userDialog.editUser")}
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <div className="hidden md:block">
      <Table>
        <TableHeader className="relative z-10">
          <TableRow>
            <TableHead
              className="sticky min-w-[140px] cursor-pointer"
              style={stickyHead}
              onClick={handleSort.bind(null, "username")}
            >
              <div className="flex flex-row items-center gap-2">
                <span>{t("username")}</span>
                <Sort sort={filters.sort} column="username" />
              </div>
            </TableHead>
            <TableHead
              className="sticky w-[400px] min-w-[150px]"
              style={stickyHead}
            >
              <div className="flex flex-row items-center gap-2">
                <StatusFilter
                  value={filters.status}
                  onChange={handleStatusFilter}
                />
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground"
                  onClick={handleSort.bind(null, "expire")}
                >
                  expire
                  <Sort sort={filters.sort} column="expire" />
                </button>
              </div>
            </TableHead>
            <TableHead
              className="sticky w-[350px] min-w-[230px] cursor-pointer"
              style={stickyHead}
              onClick={handleSort.bind(null, "used_traffic")}
            >
              <div className="flex flex-row items-center gap-2">
                <span>{t("usersTable.dataUsage")}</span>
                <Sort sort={filters.sort} column="used_traffic" />
              </div>
            </TableHead>
            <TableHead
              className="sticky w-[200px] min-w-[180px]"
              style={stickyHead}
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {users?.map((user, i) => {
            return (
              <TableRow
                key={user.username}
                className={classNames("interactive cursor-pointer", {
                  "last-row": i === users.length - 1,
                })}
                onClick={() => onEditingUser(user)}
              >
                <TableCell className="min-w-[140px]">
                  <div className="flex-status">
                    <OnlineBadge lastOnline={user.online_at} />
                    <button
                      type="button"
                      className="font-inherit text-inherit"
                      onClick={(event) => {
                        event.stopPropagation();
                        onEditingUser(user);
                      }}
                    >
                      {user.username}
                    </button>
                    <DeviceUsage user={user} />
                    <OnlineStatus lastOnline={user.online_at} />
                  </div>
                </TableCell>
                <TableCell className="w-[400px] min-w-[150px]">
                  <StatusBadge expiryDate={user.expire} status={user.status} />
                </TableCell>
                <TableCell className="w-[350px] min-w-[230px]">
                  <UsageSlider
                    totalUsedTraffic={user.lifetime_used_traffic}
                    dataLimitResetStrategy={user.data_limit_reset_strategy}
                    used={user.used_traffic}
                    total={user.data_limit}
                    colorScheme={statusColors[user.status].bandWidthColor}
                  />
                </TableCell>
                <TableCell className="w-[200px] min-w-[180px]">
                  <ActionButtons user={user} />
                </TableCell>
              </TableRow>
            );
          })}
          {users.length == 0 && (
            <TableRow>
              <TableCell colSpan={4}>
                <EmptySection isFiltered={isFiltered} />
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      </div>
      <Pagination />
    </div>
  );
};

type ActionButtonsProps = {
  user: User;
};

const ActionButtons: FC<ActionButtonsProps> = ({ user }) => {
  const { setQRCode, setSubLink } = useDashboard();

  const proxyLinks = user.links.join("\r\n");

  const [copied, setCopied] = useState([-1, false]);
  useEffect(() => {
    if (copied[1]) {
      setTimeout(() => {
        setCopied([-1, false]);
      }, 1000);
    }
  }, [copied]);
  return (
    <div
      className="flex flex-row items-center justify-end gap-1"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <CopyToClipboard
        text={
          user.subscription_url.startsWith("/")
            ? window.location.origin + user.subscription_url
            : user.subscription_url
        }
        onCopy={() => {
          setCopied([0, true]);
        }}
      >
        <div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 md:h-9 md:w-9"
                aria-label="copy subscription link"
              >
                {copied[0] == 0 && copied[1] ? (
                  <CheckIcon className={iconClass} />
                ) : (
                  <LinkIcon className={iconClass} />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {copied[0] == 0 && copied[1]
                ? t("usersTable.copied")
                : t("usersTable.copyLink")}
            </TooltipContent>
          </Tooltip>
        </div>
      </CopyToClipboard>
      <CopyToClipboard
        text={proxyLinks}
        onCopy={() => {
          setCopied([1, true]);
        }}
      >
        <div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 md:h-9 md:w-9"
                aria-label="copy configs"
              >
                {copied[0] == 1 && copied[1] ? (
                  <CheckIcon className={iconClass} />
                ) : (
                  <ClipboardIcon className={iconClass} />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {copied[0] == 1 && copied[1]
                ? t("usersTable.copied")
                : t("usersTable.copyConfigs")}
            </TooltipContent>
          </Tooltip>
        </div>
      </CopyToClipboard>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 md:h-9 md:w-9"
            aria-label="qr code"
            onClick={() => {
              setQRCode(user.links);
              setSubLink(user.subscription_url);
            }}
          >
            <QrCodeIcon className={iconClass} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>QR Code</TooltipContent>
      </Tooltip>
    </div>
  );
};

type EmptySectionProps = {
  isFiltered: boolean;
};

const EmptySection: FC<EmptySectionProps> = ({ isFiltered }) => {
  const { onCreateUser } = useDashboard();
  return (
    <div className="flex w-full flex-col items-center gap-4 px-5 py-8">
      <AddFileIcon className="max-h-[200px] max-w-[200px]" />
      <p className="font-medium text-muted-foreground">
        {isFiltered ? t("usersTable.noUserMatched") : t("usersTable.noUser")}
      </p>
      {!isFiltered && (
        <Button size="sm" onClick={() => onCreateUser(true)}>
          {t("createUser")}
        </Button>
      )}
    </div>
  );
};
