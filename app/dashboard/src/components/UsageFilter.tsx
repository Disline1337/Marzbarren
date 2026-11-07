import { CalendarIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { ApexOptions } from "apexcharts";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "components/ui/popover";
import { RadioGroup, RadioGroupItem } from "components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "components/ui/tabs";
import { FilterUsageType } from "contexts/DashboardContext";
import dayjs, { ManipulateType } from "dayjs";
import { cn } from "lib/utils";
import { FC, useEffect, useState } from "react";
import ReactDatePicker from "react-datepicker";
import { useTranslation } from "react-i18next";
import { generateDistinctColors } from "utils/color";
import { formatBytes } from "utils/formatByte";

type DateType = Date | null;
type ColorMode = "light" | "dark";

function useIsMd() {
  const [isMd, setIsMd] = useState(
    typeof window !== "undefined" &&
      window.matchMedia("(min-width: 768px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => setIsMd(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isMd;
}

const filterOptionTypes = {
  h: "hour",
  d: "day",
  w: "week",
  m: "month",
  y: "year",
};

const FilterItem: FC<{
  value: string;
  border?: boolean;
  selected: boolean;
}> = ({ value, border, selected }) => {
  return (
    <label
      className={cn(
        "flex min-w-[48px] flex-1 cursor-pointer items-center justify-center px-3 py-1 text-center text-xs md:text-sm",
        border && "rounded-md border",
        selected && "rounded-md border-primary bg-primary text-white"
      )}
    >
      <RadioGroupItem value={value} className="sr-only" />
      {value}
    </label>
  );
};

export type UsageFilterProps = {
  onChange: (filter: string, query: FilterUsageType) => void;
  defaultValue: string;
};

export const UsageFilter: FC<UsageFilterProps> = ({
  onChange,
  defaultValue,
}) => {
  const { t, i18n } = useTranslation();
  const isMd = useIsMd();

  const filterOptions = isMd
    ? ["7h", "1d", "3d", "1w", "1m", "3m"]
    : ["7h", "1d", "3d", "1w"];
  const customFilterOptions = isMd
    ? [
        { title: "hours", options: ["1h", "2h", "3h", "6h", "8h", "12h"] },
        { title: "days", options: ["1d", "2d", "3d", "4d", "5d", "6d"] },
        { title: "weeks", options: ["1w", "2w", "3w", "4w"] },
        { title: "months", options: ["1m", "2m", "3m", "6m", "8m"] },
      ]
    : [
        { title: "hours", options: ["1h", "3h", "6h", "12h"] },
        { title: "days", options: ["1d", "2d", "3d", "4d"] },
        { title: "weeks", options: ["1w", "2w", "3w", "4w"] },
        { title: "months", options: ["1m", "2m", "3m", "6m"] },
      ];

  const [filter, setFilter] = useState(defaultValue);
  const [isCustomOpen, setCustomOpen] = useState(false);
  const [customLabel, setCustomLabel] = useState(t("userDialog.custom"));
  const [custom, setCustom] = useState(false);
  const [tab, setTab] = useState("relative");
  const [startDate, setStartDate] = useState(null as DateType);
  const [endDate, setEndDate] = useState(null as DateType);

  const applyPreset = (value: string) => {
    if (value === "custom") {
      return;
    }
    setCustomOpen(false);
    setFilter(value);
    if (filterOptions.indexOf(value) >= 0) {
      setCustomLabel(t("userDialog.custom"));
      setCustom(false);
    } else {
      setCustomLabel(t("userDialog.custom") + ` (${value})`);
      setCustom(true);
    }
    const num = Number(value.substring(0, value.length - 1));
    const unit =
      filterOptionTypes[value[value.length - 1] as keyof typeof filterOptionTypes];
    onChange(value, {
      start: dayjs()
        .utc()
        .subtract(num, unit as ManipulateType)
        .format("YYYY-MM-DDTHH:00:00"),
    });
  };

  const onDateChange = (dates: [DateType, DateType]) => {
    const [start, end] = dates;
    if (endDate && !end) {
      setStartDate(null);
      setEndDate(null);
    } else {
      setStartDate(start);
      setEndDate(end);
      if (start && end) {
        setCustomOpen(false);
        setFilter("custom");
        onChange("custom", {
          start: dayjs(start).format("YYYY-MM-DDT00:00:00"),
          end: dayjs(end).format("YYYY-MM-DDT23:59:59"),
        });
      }
    }
  };

  const quickValue = filterOptions.includes(filter) ? filter : undefined;

  return (
    <Popover open={isCustomOpen} onOpenChange={setCustomOpen}>
      <PopoverAnchor asChild>
        <div className="relative flex flex-col">
          {tab === "relative" && (
            <div className="flex min-w-[320px] overflow-hidden rounded-md border md:min-w-[400px]">
              <RadioGroup
                value={quickValue}
                onValueChange={applyPreset}
                className="flex flex-1 gap-0"
              >
                {filterOptions.map((value) => (
                  <FilterItem
                    key={value}
                    value={value}
                    selected={filter === value}
                  />
                ))}
              </RadioGroup>
              <button
                type="button"
                className={cn(
                  "flex w-full cursor-pointer items-center justify-center gap-2 rounded-md px-3 py-1 text-xs md:text-sm",
                  custom && "bg-primary text-white"
                )}
                onClick={() => {
                  setStartDate(null);
                  setEndDate(null);
                  setCustomOpen(true);
                }}
              >
                <span>{customLabel}</span>
                <CalendarIcon className="h-[18px] w-[18px]" />
              </button>
            </div>
          )}
          {tab === "absolute" && (
            <button
              type="button"
              onClick={() => setCustomOpen(true)}
              className="flex min-w-[320px] cursor-pointer items-center gap-2 rounded-md border px-3 py-1 text-xs md:min-w-[400px] md:text-sm"
            >
              <span
                className={cn("w-full", !startDate && "text-muted-foreground")}
              >
                {startDate
                  ? dayjs(startDate).format("YYYY-MM-DD (00:00)")
                  : t("userDialog.startDate")}
              </span>
              <ChevronRightIcon className="h-[18px] w-[18px] shrink-0" />
              <span
                className={cn("w-full", !endDate && "text-muted-foreground")}
              >
                {endDate
                  ? dayjs(endDate).format("YYYY-MM-DD (23:59)")
                  : t("userDialog.endDate")}
              </span>
              <CalendarIcon className="h-[18px] w-[18px] shrink-0" />
            </button>
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent
        className="w-auto max-w-none p-0"
        align="start"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="m-2">
            <TabsTrigger value="relative" className="text-xs md:text-sm">
              {t("userDialog.relative")}
            </TabsTrigger>
            <TabsTrigger value="absolute" className="text-xs md:text-sm">
              {t("userDialog.absolute")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="relative" className="px-2 pb-3">
            <RadioGroup
              value={
                customFilterOptions.some((row) => row.options.includes(filter))
                  ? filter
                  : undefined
              }
              onValueChange={applyPreset}
              className="gap-3"
            >
              {customFilterOptions.map((row) => (
                <div
                  key={row.title}
                  className="flex flex-row flex-wrap items-center gap-2"
                >
                  <span className="min-w-[60px] text-xs md:text-sm">
                    {t("userDialog." + row.title)}
                  </span>
                  {row.options.map((value) => (
                    <FilterItem
                      key={value + ".custom"}
                      value={value}
                      border
                      selected={filter === value}
                    />
                  ))}
                </div>
              ))}
            </RadioGroup>
          </TabsContent>
          <TabsContent value="absolute" className="datepicker-panel">
            <ReactDatePicker
              locale={i18n.language.toLocaleLowerCase()}
              selected={startDate}
              onChange={onDateChange}
              startDate={startDate}
              endDate={endDate}
              selectsRange={true}
              maxDate={new Date()}
              monthsShown={isMd ? 2 : 1}
              peekNextMonth={false}
              inline
            />
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
};

export function createUsageConfig(
  colorMode: ColorMode,
  title: string,
  series: number[] = [],
  labels: string[] = []
) {
  const total = formatBytes((series as [number]).reduce((t, c) => (t += c), 0));
  return {
    series: series,
    options: {
      labels: labels,
      chart: {
        width: "100%",
        height: "100%",
        type: "donut",
        animations: {
          enabled: false,
        },
      },
      title: {
        text: `${title}${total}`,
        align: "center",
        style: {
          fontWeight: 500,
          color: colorMode === "dark" ? "#CBD5E0" : undefined,
        },
      },
      legend: {
        position: "bottom",
        labels: {
          colors: colorMode === "dark" ? "#CBD5E0" : undefined,
          useSeriesColors: false,
        },
      },
      stroke: {
        width: 1,
        colors: undefined,
      },
      dataLabels: {
        formatter: (val, { seriesIndex, w }) => {
          return formatBytes(w.config.series[seriesIndex], 1);
        },
      },
      tooltip: {
        custom: ({ series, seriesIndex, dataPointIndex, w }) => {
          const readable = formatBytes(series[seriesIndex], 1);
          const total = Math.max(
            (series as [number]).reduce((t, c) => (t += c)),
            1
          );
          const percent =
            Math.round((series[seriesIndex] / total) * 1000) / 10 + "%";
          return `
            <div style="
                    background-color: ${w.globals.colors[seriesIndex]};
                    padding-left:12px;
                    padding-right:12px;
                    padding-top:6px;
                    padding-bottom:6px;
                    font-size:0.725rem;
                  "
            >
              ${w.config.labels[seriesIndex]}: <b>${percent}, ${readable}</b>
            </div>
          `;
        },
      },
      colors: generateDistinctColors(series.length),
    } as ApexOptions,
  };
}
