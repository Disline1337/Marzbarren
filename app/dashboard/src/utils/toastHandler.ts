import { toast } from "sonner";
import { UseFormReturn } from "react-hook-form";

export const generateErrorMessage = (e: any, form?: UseFormReturn<any>) => {
  if (e.response && e.response._data) {
    if (typeof e.response._data.detail === "string")
      return toast.error(e.response._data.detail, { duration: 3000 });
    if (typeof e.response._data.detail === "object")
      if (form) {
        Object.keys(e.response._data.detail).forEach((errorKey) =>
          form.setError(errorKey, {
            message: e.response._data.detail[errorKey],
          })
        );
        return;
      }
  }
  return toast.error("Something went wrong!", { duration: 3000 });
};

export const generateSuccessMessage = (message: string) => {
  return toast.success(message, { duration: 3000 });
};
