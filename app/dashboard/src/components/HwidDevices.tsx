import {
  Alert,
  AlertIcon,
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Box,
  Button,
  FormControl,
  FormErrorMessage,
  FormLabel,
  HStack,
  Input,
  SimpleGrid,
  Spinner,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useToast,
  VStack,
} from "@chakra-ui/react";
import { FC, useRef, useState } from "react";
import { useQuery } from "react-query";
import { useTranslation } from "react-i18next";
import { fetch } from "service/http";
import { HwidDevice } from "types/User";

function deviceUsage(
  count?: number | null,
  limit?: number | string | null
): string {
  const used = count ?? 0;
  const value = limit === "" || limit === null || limit === undefined ? null : Number(limit);
  const cap = Number.isInteger(value) && (value ?? -1) >= 0 ? value : null;
  if (cap === 0) return `${used}/∞`;
  if (cap === null) return String(used);
  return `${used}/${cap}`;
}

type HwidDevicesProps = {
  username: string;
  disabled?: boolean;
  limit?: number | string | null;
};
const emptyDevice = {
  hwid: "",
  platform: "",
  os_version: "",
  device_model: "",
};

export const HwidDevices: FC<HwidDevicesProps> = ({
  username,
  disabled,
  limit,
}) => {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(emptyDevice);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<HwidDevice | "all" | null>(null);
  const path = `/user/${encodeURIComponent(username)}/hwid/devices`;
  const { data, isLoading, isFetching, isError, refetch } = useQuery(
    ["hwid-devices", username],
    () => fetch<{ total: number; devices: HwidDevice[] }>(path),
    { retry: false }
  );
  const devices = data?.devices || [];
  const locked = busy || disabled;
  const validHwid = /^[a-zA-Z0-9=-]{10,64}$/.test(draft.hwid.trim());
  const date = (value?: string | null) => {
    if (!value) return "—";
    const parsed = new Date(
      /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`
    );
    return Number.isNaN(parsed.getTime())
      ? "—"
      : parsed.toLocaleString(i18n.language);
  };
  const notify = (key: string, status: "success" | "error") => {
    toast({
      title: t(`userDialog.${key}`),
      status,
      isClosable: true,
      position: "top",
    });
  };
  const add = async () => {
    setSubmitted(true);
    if (!validHwid || locked) return;
    setBusy(true);
    try {
      await fetch(path, {
        method: "POST",
        body: Object.fromEntries(
          Object.entries(draft).map(([key, value]) => [
            key,
            value.trim() || null,
          ])
        ),
      });
      setDraft(emptyDevice);
      setAdding(false);
      setSubmitted(false);
      notify("hwidDeviceAdded", "success");
      await refetch();
    } catch (error: unknown) {
      const record = error && typeof error === "object" ? error : undefined;
      const response =
        record && "response" in record && record.response && typeof record.response === "object"
          ? record.response
          : undefined;
      const status =
        record && "status" in record && typeof record.status === "number"
          ? record.status
          : record && "statusCode" in record && typeof record.statusCode === "number"
            ? record.statusCode
            : response && "status" in response && typeof response.status === "number"
              ? response.status
              : undefined;
      notify(status === 409 ? "hwidDuplicate" : "hwidAddError", "error");
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!target || locked) return;
    setBusy(true);
    try {
      await fetch(
        target === "all" ? path : `${path}/${encodeURIComponent(target.hwid)}`,
        { method: "DELETE" }
      );
      notify(
        target === "all" ? "hwidAllDeleted" : "hwidDeviceDeleted",
        "success"
      );
      setTarget(null);
      await refetch();
    } catch {
      notify("hwidDeleteError", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <VStack
      align="stretch"
      spacing={3}
      w="full"
      mt={2}
      borderTopWidth="1px"
      pt={4}
    >
      <HStack justify="space-between" flexWrap="wrap">
        <Text fontSize="sm" fontWeight="semibold">
          {t("userDialog.hwidDevices")} ({deviceUsage(data?.total, limit)})
        </Text>
        <Button
          type="button"
          size="xs"
          variant="outline"
          isLoading={isFetching}
          isDisabled={locked}
          onClick={() => refetch()}
        >
          {t("userDialog.hwidRefresh")}
        </Button>
      </HStack>
      <Text fontSize="xs" color="gray.500">
        {t("userDialog.hwidImmediateHelp")}
      </Text>
      {isError && (
        <Alert status="error" fontSize="sm">
          <AlertIcon />
          {t("userDialog.hwidLoadError")}
        </Alert>
      )}
      {isLoading ? (
        <Spinner size="sm" />
      ) : !isError && devices.length === 0 ? (
        <Text fontSize="sm" color="gray.500">
          {t("userDialog.hwidNoDevices")}
        </Text>
      ) : (
        devices.length > 0 && (
          <Box overflowX="auto" maxH="280px" overflowY="auto">
            <Table size="sm">
              <Thead>
                <Tr>
                  <Th>{t("userDialog.hwid")}</Th>
                  <Th>{t("userDialog.hwidPlatform")}</Th>
                  <Th>{t("userDialog.hwidLastSeen")}</Th>
                  <Th>
                    <Text as="span" srOnly>
                      {t("delete")}
                    </Text>
                  </Th>
                </Tr>
              </Thead>
              <Tbody>
                {devices.map((device) => (
                  <Tr key={device.hwid}>
                    <Td>
                      <Text
                        fontFamily="mono"
                        fontSize="xs"
                        userSelect="all"
                        maxW="180px"
                        overflowWrap="anywhere"
                      >
                        {device.hwid}
                      </Text>
                      <Text fontSize="xs" color="gray.500">
                        {device.request_ip || "—"}
                      </Text>
                    </Td>
                    <Td fontSize="xs">
                      <Text>
                        {[device.platform, device.os_version]
                          .filter(Boolean)
                          .join(" ") || "—"}
                      </Text>
                      <Text color="gray.500">{device.device_model || "—"}</Text>
                    </Td>
                    <Td fontSize="xs" whiteSpace="nowrap">
                      {date(device.updated_at)}
                    </Td>
                    <Td>
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        colorScheme="red"
                        isDisabled={locked}
                        onClick={() => setTarget(device)}
                      >
                        {t("delete")}
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        )
      )}
      <HStack justify="space-between" flexWrap="wrap">
        <Button
          type="button"
          size="xs"
          isDisabled={locked || adding}
          onClick={() => setAdding(true)}
        >
          {t("userDialog.hwidAdd")}
        </Button>
        {devices.length > 0 && (
          <Button
            type="button"
            size="xs"
            variant="outline"
            colorScheme="red"
            isDisabled={locked}
            onClick={() => setTarget("all")}
          >
            {t("userDialog.hwidDeleteAll")}
          </Button>
        )}
      </HStack>
      {adding && (
        <VStack
          align="stretch"
          spacing={3}
          borderWidth="1px"
          borderRadius="md"
          p={3}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              void add();
            }
          }}
        >
          <FormControl isInvalid={submitted && !validHwid}>
            <FormLabel fontSize="sm" htmlFor="hwid-new-id">
              {t("userDialog.hwid")}
            </FormLabel>
            <Input
              id="hwid-new-id"
              size="sm"
              value={draft.hwid}
              maxLength={64}
              isDisabled={locked}
              onChange={(event) =>
                setDraft({ ...draft, hwid: event.target.value })
              }
            />
            <FormErrorMessage>{t("userDialog.hwidInvalid")}</FormErrorMessage>
          </FormControl>
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={2}>
            {(["platform", "os_version", "device_model"] as const).map(
              (key) => (
                <FormControl key={key}>
                  <FormLabel fontSize="xs" htmlFor={`hwid-new-${key}`}>
                    {t(
                      `userDialog.${
                        {
                          platform: "hwidPlatform",
                          os_version: "hwidOsVersion",
                          device_model: "hwidModel",
                        }[key]
                      }`
                    )}
                  </FormLabel>
                  <Input
                    id={`hwid-new-${key}`}
                    size="sm"
                    value={draft[key]}
                    maxLength={key === "device_model" ? 128 : 64}
                    isDisabled={locked}
                    onChange={(event) =>
                      setDraft({ ...draft, [key]: event.target.value })
                    }
                  />
                </FormControl>
              )
            )}
          </SimpleGrid>
          <Text fontSize="xs" color="gray.500">
            {t("userDialog.hwidManualHelp")}
          </Text>
          <HStack justify="end">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              isDisabled={locked}
              onClick={() => {
                setAdding(false);
                setDraft(emptyDevice);
                setSubmitted(false);
              }}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              colorScheme="blue"
              isLoading={busy}
              isDisabled={disabled}
              onClick={add}
            >
              {t("userDialog.hwidAdd")}
            </Button>
          </HStack>
        </VStack>
      )}
      <AlertDialog
        isOpen={target !== null}
        leastDestructiveRef={cancelRef}
        onClose={() => {
          if (!busy) setTarget(null);
        }}
        closeOnOverlayClick={!busy}
        closeOnEsc={!busy}
      >
        <AlertDialogOverlay>
          <AlertDialogContent mx={3}>
            <AlertDialogHeader>
              {t(target === "all" ? "userDialog.hwidDeleteAll" : "delete")}
            </AlertDialogHeader>
            <AlertDialogBody>
              {t(
                target === "all"
                  ? "userDialog.hwidConfirmAll"
                  : "userDialog.hwidConfirmDelete"
              )}
              {target && target !== "all" && (
                <Text
                  fontFamily="mono"
                  fontSize="sm"
                  mt={2}
                  overflowWrap="anywhere"
                >
                  {target.hwid}
                </Text>
              )}
              <Text fontSize="sm" mt={2}>
                {t("userDialog.hwidDeleteHelp")}
              </Text>
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button
                type="button"
                ref={cancelRef}
                isDisabled={busy}
                onClick={() => setTarget(null)}
              >
                {t("cancel")}
              </Button>
              <Button
                type="button"
                colorScheme="red"
                ml={3}
                isLoading={busy}
                isDisabled={disabled}
                onClick={remove}
              >
                {t("delete")}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </VStack>
  );
};
