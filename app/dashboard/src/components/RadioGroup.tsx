import { EllipsisVerticalIcon } from "@heroicons/react/24/outline";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "components/ui/accordion";
import { Badge } from "components/ui/badge";
import { Checkbox } from "components/ui/checkbox";
import { Input } from "components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "components/ui/select";
import { shadowsocksMethods, XTLSFlows } from "constants/Proxies";
import {
  InboundType,
  ProtocolType,
  useDashboard,
} from "contexts/DashboardContext";
import { t } from "i18next";
import { cn } from "lib/utils";
import { FC, forwardRef, useState } from "react";
import {
  ControllerRenderProps,
  useFormContext,
  useWatch,
} from "react-hook-form";

const NONE = "__none__";

const InboundCard: FC<{
  inbound: InboundType;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}> = ({ inbound, checked, disabled, onCheckedChange }) => {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center justify-between gap-2 overflow-hidden rounded-sm border border-gray-200 px-3 py-2 text-sm font-medium capitalize dark:border-gray-600",
        checked &&
          "border-transparent bg-gray-50 font-medium ring-2 ring-primary dark:bg-[#222C3B]"
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <Checkbox
          checked={checked}
          disabled={disabled}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          className="inbound-item pointer-events-none"
        />
        <span
          className={cn(
            "truncate text-xs uppercase text-gray-700 dark:text-gray-300",
            checked ? "opacity-100" : "opacity-80"
          )}
        >
          {inbound.tag} <span>({inbound.network})</span>
        </span>
      </span>
      {inbound.tls && inbound.tls != "none" && (
        <Badge variant="secondary" className="text-xs opacity-80">
          {inbound.tls}
        </Badge>
      )}
    </label>
  );
};

