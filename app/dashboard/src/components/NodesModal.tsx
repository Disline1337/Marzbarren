import {
  EyeIcon,
  EyeSlashIcon,
  InformationCircleIcon,
  PlusIcon as HeroIconPlusIcon,
  SquaresPlusIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "components/ui/accordion";
import { Badge } from "components/ui/badge";
import { Button, ButtonProps } from "components/ui/button";
import { Checkbox } from "components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "components/ui/dialog";
import { Label } from "components/ui/label";
import { Switch } from "components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "components/ui/tooltip";
import {
  FetchNodesQueryKey,
  getNodeDefaultValues,
  NodeSchema,
  NodeType,
  useNodes,
  useNodesQuery,
} from "contexts/NodesContext";
import { FC, ReactNode, useState } from "react";
import { Controller, useForm, UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  UseMutateFunction,
  useMutation,
  useQuery,
  useQueryClient,
} from "react-query";
import "slick-carousel/slick/slick-theme.css";
import "slick-carousel/slick/slick.css";
import { Status } from "types/User";
import {
  generateErrorMessage,
  generateSuccessMessage,
} from "utils/toastHandler";
import { useDashboard } from "../contexts/DashboardContext";
import { DeleteNodeModal } from "./DeleteNodeModal";
import { DeleteIcon } from "./DeleteUserModal";
import { ReloadIcon } from "./Filters";
import { Icon } from "./Icon";
import { NodeModalStatusBadge } from "./NodeModalStatusBadge";

import { fetch } from "service/http";
import { Input } from "./Input";

type AccordionInboundType = {
  node: NodeType;
  value: string;
};

const NodeAccordion: FC<AccordionInboundType> = ({ node, value }) => {
  const { updateNode, reconnectNode, setDeletingNode } = useNodes();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const form = useForm<NodeType>({
    defaultValues: node,
    resolver: zodResolver(NodeSchema),
  });
  const handleDeleteNode = setDeletingNode.bind(null, node);

  const { isLoading, mutate } = useMutation(updateNode, {
    onSuccess: () => {
      generateSuccessMessage("Node updated successfully");
      queryClient.invalidateQueries(FetchNodesQueryKey);
    },
    onError: (e) => {
      generateErrorMessage(e, form);
    },
  });

  const { isLoading: isReconnecting, mutate: reconnect } = useMutation(
    reconnectNode.bind(null, node),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(FetchNodesQueryKey);
      },
    }
  );

  const nodeStatus: Status = isReconnecting
    ? "connecting"
    : node.status
    ? node.status
    : "error";

  return (
    <AccordionItem
      value={value}
      className="w-full rounded border border-gray-200 p-1 dark:border-gray-600"
    >
      <AccordionTrigger className="rounded-sm px-2 py-2 hover:no-underline">
        <div className="flex w-full flex-row items-center justify-between gap-2 pr-2">
          <span className="flex-1 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
            {node.name}
          </span>
          <div className="flex flex-row items-center gap-2">
            {node.xray_version && (
              <Badge className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-blue-800 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-100 dark:hover:bg-blue-900">
                <span className="text-[0.7rem] font-medium capitalize tracking-tighter">
                  Xray {node.xray_version}
                </span>
              </Badge>
            )}
            {node.status && (
              <NodeModalStatusBadge status={nodeStatus} compact />
            )}
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-2 pb-2">
        <div className="flex flex-col items-start gap-4 pb-3">
          {nodeStatus === "error" && (
            <div className="w-full rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <div className="flex w-full flex-row items-center gap-2">
                <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
                <p>{node.message}</p>
              </div>
              <div className="mt-2 flex w-full flex-row justify-end">
                <Button
                  size="sm"
                  aria-label="reconnect node"
                  onClick={() => reconnect()}
                  disabled={isReconnecting}
                >
                  <ReloadIcon />
                  {isReconnecting
                    ? t("nodes.reconnecting")
                    : t("nodes.reconnect")}
                </Button>
              </div>
            </div>
          )}
        </div>
        <NodeForm
          form={form}
          mutate={mutate}
          isLoading={isLoading}
          submitBtnText={t("nodes.editNode")}
          btnLeftAdornment={
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  aria-label="delete node"
                  type="button"
                  onClick={handleDeleteNode}
                >
                  <DeleteIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t("delete")}</TooltipContent>
            </Tooltip>
          }
        />
      </AccordionContent>
    </AccordionItem>
  );
};

type AddNodeFormType = {
  resetAccordions: () => void;
  value: string;
};

