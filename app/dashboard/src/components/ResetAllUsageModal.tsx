import { DocumentMinusIcon } from "@heroicons/react/24/outline";
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
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Icon } from "./Icon";

export const ResetIcon = () => <DocumentMinusIcon className="h-5 w-5" />;

export type DeleteUserModalProps = {};

export const ResetAllUsageModal: FC<DeleteUserModalProps> = () => {
  const [loading, setLoading] = useState(false);
  const { isResetingAllUsage, onResetAllUsage, resetAllUsage } = useDashboard();
  const { t } = useTranslation();
  const onClose = () => {
    onResetAllUsage(false);
  };
  const onReset = () => {
    setLoading(true);
    resetAllUsage()
      .then(() => {
        toast.success(t("resetAllUsage.success"), { duration: 3000 });
      })
      .catch(() => {
        toast.error(t("resetAllUsage.error"), { duration: 3000 });
      })
      .finally(() => {
        setLoading(false);
      });
  };
  return (
    <AlertDialog
      open={isResetingAllUsage}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent className="mx-3 max-w-sm">
        <AlertDialogHeader className="pt-2">
          <Icon color="red">
            <ResetIcon />
          </Icon>
          <AlertDialogTitle className="text-lg">
            {t("resetAllUsage.title")}
          </AlertDialogTitle>
        </AlertDialogHeader>
        {isResetingAllUsage && (
          <p className="text-sm text-muted-foreground">
            {t("resetAllUsage.prompt")}
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
            variant="destructive"
            onClick={onReset}
            disabled={loading}
          >
            {t("reset")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
