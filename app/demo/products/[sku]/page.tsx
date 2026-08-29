import { notFound } from "next/navigation";
import { demoProducts } from "@/lib/demo/data";
import DemoProductDetailView from "@/components/DemoProductDetailView";

export function generateStaticParams() {
  return demoProducts.map((product) => ({ sku: product.sku }));
}

export default async function DemoProductDetail({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const product = demoProducts.find((item) => item.sku === sku);
  if (!product) notFound();
  return <DemoProductDetailView product={product} />;
}
