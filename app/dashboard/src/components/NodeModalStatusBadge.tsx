import { statusColors } from "constants/UserSettings";
import { cn } from "lib/utils";
import { FC } from "react";
import { useTranslation } from "react-i18next";
import { Status as UserStatusType } from "types/User";
import { relativeExpiryDate } from "utils/dateFormatter";

type UserStatusProps = {
  expiryDate?: number | null;
  status: UserStatusType;
  compact?: boolean;
  showDetail?: boolean;
  extraText?: string | null;
};

const statusBadgeClass: Record<string, string> = {
  green: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  gray: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
  orange:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
  purple:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
  red: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  primary: "bg-primary/15 text-primary",
};

export const NodeModalStatusBadge: FC<UserStatusProps> = ({
  expiryDate,
  status: userStatus,
  compact = false,
  showDetail = true,
  extraText,
}) => {
  const { t } = useTranslation();
  const dateInfo = relativeExpiryDate(expiryDate);
  const Icon = statusColors[userStatus].icon;
  const color = statusColors[userStatus].statusColor;
  return (
    <>
      <span
        className={cn(
          "inline-flex items-center rounded-full px-3 py-1",
          compact ? "gap-1" : "gap-2",
          statusBadgeClass[color] || statusBadgeClass.gray
        )}
      >
        <Icon className={compact ? "h-3 w-3" : "h-4 w-4"} />
        {showDetail && (
          <span
            className={cn(
              "capitalize font-medium tracking-tighter",
              compact ? "text-[0.7rem] leading-4" : "text-sm leading-5"
            )}
          >
            {userStatus && t(`nodeModal.status.${userStatus}`)}
            {extraText && `: ${extraText}`}
          </span>
        )}
      </span>
      {showDetail && expiryDate && (
        <span className="ml-2 inline-block text-xs font-medium text-muted-foreground">
          {t(dateInfo.status, { time: dateInfo.time })}
        </span>
      )}
    </>
  );
};
