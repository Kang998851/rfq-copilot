import type { Company, Quotation, QuotationItem, Rfq, RfqItem } from "@/types/database";
import { formatMoney, lineAmount, quoteTotal } from "@/lib/quote/totals";
import type { Messages } from "@/lib/i18n/messages";
import type { QuoteBranding } from "@/lib/quote/branding";
import { DEFAULT_ACCENT } from "@/lib/quote/branding";
import { headerValue, lineSpecification, quoteNumberFromRfq, validUntil } from "@/lib/quote/document";

type Props = {
  company: Company | null;
  rfq: Rfq;
  quote: Quotation;
  items: QuotationItem[];
  rfqItems?: RfqItem[];
  branding?: QuoteBranding | null;
  copy: Messages["quoteDoc"];
};

export default function QuotationDocument({ company, rfq, quote, items, rfqItems, branding, copy }: Props) {
  const total = quoteTotal(items);
  const issued = new Date(quote.updated_at || quote.created_at);
  const until = validUntil(rfq.extracted_header, issued);
  const quoteNo = quoteNumberFromRfq(rfq.reference);
  const accent = branding?.accent || DEFAULT_ACCENT;
  const specs = new Map((rfqItems ?? []).map((row) => [row.id, lineSpecification(row.specs)]));

  return (
    <article className="w-[210mm] max-w-full bg-white p-10 text-slate-900">
      <header className="flex items-start justify-between gap-6 border-b pb-6" style={{ borderColor: accent }}>
        <div className="flex items-start gap-4">
          {branding?.logoDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoDataUrl} alt="" className="h-12 w-auto max-w-28 object-contain" />
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: accent }}>{copy.quotation}</p>
            <h1 className="mt-2 text-2xl font-bold">{company?.name ?? "RFQ Copilot"}</h1>
            <p className="mt-2 text-sm text-slate-500">
              {[company?.contact_name, company?.contact_email, company?.website].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <div className="text-right text-sm">
          <p className="font-mono text-xs font-semibold" style={{ color: accent }}>{quoteNo}</p>
          <p className="mt-1 font-mono text-xs text-slate-500">{copy.rfqRef}: {rfq.reference}</p>
          <p className="mt-2 text-slate-500">{copy.date}: {issued.toLocaleDateString()}</p>
          <p className="text-slate-500">{copy.validUntil}: {until.value}{until.source === "company_default" ? ` (${copy.suggestedDefault})` : ""}</p>
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
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{copy.terms}</p>
          <p className="mt-2 text-slate-600">{copy.incoterm}: {headerValue(rfq.extracted_header, "incoterm") || copy.notProvided}</p>
          <p className="text-slate-600">{copy.payment}: {headerValue(rfq.extracted_header, "payment_terms") || copy.notProvided}</p>
          <p className="text-slate-600">{copy.delivery}: {headerValue(rfq.extracted_header, "delivery_location") || copy.notProvided}</p>
        </div>
      </section>

      <table className="mt-8 w-full text-left text-sm">
        <thead className="border-y border-slate-200 text-xs uppercase text-slate-500">
          <tr>
            <th className="py-2 pr-2">SKU</th>
            <th className="py-2 pr-2">{copy.product}</th>
            <th className="py-2 pr-2">{copy.spec}</th>
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
              <td className="py-2 pr-2 text-xs text-slate-500">{specs.get(item.rfq_item_id ?? "") || "—"}</td>
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

      <div className="mt-10 grid gap-8 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{copy.signature}</p>
          <div className="mt-8 border-b border-slate-400" />
          <p className="mt-2 text-xs text-slate-500">{copy.signDate}</p>
        </div>
        <div className="text-xs leading-6 text-slate-500">
          {quote.notes && <p>{quote.notes}</p>}
          <p>{until.source === "customer" ? copy.validUntilCustomer : copy.validity}</p>
          {branding?.terms && <p>{branding.terms}</p>}
          <p>{copy.disclaimer}</p>
          {branding?.footer && <p>{branding.footer}</p>}
        </div>
      </div>
    </article>
  );
}
