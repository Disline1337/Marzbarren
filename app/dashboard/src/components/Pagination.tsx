import {
  ArrowLongLeftIcon,
  ArrowLongRightIcon,
} from "@heroicons/react/24/outline";
import { Button } from "components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "components/ui/select";
import { useDashboard } from "contexts/DashboardContext";
import { FC } from "react";
import { useTranslation } from "react-i18next";
import { setUsersPerPageLimitSize } from "utils/userPreferenceStorage";

export type PaginationType = {
  count: number;
  perPage: number;
  page: number;
  onChange?: (page: number) => void;
};

const MINIMAL_PAGE_ITEM_COUNT = 5;

/**
 * Generate numeric page items around current page.
 *   - Always include first and last page
 *   - Add ellipsis if needed
 */
function generatePageItems(total: number, current: number, width: number) {
  if (width < MINIMAL_PAGE_ITEM_COUNT) {
    throw new Error(
      `Must allow at least ${MINIMAL_PAGE_ITEM_COUNT} page items`
    );
  }
  if (width % 2 === 0) {
    throw new Error(`Must allow odd number of page items`);
  }
  if (total < width) {
    return [...new Array(total).keys()];
  }
  const left = Math.max(
    0,
    Math.min(total - width, current - Math.floor(width / 2))
  );
  const items: (string | number)[] = new Array(width);
  for (let i = 0; i < width; i += 1) {
    items[i] = i + left;
  }
  // replace non-ending items with placeholders
  if (items[0] > 0) {
    items[0] = 0;
    items[1] = "prev-more";
  }
  if (items[items.length - 1] < total - 1) {
    items[items.length - 1] = total - 1;
    items[items.length - 2] = "next-more";
  }
  return items;
}

export const Pagination: FC = () => {
  const {
    filters,
    onFilterChange,
    users: { total },
  } = useDashboard();
  const { limit: perPage, offset } = filters;

  const page = (offset || 0) / (perPage || 1);
  const noPages = Math.ceil(total / (perPage || 1));
  const pages = generatePageItems(noPages, page, 7);

  const changePage = (page: number) => {
    onFilterChange({
      ...filters,
      offset: page * (perPage as number),
    });
  };

  const handlePageSizeChange = (value: string) => {
    onFilterChange({
      ...filters,
      limit: parseInt(value),
    });
    setUsersPerPageLimitSize(value);
  };

  const { t } = useTranslation();

  return (
    <div className="mt-4 flex w-full flex-col items-center justify-between gap-4 md:flex-row md:gap-0">
      <div className="order-2 md:order-1">
        <div className="flex flex-row items-center gap-2">
          <Select
            value={String(perPage)}
            onValueChange={handlePageSizeChange}
          >
            <SelectTrigger className="h-8 min-w-[60px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="30">30</SelectItem>
            </SelectContent>
          </Select>
          <span className="whitespace-nowrap text-sm">{t("itemsPerPage")}</span>
        </div>
      </div>

      <div className="order-1 flex md:order-2">
        <Button
          size="sm"
          variant="outline"
          className="rounded-r-none"
          onClick={changePage.bind(null, page - 1)}
          disabled={page === 0 || noPages === 0}
        >
          <ArrowLongLeftIcon className="mr-1 h-4 w-4" />
          {t("previous")}
        </Button>
        {pages.map((pageIndex) => {
          if (typeof pageIndex === "string")
            return (
              <Button
                key={pageIndex}
                size="sm"
                variant="outline"
                className="rounded-none"
              >
                ...
              </Button>
            );
          return (
            <Button
              key={pageIndex}
              size="sm"
              className="rounded-none"
              variant={(pageIndex as number) === page ? "default" : "outline"}
              onClick={changePage.bind(null, pageIndex)}
            >
              {(pageIndex as number) + 1}
            </Button>
          );
        })}
        <Button
          size="sm"
          variant="outline"
          className="rounded-l-none"
          onClick={changePage.bind(null, page + 1)}
          disabled={page + 1 === noPages || noPages === 0}
        >
          {t("next")}
          <ArrowLongRightIcon className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
