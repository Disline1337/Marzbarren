import { ArrowPathIcon } from "@heroicons/react/24/outline";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "components/ui/alert-dialog";
import { Button } from "components/ui/button";
import { useDashboard } from "contexts/DashboardContext";
import { FC, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Icon } from "./Icon";

export const ResetIcon = () => <ArrowPathIcon className="h-5 w-5" />;

export type RevokeSubscriptionModalProps = {};

export const RevokeSubscriptionModal: FC<RevokeSubscriptionModalProps> = () => {
  const [loading, setLoading] = useState(false);
  const { revokeSubscriptionUser: user, revokeSubscription } = useDashboard();
  const { t } = useTranslation();
  const onClose = () => {
    useDashboard.setState({ revokeSubscriptionUser: null });
  };
  const onReset = () => {
    if (user) {
      setLoading(true);
      revokeSubscription(user)
        .then(() => {
          toast.success(
            t("revokeUserSub.success", { username: user.username }),
            { duration: 3000 }
          );
        })
        .catch(() => {
          toast.error(t("revokeUserSub.error"), { duration: 3000 });
        })
        .finally(() => {
          setLoading(false);
        });
    }
  };
  return (
    <AlertDialog
      open={!!user}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent className="mx-3 max-w-sm">
        <AlertDialogHeader className="pt-2">
          <Icon color="blue">
            <ResetIcon />
          </Icon>
          <AlertDialogTitle className="text-lg">
            {t("revokeUserSub.title")}
          </AlertDialogTitle>
        </AlertDialogHeader>
        {user && (
          <p className="text-sm text-muted-foreground">
            <Trans components={{ b: <b /> }}>
              {t("revokeUserSub.prompt", { username: user.username })}
            </Trans>
          </p>
        )}
        <AlertDialogFooter className="flex sm:justify-stretch">
          <Button
            size="sm"
            onClick={onClose}
            className="w-full"
            variant="outline"
          >
            {t("cancel")}
          </Button>
          <Button
            size="sm"
            className="w-full"
            onClick={onReset}
            disabled={loading}
          >
            {t("revoke")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
