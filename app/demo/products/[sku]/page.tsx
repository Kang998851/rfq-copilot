import Link from "next/link";
import { notFound } from "next/navigation";
import { demoProducts } from "@/lib/demo/data";

export function generateStaticParams() {
  return demoProducts.map((product) => ({ sku: product.sku }));
}

export default async function DemoProductDetail({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const product = demoProducts.find((item) => item.sku === sku);
  if (!product) notFound();

  const facts: [string, string][] = [
    ["Material", product.material],
    ["Size", product.size],
    ["Cost", `${product.cost} ${product.currency}`],
    ["MOQ", `${product.moq} ${product.unit}`],
    ["Lead Time", `${product.leadTime} days`],
    ["Status", "Active"],
  ];

  return <div className="max-w-3xl">
    <Link href="/demo/products" className="text-sm text-blue-600">← Demo Product Library</Link>
    <div className="mt-5 flex items-start justify-between">
      <div><p className="label">Sample Product · {product.sku}</p><h1 className="mt-2 text-3xl font-bold">{product.name}</h1><p className="mt-2 text-slate-500">{product.category} · {product.model}</p></div>
      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">Read-only</span>
    </div>
    <div className="mt-8 grid gap-4 border border-slate-200 bg-white p-6 sm:grid-cols-2">{facts.map(([label, value]) => <div key={label}><p className="label">{label}</p><p className="mt-2 text-sm font-semibold">{value}</p></div>)}</div>
    <div className="mt-4 border border-slate-200 bg-white p-6"><p className="label">Specifications</p>{Object.entries(product.specifications).map(([key, value]) => <div key={key} className="flex justify-between border-b border-slate-100 py-3 text-sm"><span className="text-slate-500">{key}</span><span className="font-medium">{value}</span></div>)}</div>
    <p className="mt-5 text-xs text-slate-500">Sample Product for product demonstration. This view cannot edit Production data.</p>
  </div>;
}
