import { LanguageIcon } from "@heroicons/react/24/outline";
import { Button } from "components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "components/ui/dropdown-menu";
import { FC, ReactNode } from "react";
import { useTranslation } from "react-i18next";

type HeaderProps = {
  actions?: ReactNode;
};

export const Language: FC<HeaderProps> = ({ actions }) => {
  const { i18n } = useTranslation();

  var changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <LanguageIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[100px]">
        <DropdownMenuItem
          className="max-w-[100px] text-sm"
          onClick={() => changeLanguage("en")}
        >
          English
        </DropdownMenuItem>
        <DropdownMenuItem
          className="max-w-[100px] text-sm"
          onClick={() => changeLanguage("fa")}
        >
          فارسی
        </DropdownMenuItem>
        <DropdownMenuItem
          className="max-w-[100px] text-sm"
          onClick={() => changeLanguage("zh-cn")}
        >
          简体中文
        </DropdownMenuItem>
        <DropdownMenuItem
          className="max-w-[100px] text-sm"
          onClick={() => changeLanguage("ru")}
        >
          Русский
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
