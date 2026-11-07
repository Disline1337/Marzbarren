import { ORGANIZATION_URL, REPO_URL } from "constants/Project";
import { useDashboard } from "contexts/DashboardContext";
import { cn } from "lib/utils";
import { FC, HTMLAttributes } from "react";

export const Footer: FC<HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => {
  const { version } = useDashboard();
  return (
    <div
      className={cn("relative flex w-full flex-row items-center py-0", className)}
      {...props}
    >
      <p className="inline-block flex-grow text-center text-xs text-muted-foreground">
        <a className="text-blue-400 hover:underline" href={REPO_URL}>
          Marzban
        </a>
        {version ? ` (v${version}), ` : ", "}
        Made with ❤️ in{" "}
        <a className="text-blue-400 hover:underline" href={ORGANIZATION_URL}>
          Gozargah
        </a>
      </p>
    </div>
  );
};
