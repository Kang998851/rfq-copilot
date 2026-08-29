import type { Company, Quotation, QuotationItem, Rfq } from "@/types/database";
import { formatMoney, lineAmount, quoteTotal } from "@/lib/quote/totals";
import type { Messages } from "@/lib/i18n/messages";

type Props = {
  company: Company | null;
  rfq: Rfq;
  quote: Quotation;
  items: QuotationItem[];
  copy: Messages["quoteDoc"];
};

export default function QuotationDocument({ company, rfq, quote, items, copy }: Props) {
  const total = quoteTotal(items);
  const issued = new Date(quote.updated_at || quote.created_at).toLocaleDateString();

  return (
    <article className="w-[210mm] max-w-full bg-white p-10 text-slate-900">
      <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">{copy.quotation}</p>
          <h1 className="mt-2 text-2xl font-bold">{company?.name ?? "RFQ Copilot"}</h1>
          <p className="mt-2 text-sm text-slate-500">
            {[company?.contact_name, company?.contact_email, company?.website].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="text-right text-sm">
          <p className="font-mono text-xs font-semibold text-blue-700">{rfq.reference}</p>
          <p className="mt-2 text-slate-500">{copy.date}: {issued}</p>
          <p className="text-slate-500">{copy.currency}: {quote.currency}</p>
          <p className="mt-1 font-semibold capitalize">{quote.status === "sent" ? copy.sent : quote.status === "ready" ? copy.ready : copy.draft}</p>
        </div>
      </header>

      <section className="mt-6 grid gap-6 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{copy.to}</p>
          <p className="mt-2 font-semibold">{rfq.buyer_name}</p>
          {rfq.buyer_email && <p className="text-slate-500">{rfq.buyer_email}</p>}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{copy.from}</p>
          <p className="mt-2 font-semibold">{company?.name}</p>
          <p className="text-slate-500">{company?.country}{company?.industry ? ` · ${company.industry}` : ""}</p>
        </div>
      </section>

      <table className="mt-8 w-full text-left text-sm">
        <thead className="border-y border-slate-200 text-xs uppercase text-slate-500">
          <tr>
            <th className="py-2 pr-2">SKU</th>
            <th className="py-2 pr-2">{copy.product}</th>
            <th className="py-2 pr-2">{copy.qty}</th>
            <th className="py-2 pr-2">{copy.unitPrice}</th>
            <th className="py-2 pr-2">{copy.amount}</th>
            <th className="py-2">{copy.lead}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-slate-100">
              <td className="py-2 pr-2 font-mono text-xs">{item.sku ?? "—"}</td>
              <td className="py-2 pr-2">{item.name}</td>
              <td className="py-2 pr-2">{item.quantity ?? "—"} {item.unit ?? ""}</td>
              <td className="py-2 pr-2">{formatMoney(item.unit_price, quote.currency)}</td>
              <td className="py-2 pr-2">{formatMoney(lineAmount(item.quantity, item.unit_price), quote.currency)}</td>
              <td className="py-2">{item.lead_time_days != null ? `${item.lead_time_days} ${copy.days}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-6 flex justify-end">
        <div className="min-w-48 border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <p className="text-xs uppercase text-slate-500">{copy.total}</p>
          <p className="mt-1 text-xl font-bold">{formatMoney(total, quote.currency)}</p>
        </div>
      </div>

      <footer className="mt-10 space-y-2 text-xs leading-6 text-slate-500">
        {quote.notes && <p>{quote.notes}</p>}
        <p>{copy.validity}</p>
        <p>{copy.disclaimer}</p>
      </footer>
    </article>
  );
}
