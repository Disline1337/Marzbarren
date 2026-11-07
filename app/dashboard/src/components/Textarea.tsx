import { XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "components/ui/button";
import { Label } from "components/ui/label";
import { Textarea as UiTextarea } from "components/ui/textarea";
import { cn } from "lib/utils";
import React, { PropsWithChildren, ReactNode } from "react";

export type TextareaProps = PropsWithChildren<
  {
    value?: string;
    className?: string;
    endAdornment?: ReactNode;
    startAdornment?: ReactNode;
    type?: string;
    placeholder?: string;
    onChange?: (e: any) => void;
    onBlur?: (e: any) => void;
    onClick?: (e: any) => void;
    name?: string;
    error?: string;
    disabled?: boolean;
    step?: number;
    label?: string;
    clearable?: boolean;
  } & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value">
>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      disabled,
      label,
      className,
      startAdornment,
      endAdornment,
      placeholder,
      onChange,
      onBlur,
      name,
      value,
      onClick,
      error,
      clearable = false,
      id,
      ...props
    },
    ref
  ) => {
    const clear = () => {
      if (onChange)
        onChange({
          target: {
            value: "",
            name,
          },
        });
    };
    const inputId = id || name;
    const showClear = Boolean(clearable && value && value.length);
    const hasAddon = Boolean(startAdornment || endAdornment || showClear);

    return (
      <div className="w-full">
        {label && (
          <Label htmlFor={inputId} className="mb-1 block text-sm font-medium">
            {label}
          </Label>
        )}
        <div
          className={cn(
            "flex w-full items-stretch rounded-[6px]",
            hasAddon &&
              "overflow-hidden border border-input focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/40 dark:border-gray-600",
            disabled && "cursor-not-allowed bg-muted opacity-50",
            error && "border-destructive"
          )}
        >
          {startAdornment && (
            <div className="flex items-center border-r border-input bg-muted px-3 text-sm text-muted-foreground dark:border-gray-600">
              {startAdornment}
            </div>
          )}
          <UiTextarea
            id={inputId}
            name={name}
            ref={ref}
            className={cn(
              "min-h-[80px] flex-1",
              hasAddon && "rounded-none border-0 focus-visible:ring-0",
              className
            )}
            placeholder={placeholder}
            onChange={onChange}
            onBlur={onBlur}
            value={value}
            onClick={onClick}
            disabled={disabled}
            {...props}
          />
          {endAdornment && (
            <div className="flex items-center border-l border-input px-3 text-sm text-muted-foreground dark:border-gray-600">
              {endAdornment}
            </div>
          )}
          {showClear && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-none"
              onClick={clear}
            >
              <XMarkIcon className="h-4 w-4" />
            </Button>
          )}
        </div>
        {!!error && <p className="mt-1 text-sm text-destructive">{error}</p>}
      </div>
    );
  }
);
