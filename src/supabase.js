import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const authEmailDomain = String(
  import.meta.env.VITE_AUTH_EMAIL_DOMAIN ?? ""
).trim().toLowerCase();

export const errorConfiguracionSupabase =
  !supabaseUrl || !supabaseAnonKey
    ? "Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. Revisá la configuración de la aplicación."
    : !authEmailDomain
      ? "Falta VITE_AUTH_EMAIL_DOMAIN. Revisá la configuración de la aplicación."
      : "";

export const supabase = errorConfiguracionSupabase
  ? null
  : createClient(supabaseUrl, supabaseAnonKey);