const AddNodeForm: FC<AddNodeFormType> = ({ resetAccordions, value }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { addNode } = useNodes();
  const form = useForm<NodeType>({
    resolver: zodResolver(NodeSchema),
    defaultValues: {
      ...getNodeDefaultValues(),
      add_as_new_host: false,
    },
  });
  const { isLoading, mutate } = useMutation(addNode, {
    onSuccess: () => {
      generateSuccessMessage(
        t("nodes.addNodeSuccess", { name: form.getValues("name") })
      );
      queryClient.invalidateQueries(FetchNodesQueryKey);
      form.reset();
      resetAccordions();
    },
    onError: (e) => {
      generateErrorMessage(e, form);
    },
  });
  return (
    <AccordionItem
      value={value}
      className="w-full rounded border border-gray-200 p-1 dark:border-gray-600"
    >
      <AccordionTrigger className="rounded-sm px-2 py-2 hover:no-underline">
        <span className="flex flex-1 items-center gap-1 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
          <HeroIconPlusIcon className="inline-block h-5 w-5 stroke-2" />
          <span>{t("nodes.addNewMarzbanNode")}</span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="px-2 py-4">
        <NodeForm
          form={form}
          mutate={mutate}
          isLoading={isLoading}
          submitBtnText={t("nodes.addNode")}
          btnProps={{ variant: "default" }}
          addAsHost
        />
      </AccordionContent>
    </AccordionItem>
  );
};

type NodeFormType = FC<{
  form: UseFormReturn<NodeType>;
  mutate: UseMutateFunction<unknown, unknown, any>;
  isLoading: boolean;
  submitBtnText: string;
  btnProps?: Partial<ButtonProps>;
  btnLeftAdornment?: ReactNode;
  addAsHost?: boolean;
}>;

