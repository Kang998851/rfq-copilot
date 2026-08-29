import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export function createUserClient(authorization: string | null) {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { global: { headers: authorization ? { Authorization: authorization } : {} } },
  );
}
