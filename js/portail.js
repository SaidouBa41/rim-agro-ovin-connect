// =====================================
// CONFIGURATION SUPABASE - RIM AGROOVIN
// =====================================
const SUPABASE_URL="https://yxvfmigqkcbiodtgjooi.supabase.co";
// Clé publiable uniquement : ne jamais mettre sb_secret ou service_role dans le navigateur.
const SUPABASE_KEY="sb_publishable_Xp3rhQbII8gAXxVaJPuRKg_bPEJBnCm";
const PHOTO_BUCKET=RIM_CONFIG.photoBucket;
const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=id=>document.getElementById(id);
function status(id,msg,ok=false){const el=$(id);el.textContent=msg;el.className="status "+(ok?"ok":"err")}
function clearStatus(id){$(id).textContent="";$(id).className="status"}
function busy(form,value){form.querySelectorAll("button").forEach(b=>b.disabled=value)}
function esc(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

async function saveProfile(user,values={}){
 const p={id:user.id,full_name:values.full_name??user.user_metadata?.full_name??"",phone:values.phone??user.user_metadata?.phone??"",city:values.city??user.user_metadata?.city??"",role:values.role??user.user_metadata?.role??"Acheteur"};
 const {error}=await supabaseClient.from("profiles").upsert(p,{onConflict:"id"});if(error)throw error;return p;
}
function signedIn(user){
 if($("accountEmailLabel")) $("accountEmailLabel").textContent=user.email||"Non renseigné";
 window.__rimCurrentUserId=user.id;
 $("sessionBar").style.display="block";$("sessionEmail").textContent=user.email||"Utilisateur";
 $("authCards").classList.add("hidden");["memberArea","publishCard","myListingsCard","messagingSection"].forEach(id=>$(id).classList.remove("hidden"));
 if(!$("listingPhone").value)$("listingPhone").value=user.user_metadata?.phone||"";
 if(!$("listingCity").value)$("listingCity").value=user.user_metadata?.city||"";
 loadMyListings();
 loadConversations();
 updateProfessionalFormVisibility(user);updateServiceFormVisibility(user);loadServiceRequests();loadMyServiceRequests();loadProfile(user);
 setupAdmin(user);
}
function signedOut(){
 window.__rimCurrentUserId=null;
 $("sessionBar").style.display="none";$("authCards").classList.remove("hidden");
 ["memberArea","publishCard","myListingsCard","adminPanel","messagingSection"].forEach(id=>$(id).classList.add("hidden"));
 updateProfessionalFormVisibility(null);updateServiceFormVisibility(null);$("serviceRequestList").innerHTML="<p class=\"small\">Connectez-vous pour consulter les demandes.</p>";$("myServiceRequests").innerHTML="<p class=\"small\">Connectez-vous pour suivre vos demandes.</p>";
}
async function loadProfile(user){
 const {data,error}=await supabaseClient.from('profiles').select('full_name,phone,city,role').eq('id',user.id).maybeSingle();
 if(error){status('profileStatus','Impossible de charger le profil : '+error.message);return;}
 $('profileName').value=data?.full_name||user.user_metadata?.full_name||'';
 $('profilePhone').value=data?.phone||user.user_metadata?.phone||'';
 $('profileCity').value=data?.city||user.user_metadata?.city||'';
 $('profileRole').value=data?.role||user.user_metadata?.role||'Acheteur';
}
$('profileForm').addEventListener('submit',async e=>{
 e.preventDefault();const {data:{user}}=await supabaseClient.auth.getUser();if(!user){status('profileStatus','Connecte-toi pour modifier ton profil.');return;}
 const values={full_name:$('profileName').value.trim(),phone:$('profilePhone').value.trim(),city:$('profileCity').value.trim(),role:$('profileRole').value};
 try{await saveProfile(user,values);await supabaseClient.auth.updateUser({data:values});status('profileStatus','Profil mis à jour avec succès.',true);}
 catch(err){status('profileStatus','Enregistrement impossible : '+err.message);}
});
async function refreshSession(){const {data:{session}}=await supabaseClient.auth.getSession();if(session)signedIn(session.user);else signedOut()}

// V23 — DEMANDES DE SERVICES ET PRESTATIONS
function updateServiceFormVisibility(user){
 const form=$('serviceRequestForm'),hint=$('serviceLoginHint');if(!form||!hint)return;
 if(user){form.classList.remove('hidden');hint.classList.add('hidden');if(!$('servicePhone').value)$('servicePhone').value=user.user_metadata?.phone||'';if(!$('serviceCity').value)$('serviceCity').value=user.user_metadata?.city||'';}
 else{form.classList.add('hidden');hint.classList.remove('hidden');}
}
function serviceStatusLabel(v){return v==='open'?'Ouverte':v==='in_progress'?'En cours':v==='completed'?'Terminée':v==='cancelled'?'Annulée':v;}
function renderServiceRequests(rows){
 const box=$('serviceRequestList');const q=$('serviceSearch').value.trim().toLowerCase(),cat=$('serviceFilter').value;
 const data=(rows||[]).filter(r=>(!q||[r.title,r.description,r.city,r.category].some(x=>String(x||'').toLowerCase().includes(q)))&&(!cat||r.category===cat));
 if(!data.length){box.innerHTML='<p class="small">Aucune demande ouverte ne correspond à votre recherche.</p>';return;}
 box.innerHTML='<div class="service-grid">'+data.map(r=>'<article class="service-card"><span class="service-badge">'+esc(r.category)+'</span><h3>'+esc(r.title)+'</h3><p>'+esc(r.description)+'</p><p class="small">📍 '+esc(r.city)+' · '+(r.budget_mru?('Budget indicatif : '+Number(r.budget_mru).toLocaleString('fr-FR')+' MRU · '):'')+'Publié le '+new Date(r.created_at).toLocaleDateString('fr-FR')+'</p><p class="small">Contact : '+esc(r.phone_contact||'Non renseigné')+'</p><span class="service-badge">'+serviceStatusLabel(r.status)+'</span>'+(r.user_id!==window.__rimCurrentUserId?'<button type="button" class="secondary" onclick="startConversation(\''+r.user_id+'\',\''+esc(r.title).replace(/\\/g,'')+'\')">💬 Contacter par message</button>':'')+'</article>').join('')+'</div>';
}
let serviceRequestCache=[];
async function loadServiceRequests(){
 const box=$('serviceRequestList');const {data:{user}}=await supabaseClient.auth.getUser();
 if(!user){box.innerHTML='<p class="small">Connectez-vous pour consulter les demandes.</p>';return;}
 box.innerHTML='<p class="small">Chargement des demandes...</p>';
 const {data,error}=await supabaseClient.from('service_requests').select('id,user_id,category,title,description,city,budget_mru,phone_contact,status,created_at').in('status',['open','in_progress']).order('created_at',{ascending:false});
 if(error){box.innerHTML='<p class="small">Impossible de charger les demandes : '+esc(error.message)+'<br>Vérifiez que la table service_requests et ses politiques SQL sont installées.</p>';return;}
 serviceRequestCache=data||[];renderServiceRequests(serviceRequestCache);
}
async function loadMyServiceRequests(){
 const box=$('myServiceRequests');const {data:{user}}=await supabaseClient.auth.getUser();if(!user){box.innerHTML='<p class="small">Connectez-vous pour suivre vos demandes.</p>';return;}
 const {data,error}=await supabaseClient.from('service_requests').select('id,category,title,city,status,created_at').eq('user_id',user.id).order('created_at',{ascending:false});
 if(error){box.innerHTML='<p class="small">Chargement impossible : '+esc(error.message)+'</p>';return;}
 if(!data?.length){box.innerHTML='<p class="small">Vous n’avez pas encore publié de demande.</p>';return;}
 box.innerHTML=data.map(r=>'<article class="service-admin"><div class="admin-top"><strong>'+esc(r.title)+'</strong><span class="service-badge">'+serviceStatusLabel(r.status)+'</span></div><p class="small">'+esc(r.category)+' · '+esc(r.city)+' · '+new Date(r.created_at).toLocaleDateString('fr-FR')+'</p>'+(r.status==='open'?'<button class="btn-danger" onclick="cancelServiceRequest(\''+r.id+'\')">Annuler ma demande</button>':'')+'</article>').join('');
}
$('serviceRequestForm').addEventListener('submit',async e=>{
 e.preventDefault();const form=e.currentTarget;busy(form,true);clearStatus('serviceFormStatus');
 try{const {data:{user}}=await supabaseClient.auth.getUser();if(!user)throw new Error('Connectez-vous pour publier une demande.');
 const row={user_id:user.id,category:$('serviceCategory').value,title:$('serviceTitle').value.trim(),description:$('serviceDescription').value.trim(),city:$('serviceCity').value.trim(),budget_mru:$('serviceBudget').value?Number($('serviceBudget').value):null,phone_contact:$('servicePhone').value.trim(),status:'open'};
 if(!row.category||!row.title||!row.description||!row.city||!row.phone_contact)throw new Error('Veuillez remplir tous les champs obligatoires.');
 const {error}=await supabaseClient.from('service_requests').insert(row);if(error)throw error;form.reset();updateServiceFormVisibility(user);status('serviceFormStatus','Votre demande a été publiée avec succès.',true);await loadServiceRequests();await loadMyServiceRequests();
 }catch(err){status('serviceFormStatus','Publication impossible : '+(err.message||'Erreur inconnue'));}finally{busy(form,false);}
});
async function cancelServiceRequest(id){if(!confirm('Annuler cette demande ?'))return;const {data:{user}}=await supabaseClient.auth.getUser();if(!user)return;const {error}=await supabaseClient.from('service_requests').update({status:'cancelled'}).eq('id',id).eq('user_id',user.id);if(error){status('serviceFormStatus','Annulation impossible : '+error.message);return;}await loadMyServiceRequests();await loadServiceRequests();}
$('refreshServicesBtn').addEventListener('click',()=>{loadServiceRequests();loadMyServiceRequests();});
['serviceSearch','serviceFilter'].forEach(id=>$(id).addEventListener('input',()=>renderServiceRequests(serviceRequestCache)));


// =====================================
// V24.1 — MESSAGERIE PRIVÉE ET CORRECTIONS MOBILE
// Tables: conversations, messages
// =====================================
let activeConversationId=null;
let conversationCache=[];
function orderedParticipants(a,b){return [a,b].sort((x,y)=>x.localeCompare(y));}
async function loadConversations(){
 const {data:{user}}=await supabaseClient.auth.getUser();const box=$('conversationList');
 if(!user){box.innerHTML='<p class="small" style="padding:12px">Connectez-vous pour voir vos conversations.</p>';return;}
 box.innerHTML='<p class="small" style="padding:12px">Chargement...</p>';
 const {data,error}=await supabaseClient.from('conversations').select('id,participant_1,participant_2,subject,updated_at').order('updated_at',{ascending:false});
 if(error){box.innerHTML='<p class="small" style="padding:12px">Chargement impossible : '+esc(error.message)+'. Vérifiez le SQL V24.</p>';return;}
 conversationCache=data||[];
 if(!conversationCache.length){box.innerHTML='<p class="small" style="padding:12px">Aucune conversation. Vous pourrez en démarrer une depuis une demande de service.</p>';return;}
 box.innerHTML=conversationCache.map(c=>'<button type="button" class="conversation-item '+(c.id===activeConversationId?'active':'')+'" onclick="openConversation(\''+c.id+'\')">'+esc(c.subject||'Conversation')+'<small>'+new Date(c.updated_at).toLocaleString('fr-FR')+'</small></button>').join('');
 if(activeConversationId && conversationCache.some(c=>c.id===activeConversationId)) await loadMessages(activeConversationId);
}
async function startConversation(recipientId,subject){
 try{
  const {data:{user}}=await supabaseClient.auth.getUser();if(!user)throw new Error('Connectez-vous pour envoyer un message.');
  if(!recipientId||recipientId===user.id)throw new Error('Vous ne pouvez pas vous envoyer un message.');
  const [p1,p2]=orderedParticipants(user.id,recipientId);
  let {data,error}=await supabaseClient.from('conversations').select('id').eq('participant_1',p1).eq('participant_2',p2).maybeSingle();
  if(error)throw error;
  if(!data){const result=await supabaseClient.from('conversations').insert({participant_1:p1,participant_2:p2,subject:subject||'Échange entre membres'}).select('id').single();if(result.error)throw result.error;data=result.data;}
  activeConversationId=data.id;await loadConversations();await loadMessages(activeConversationId);$('messageBody').focus();
 }catch(e){status('messageStatus','Ouverture impossible : '+(e.message||'Erreur inconnue'));}
}
async function openConversation(id){activeConversationId=id;await loadConversations();}
async function loadMessages(id){
 const {data:{user}}=await supabaseClient.auth.getUser();if(!user)return;
 const c=conversationCache.find(x=>x.id===id);$('chatHeading').innerHTML='<strong>'+esc(c?.subject||'Conversation')+'</strong><p class="small">Échange privé</p>';
 $('messageForm').classList.remove('hidden');$('chatMessages').innerHTML='<p class="small">Chargement des messages...</p>';
 const {data,error}=await supabaseClient.from('messages').select('id,sender_id,body,created_at').eq('conversation_id',id).order('created_at',{ascending:true}).limit(200);
 if(error){$('chatMessages').innerHTML='<p class="small">Impossible de charger les messages : '+esc(error.message)+'</p>';return;}
 if(!data?.length){$('chatMessages').innerHTML='<p class="small">Démarrez la conversation en envoyant votre premier message.</p>';return;}
 $('chatMessages').innerHTML=data.map(m=>'<div class="chat-bubble '+(m.sender_id===user.id?'mine':'')+'">'+esc(m.body)+'<span class="chat-time">'+(m.sender_id===user.id?'Vous · ':'')+new Date(m.created_at).toLocaleString('fr-FR')+'</span></div>').join('');
 $('chatMessages').scrollTop=$('chatMessages').scrollHeight;
}
$('messageForm').addEventListener('submit',async e=>{
 e.preventDefault();const form=e.currentTarget;busy(form,true);
 try{
  const {data:{user}}=await supabaseClient.auth.getUser();if(!user||!activeConversationId)throw new Error('Sélectionnez une conversation.');
  const body=$('messageBody').value.trim();if(!body)throw new Error('Le message est vide.');
  const {error}=await supabaseClient.from('messages').insert({conversation_id:activeConversationId,sender_id:user.id,body});
  if(error)throw error;$('messageBody').value='';await loadMessages(activeConversationId);
 }catch(err){status('messageStatus','Envoi impossible : '+(err.message||'Erreur inconnue'));}finally{busy(form,false);}
});
$('refreshMessagesBtn').addEventListener('click',loadConversations);

// MARKETPLACE PUBLIC : uniquement annonces approuvées et disponibles
let marketData=[];
const FAVORITES_KEY="rim_agroovin_favorites_v1";
function getFavoriteIds(){try{return JSON.parse(localStorage.getItem(FAVORITES_KEY)||"[]").map(String)}catch(e){return []}}
function isFavorite(id){return getFavoriteIds().includes(String(id))}
function toggleFavorite(id){const ids=getFavoriteIds(),key=String(id),next=ids.includes(key)?ids.filter(x=>x!==key):[...ids,key];localStorage.setItem(FAVORITES_KEY,JSON.stringify(next));renderMarket();renderFavorites();if($("listingDetailModal")&&$("listingDetailModal").classList.contains("open"))openListingDetails(id)}
function favoriteCard(a){const img=(a.photos||[])[0];return '<article class="market-card">'+(img?'<img loading="lazy" src="'+esc(img)+'" alt="'+esc(a.title)+'">':'<div style="height:190px;background:#e9efe9;display:grid;place-items:center;font-size:3rem">🐑</div>')+'<div class="market-body"><h3>'+esc(a.title)+'</h3><div class="market-meta">'+esc(a.category||'')+' · 📍 '+esc(a.city||'Localité non précisée')+'</div><div class="market-price">'+Number(a.price||0).toLocaleString('fr-FR')+' MRU</div><button class="detail-btn" onclick="openListingDetails(\''+a.id+'\')">Voir les détails</button><button class="favorite-btn is-favorite" onclick="toggleFavorite(\''+a.id+'\')">♥ Retirer des favoris</button></div></article>'}
function renderFavorites(){const box=$("favoriteListings");if(!box)return;const ids=getFavoriteIds(),items=ids.map(id=>marketData.find(a=>String(a.id)===id)).filter(Boolean);if(!items.length){box.innerHTML='<p class="favorites-empty">'+(ids.length?'Certaines annonces sauvegardées ne sont plus disponibles.':'Vous n\'avez pas encore enregistré d\'annonce. Cliquez sur « Ajouter aux favoris » sur une annonce qui vous intéresse.')+'</p>';return;}box.innerHTML='<div class="market-grid">'+items.map(favoriteCard).join('')+'</div>'}

function contactLinks(phone){
 const digits=String(phone||'').replace(/[^0-9]/g,'');
 if(!digits)return '<span class="small">Contact vendeur non renseigné</span>';
 return '<div class="market-actions"><a target="_blank" rel="noopener" href="https://wa.me/'+digits+'">WhatsApp</a><a class="call" href="tel:'+digits+'">Appeler</a></div>';
}
function renderMarket(){
 const search=$('marketSearch').value.trim().toLowerCase(),category=$('marketCategory').value,city=$('marketCity').value.trim().toLowerCase();
 const filtered=marketData.filter(a=>(!search||[a.title,a.description,a.category,a.city].some(v=>String(v||'').toLowerCase().includes(search)))&&(!category||a.category===category)&&(!city||String(a.city||'').toLowerCase().includes(city)));
 const box=$('marketListings');
 if(!filtered.length){box.innerHTML='<p class="small">Aucune annonce ne correspond à votre recherche.</p>';return;}
 box.innerHTML='<div class="market-grid">'+filtered.map(a=>{
  const img=(a.photos||[])[0];
  return '<article class="market-card">'+(img?'<img loading="lazy" src="'+esc(img)+'" alt="'+esc(a.title)+'">':'<div style="height:190px;background:#e9efe9;display:grid;place-items:center;font-size:3rem">🐑</div>')+'<div class="market-body"><h3>'+esc(a.title)+'</h3><div class="market-meta">'+esc(a.category||'')+' · 📍 '+esc(a.city||'Localité non précisée')+'</div><div class="market-price">'+Number(a.price||0).toLocaleString('fr-FR')+' MRU</div><p>'+esc((a.description||'').slice(0,150))+(String(a.description||'').length>150?'…':'')+'</p><button class="detail-btn" onclick="openListingDetails(\''+a.id+'\')">Voir les détails</button><button class="favorite-btn '+(isFavorite(a.id)?'is-favorite':'')+'" onclick="toggleFavorite(\''+a.id+'\')">'+(isFavorite(a.id)?'♥ Retirer des favoris':'♡ Ajouter aux favoris')+'</button>'+contactLinks(a.phone_contact)+'</div></article>';
 }).join('')+'</div>';
}

let professionalDirectoryData=[];
function renderDirectory(){
 const search=$('directorySearch').value.trim().toLowerCase();
 const category=$('directoryCategory').value;
 const city=$('directoryCity').value.trim().toLowerCase();
 const entries=professionalDirectoryData.filter(p=>
  (!search||[p.full_name,p.professional_type,p.description,p.city,p.address].some(v=>String(v||'').toLowerCase().includes(search)))&&
  (!category||p.professional_type===category)&&
  (!city||String(p.city||'').toLowerCase().includes(city))
 );
 const box=$('directoryCards');
 if(!entries.length){box.innerHTML='<p class="small">Aucun professionnel approuvé ne correspond à votre recherche.</p>';return;}
 box.innerHTML='<div class="directory-grid">'+entries.map(p=>{
  const phone=String(p.phone||'').replace(/[^0-9]/g,'');
  const wa=String(p.whatsapp||p.phone||'').replace(/[^0-9]/g,'');
  const actions=(phone||wa)?'<div class="market-actions">'+(wa?'<a target="_blank" rel="noopener" href="https://wa.me/'+esc(wa)+'">WhatsApp</a>':'')+(phone?'<a class="call" href="tel:'+esc(phone)+'">Appeler</a>':'')+'</div>':'<p class="small">Coordonnées non renseignées.</p>';
  return '<article class="directory-card"><span class="directory-tag">'+esc(p.professional_type)+'</span><h3 style="margin-top:10px">'+esc(p.full_name)+'</h3><div class="market-meta">📍 '+esc(p.city||'Localité non précisée')+(p.address?' · '+esc(p.address):'')+'</div><p class="directory-description">'+esc(p.description||'Aucune description fournie.')+'</p>'+actions+'</article>';
 }).join('')+'</div>';
}
async function loadProfessionalDirectory(){
 const box=$('directoryCards');box.innerHTML='<p class="small">Chargement des professionnels...</p>';
 const {data,error}=await supabaseClient.from('professional_directory')
  .select('id,full_name,professional_type,description,phone,whatsapp,city,address,created_at')
  .eq('status','approved').order('created_at',{ascending:false});
 if(error){box.innerHTML='<p class="small">Impossible de charger l’annuaire : '+esc(error.message)+'</p>';return;}
 professionalDirectoryData=data||[];renderDirectory();
}
function updateProfessionalFormVisibility(user){
 const form=$('professionalForm'),hint=$('directoryLoginHint');
 if(user){form.classList.remove('hidden');hint.classList.add('hidden');
  $('proFullName').value=$('proFullName').value||user.user_metadata?.full_name||'';
  $('proPhone').value=$('proPhone').value||user.user_metadata?.phone||'';
  $('proCity').value=$('proCity').value||user.user_metadata?.city||'';
 }else{form.classList.add('hidden');hint.classList.remove('hidden');}
}
$('professionalForm').addEventListener('submit',async e=>{
 e.preventDefault();const form=e.currentTarget;busy(form,true);clearStatus('professionalFormStatus');
 try{
  const {data:{user},error:userError}=await supabaseClient.auth.getUser();
  if(userError)throw userError;if(!user)throw new Error('Connectez-vous avant de soumettre votre fiche.');
  const record={
   user_id:user.id,full_name:$('proFullName').value.trim(),
   professional_type:$('proType').value,description:$('proDescription').value.trim(),
   phone:$('proPhone').value.trim(),whatsapp:$('proWhatsapp').value.trim(),
   city:$('proCity').value.trim(),address:$('proAddress').value.trim(),
   status:'pending'
  };
  if(!record.full_name||!record.professional_type||!record.phone||!record.city)throw new Error('Veuillez remplir les champs obligatoires.');
  const {error}=await supabaseClient.from('professional_directory').insert(record);
  if(error)throw error;
  form.reset();updateProfessionalFormVisibility(user);
  status('professionalFormStatus','Votre demande a été envoyée. Elle sera visible dans l’annuaire après approbation.',true);
 }catch(err){status('professionalFormStatus','Soumission impossible : '+(err.message||'Erreur inconnue'))}
 finally{busy(form,false)}
});
['directorySearch','directoryCategory','directoryCity'].forEach(id=>$(id).addEventListener('input',renderDirectory));
$('refreshDirectoryBtn').addEventListener('click',loadProfessionalDirectory);

async function loadMarketplace(){
 const box=$('marketListings');box.innerHTML='<p class="small">Chargement des annonces...</p>';clearStatus('marketStatus');
 const {data,error}=await supabaseClient.from('listings').select('id,title,category,description,price,city,phone_contact,photos,status,moderation_status,created_at,seller_id').eq('moderation_status','approved').eq('status','available').order('created_at',{ascending:false});
 if(error){box.innerHTML='<p class="small">Impossible de charger les annonces : '+esc(error.message)+'</p>';return;}
 marketData=data||[];renderMarket();renderFavorites();
}
['marketSearch','marketCategory','marketCity'].forEach(id=>$(id).addEventListener('input',renderMarket));$('refreshMarketBtn').addEventListener('click',loadMarketplace);
$('showAllFavoritesBtn').addEventListener('click',()=>document.getElementById('marketplacePublic').scrollIntoView({behavior:'smooth'}));

// INSCRIPTION ET CONNEXION
$("signupForm").addEventListener("submit",async e=>{
 e.preventDefault();const f=e.currentTarget;clearStatus("signupStatus");busy(f,true);
 const full_name=$("signupName").value.trim(),phone=$("signupPhone").value.trim(),city=$("signupCity").value.trim(),role=$("signupRole").value,email=$("signupEmail").value.trim(),password=$("signupPassword").value;
 try{
  const {data,error}=await supabaseClient.auth.signUp({email,password,options:{emailRedirectTo:RIM_CONFIG.siteUrl,data:{full_name,phone,city,role}}});if(error)throw error;
  if(data.session){await saveProfile(data.user,{full_name,phone,city,role});signedIn(data.user);status("signupStatus","Compte créé et profil enregistré.",true)}
  else status("signupStatus","Inscription enregistrée. Vérifie ta boîte email pour confirmer ton adresse, puis connecte-toi.",true);
 }catch(err){status("signupStatus",err.message||"Erreur d'inscription")}finally{busy(f,false)}
});
$("loginForm").addEventListener("submit",async e=>{
 e.preventDefault();const f=e.currentTarget;clearStatus("loginStatus");busy(f,true);
 try{const {data,error}=await supabaseClient.auth.signInWithPassword({email:$("loginEmail").value.trim(),password:$("loginPassword").value});if(error)throw error;
  await saveProfile(data.user);signedIn(data.user);status("loginStatus","Connexion réussie.",true);
 }catch(err){status("loginStatus",err.message||"Erreur de connexion")}finally{busy(f,false)}
});
// V20 — récupération et gestion sécurisée du mot de passe
$("resetRequestForm").addEventListener("submit",async e=>{
 e.preventDefault();const f=e.currentTarget;busy(f,true);clearStatus("resetRequestStatus");
 try{
  const email=$("resetEmail").value.trim();
  const redirectTo=RIM_CONFIG.siteUrl;
  const {error}=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo});if(error)throw error;
  status("resetRequestStatus","Si cette adresse correspond à un compte, un lien de réinitialisation sera envoyé. Vérifie aussi tes courriers indésirables.",true);
 }catch(err){status("resetRequestStatus",err.message||"Envoi du lien impossible.") }finally{busy(f,false)}
});
async function updateAccountPassword(inputId,confirmId,statusId,formId){
 const password=$(inputId).value,confirmation=$(confirmId).value;
 if(password.length<8){status(statusId,"Le mot de passe doit contenir au moins 8 caractères.");return false;}
 if(password!==confirmation){status(statusId,"Les deux mots de passe ne correspondent pas.");return false;}
 const {error}=await supabaseClient.auth.updateUser({password});
 if(error){status(statusId,error.message||"Mise à jour impossible.");return false;}
 $(formId).reset();status(statusId,"Mot de passe mis à jour avec succès.",true);return true;
}
$("changePasswordForm").addEventListener("submit",async e=>{e.preventDefault();const f=e.currentTarget;busy(f,true);clearStatus("changePasswordStatus");try{await updateAccountPassword("newPassword","confirmPassword","changePasswordStatus","changePasswordForm")}catch(err){status("changePasswordStatus",err.message||"Erreur lors de la mise à jour.")}finally{busy(f,false)}});
$("recoveryPasswordForm").addEventListener("submit",async e=>{e.preventDefault();const f=e.currentTarget;busy(f,true);clearStatus("recoveryPasswordStatus");try{const ok=await updateAccountPassword("recoveryPassword","recoveryPasswordConfirm","recoveryPasswordStatus","recoveryPasswordForm");if(ok){$("recoveryPanel").classList.add("hidden");history.replaceState({},document.title,window.location.pathname);}}catch(err){status("recoveryPasswordStatus",err.message||"Erreur lors de la réinitialisation.")}finally{busy(f,false)}});
function detectRecoveryLink(){
 const hash=new URLSearchParams(window.location.hash.replace(/^#/ ,""));
 if(hash.get("type")==="recovery"){$("recoveryPanel").classList.remove("hidden");$("recoveryPanel").scrollIntoView({behavior:"smooth",block:"center"});}
}
detectRecoveryLink();

$("logoutBtn").addEventListener("click",async()=>{const {error}=await supabaseClient.auth.signOut();if(error){alert(error.message);return}signedOut()});

// ESPACE ADMIN : vérification du rôle via table admin_roles
async function checkAdminRole(user){
 const {data,error}=await supabaseClient.from("admin_roles").select("role").eq("user_id",user.id).maybeSingle();
 if(error){console.warn("Admin role check:",error.message);return null}
 return data?.role||null;
}

async function loadAdminProfessionals(){
 const box=$('pendingProfessionals');if(!box)return;
 box.innerHTML='<p class="small">Chargement des demandes professionnelles...</p>';
 const {data,error}=await supabaseClient.from('professional_directory')
  .select('id,full_name,professional_type,description,phone,whatsapp,city,address,status,created_at,user_id')
  .in('status',['pending','approved','rejected']).order('created_at',{ascending:false});
 if(error){box.innerHTML='<p class="small">Chargement impossible : '+esc(error.message)+'</p>';return;}
 if(!data?.length){box.innerHTML='<p class="small">Aucune demande professionnelle enregistrée.</p>';return;}
 box.innerHTML=data.map(p=>`<article class="directory-admin-item"><div class="admin-top"><strong>${esc(p.full_name)}</strong><span class="directory-status">${p.status==='pending'?'⏳ En attente':p.status==='approved'?'✅ Approuvée':'❌ Rejetée'}</span></div><p class="small">${esc(p.professional_type)} · ${esc(p.city||'Ville non précisée')}${p.address?' · '+esc(p.address):''}</p><p>${esc(p.description||'Aucune description')}</p><p class="small">Téléphone : ${esc(p.phone||'—')} · WhatsApp : ${esc(p.whatsapp||'—')} · Demande du ${p.created_at?new Date(p.created_at).toLocaleDateString('fr-FR'):'—'}</p><div class="directory-admin-actions">${p.status!=='approved'?`<button class="btn-approve" onclick="moderateProfessional('${p.id}','approved')">Approuver</button>`:''}${p.status!=='rejected'?`<button class="btn-danger" onclick="moderateProfessional('${p.id}','rejected')">Rejeter</button>`:''}</div></article>`).join('');
}
async function moderateProfessional(id,nextStatus){
 const {data:{user}}=await supabaseClient.auth.getUser();
 const role=user?await checkAdminRole(user):null;
 if(!['super_admin','admin','moderator'].includes(role)){status('directoryAdminStatus','Accès refusé : rôle administrateur requis.');return;}
 const {error}=await supabaseClient.from('professional_directory').update({status:nextStatus}).eq('id',id);
 if(error){status('directoryAdminStatus','Modification impossible : '+error.message);return;}
 status('directoryAdminStatus',nextStatus==='approved'?'Fiche professionnelle approuvée et publiée.':'Fiche professionnelle rejetée.',true);
 await loadAdminProfessionals();await loadProfessionalDirectory();
}

async function loadAdminServiceRequests(){
 const box=$('adminServiceRequests');if(!box)return;box.innerHTML='<p class="small">Chargement...</p>';
 const {data,error}=await supabaseClient.from('service_requests').select('id,title,category,description,city,phone_contact,status,created_at').order('created_at',{ascending:false}).limit(100);
 if(error){box.innerHTML='<p class="small">Chargement impossible : '+esc(error.message)+'</p>';return;}
 if(!data?.length){box.innerHTML='<p class="small">Aucune demande enregistrée.</p>';return;}
 box.innerHTML=data.map(r=>'<article class="service-admin"><div class="admin-top"><strong>'+esc(r.title)+'</strong><span class="service-badge">'+serviceStatusLabel(r.status)+'</span></div><p class="small">'+esc(r.category)+' · '+esc(r.city)+' · '+esc(r.phone_contact||'')+'</p><p>'+esc(r.description)+'</p><div class="service-actions">'+(r.status!=='in_progress'?'<button onclick="moderateServiceRequest(\''+r.id+'\',\'in_progress\')">Marquer en cours</button>':'')+(r.status!=='completed'?'<button class="btn-approve" onclick="moderateServiceRequest(\''+r.id+'\',\'completed\')">Terminer</button>':'')+(r.status!=='cancelled'?'<button class="btn-danger" onclick="moderateServiceRequest(\''+r.id+'\',\'cancelled\')">Annuler</button>':'')+'</div></article>').join('');
}
async function moderateServiceRequest(id,next){const {data:{user}}=await supabaseClient.auth.getUser();const role=user?await checkAdminRole(user):null;if(!['super_admin','admin','moderator'].includes(role)){status('adminServiceStatus','Accès administrateur requis.');return;}const {error}=await supabaseClient.from('service_requests').update({status:next}).eq('id',id);if(error){status('adminServiceStatus','Modification impossible : '+error.message);return;}status('adminServiceStatus','Statut de la demande mis à jour.',true);await loadAdminServiceRequests();await loadServiceRequests();await loadMyServiceRequests();}
async function setupAdmin(user){
 const role=await checkAdminRole(user);
 if(["super_admin","admin","moderator"].includes(role)){
  $("adminPanel").classList.remove("hidden");
  $("adminStatus").className="status";
  loadAdminListings();loadAdminProfessionals();loadAdminServiceRequests();
 }else $("adminPanel").classList.add("hidden");
}
function adminStatus(msg,ok=false){status("adminStatus",msg,ok)}
async function loadAdminListings(){
 const box=$("pendingListings");box.innerHTML='<p class="small">Chargement des annonces...</p>';
 const {data,error}=await supabaseClient.from("listings").select("id,title,category,description,price,city,phone_contact,photos,moderation_status,status,created_at,seller_id").eq("moderation_status","pending").order("created_at",{ascending:false});
 if(error){box.innerHTML='<p class="small">Chargement impossible : '+esc(error.message)+'</p>';return}
 const {count:total}=await supabaseClient.from("listings").select("id",{count:"exact",head:true});
 const {count:approved}=await supabaseClient.from("listings").select("id",{count:"exact",head:true}).eq("moderation_status","approved");
 const {count:rejected}=await supabaseClient.from("listings").select("id",{count:"exact",head:true}).eq("moderation_status","rejected");
 $("adminStats").innerHTML=[
  ["Total annonces",total??0],["En attente",data.length],["Approuvées",approved??0],["Rejetées",rejected??0]
 ].map(([label,val])=>'<div class="card"><strong>'+esc(label)+'</strong><h2>'+val+'</h2></div>').join("");
 if(!data.length){box.innerHTML='<p class="small">Aucune annonce en attente de validation.</p>';return}
 box.innerHTML=data.map(a=>`<article class="admin-listing"><h3>${esc(a.title)}</h3><div class="small">${esc(a.category||"")} · ${esc(a.city||"")} · ${Number(a.price||0).toLocaleString("fr-FR")} MRU</div><p>${esc(a.description||"Aucune description")}</p><div class="small">Contact : ${esc(a.phone_contact||"Non renseigné")} · Déposée le ${new Date(a.created_at).toLocaleDateString("fr-FR")}</div>${(a.photos||[]).map(url=>'<img src="'+esc(url)+'" alt="Photo annonce">').join("")}<div><button class="btn-approve" onclick="moderateListing('${a.id}','approved')">Approuver</button> <button class="btn-danger" onclick="moderateListing('${a.id}','rejected')">Rejeter</button></div></article>`).join("");
}
async function moderateListing(id,nextStatus){
 $("pendingListings").querySelectorAll("button").forEach(b=>b.disabled=true);
 const {data:{user}}=await supabaseClient.auth.getUser();
 const role=user?await checkAdminRole(user):null;
 if(!["super_admin","admin","moderator"].includes(role)){adminStatus("Accès refusé : rôle administrateur requis.");loadAdminListings();return}
 const {error}=await supabaseClient.from("listings").update({moderation_status:nextStatus}).eq("id",id);
 if(error){adminStatus("Action impossible : "+error.message);loadAdminListings();return}
 adminStatus(nextStatus==="approved"?"Annonce approuvée et publiée.":"Annonce rejetée.",true);
 loadAdminListings();
}
$("refreshAdminBtn").addEventListener("click",()=>{loadAdminListings();loadAdminProfessionals();loadAdminServiceRequests();});
// ENVOI DES PHOTOS AU BUCKET SUPABASE STORAGE
async function uploadPhotos(user,files){
 const urls=[];
 for(const file of files){
  if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("Format photo non accepté : "+file.name);
  if(file.size>2*1024*1024)throw new Error("La photo "+file.name+" dépasse 2 Mo.");
  const filename=file.name.toLowerCase().replace(/[^a-z0-9._-]/g,"-");
  const objectPath=user.id+"/"+Date.now()+"-"+Math.random().toString(36).slice(2,8)+"-"+filename;
  const {error}=await supabaseClient.storage.from(PHOTO_BUCKET).upload(objectPath,file,{cacheControl:"3600",upsert:false,contentType:file.type});
  if(error)throw error;
  const {data}=supabaseClient.storage.from(PHOTO_BUCKET).getPublicUrl(objectPath);urls.push(data.publicUrl);
 }
 return urls;
}

// PUBLICATION : moderation_status est toujours fixé à pending par le navigateur.
// La politique RLS INSERT doit également imposer cette valeur.
$("listingForm").addEventListener("submit",async e=>{
 e.preventDefault();const f=e.currentTarget;clearStatus("listingStatus");busy(f,true);
 try{
  const {data:{user},error:userError}=await supabaseClient.auth.getUser();if(userError)throw userError;if(!user)throw new Error("Session expirée. Reconnecte-toi.");
  const photos=await uploadPhotos(user,Array.from($("listingPhotos").files));
  const listing={seller_id:user.id,category:$("listingCategory").value,title:$("listingTitle").value.trim(),description:$("listingDescription").value.trim(),price:Number($("listingPrice").value),phone_contact:$("listingPhone").value.trim()||user.user_metadata?.phone||null,city:$("listingCity").value.trim(),photos,status:"available",moderation_status:"pending"};
  const {error}=await supabaseClient.from("listings").insert(listing);if(error)throw error;
  f.reset();status("listingStatus","Annonce enregistrée. Elle est en attente de validation avant sa publication publique.",true);loadMyListings();
 }catch(err){status("listingStatus","Publication impossible : "+(err.message||"Erreur inconnue")+". Vérifie les politiques RLS, les colonnes et le bucket de stockage.")}
 finally{busy(f,false)}
});

// ESPACE VENDEUR V14 : suivi, modification, statut vendu et suppression
let sellerListings=[]; let sellerFilter='all';
function sellerBadge(a){const m=a.moderation_status||'pending';const st=a.status||'available';if(m==='pending')return '⏳ En attente de validation';if(m==='rejected')return '❌ Rejetée';if(m==='approved'&&st==='sold')return '💰 Vendue';if(m==='approved'&&st==='reserved')return '🔖 Réservée';if(m==='approved')return '✅ En ligne';return m+' · '+st}
function renderSellerListings(){
 const box=$('myListings'); const data=sellerListings.filter(a=>sellerFilter==='all'||(sellerFilter==='pending'&&a.moderation_status==='pending')||(sellerFilter==='approved'&&a.moderation_status==='approved'&&a.status!=='sold')||(sellerFilter==='rejected'&&a.moderation_status==='rejected')||(sellerFilter==='sold'&&a.status==='sold'));
 const counts={total:sellerListings.length,pending:sellerListings.filter(a=>a.moderation_status==='pending').length,approved:sellerListings.filter(a=>a.moderation_status==='approved'&&a.status!=='sold').length,rejected:sellerListings.filter(a=>a.moderation_status==='rejected').length,sold:sellerListings.filter(a=>a.status==='sold').length};
 $('sellerSummary').innerHTML=[['Total',counts.total],['En attente',counts.pending],['En ligne',counts.approved],['Rejetées',counts.rejected],['Vendues',counts.sold]].map(([label,n])=>`<div class="card" style="margin:0;padding:12px"><div class="small">${label}</div><strong style="font-size:1.3rem;color:var(--green)">${n}</strong></div>`).join('');
 if(!data.length){box.innerHTML='<p class="small">Aucune annonce dans cette catégorie.</p>';return;}
 box.innerHTML=data.map(a=>`<article class="admin-listing"><strong>${esc(a.title)}</strong><div class="small">${esc(a.category||'')} · ${esc(a.city||'')} · ${Number(a.price||0).toLocaleString('fr-FR')} MRU</div><p class="small">${sellerBadge(a)} · Publiée le ${a.created_at?new Date(a.created_at).toLocaleDateString('fr-FR'):'—'}</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="secondary" onclick="sellerEdit('${a.id}')">Modifier</button>${a.moderation_status==='approved'&&a.status!=='sold'?`<button onclick="sellerSetStatus('${a.id}','sold')">Marquer vendu</button>`:a.status==='sold'?`<button class="secondary" onclick="sellerSetStatus('${a.id}','available')">Remettre disponible</button>`:''}<button class="btn-danger" onclick="sellerDelete('${a.id}')">Supprimer</button></div></article>`).join('');
}
const NOTIFICATION_READ_KEY='rim_agroovin_notifications_read_v1';
function notificationReadKey(){const u=supabaseClient.auth.getUser;return 'rim_agroovin_notifications_read_v1_'+(window.__rimCurrentUserId||'guest')}
function renderNotifications(){
 const box=$('notificationList'),summary=$('notificationSummary');if(!box||!summary)return;
 const rows=[...sellerListings].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).map(a=>{
  const m=a.moderation_status||'pending',st=a.status||'available';let icon='⏳',title='Annonce en attente de validation',desc='Ton annonce « '+esc(a.title)+' » a bien été enregistrée et attend la validation de l’équipe.';
  if(m==='approved'){icon='✅';title='Annonce approuvée';desc='Ton annonce « '+esc(a.title)+' » est approuvée'+(st==='sold'?' et marquée comme vendue.':st==='reserved'?' et indiquée comme réservée.':'. Elle peut être visible sur le marketplace.')}
  if(m==='rejected'){icon='⚠️';title='Annonce rejetée';desc='Ton annonce « '+esc(a.title)+' » n’a pas été approuvée. Consulte son statut dans Mon espace vendeur et contacte l’équipe si nécessaire.'}
  if(m==='approved'&&st==='sold'){icon='💰';title='Annonce marquée comme vendue';desc='« '+esc(a.title)+' » est marquée comme vendue.'}
  return {id:String(a.id),icon,title,desc,date:a.created_at};
 });
 const pending=sellerListings.filter(a=>a.moderation_status==='pending').length,approved=sellerListings.filter(a=>a.moderation_status==='approved').length,rejected=sellerListings.filter(a=>a.moderation_status==='rejected').length;
 summary.innerHTML='<strong>'+sellerListings.length+' annonce(s) suivie(s)</strong><br>⏳ '+pending+' en attente · ✅ '+approved+' approuvée(s) · ⚠️ '+rejected+' rejetée(s)';
 if(!rows.length){box.innerHTML='<p class="small">Aucune notification pour le moment. Publie une annonce pour commencer à suivre son traitement.</p>';return;}
 box.innerHTML=rows.map(n=>'<div class="notification-item"><div class="notification-icon">'+n.icon+'</div><div><strong>'+n.title+'</strong><p>'+n.desc+'</p><div class="notification-date">'+(n.date?'Publication : '+new Date(n.date).toLocaleString('fr-FR'):'Statut actuel')+'</div></div></div>').join('');
}
async function loadMyListings(){
 const box=$('myListings');box.innerHTML='<p class="small">Chargement...</p>';
 const {data:{user}}=await supabaseClient.auth.getUser();if(!user){box.textContent='Connecte-toi pour voir tes annonces.';return}
 const {data,error}=await supabaseClient.from('listings').select('id,title,description,category,price,city,status,moderation_status,created_at').eq('seller_id',user.id).order('created_at',{ascending:false});
 if(error){box.textContent='Erreur de chargement : '+error.message;return}
 sellerListings=data||[];renderSellerListings();renderNotifications();
}
async function sellerEdit(id){
 const a=sellerListings.find(x=>x.id===id);if(!a)return;
 const title=prompt('Modifier le titre :',a.title);if(title===null)return;if(!title.trim()){alert('Le titre ne peut pas être vide.');return;}
 const priceRaw=prompt('Modifier le prix (MRU) :',a.price);if(priceRaw===null)return;const price=Number(priceRaw);if(!Number.isFinite(price)||price<0){alert('Prix invalide.');return;}
 const city=prompt('Modifier la ville/localité :',a.city||'');if(city===null)return;
 const description=prompt('Modifier la description :',a.description||'');if(description===null)return;
 const {error}=await supabaseClient.from('listings').update({title:title.trim(),price,city:city.trim(),description}).eq('id',id);
 if(error){status('sellerStatus','Modification impossible : '+error.message);return;}status('sellerStatus','Annonce modifiée. Si elle est déjà approuvée, elle reste publiée.',true);await loadMyListings();
}
async function sellerSetStatus(id,next){
 const {error}=await supabaseClient.from('listings').update({status:next}).eq('id',id);
 if(error){status('sellerStatus','Changement de statut impossible : '+error.message);return;}status('sellerStatus',next==='sold'?'Annonce marquée comme vendue.':'Annonce remise disponible.',true);await loadMyListings();await loadMarketplace();
}
async function sellerDelete(id){if(!confirm('Supprimer définitivement cette annonce ?'))return;
 const {error}=await supabaseClient.from('listings').delete().eq('id',id);
 if(error){status('sellerStatus','Suppression impossible : '+error.message);return;}status('sellerStatus','Annonce supprimée.',true);await loadMyListings();await loadMarketplace();
}
$('refreshListingsBtn').addEventListener('click',loadMyListings);
$('refreshNotificationsBtn').addEventListener('click',loadMyListings);
$('myListingsCard').querySelectorAll('.seller-filter').forEach(b=>b.addEventListener('click',()=>{sellerFilter=b.dataset.filter;renderSellerListings()}));
supabaseClient.auth.onAuthStateChange((_event,session)=>{if(session)signedIn(session.user);else signedOut()});
refreshSession();
loadMarketplace();
loadProfessionalDirectory();
;
function openListingDetails(id){
 const a=marketData.find(x=>String(x.id)===String(id));if(!a)return;
 const photos=(a.photos||[]).filter(Boolean);
 const gallery=photos.length?'<div class="detail-gallery">'+photos.map(url=>'<img loading="lazy" src="'+esc(url)+'" alt="Photo de '+esc(a.title)+'">').join('')+'</div>':'<div style="height:180px;background:#e9efe9;border-radius:12px;display:grid;place-items:center;font-size:3rem">🐑</div>';
 const created=a.created_at?new Date(a.created_at).toLocaleDateString('fr-FR'):'Non précisée';
 $('listingDetailContent').innerHTML=gallery+'<h2>'+esc(a.title)+'</h2><div class="market-price">'+Number(a.price||0).toLocaleString('fr-FR')+' MRU</div><div class="market-meta">'+esc(a.category||'')+' · 📍 '+esc(a.city||'Localité non précisée')+' · Publié le '+created+'</div><h3>Description</h3><div class="detail-description">'+esc(a.description||'Aucune description fournie.')+'</div>'+contactLinks(a.phone_contact);
 $('listingDetailModal').classList.add('open');document.body.style.overflow='hidden';
}
function closeListingDetails(){ $('listingDetailModal').classList.remove('open');document.body.style.overflow=''; }
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeListingDetails()});
;
/* Navigation mono-page : les rubriques sont affichées sans recharger le site. */
(function(){
 const views={
  home:['.hero'],
  market:['#marketplacePublic','#myFavorites'],
  directory:['#professionalDirectory'],
  services:['#serviceRequests'],
  messages:['#messagingSection'],
  account:['#sessionBar','#authCards','#memberArea','#publishCard','#myListingsCard','#adminPanel']
 };
 const nav=document.getElementById('mainNavigation');
 if(!nav)return;
 const allSelectors=[...new Set(Object.values(views).flat())];
 function showView(name){
  if(!views[name])name='home';
  allSelectors.forEach(sel=>document.querySelectorAll(sel).forEach(el=>el.classList.add('nav-inactive')));
  views[name].forEach(sel=>document.querySelectorAll(sel).forEach(el=>el.classList.remove('nav-inactive')));
  nav.querySelectorAll('button[data-view]').forEach(btn=>{
   if(btn.dataset.view===name)btn.setAttribute('aria-current','page');
   else btn.removeAttribute('aria-current');
  });
  try{history.replaceState(null,'','#'+(name==='home'?'accueil':name));}catch(e){}
  window.scrollTo({top:0,behavior:'smooth'});
 }
 nav.addEventListener('click',e=>{const btn=e.target.closest('button[data-view]');if(btn){showView(btn.dataset.view);closeMobileNav();}});
 const menuToggle=document.getElementById('mobileMenuToggle');
 const overlay=document.getElementById('mobileNavOverlay');
 function openMobileNav(){nav.classList.add('mobile-nav-open');overlay.classList.add('mobile-overlay-open');menuToggle.setAttribute('aria-expanded','true');document.body.classList.add('mobile-nav-lock');}
 function closeMobileNav(){nav.classList.remove('mobile-nav-open');overlay.classList.remove('mobile-overlay-open');menuToggle.setAttribute('aria-expanded','false');document.body.classList.remove('mobile-nav-lock');}
 menuToggle?.addEventListener('click',()=>nav.classList.contains('mobile-nav-open')?closeMobileNav():openMobileNav());
 overlay?.addEventListener('click',closeMobileNav);
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMobileNav();});
 document.querySelectorAll('.hero-actions a[href="#marketplacePublic"]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();showView('market')}));
 document.querySelectorAll('.hero-actions a[href="#authCards"]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();showView('account')}));
 // Les liens d'accès à la messagerie depuis les annonces peuvent l'afficher directement.
 window.rimShowView=showView;
 showView('home');
})();
