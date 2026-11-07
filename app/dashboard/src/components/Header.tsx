import {
  ArrowLeftOnRectangleIcon,
  Bars3Icon,
  ChartPieIcon,
  Cog6ToothIcon,
  CurrencyDollarIcon,
  DocumentMinusIcon,
  LinkIcon,
  MapIcon,
  MoonIcon,
  SquaresPlusIcon,
  SunIcon,
} from "@heroicons/react/24/outline";
import { Button } from "components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "components/ui/dropdown-menu";
import { DONATION_URL, REPO_URL } from "constants/Project";
import { useDashboard } from "contexts/DashboardContext";
import differenceInDays from "date-fns/differenceInDays";
import isValid from "date-fns/isValid";
import { useTheme } from "next-themes";
import { FC, ReactNode, useState } from "react";
import GitHubButton from "react-github-btn";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { updateThemeColor } from "utils/themeColor";
import { Language } from "./Language";
import useGetUser from "hooks/useGetUser";

type HeaderProps = {
  actions?: ReactNode;
};

const NOTIFICATION_KEY = "marzban-menu-notification";

export const shouldShowDonation = (): boolean => {
  const date = localStorage.getItem(NOTIFICATION_KEY);
  if (!date) return true;
  try {
    if (date && isValid(parseInt(date))) {
      if (differenceInDays(new Date(), new Date(parseInt(date))) >= 7)
        return true;
      return false;
    }
    return true;
  } catch (err) {
    return true;
  }
};

export const Header: FC<HeaderProps> = ({ actions }) => {
  const { userData, getUserIsSuccess, getUserIsPending } = useGetUser();

  const isSudo = () => {
    if (!getUserIsPending && getUserIsSuccess) {
      return userData.is_sudo;
    }
    return false;
  };

  const {
    onEditingHosts,
    onResetAllUsage,
    onEditingNodes,
    onShowingNodesUsage,
  } = useDashboard();
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const colorMode = theme === "dark" ? "dark" : "light";
  const [showDonationNotif, setShowDonationNotif] = useState(
    shouldShowDonation()
  );
  const gBtnColor = colorMode === "dark" ? "dark_dimmed" : colorMode;

  const handleOnClose = () => {
    localStorage.setItem(NOTIFICATION_KEY, new Date().getTime().toString());
    setShowDonationNotif(false);
  };

  return (
    <div className="relative flex flex-row items-center justify-between gap-2">
      <h1 className="text-2xl font-semibold">{t("users")}</h1>
      <div className="overflow-auto" dir="rtl">
        <div className="flex flex-row items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="relative">
                <Bars3Icon className="h-4 w-4" />
                {showDonationNotif && (
                  <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-yellow-500" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="menuList min-w-[170px]" style={{ direction: "ltr" }}>
              {isSudo() && (
                <>
                  <DropdownMenuItem
                    className="max-w-[170px] text-sm"
                    onClick={onEditingHosts.bind(null, true)}
                  >
                    <LinkIcon className="mr-2 h-4 w-4" />
                    {t("header.hostSettings")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-sm whitespace-normal"
                    onClick={() => {
                      useDashboard.setState({ isEditingClientRouting: true });
                    }}
                  >
                    <MapIcon className="mr-2 h-4 w-4" />
                    {t("header.clientRouting")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="max-w-[170px] text-sm"
                    onClick={onEditingNodes.bind(null, true)}
                  >
                    <SquaresPlusIcon className="mr-2 h-4 w-4" />
                    {t("header.nodeSettings")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="max-w-[170px] text-sm"
                    onClick={onShowingNodesUsage.bind(null, true)}
                  >
                    <ChartPieIcon className="mr-2 h-4 w-4" />
                    {t("header.nodesUsage")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="max-w-[170px] text-sm"
                    onClick={onResetAllUsage.bind(null, true)}
                  >
                    <DocumentMinusIcon className="mr-2 h-4 w-4" />
                    {t("resetAllUsage")}
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem className="max-w-[170px] text-sm" asChild>
                <Link
                  to={DONATION_URL}
                  target="_blank"
                  className="relative flex items-center"
                  onClick={handleOnClose}
                >
                  <CurrencyDollarIcon className="mr-2 h-4 w-4" />
                  {t("header.donation")}{" "}
                  {showDonationNotif && (
                    <span className="absolute right-2 top-3 h-2 w-2 rounded-full bg-yellow-500" />
                  )}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="max-w-[170px] text-sm" asChild>
                <Link to="/login" className="flex items-center">
                  <ArrowLeftOnRectangleIcon className="mr-2 h-4 w-4" />
                  {t("header.logout")}
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {isSudo() && (
            <Button
              size="icon"
              variant="outline"
              aria-label="core settings"
              onClick={() => {
                useDashboard.setState({ isEditingCore: true });
              }}
            >
              <Cog6ToothIcon className="h-4 w-4" />
            </Button>
          )}

          <Language />

          <Button
            size="icon"
            variant="outline"
            aria-label="switch theme"
            onClick={() => {
              const next = colorMode == "dark" ? "light" : "dark";
              updateThemeColor(next);
              setTheme(next);
            }}
          >
            {colorMode === "light" ? (
              <MoonIcon className="h-4 w-4" />
            ) : (
              <SunIcon className="h-4 w-4" />
            )}
          </Button>

          <div className="flex items-center pr-2 [&_span]:inline-flex" dir="ltr">
            <GitHubButton
              href={REPO_URL}
              data-color-scheme={`no-preference: ${gBtnColor}; light: ${gBtnColor}; dark: ${gBtnColor};`}
              data-size="large"
              data-show-count="true"
              aria-label="Star Marzban on GitHub"
            >
              Star
            </GitHubButton>
          </div>
        </div>
      </div>
    </div>
  );
};
