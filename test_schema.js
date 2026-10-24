const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();

const supabase = createClient(url, key);

async function clean() {
  const { data, error } = await supabase.from('questions').select('*');
  console.log("Total before:", data.length);
  
  let deleted = 0;
  for (const q of data) {
     const opts = q.content?.options || [];
     if (opts.length === 0) {
         await supabase.from('questions').delete().eq('id', q.id);
         deleted++;
     }
  }
  
  console.log("Deleted broken questions:", deleted);
}
clean();
