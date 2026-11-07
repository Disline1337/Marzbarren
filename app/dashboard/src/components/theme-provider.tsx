import { ThemeProvider as NextThemesProvider } from "next-themes";
import { useEffect, type ReactNode } from "react";
import { updateThemeColor } from "utils/themeColor";

function migrateLegacyTheme() {
  if (typeof window === "undefined") return;
  if (!localStorage.getItem("theme")) {
    const legacy = localStorage.getItem("chakra-ui-color-mode");
    if (legacy === "dark" || legacy === "light") {
      localStorage.setItem("theme", legacy);
    }
  }
  localStorage.removeItem("chakra-ui-color-mode");
}

migrateLegacyTheme();

function ThemeColorSync() {
  useEffect(() => {
    const theme = (localStorage.getItem("theme") as "light" | "dark") || "light";
    updateThemeColor(theme);
  }, []);
  return null;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      storageKey="theme"
      enableSystem={false}
    >
      <ThemeColorSync />
      {children}
    </NextThemesProvider>
  );
}
