export const updateThemeColor = (colorMode: "light" | "dark") => {
  const el = document.querySelector('meta[name="theme-color"]');
  el?.setAttribute("content", colorMode == "dark" ? "#1A202C" : "#3B81F6");
};
