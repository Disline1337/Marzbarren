import {
  ClockIcon,
  ExclamationCircleIcon,
  NoSymbolIcon,
  WifiIcon,
} from "@heroicons/react/24/outline";
import { cn } from "lib/utils";
import { ForwardRefExoticComponent, SVGProps } from "react";
import { DataLimitResetStrategy } from "types/User";

export type StatusIcon = ForwardRefExoticComponent<
  SVGProps<SVGSVGElement> & { title?: string; titleId?: string }
>;

function StatusIconEl(Icon: StatusIcon) {
  const Wrapped = (props: SVGProps<SVGSVGElement>) => (
    <Icon strokeWidth={2} {...props} className={cn("h-4 w-4", props.className)} />
  );
  return Wrapped;
}

const ActiveStatusIcon = StatusIconEl(WifiIcon);
const DisabledStatusIcon = StatusIconEl(NoSymbolIcon);
const LimitedStatusIcon = StatusIconEl(ExclamationCircleIcon);
const ExpiredStatusIcon = StatusIconEl(ClockIcon);
const On_holdStatusIcon = StatusIconEl(ClockIcon);

export const resetStrategy: { title: string; value: DataLimitResetStrategy }[] =
  [
    {
      title: "No",
      value: "no_reset",
    },
    {
      title: "Daily",
      value: "day",
    },
    {
      title: "Weekly",
      value: "week",
    },
    {
      title: "Monthly",
      value: "month",
    },
    {
      title: "Annually",
      value: "year",
    },
  ];

export const statusColors: {
  [key: string]: {
    statusColor: string;
    bandWidthColor: string;
    icon: (props: SVGProps<SVGSVGElement>) => JSX.Element;
  };
} = {
  active: {
    statusColor: "green",
    bandWidthColor: "primary",
    icon: ActiveStatusIcon,
  },
  connected: {
    statusColor: "green",
    bandWidthColor: "primary",
    icon: ActiveStatusIcon,
  },
  disabled: {
    statusColor: "gray",
    bandWidthColor: "gray",
    icon: DisabledStatusIcon,
  },
  expired: {
    statusColor: "orange",
    bandWidthColor: "orange",
    icon: ExpiredStatusIcon,
  },
  on_hold: {
    statusColor: "purple",
    bandWidthColor: "purple",
    icon: On_holdStatusIcon,
  },
  connecting: {
    statusColor: "orange",
    bandWidthColor: "orange",
    icon: ExpiredStatusIcon,
  },
  limited: {
    statusColor: "red",
    bandWidthColor: "red",
    icon: LimitedStatusIcon,
  },
  error: {
    statusColor: "red",
    bandWidthColor: "red",
    icon: LimitedStatusIcon,
  },
};
