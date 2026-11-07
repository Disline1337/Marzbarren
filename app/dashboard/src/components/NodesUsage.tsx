import { ChartPieIcon } from "@heroicons/react/24/outline";
import { FilterUsageType, useDashboard } from "contexts/DashboardContext";
import { useNodes } from "contexts/NodesContext";
import dayjs from "dayjs";
import { FC, Suspense, useEffect, useState } from "react";
import ReactApexChart from "react-apexcharts";
import { useTranslation } from "react-i18next";
import { useTheme } from "next-themes";
import { Icon } from "./Icon";
import { UsageFilter, createUsageConfig } from "./UsageFilter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

export type NodesUsageProps = {};

type NodeUsageEntry = {
  uplink?: number;
  downlink?: number;
  node_name?: string;
};

export const NodesUsage: FC<NodesUsageProps> = () => {
  const { isShowingNodesUsage, onShowingNodesUsage } = useDashboard();
  const { fetchNodesUsage } = useNodes();
  const { t } = useTranslation();
  const [loading] = useState(false);
  const { theme } = useTheme();
  const colorMode = theme === "dark" ? "dark" : "light";

  const usageTitle = t("userDialog.total");
  const [usage, setUsage] = useState(createUsageConfig(colorMode, usageTitle));
  const [usageFilter, setUsageFilter] = useState("1m");
  const fetchUsageWithFilter = (query: FilterUsageType) => {
    fetchNodesUsage(query).then((data: unknown) => {
      const labels: string[] = [];
      const series: number[] = [];
      if (!data || typeof data !== "object" || !("usages" in data)) return;
      const usages = data.usages;
      if (!usages || typeof usages !== "object") return;
      for (const key in usages) {
        const entry = (usages as Record<string, NodeUsageEntry>)[key];
        if (!entry || typeof entry !== "object") continue;
        series.push(Number(entry.uplink) + Number(entry.downlink));
        labels.push(String(entry.node_name ?? ""));
      }
      setUsage(createUsageConfig(colorMode, usageTitle, series, labels));
    });
  };

  useEffect(() => {
    if (isShowingNodesUsage) {
      fetchUsageWithFilter({
        start: dayjs().utc().subtract(30, "day").format("YYYY-MM-DDTHH:00:00"),
      });
    }
  }, [isShowingNodesUsage]);

  const onClose = () => {
    onShowingNodesUsage(false);
    setUsageFilter("1m");
  };

  const disabled = loading;

  return (
    <Dialog
      open={isShowingNodesUsage}
      onOpenChange={(open) => {
        if (!open && !disabled) onClose();
      }}
    >
      <DialogContent className="mx-3 w-full max-w-2xl">
        <DialogHeader>
          <div className="flex flex-row items-center gap-2">
            <Icon color="primary">
              <ChartPieIcon className="h-5 w-5 text-white" />
            </Icon>
            <DialogTitle className="text-lg font-semibold">
              {t("header.nodesUsage")}
            </DialogTitle>
          </div>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <UsageFilter
            defaultValue={usageFilter}
            onChange={(filter, query) => {
              setUsageFilter(filter);
              fetchUsageWithFilter(query);
            }}
          />
          <div className="mt-4 w-full max-w-[300px] justify-self-center">
            <Suspense
              fallback={
                <svg
                  className="h-8 w-8 animate-spin text-primary"
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
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  />
                </svg>
              }
            >
              <ReactApexChart
                options={usage.options}
                series={usage.series}
                type="donut"
                height="500px"
              />
            </Suspense>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
