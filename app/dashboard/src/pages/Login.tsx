import { ArrowRightOnRectangleIcon } from "@heroicons/react/24/outline";
import { zodResolver } from "@hookform/resolvers/zod";
import { FC, useEffect, useState } from "react";
import { FieldValues, useForm } from "react-hook-form";
import { useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Footer } from "components/Footer";
import { Input } from "components/Input";
import { Button } from "components/ui/button";
import { fetch } from "service/http";
import { removeAuthToken, setAuthToken } from "utils/authStorage";
import { ReactComponent as Logo } from "assets/logo.svg";
import { useTranslation } from "react-i18next";
import { Language } from "components/Language";

const schema = z.object({
  username: z.string().min(1, "login.fieldRequired"),
  password: z.string().min(1, "login.fieldRequired"),
});

export const LogoIcon = () => (
  <Logo className="h-12 w-12" style={{ strokeWidth: "10px" }} />
);

export const Login: FC = () => {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();
  let location = useLocation();
  const {
    register,
    formState: { errors },
    handleSubmit,
  } = useForm({
    resolver: zodResolver(schema),
  });
  useEffect(() => {
    removeAuthToken();
    if (location.pathname !== "/login") {
      navigate("/login", { replace: true });
    }
  }, []);
  const login = (values: FieldValues) => {
    setError("");
    const formData = new FormData();
    formData.append("username", values.username);
    formData.append("password", values.password);
    formData.append("grant_type", "password");
    setLoading(true);
    fetch("/admin/token", { method: "post", body: formData })
      .then(({ access_token: token }) => {
        setAuthToken(token);
        navigate("/");
      })
      .catch((err) => {
        setError(err.response._data.detail);
      })
      .finally(setLoading.bind(null, false));
  };
  return (
    <div className="flex min-h-screen w-full flex-col justify-between p-6">
      <div className="w-full">
        <div className="flex w-full justify-end">
          <Language />
        </div>
        <div className="flex w-full items-center justify-center">
          <div className="mt-6 w-full max-w-[340px]">
            <div className="flex w-full flex-col items-center gap-2">
              <LogoIcon />
              <p className="text-2xl font-semibold">
                {t("login.loginYourAccount")}
              </p>
              <p className="text-muted-foreground">{t("login.welcomeBack")}</p>
            </div>
            <div className="m-auto w-full max-w-[300px] pt-4">
              <form onSubmit={handleSubmit(login)}>
                <div className="mt-4 flex flex-col gap-2">
                  <Input
                    placeholder={t("username")}
                    {...register("username")}
                    error={t(errors?.username?.message as string)}
                  />
                  <Input
                    type="password"
                    placeholder={t("password")}
                    {...register("password")}
                    error={t(errors?.password?.message as string)}
                  />
                  {error && (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {error}
                    </div>
                  )}
                  <Button
                    disabled={loading}
                    type="submit"
                    className="w-full"
                  >
                    {loading && (
                      <svg
                        className="mr-2 h-4 w-4 animate-spin"
                        viewBox="0 0 24 24"
                        fill="none"
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
                    <ArrowRightOnRectangleIcon className="mr-1 h-4 w-4" />
                    {t("login")}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Login;
