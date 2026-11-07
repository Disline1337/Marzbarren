import {
  ChartBarIcon,
  ChartPieIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import { Card } from "components/ui/card";
import { useDashboard } from "contexts/DashboardContext";
import { cn } from "lib/utils";
import { FC, HTMLAttributes, PropsWithChildren, ReactElement, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "react-query";
import { fetch } from "service/http";
import { formatBytes, numberWithCommas } from "utils/formatByte";

type StatisticCardProps = {
  title: string;
  content: ReactNode;
  icon: ReactElement;
};

const StatisticCard: FC<PropsWithChildren<StatisticCardProps>> = ({
  title,
  content,
  icon,
}) => {
  return (
    <Card className="flex w-full min-w-0 flex-1 flex-row items-center justify-between rounded-xl border border-border bg-[#F9FAFB] p-6 shadow-none dark:border-gray-600 dark:bg-[#222C3B]">
      <div className="flex flex-row items-center gap-4">
        <div className="relative p-2 text-white">
          <span className="absolute inset-0 z-[1] rounded-[5px] bg-primary opacity-50" />
          <span className="absolute -inset-[5px] z-[1] rounded-lg bg-primary opacity-40" />
          <span className="relative z-[2] text-white">{icon}</span>
        </div>
        <p className="text-sm font-medium capitalize text-muted-foreground">
          {title}
        </p>
      </div>
      <div className="mt-2 text-3xl font-semibold">{content}</div>
    </Card>
  );
};
export const StatisticsQueryKey = "statistics-query-key";
export const Statistics: FC<HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => {
  const { version } = useDashboard();
  const { data: systemData } = useQuery({
    queryKey: StatisticsQueryKey,
    queryFn: () => fetch("/system"),
    refetchInterval: 5000,
    onSuccess: ({ version: currentVersion }) => {
      if (version !== currentVersion)
        useDashboard.setState({ version: currentVersion });
    },
  });
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "flex flex-col justify-between gap-4 lg:flex-row lg:gap-4",
        className
      )}
      {...props}
    >
      <StatisticCard
        title={t("activeUsers")}
        content={
          systemData && (
            <div className="flex flex-row items-end gap-2">
              <span>{numberWithCommas(systemData.users_active)}</span>
              <span className="inline-block pb-[5px] text-lg font-normal">
                / {numberWithCommas(systemData.total_user)}
              </span>
            </div>
          )
        }
        icon={<UsersIcon className="relative z-[2] h-5 w-5" />}
      />
      <StatisticCard
        title={t("dataUsage")}
        content={
          systemData &&
          formatBytes(
            systemData.incoming_bandwidth + systemData.outgoing_bandwidth
          )
        }
        icon={<ChartBarIcon className="relative z-[2] h-5 w-5" />}
      />
      <StatisticCard
        title={t("memoryUsage")}
        content={
          systemData && (
            <div className="flex flex-row items-end gap-2">
              <span>{formatBytes(systemData.mem_used, 1, true)[0]}</span>
              <span className="inline-block pb-[5px] text-lg font-normal">
                {formatBytes(systemData.mem_used, 1, true)[1]} /{" "}
                {formatBytes(systemData.mem_total, 1)}
              </span>
            </div>
          )
        }
        icon={<ChartPieIcon className="relative z-[2] h-5 w-5" />}
      />
    </div>
  );
};
