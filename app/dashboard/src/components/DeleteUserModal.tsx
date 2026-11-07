import { TrashIcon } from "@heroicons/react/24/outline";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "components/ui/alert-dialog";
import { Button } from "components/ui/button";
import { useDashboard } from "contexts/DashboardContext";
import { cn } from "lib/utils";
import React, { FC, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Icon } from "./Icon";

export const DeleteIcon = ({
  className,
  ...props
}: React.ComponentProps<typeof TrashIcon>) => (
  <TrashIcon className={cn("h-5 w-5", className)} {...props} />
);

export type DeleteUserModalProps = {
  deleteCallback?: () => void;
};

export const DeleteUserModal: FC<DeleteUserModalProps> = () => {
  const [loading, setLoading] = useState(false);
  const { deletingUser: user, onDeletingUser, deleteUser } = useDashboard();
  const { t } = useTranslation();
  const onClose = () => {
    onDeletingUser(null);
  };
  const onDelete = () => {
    if (user) {
      setLoading(true);
      deleteUser(user)
        .then(() => {
          toast.success(
            t("deleteUser.deleteSuccess", { username: user.username }),
            { duration: 3000 }
          );
        })
        .then(onClose)
        .finally(setLoading.bind(null, false));
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
          <Icon color="red">
            <DeleteIcon />
          </Icon>
          <AlertDialogTitle className="text-lg">
            {t("deleteUser.title")}
          </AlertDialogTitle>
        </AlertDialogHeader>
        {user && (
          <p className="text-sm text-muted-foreground">
            <Trans components={{ b: <b /> }}>
              {t("deleteUser.prompt", { username: user.username })}
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
            variant="destructive"
            onClick={onDelete}
            disabled={loading}
          >
            {t("delete")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