const NodeForm: NodeFormType = ({
  form,
  mutate,
  isLoading,
  submitBtnText,
  btnProps = {},
  btnLeftAdornment,
  addAsHost = false,
}) => {
  const { t } = useTranslation();
  const [showCertificate, setShowCertificate] = useState(false);
  const { data: nodeSettings } = useQuery({
    queryKey: "node-settings",
    queryFn: () =>
      fetch<{
        min_node_version: string;
        certificate: string;
      }>("/node/settings"),
  });
  function selectText(node: HTMLElement) {
    // @ts-ignore
    if (document.body.createTextRange) {
      // @ts-ignore
      const range = document.body.createTextRange();
      range.moveToElementText(node);
      range.select();
    } else if (window.getSelection) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(node);
      selection!.removeAllRanges();
      selection!.addRange(range);
    } else {
      console.warn("Could not select text in node: Unsupported browser.");
    }
  }

  return (
    <form onSubmit={form.handleSubmit((v) => mutate(v))}>
      <div className="flex flex-col gap-4">
        {nodeSettings && nodeSettings.certificate && (
          <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100">
            <InformationCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex w-full flex-col overflow-hidden">
              <span>{t("nodes.connection-hint")}</span>
              <div className="flex flex-row justify-end gap-2 py-2">
                <Button asChild size="sm" variant="default">
                  <a
                    download="ssl_client_cert.pem"
                    href={URL.createObjectURL(
                      new Blob([nodeSettings.certificate], {
                        type: "text/plain",
                      })
                    )}
                  >
                    {t("nodes.download-certificate")}
                  </a>
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      aria-label={t(
                        !showCertificate
                          ? "nodes.show-certificate"
                          : "nodes.show-certificate"
                      )}
                      onClick={setShowCertificate.bind(null, !showCertificate)}
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-primary"
                    >
                      {!showCertificate ? (
                        <EyeIcon className="h-4 w-4" />
                      ) : (
                        <EyeSlashIcon className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {t(
                      !showCertificate
                        ? "nodes.show-certificate"
                        : "nodes.show-certificate"
                    )}
                  </TooltipContent>
                </Tooltip>
              </div>
              {showCertificate && (
                <pre
                  className="cursor-text overflow-auto whitespace-pre rounded-md bg-white/50 p-2 font-mono text-[10px] leading-tight dark:bg-white/20"
                  onClick={(e) => {
                    selectText(e.target as HTMLElement);
                  }}
                >
                  {nodeSettings.certificate}
                </pre>
              )}
            </div>
          </div>
        )}

        <div className="flex w-full flex-row items-center gap-2">
          <div className="flex-1">
            <Input
              label={t("nodes.nodeName")}
              placeholder="Marzban-S2"
              {...form.register("name")}
              error={form.formState?.errors?.name?.message}
            />
          </div>
          <div className="px-1">
            <Controller
              name="status"
              control={form.control}
              render={({ field }) => {
                return (
                  <Tooltip key={field.value}>
                    <TooltipTrigger asChild>
                      <div className="mt-6">
                        <Switch
                          checked={field.value !== "disabled"}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              field.onChange("connecting");
                            } else {
                              field.onChange("disabled");
                            }
                          }}
                          aria-label={
                            `${t("usersTable.status")}: ` +
                            (field.value !== "disabled"
                              ? t("active")
                              : t("disabled"))
                          }
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="capitalize">
                      {`${t("usersTable.status")}: ` +
                        (field.value !== "disabled"
                          ? t("active")
                          : t("disabled"))}
                    </TooltipContent>
                  </Tooltip>
                );
              }}
            />
          </div>
        </div>
        <div className="flex w-full flex-row items-start">
          <div className="w-full">
            <Input
              label={t("nodes.nodeAddress")}
              placeholder="51.20.12.13"
              {...form.register("address")}
              error={form.formState?.errors?.address?.message}
            />
          </div>
        </div>
        <div className="flex w-full flex-row items-start gap-2">
          <div>
            <Input
              label={t("nodes.nodePort")}
              placeholder="62050"
              {...form.register("port")}
              error={form.formState?.errors?.port?.message}
            />
          </div>
          <div>
            <Input
              label={t("nodes.nodeAPIPort")}
              placeholder="62051"
              {...form.register("api_port")}
              error={form.formState?.errors?.api_port?.message}
            />
          </div>
          <div>
            <Input
              label={t("nodes.usageCoefficient")}
              placeholder="1"
              {...form.register("usage_coefficient")}
              error={form.formState?.errors?.usage_coefficient?.message}
            />
          </div>
        </div>
        {addAsHost && (
          <Controller
            name="add_as_new_host"
            control={form.control}
            render={({ field }) => (
              <div className="flex items-center gap-2 py-1">
                <Checkbox
                  id="add_as_new_host"
                  checked={!!field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                />
                <Label htmlFor="add_as_new_host" className="m-0 font-normal">
                  {t("nodes.addHostForEveryInbound")}
                </Label>
              </div>
            )}
          />
        )}
        <div className="flex w-full flex-row items-center gap-2">
          {btnLeftAdornment}
          <Button
            className="w-full flex-1 px-5"
            type="submit"
            size="sm"
            disabled={isLoading}
            {...btnProps}
          >
            {isLoading && (
              <svg
                className="mr-2 h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            )}
            {submitBtnText}
          </Button>
        </div>
      </div>
    </form>
  );
};

export const NodesDialog: FC = () => {
  const { isEditingNodes, onEditingNodes } = useDashboard();
  const { t } = useTranslation();
  const [openAccordions, setOpenAccordions] = useState<any>({});
  const { data: nodes, isLoading } = useNodesQuery();

  const onClose = () => {
    setOpenAccordions({});
    onEditingNodes(false);
  };

  return (
    <>
      <Dialog
        open={isEditingNodes}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent className="max-w-3xl w-fit">
          <DialogHeader className="pt-0">
            <DialogTitle className="sr-only">{t("nodes.title")}</DialogTitle>
            <Icon color="primary">
              <SquaresPlusIcon className="h-5 w-5 text-white" />
            </Icon>
          </DialogHeader>
          <div className="w-[440px] max-w-full pb-0 pt-1">
            <p className="mb-3 text-sm opacity-80">{t("nodes.title")}</p>
            {isLoading && "loading..."}

            <Accordion
              type="multiple"
              className="w-full"
              value={Object.keys(openAccordions)}
              onValueChange={(vals) => {
                const next: Record<string, object> = {};
                vals.forEach((v) => {
                  next[v] = {};
                });
                setOpenAccordions(next);
              }}
            >
              <div className="flex w-full flex-col gap-4">
                {!isLoading &&
                  nodes &&
                  nodes.map((node, index) => {
                    return (
                      <NodeAccordion
                        key={node.name}
                        value={String(index)}
                        node={node}
                      />
                    );
                  })}

                <AddNodeForm
                  value={String((nodes || []).length)}
                  resetAccordions={() => setOpenAccordions({})}
                />
              </div>
            </Accordion>
          </div>
        </DialogContent>
      </Dialog>
      <DeleteNodeModal deleteCallback={() => setOpenAccordions({})} />
    </>
  );
};
