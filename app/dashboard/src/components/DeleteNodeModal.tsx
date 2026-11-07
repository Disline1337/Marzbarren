import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "components/ui/alert-dialog";
import { Button } from "components/ui/button";
import { FetchNodesQueryKey, useNodes } from "contexts/NodesContext";
import { FC } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "react-query";
import {
  generateErrorMessage,
  generateSuccessMessage,
} from "utils/toastHandler";
import { DeleteIcon, DeleteUserModalProps } from "./DeleteUserModal";
import { Icon } from "./Icon";

export const DeleteNodeModal: FC<DeleteUserModalProps> = ({
  deleteCallback,
}) => {
  const { deleteNode, deletingNode, setDeletingNode } = useNodes();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const onClose = () => {
    setDeletingNode(null);
  };

  const { isLoading, mutate: onDelete } = useMutation(deleteNode, {
    onSuccess: () => {
      generateSuccessMessage(
        t("deleteNode.deleteSuccess", { name: deletingNode && deletingNode.name })
      );
      setDeletingNode(null);
      queryClient.invalidateQueries(FetchNodesQueryKey);
      deleteCallback && deleteCallback();
    },
    onError: (e) => {
      generateErrorMessage(e);
    },
  });

  return (
    <AlertDialog
      open={!!deletingNode}
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
            {t("deleteNode.title")}
          </AlertDialogTitle>
        </AlertDialogHeader>
        {deletingNode && (
          <p className="text-sm text-muted-foreground">
            <Trans components={{ b: <b /> }}>
              {t("deleteNode.prompt", { name: deletingNode.name })}
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
            onClick={() => onDelete()}
            disabled={isLoading}
          >
            {t("delete")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
