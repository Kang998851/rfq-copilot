import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap { const base = "https://rfq-copilot.vercel.app"; return ["", "/demo", "/demo/products", "/demo/rfqs", "/login", "/privacy", "/terms"].map(path => ({ url: `${base}${path}`, lastModified: new Date() })); }
