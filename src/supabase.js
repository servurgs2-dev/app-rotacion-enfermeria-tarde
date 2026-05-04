import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://iylwhjwbqwhvsvsurvnf.supabase.co";

const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5bHdoandicXdodnN2c3Vydm5mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NzUwMTcsImV4cCI6MjA5MzE1MTAxN30.8KRgn0D08IDakCXjneVTWGhwJoQ0pOf8KBYn3D4DMls";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);