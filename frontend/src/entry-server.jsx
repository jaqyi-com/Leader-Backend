// Build-time renderer for the public marketing pages (see scripts/prerender.mjs).
// Only pages listed in seo.js INDEXABLE_ROUTES are rendered here; the app itself stays client-only.
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import LandingPage from "./pages/LandingPage";
import PricingPage from "./pages/PricingPage";

const PAGES = {
  "/": LandingPage,
  "/pricing": PricingPage,
};

export function render(url) {
  const Page = PAGES[url];
  if (!Page) throw new Error(`No pre-render page for ${url}`);
  return renderToString(
    <StaticRouter location={url}>
      <ThemeProvider>
        <Page />
      </ThemeProvider>
    </StaticRouter>
  );
}
