require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

// Configuration Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_PUBLISHABLE_KEY,
);

module.exports = {
  supabase,
};
