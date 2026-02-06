import { supabase } from './supabase.js';

const s = JSON.parse(localStorage.getItem('session')||'{}');
if(!s.isAdmin){
  location.replace('login.html');
}

document.getElementById('logout')?.addEventListener('click', async ()=>{
  await supabase.auth.signOut();
  localStorage.clear();
  location.replace('login.html');
});