const ProtocolSelect: FC<{
  name: string;
  options: { title: string; value: string }[];
  disabled?: boolean;
}> = ({ name, options, disabled }) => {
  const form = useFormContext();
  const current = (useWatch({ name, control: form.control }) as string) ?? "";
  const value = current === "" ? NONE : current;
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) =>
        form.setValue(name, next === NONE ? "" : next, {
          shouldDirty: true,
          shouldValidate: true,
        })
      }
    >
      <SelectTrigger className="h-9 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((entry) => (
          <SelectItem
            key={entry.title}
            value={entry.value === "" ? NONE : entry.value}
          >
            {entry.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

const RadioCard: FC<{
  disabled?: boolean;
  title: string;
  description: string;
  toggleAccordion: () => void;
  isSelected: boolean;
  onToggle: (checked: boolean) => void;
}> = ({
  disabled,
  title,
  description,
  toggleAccordion,
  isSelected,
  onToggle,
}) => {
  const form = useFormContext();
  const { inbounds } = useDashboard();
  const [inBoundDefaultValue] = useWatch({
    name: [`inbounds.${title}`],
    control: form.control,
  });
  const selectedInbounds: string[] = inBoundDefaultValue || [];

  const setInbounds = (next: string[]) => {
    form.setValue(`inbounds.${title}`, next);
    if (next.length === 0) {
      const selected_proxies = form.getValues("selected_proxies");
      form.setValue(
        `selected_proxies`,
        selected_proxies.filter((p: string) => p !== title)
      );
      toggleAccordion();
    }
  };

  const protocolInbounds =
    useDashboard.getState().inbounds.get(title as ProtocolType) || [];
  const isPartialSelected =
    !!inBoundDefaultValue &&
    isSelected &&
    protocolInbounds.length !== selectedInbounds.length;
  const protocolHasInbound = protocolInbounds.length > 0;
  const shouldBeDisabled = !isSelected && !protocolHasInbound;

  return (
    <AccordionItem
      value={title}
      disabled={!protocolHasInbound}
      className={cn(
        "overflow-hidden rounded-md border border-gray-200 dark:border-gray-600",
        shouldBeDisabled ? "bg-gray-100 dark:bg-[#364154]" : "bg-transparent",
        isSelected &&
          "border-transparent bg-gray-50 ring-2 ring-primary dark:bg-[#222C3B]"
      )}
    >
      <div className="relative flex items-start">
        {isPartialSelected && (
          <span className="absolute -right-1 -top-1 z-10 h-2 w-2 rounded-full bg-yellow-500" />
        )}
        <label
          className={cn(
            "relative min-w-0 flex-1 px-3 py-2 capitalize",
            shouldBeDisabled ? "pointer-events-none cursor-not-allowed" : "cursor-pointer"
          )}
        >
          <Checkbox
            checked={isSelected}
            disabled={disabled || shouldBeDisabled}
            onCheckedChange={(value) => {
              if (shouldBeDisabled) return;
              onToggle(value === true);
            }}
            className="sr-only"
          />
          <p
            className={cn(
              "text-sm",
              shouldBeDisabled
                ? "text-gray-400 dark:text-gray-500"
                : "text-gray-700 dark:text-gray-200",
              isSelected ? "font-medium opacity-100" : "opacity-80"
            )}
          >
            {title}
          </p>
          <p
            className={cn(
              "text-xs font-medium",
              shouldBeDisabled
                ? "text-gray-400 dark:text-gray-500"
                : "text-gray-600 dark:text-gray-400",
              isSelected ? "opacity-100" : "opacity-80"
            )}
          >
            {description}
          </p>
        </label>
        {isSelected && protocolHasInbound && (
          <AccordionTrigger
            className="mt-1 mr-1 h-auto w-auto shrink-0 flex-none p-0 hover:no-underline [&>svg:last-child]:hidden"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/10">
              <EllipsisVerticalIcon className="h-5 w-5 stroke-2 text-primary" />
            </span>
          </AccordionTrigger>
        )}
      </div>
      <AccordionContent
        className={cn(
          "rounded-b-md px-2 pb-3 pt-0",
          isSelected && "dark:bg-[#222C3B]"
        )}
      >
        <div className="flex w-full flex-col gap-2 rounded-md border px-3 pb-3 pt-1.5 dark:bg-gray-700">
          <div className="flex w-full flex-col items-start gap-1">
            <p className="text-sm">{t("inbound")}</p>
            <div className="flex w-full flex-col gap-2">
              {(
                (inbounds.get(title as ProtocolType) as InboundType[]) || []
              ).map((inbound) => (
                <InboundCard
                  key={inbound.tag}
                  inbound={inbound}
                  checked={selectedInbounds.includes(inbound.tag)}
                  disabled={disabled}
                  onCheckedChange={(checked) => {
                    const next = checked
                      ? [...selectedInbounds, inbound.tag]
                      : selectedInbounds.filter((tag) => tag !== inbound.tag);
                    setInbounds(next);
                  }}
                />
              ))}
            </div>
          </div>
          {title === "vmess" && isSelected && (
            <label className="flex h-[66px] w-full flex-col items-start gap-1">
              <span className="text-sm">ID</span>
              <Input
                className="h-9 text-xs"
                placeholder={t("userDialog.generatedByDefault")}
                disabled={disabled}
                {...form.register("proxies.vmess.id")}
              />
            </label>
          )}
          {title === "vless" && isSelected && (
            <div className="flex w-full flex-col items-start gap-2">
              <label className="flex h-[66px] w-full flex-col items-start gap-1">
                <span className="text-sm">ID</span>
                <Input
                  className="h-9 text-xs"
                  placeholder={t("userDialog.generatedByDefault")}
                  disabled={disabled}
                  {...form.register("proxies.vless.id")}
                />
              </label>
              <label className="flex h-[66px] w-full flex-col items-start gap-1">
                <span className="text-sm">Flow</span>
                <ProtocolSelect
                  name="proxies.vless.flow"
                  options={XTLSFlows}
                  disabled={disabled}
                />
              </label>
            </div>
          )}
          {title === "trojan" && isSelected && (
            <label className="flex h-[66px] w-full flex-col items-start gap-1">
              <span className="text-sm">{t("password")}</span>
              <Input
                className="h-9 text-xs"
                placeholder={t("userDialog.generatedByDefault")}
                disabled={disabled}
                {...form.register("proxies.trojan.password")}
              />
            </label>
          )}
          {title === "hysteria" && isSelected && (
            <label className="flex h-[66px] w-full flex-col items-start gap-1">
              <span className="text-sm">{t("password")}</span>
              <Input
                className="h-9 text-xs"
                placeholder={t("userDialog.generatedByDefault")}
                disabled={disabled}
                {...form.register("proxies.hysteria.auth")}
              />
            </label>
          )}
          {title === "shadowsocks" && isSelected && (
            <div className="flex w-full flex-col items-start gap-2">
              <label className="flex h-[66px] w-full flex-col items-start gap-1">
                <span className="text-sm">{t("password")}</span>
                <Input
                  className="h-9 text-xs"
                  placeholder={t("userDialog.generatedByDefault")}
                  disabled={disabled}
                  {...form.register("proxies.shadowsocks.password")}
                />
              </label>
              <label className="flex h-[66px] w-full flex-col items-start gap-1">
                <span className="text-sm">{t("userDialog.method")}</span>
                <ProtocolSelect
                  name="proxies.shadowsocks.method"
                  options={shadowsocksMethods.map((method) => ({
                    title: method,
                    value: method,
                  }))}
                  disabled={disabled}
                />
              </label>
            </div>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};

export type RadioListType = {
  title: string;
  description: string;
};

export type RadioGroupProps = ControllerRenderProps & {
  list: RadioListType[];
  disabled?: boolean;
};

export const RadioGroup = forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ name, list, onChange, disabled, ...props }, ref) => {
    const form = useFormContext();
    const [expandedAccordions, setExpandedAccordions] = useState<string[]>([]);
    const selected: string[] = props.value || [];

    const toggleAccordion = (title: string) => {
      setExpandedAccordions((current) =>
        current.includes(title)
          ? current.filter((item) => item !== title)
          : [...current, title]
      );
    };

    const toggleProtocol = (title: string, checked: boolean) => {
      const protocolInbounds =
        useDashboard.getState().inbounds.get(title as ProtocolType) || [];
      if (checked && protocolInbounds.length === 0) return;

      const next = checked
        ? selected.includes(title)
          ? selected
          : [...selected, title]
        : selected.filter((item) => item !== title);

      if (checked && !selected.includes(title)) {
        form.setValue(
          `inbounds.${title}`,
          protocolInbounds.map((inbound) => inbound.tag)
        );
      }
      setExpandedAccordions((current) =>
        current.filter((item) => next.includes(item))
      );

      onChange({
        target: {
          value: next,
          name,
        },
      });
    };

    return (
      <Accordion
        type="multiple"
        value={expandedAccordions}
        onValueChange={setExpandedAccordions}
      >
        <div ref={ref} className="flex flex-col items-stretch gap-2">
          {list.map((value) => (
            <RadioCard
              toggleAccordion={() => toggleAccordion(value.title)}
              disabled={disabled}
              key={value.title}
              title={value.title}
              description={value.description}
              isSelected={selected.includes(value.title)}
              onToggle={(checked) => toggleProtocol(value.title, checked)}
            />
          ))}
        </div>
      </Accordion>
    );
  }
);
