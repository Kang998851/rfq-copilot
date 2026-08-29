import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !publishableKey || !secretKey) throw new Error("SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY are required.");

const admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
const out: Array<[string, boolean, string?]> = [];
function check(label: string, ok: boolean, detail = "") { out.push([label, ok, detail]); console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`); }
function hasNoRows<T>(data: T[] | null, error: { message?: string } | null) { return !error && (data?.length ?? 0) === 0; }

async function createUser(label: string, password: string) {
  for (const domain of ["test.local", "example.org", "gmail.com"]) {
    const email = `rfq-test-${label.toLowerCase()}-${Date.now()}@${domain}`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (!error && data.user) return { user: data.user, email };
  }
  throw new Error(`Could not create test user ${label}.`);
}
async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(url!, publishableKey!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

async function main() {
  const password = `RfqPhase1B!${crypto.randomUUID()}`;
  const fixtures: Array<{ user: User; email: string }> = [];
  const temporaryProducts: string[] = [];
  const uploadedObjects: string[] = [];
  let companyA = "", companyB = "", productA = "", productB = "";
  try {
    fixtures.push(await createUser("A", password), await createUser("B", password));
    check("User A auth row", Boolean(fixtures[0].user.id));
    check("User B auth row", Boolean(fixtures[1].user.id));
    const [a, b] = await Promise.all(fixtures.map(f => signIn(f.email, password)));
    const clients = [a, b];
    for (let i = 0; i < clients.length; i++) {
      const { data, error } = await clients[i].from("profiles").select("id").eq("id", fixtures[i].user.id).single();
      check(`User ${i ? "B" : "A"} profile row`, !error && data?.id === fixtures[i].user.id, error?.message);
    }
    const ca = await a.from("companies").insert({ name: "RFQ Verification Company A", country: "China", industry: "Industrial", default_currency: "USD" }).select("id").single();
    const cb = await b.from("companies").insert({ name: "RFQ Verification Company B", country: "China", industry: "Industrial", default_currency: "USD" }).select("id").single();
    if (ca.error || cb.error || !ca.data || !cb.data) throw new Error(ca.error?.message ?? cb.error?.message ?? "Company creation failed.");
    companyA = ca.data.id; companyB = cb.data.id;
    for (let i = 0; i < clients.length; i++) {
      const own = i ? companyB : companyA;
      const { data, error } = await clients[i].from("company_members").select("company_id,user_id,role").eq("company_id", own).eq("user_id", fixtures[i].user.id).single();
      check(`${i ? "B" : "A"} owns ${i ? "B" : "A"}`, !error && data?.role === "owner", error?.message);
    }
    const pa = await a.from("products").insert({ company_id: companyA, sku: "VERIFY-A1", name: "Verification Product A1", cost: 10, currency: "USD", active: true }).select("id").single();
    const pb = await b.from("products").insert({ company_id: companyB, sku: "VERIFY-B1", name: "Verification Product B1", cost: 10, currency: "USD", active: true }).select("id").single();
    if (pa.error || pb.error || !pa.data || !pb.data) throw new Error(pa.error?.message ?? pb.error?.message ?? "Product fixture creation failed.");
    productA = pa.data.id; productB = pb.data.id;
    for (let i = 0; i < clients.length; i++) {
      const label = i ? "B" : "A", ownCompany = i ? companyB : companyA, otherCompany = i ? companyA : companyB, own = i ? productB : productA, other = i ? productA : productB, client = clients[i];
      let r = await client.from("products").select("id").eq("id", own).single(); check(`${label} reads own`, !r.error && r.data?.id === own, r.error?.message);
      r = await client.from("products").update({ description: `${label} updated` }).eq("id", own).select("id").single(); check(`${label} updates own`, !r.error && r.data?.id === own, r.error?.message);
      const temp = await client.from("products").insert({ company_id: ownCompany, sku: `TEMP-${label}`, name: "Temporary product", cost: 1, currency: "USD" }).select("id").single();
      check(`${label} inserts into own`, !temp.error && Boolean(temp.data)); if (temp.data?.id) { temporaryProducts.push(temp.data.id); const del = await client.from("products").delete().eq("id", temp.data.id); check(`${label} deletes own temp fixture`, !del.error); }
      r = await client.from("products").select("id").eq("id", other); check(`${label} reads other`, hasNoRows(r.data, r.error), r.error?.message);
      r = await client.from("products").update({ description: "blocked" }).eq("id", other).select("id"); check(`${label} updates other`, hasNoRows(r.data, r.error), r.error?.message);
      r = await client.from("products").delete().eq("id", other).select("id"); check(`${label} deletes other`, hasNoRows(r.data, r.error), r.error?.message);
      r = await client.from("products").insert({ company_id: otherCompany, sku: `BLOCK-${label}`, name: "Blocked", cost: 1, currency: "USD" }).select("id"); check(`${label} inserts into other`, Boolean(r.error) && hasNoRows(r.data, null), r.error?.message);
    }
    for (let i = 0; i < clients.length; i++) {
      const label = i ? "B" : "A", own = i ? companyB : companyA, other = i ? companyA : companyB, client = clients[i];
      let r = await client.from("companies").select("id").eq("id", own).single(); check(`${label} reads own company`, !r.error && r.data?.id === own, r.error?.message);
      r = await client.from("companies").select("id").eq("id", other); check(`${label} reads other company`, hasNoRows(r.data, r.error), r.error?.message);
      r = await client.from("companies").update({ industry: "Industrial Verified" }).eq("id", own).select("id").single(); check(`${label} updates own company`, !r.error && r.data?.id === own, r.error?.message);
      r = await client.from("companies").update({ industry: "Blocked" }).eq("id", other).select("id"); check(`${label} updates other company`, hasNoRows(r.data, r.error), r.error?.message);
      r = await client.from("company_members").select("user_id").eq("user_id", fixtures[1 - i].user.id); check(`${label} cannot enumerate other membership`, hasNoRows(r.data, r.error), r.error?.message);
    }
    for (let i = 0; i < clients.length; i++) {
      const label = i ? "B" : "A", own = i ? companyB : companyA, other = i ? companyA : companyB, client = clients[i], path = `${own}/product-imports/${crypto.randomUUID()}/sample-${label.toLowerCase()}.csv`, otherPath = `${other}/product-imports/${crypto.randomUUID()}/sample-${label === "A" ? "b" : "a"}.csv`, blob = new Blob(["sku,name\nSTORAGE,Storage test\n"], { type: "text/csv" });
      let r = await client.storage.from("company-documents").upload(path, blob, { contentType: "text/csv" }); check(`${label} uploads own Storage`, !r.error, r.error?.message); if (!r.error) uploadedObjects.push(path);
      r = await client.storage.from("company-documents").download(path); check(`${label} reads own Storage`, !r.error && Boolean(r.data), r.error?.message);
      r = await client.storage.from("company-documents").upload(otherPath, blob, { contentType: "text/csv" }); check(`${label} uploads other Storage`, Boolean(r.error), r.error?.message);
      r = await client.storage.from("company-documents").download(otherPath); check(`${label} reads other Storage`, Boolean(r.error) || !r.data, r.error?.message);
      const doc = await client.from("documents").insert({ company_id: own, storage_path: path, original_filename: `sample-${label.toLowerCase()}.csv`, mime_type: "text/csv", size_bytes: 30, document_type: "product_catalog" }).select("id").single(); check(`${label} creates own document metadata`, !doc.error, doc.error?.message);
      r = await client.from("documents").select("id").eq("company_id", other); check(`${label} cannot read other document metadata`, hasNoRows(r.data, r.error), r.error?.message);
    }
  } finally {
    for (const id of temporaryProducts) await admin.from("products").delete().eq("id", id);
    if (uploadedObjects.length) await admin.storage.from("company-documents").remove(uploadedObjects);
    for (const fixture of fixtures) await admin.auth.admin.deleteUser(fixture.user.id);
  }
  if (out.some(([, ok]) => !ok)) process.exitCode = 1;
}
main().catch(error => { console.error(`TEST_ERROR: ${error instanceof Error ? error.message : "unknown error"}`); process.exitCode = 1; });
