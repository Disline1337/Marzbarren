import {
  ArrowPathIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import classNames from "classnames";
import { Button } from "components/ui/button";
import { Input } from "components/ui/input";
import { useDashboard } from "contexts/DashboardContext";
import { cn } from "lib/utils";
import debounce from "lodash.debounce";
import React, { FC, HTMLAttributes } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export const ReloadIcon = ({
  className,
  ...props
}: React.ComponentProps<typeof ArrowPathIcon>) => (
  <ArrowPathIcon className={cn("h-4 w-4", className)} {...props} />
);

export type FilterProps = HTMLAttributes<HTMLDivElement>;
const setSearchField = debounce((search: string) => {
  useDashboard.getState().onFilterChange({
    ...useDashboard.getState().filters,
    offset: 0,
    search,
  });
}, 300);

export const Filters: FC<FilterProps> = ({ className, ...props }) => {
  const { loading, filters, onFilterChange, refetchUsers, onCreateUser } =
    useDashboard();
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setSearchField(e.target.value);
  };
  const clear = () => {
    setSearch("");
    onFilterChange({
      ...filters,
      offset: 0,
      search: "",
    });
  };
  return (
    <div
      id="filters"
      className={cn(
        "sticky top-0 z-10 mx-[-1.5rem] grid grid-cols-1 items-center gap-3 bg-background px-6 py-4 md:grid-cols-4 lg:grid-cols-3 lg:gap-4",
        className
      )}
      {...props}
    >
      <div className="order-2 col-span-1 md:order-1 md:col-span-2 lg:col-span-1">
        <div className="relative">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9 pr-9"
            placeholder={t("search")}
            value={search}
            onChange={onChange}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
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
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            )}
            {filters.search && filters.search.length > 0 && (
              <Button
                onClick={clear}
                aria-label="clear"
                size="icon"
                variant="ghost"
                className="h-6 w-6"
              >
                <XMarkIcon className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
      <div className="order-1 col-span-2 md:order-2">
        <div className="flex h-full flex-row items-center justify-end gap-2">
          <Button
            aria-label="refresh users"
            disabled={loading}
            onClick={refetchUsers}
            size="sm"
            variant="outline"
          >
            <ReloadIcon
              className={classNames({
                "animate-spin": loading,
              })}
            />
          </Button>
          <Button size="sm" onClick={() => onCreateUser(true)} className="px-5">
            {t("createUser")}
          </Button>
        </div>
      </div>
    </div>
  );
};
