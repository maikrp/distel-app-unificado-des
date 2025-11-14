// ============================================================================
// supabaseAdminClient.js — conexión con Service Role (solo panel admin)
// ============================================================================
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://plarayywtxedbiotsmmd.supabase.co";
const supabaseServiceKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYXJheXl3dHhlZGJpb3RzbW1kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODEzNDQ1NCwiZXhwIjoyMDczNzEwNDU0fQ.IUPp46RID_hzBLeIutw2Vw0ESZQcjEq_iHWqAkf2eaM";

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export default supabaseAdmin;
