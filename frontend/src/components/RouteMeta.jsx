import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { metaFor } from "../seo";

function setMeta(selector, attr, value) {
  const el = document.head.querySelector(selector);
  if (el) el.setAttribute(attr, value);
}

// Keeps <title>, description, canonical and robots in step with the current route.
export default function RouteMeta() {
  const { pathname } = useLocation();

  useEffect(() => {
    const m = metaFor(pathname);
    document.title = m.title;
    setMeta('meta[name="description"]', "content", m.description);
    setMeta('link[rel="canonical"]', "href", m.canonical);
    setMeta('meta[property="og:url"]', "content", m.canonical);
    setMeta('meta[property="og:title"]', "content", m.title);
    setMeta('meta[property="og:description"]', "content", m.description);
    setMeta('meta[name="twitter:title"]', "content", m.title);
    setMeta('meta[name="robots"]', "content", m.index
      ? "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1"
      : "noindex, follow");
  }, [pathname]);

  return null;
}
