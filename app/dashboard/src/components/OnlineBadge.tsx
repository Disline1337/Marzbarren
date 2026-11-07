import { FC } from "react";

type UserStatusProps = {
  lastOnline?: string | null;
};

const convertDateFormat = (lastOnline?: string | null): number | null => {
  if (!lastOnline) return null;

  const date = new Date(`${lastOnline}Z`);
  return Math.floor(date.getTime() / 1000);
};

export const OnlineBadge: FC<UserStatusProps> = ({ lastOnline }) => {
  const currentTimeInSeconds = Math.floor(Date.now() / 1000);
  const unixTime = convertDateFormat(lastOnline);

  if (!lastOnline || unixTime === null) {
    return (
      <div className="circle border border-gray-400 dark:border-gray-600" />
    );
  }

  const timeDifferenceInSeconds = currentTimeInSeconds - unixTime;

  if (timeDifferenceInSeconds <= 60) {
    return <div className="circle pulse green bg-green-300 dark:bg-green-500" />;
  }

  return <div className="circle bg-gray-400 dark:bg-gray-600" />;
};
