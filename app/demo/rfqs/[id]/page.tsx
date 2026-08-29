import { notFound } from "next/navigation";
import { demoRfqs } from "@/lib/demo/data";
import DemoRfqDetailView from "@/components/DemoRfqDetailView";

export function generateStaticParams() {
  return demoRfqs.map((r) => ({ id: r.id }));
}

export default async function DemoRfqDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rfq = demoRfqs.find((r) => r.id === id);
  if (!rfq) notFound();
  return <DemoRfqDetailView rfq={rfq} />;
}
