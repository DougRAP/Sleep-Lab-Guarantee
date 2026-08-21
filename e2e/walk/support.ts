// e2e/walk/support.ts
// Shared setup for the live walkthrough. Not a spec: Playwright only collects
// *.spec.ts, so nothing here runs on its own.
//
// This file does the ONE thing the app deliberately cannot do. There is no
// unlink anywhere in the product, so a walkthrough that borrowed a seeded
// purchase would spend it forever, one run at a time. With the service key it
// can instead fabricate its own guarantee and take it away again, so watching
// R-5 costs your project nothing.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Everything the walk needs to know about the purchase it just invented. */
export interface QaPurchase {
  id: string;
  salesOrderNumber: string;
  lastName: string;
}

function headers(): Record<string, string> {
  if (!URL || !KEY) {
    throw new Error(
      "The live walk needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY " +
        "in .env.local. playwright.walk.config.ts reads them into this process; " +
        "the two real suites blank them on purpose, which is why they cannot do this."
    );
  }
  return {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

/** A plain date N days from today. */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * A purchase of our own, delivered 45 nights ago so it sits inside the day
 * 31 to 90 window without needing the demo day-jumper.
 *
 * Only three columns are required by the schema (sales order, last name,
 * delivery date); the rest are filled so the screens read like a real one.
 */
export async function createQaPurchase(suffix: string): Promise<QaPurchase> {
  const salesOrderNumber = `QA-${suffix.toUpperCase()}`;
  const lastName = "Qatest";

  const res = await fetch(`${URL}/rest/v1/guarantees`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      sales_order_number: salesOrderNumber,
      customer_first_name: "Qa",
      customer_last_name: lastName,
      customer_email: `qa-${suffix}@rapqa.com`,
      customer_phone: "0005550000",
      dealer_name: "City Mattress",
      oem_model: "CM-QUEEN-01",
      product_description: "QA walkthrough mattress set",
      delivery_date: daysAgo(45),
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Could not create the QA purchase (${res.status}). The walk writes to the ` +
        `real Supabase project, so this usually means the service key is wrong.`
    );
  }
  const [row] = (await res.json()) as Array<{ id: string }>;
  return { id: row.id, salesOrderNumber, lastName };
}

/**
 * Take it away again. `claims` references `guarantees` with ON DELETE CASCADE
 * (supabase/schema.sql), so this removes the request the walk left on it too,
 * and nothing accumulates in the project run after run.
 */
export async function removeQaPurchase(purchase: QaPurchase): Promise<void> {
  await fetch(`${URL}/rest/v1/guarantees?id=eq.${purchase.id}`, {
    method: "DELETE",
    headers: headers(),
  });
}
