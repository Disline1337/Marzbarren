import { cn } from "lib/utils";
import { FC, PropsWithChildren } from "react";

export type IconType = {
  color: string;
};

const tones: Record<string, { wash: string; fg: string }> = {
  primary: { wash: "bg-primary", fg: "text-white" },
  red: { wash: "bg-red-400", fg: "text-red-600 dark:text-red-200" },
  orange: { wash: "bg-orange-400", fg: "text-orange-600 dark:text-orange-200" },
  green: { wash: "bg-green-400", fg: "text-green-600 dark:text-green-200" },
  yellow: { wash: "bg-yellow-400", fg: "text-yellow-600 dark:text-yellow-200" },
  blue: { wash: "bg-blue-400", fg: "text-blue-600 dark:text-blue-200" },
};

export const Icon: FC<PropsWithChildren<IconType>> = ({ children, color }) => {
  const tone = tones[color] || tones.primary;
  return (
    <div className="relative mb-1 inline-flex h-9 w-9 items-center justify-center">
      <span
        className={cn(
          "absolute -inset-[5px] z-[1] rounded-lg opacity-40",
          tone.wash
        )}
      />
      <span
        className={cn(
          "absolute inset-0 z-[1] rounded-[5px] opacity-50",
          tone.wash
        )}
      />
      <span className={cn("relative z-[2]", tone.fg)}>{children}</span>
    </div>
  );
};
