const {createClient}=supabase;const cats={expense:['Achat de moutons','Alimentation','Santé animale','Transport','Matériel / équipements','Main-d’œuvre','Infrastructure','Eau / électricité','Autres dépenses'],income:['Vente de moutons','Vente de viande','Vente de fumier','Prestation / service','Autres recettes']};let client=null,rows=[],animals=[],lots=[],history=[],stockProducts=[],stockMovements=[];const fmt=n=>Number(n||0).toLocaleString('fr-FR',{maximumFractionDigits:2})+' MRU';const SB_URL=RIM_CONFIG.url,SB_KEY=RIM_CONFIG.key;function conf(){client=createClient(SB_URL,SB_KEY)}function getClient(){if(client)return client;client=createClient(SB_URL,SB_KEY);return client}function sayAuth(t,err=false){authmsg.textContent=t;authmsg.className=err?'status err':'status'}async function login(){try{conf();let {data,error}=await client.auth.signInWithPassword({email:email.value.trim(),password:password.value});if(error)throw error;await start()}catch(e){sayAuth(e.message,true)}}async function start(){client=getClient();let {data:{session}}=await client.auth.getSession();if(!session){app.classList.add('hidden');authscreen.classList.remove('hidden');return}authscreen.classList.add('hidden');app.classList.remove('hidden');userbadge.textContent=session.user.email;await load();if(!currentRole)return;await loadTeam()}async function logout(){await client.auth.signOut();rows=[];app.classList.add('hidden');authscreen.classList.remove('hidden');sayAuth('Vous êtes déconnecté.')}let currentRole='';
async function load(){try{
 const {data:{user}}=await client.auth.getUser();
 const rr=await client.from('rim_team_roles').select('role').eq('user_id',user.id).maybeSingle();
 if(rr.error)throw rr.error;currentRole=rr.data?.role||'';if(!currentRole){await client.auth.signOut();app.classList.add('hidden');authscreen.classList.remove('hidden');sayAuth('Accès réservé à l\u2019équipe : aucun rôle n\u2019est attribué à ce compte.',true);return}applyRoleAccess();
 rows=[];animals=[];lots=[];history=[];stockProducts=[];stockMovements=[];
 if(['admin','accountant'].includes(currentRole)){const q=await client.from('rim_internal_transactions').select('*').order('transaction_date',{ascending:false}).order('created_at',{ascending:false});if(q.error)throw q.error;rows=q.data||[];}
 if(['admin','livestock_manager','storekeeper'].includes(currentRole)) await loadLivestock();
 if(['admin','accountant','livestock_manager','storekeeper'].includes(currentRole)) await loadStock();
 render();
 }catch(e){msg.innerHTML='<div class="notice">Erreur de chargement Supabase : '+esc(e.message)+'</div>'}}
function applyRoleAccess(){
 const allowed={admin:['dashboard','transactions','livestock','profitability','stock','team','audit','reports'],accountant:['dashboard','transactions','stock','team','reports'],livestock_manager:['dashboard','livestock','stock','team'],storekeeper:['dashboard','livestock','stock','team'],viewer:['dashboard','team']};
 const pages=allowed[currentRole]||allowed.viewer;
 document.querySelectorAll('.nav button[data-page]').forEach(b=>{const p=b.dataset.page;b.classList.toggle('hidden',!pages.includes(p));});
 document.querySelectorAll('.page').forEach(el=>{if(!pages.includes(el.id))el.classList.add('hidden')});
 document.querySelectorAll('[data-admin-only]').forEach(el=>el.classList.toggle('hidden',currentRole!=='admin'));
 const financeWrite=currentRole==='admin'||currentRole==='accountant';
 const livestockWrite=currentRole==='admin'||currentRole==='livestock_manager';
 const stockWrite=currentRole==='admin'||currentRole==='storekeeper';
 ['txnform'].forEach(id=>{const el=document.getElementById(id);if(el)el.querySelectorAll('input,select,textarea,button').forEach(x=>x.disabled=!financeWrite)});
 ['employeeForm','roleForm'].forEach(id=>{const el=document.getElementById(id);if(el)el.querySelectorAll('input,select,textarea,button').forEach(x=>x.disabled=currentRole!=='admin')});
 const setPanel=(id,visible)=>{const el=document.getElementById(id);if(el){const panel=el.closest('.panel');if(panel)panel.classList.toggle('hidden',!visible)}};
 setPanel('stockProductForm',stockWrite);setPanel('stockMovementForm',stockWrite);
 setPanel('animalForm',livestockWrite);
 document.querySelectorAll('#transactions .panelhead button, #dashboard .quick .card[onclick*=openModal]').forEach(x=>x.classList.toggle('hidden',!financeWrite));
 const badge=document.getElementById('userbadge');if(badge)badge.textContent=({admin:'Administrateur',accountant:'Comptable',livestock_manager:'Responsable élevage',storekeeper:'Magasinier',viewer:'Consultation'})[currentRole]||'Sans rôle';
}
let auditRows=[];
async function loadAudit(){if(currentRole!=='admin')return;try{const {data,error}=await client.from('rim_audit_logs').select('id,actor_id,table_name,operation,record_id,created_at,old_data,new_data').order('created_at',{ascending:false}).limit(250);if(error)throw error;auditRows=data||[];const tf=document.getElementById('auditTableFilter');if(tf){const current=tf.value;const tables=[...new Set(auditRows.map(x=>x.table_name).filter(Boolean))].sort();tf.innerHTML='<option value="">Toutes les tables</option>'+tables.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('');tf.value=tables.includes(current)?current:'';}renderAudit();}catch(e){auditTable.innerHTML='<div class="status err">'+esc(e.message)+'</div>'}}
function renderAudit(){const el=document.getElementById('auditTable');if(!el)return;const q=(document.getElementById('auditSearch')?.value||'').toLowerCase(),table=document.getElementById('auditTableFilter')?.value||'',op=document.getElementById('auditOperationFilter')?.value||'',from=document.getElementById('auditFrom')?.value||'',to=document.getElementById('auditTo')?.value||'';const data=auditRows.filter(x=>(!q||`${x.actor_id||''} ${x.table_name||''} ${x.record_id||''}`.toLowerCase().includes(q))&&(!table||x.table_name===table)&&(!op||x.operation===op)&&(!from||String(x.created_at).slice(0,10)>=from)&&(!to||String(x.created_at).slice(0,10)<=to));el.innerHTML=data.length?'<div class="tablewrap"><table><thead><tr><th>Date</th><th>Auteur (UUID)</th><th>Table / module</th><th>Action</th><th>Enregistrement</th><th>Détails</th></tr></thead><tbody>'+data.map(x=>`<tr><td>${esc(new Date(x.created_at).toLocaleString('fr-FR'))}</td><td><code>${esc(x.actor_id||'Système')}</code></td><td>${esc(x.table_name)}</td><td>${esc(x.operation)}</td><td><code>${esc(x.record_id||'—')}</code></td><td><button class="btn alt" onclick="auditDetail('${x.id}')">Voir</button></td></tr>`).join('')+'</tbody></table></div>':'<div class="empty">Aucune opération ne correspond aux filtres.</div>';}
function auditDetail(id){const x=auditRows.find(r=>r.id===id);if(!x)return;const fmtObj=o=>o==null?'—':esc(JSON.stringify(o,null,2));auditDetailContent.innerHTML=`<p><b>Date :</b> ${esc(new Date(x.created_at).toLocaleString('fr-FR'))}</p><p><b>Auteur UUID :</b> <code>${esc(x.actor_id||'Système')}</code></p><p><b>Table :</b> ${esc(x.table_name||'—')} &nbsp; <b>Action :</b> ${esc(x.operation||'—')}</p><p><b>ID enregistrement :</b> <code>${esc(x.record_id||'—')}</code></p><h3>Anciennes données</h3><pre style="white-space:pre-wrap;word-break:break-word;background:#f5f7f5;padding:12px;border-radius:8px">${fmtObj(x.old_data)}</pre><h3>Nouvelles données</h3><pre style="white-space:pre-wrap;word-break:break-word;background:#f5f7f5;padding:12px;border-radius:8px">${fmtObj(x.new_data)}</pre>`;auditDetailModal.classList.add('open');}
function closeAuditDetail(){auditDetailModal.classList.remove('open');}
function exportAuditCSV(){const q=(document.getElementById('auditSearch')?.value||'').toLowerCase(),table=document.getElementById('auditTableFilter')?.value||'',op=document.getElementById('auditOperationFilter')?.value||'',from=document.getElementById('auditFrom')?.value||'',to=document.getElementById('auditTo')?.value||'';const data=auditRows.filter(x=>(!q||`${x.actor_id||''} ${x.table_name||''} ${x.record_id||''}`.toLowerCase().includes(q))&&(!table||x.table_name===table)&&(!op||x.operation===op)&&(!from||String(x.created_at).slice(0,10)>=from)&&(!to||String(x.created_at).slice(0,10)<=to));const csv=['Date;Auteur UUID;Table;Action;ID enregistrement',...data.map(x=>[new Date(x.created_at).toLocaleString('fr-FR'),x.actor_id||'Système',x.table_name,x.operation,x.record_id||''].map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(';'))].join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.download='RIM_AgroOvin_Audit.csv';a.click();URL.revokeObjectURL(a.href);}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function go(p){document.querySelectorAll('.page').forEach(s=>s.classList.add('hidden'));document.getElementById(p).classList.remove('hidden');document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===p));pagetitle.textContent=({dashboard:'Tableau de bord',transactions:'Comptabilité',livestock:'Gestion du cheptel',profitability:'Rentabilité de l’élevage',stock:'Stocks & alimentation',team:'Équipe',audit:'Journal d’activité / Audit',reports:'Rapports'})[p];render();if(p==='profitability')renderProfitability();if(p==='stock'&&client)loadStock().catch(()=>{});if(p==='team'&&client)loadTeam();if(p==='audit'&&client)loadAudit()}document.querySelectorAll('.nav button').forEach(b=>b.onclick=()=>go(b.dataset.page));function openModal(t){modal.classList.add('open');fillAnimalSelectors();kind.value=t==='expense'?'Dépense':'Recette';modtitle.textContent=t==='expense'?'Enregistrer une dépense':'Enregistrer une recette';category.innerHTML=cats[t].map(c=>`<option>${esc(c)}</option>`).join('');date.value=new Date().toISOString().slice(0,10);txnform.dataset.type=t}function closeModal(){modal.classList.remove('open')}txnform.onsubmit=async e=>{e.preventDefault();try{let {data:{user}}=await client.auth.getUser();if(!user)throw Error('Session expirée, reconnectez-vous.');let payload={created_by:user.id,transaction_type:txnform.dataset.type,category:category.value,amount:Number(amount.value),transaction_date:date.value,payment_method:payment.value,responsible_name:person.value.trim(),description:description.value.trim(),animal_id:txnAnimal.value||null,lot_id:txnLot.value||null};let {error}=await client.from('rim_internal_transactions').insert(payload);if(error)throw error;closeModal();txnform.reset();await load();msg.innerHTML='<div class="status">Opération enregistrée dans Supabase.</div>'}catch(err){msg.innerHTML='<div class="status err">'+esc(err.message)+'</div>'}};function render(){let incomeSum=rows.filter(x=>x.transaction_type==='income').reduce((s,x)=>s+Number(x.amount),0),expenseSum=rows.filter(x=>x.transaction_type==='expense').reduce((s,x)=>s+Number(x.amount),0);income.textContent=fmt(incomeSum);expenses.textContent=fmt(expenseSum);balance.textContent=fmt(incomeSum-expenseSum);count.textContent=rows.length;const line=x=>`<tr><td>${esc(x.transaction_date)}</td><td>${x.transaction_type==='income'?'Recette':'Dépense'}</td><td>${esc(x.category)}</td><td>${esc(x.description)}</td><td>${esc(x.responsible_name||'—')}</td><td>${fmt(x.amount)}</td><td><button class="btn danger" onclick="del('${x.id}')">Supprimer</button></td></tr>`;recent.innerHTML=rows.length?'<div class="tablewrap"><table><thead><tr><th>Date</th><th>Type</th><th>Catégorie</th><th>Description</th><th>Responsable</th><th>Montant</th><th></th></tr></thead><tbody>'+rows.slice(0,5).map(line).join('')+'</tbody></table></div>':'<div class="empty">Aucune opération enregistrée.</div>';let q=(search?.value||'').toLowerCase(),type=typefilter?.value||'';let filtered=rows.filter(x=>(!type||x.transaction_type===type)&&(`${x.category} ${x.description} ${x.responsible_name||''}`.toLowerCase().includes(q)));table.innerHTML=filtered.length?'<div class="tablewrap"><table><thead><tr><th>Date</th><th>Type</th><th>Catégorie</th><th>Description</th><th>Responsable</th><th>Montant</th><th></th></tr></thead><tbody>'+filtered.map(line).join('')+'</tbody></table></div>':'<div class="empty">Aucune opération trouvée.</div>'}async function del(id){if(!confirm('Supprimer cette opération en ligne ?'))return;try{let {error}=await client.from('rim_internal_transactions').delete().eq('id',id);if(error)throw error;await load()}catch(e){msg.innerHTML='<div class="status err">'+esc(e.message)+'</div>'}}async function loadLivestock(){
 const [a,l,w,h,f]=await Promise.all([
  client.from('rim_livestock_animals').select('*').order('created_at',{ascending:false}),
  client.from('rim_livestock_lots').select('*').order('created_at',{ascending:false}),
  client.from('rim_livestock_weight_records').select('*').order('record_date',{ascending:false}).limit(12),
  client.from('rim_livestock_health_records').select('*').order('record_date',{ascending:false}).limit(12),
  client.from('rim_livestock_feed_records').select('*').order('record_date',{ascending:false}).limit(12)
 ]);
 for(const r of [a,l,w,h,f]) if(r.error) throw r.error;
 animals=a.data||[];lots=l.data||[];history=[...(w.data||[]).map(x=>({...x,_kind:'Pesée'})),...(h.data||[]).map(x=>({...x,_kind:'Soin'})),...(f.data||[]).map(x=>({...x,_kind:'Alimentation'}))].sort((x,y)=>String(y.record_date).localeCompare(String(x.record_date))).slice(0,20);
 renderLivestock();fillAnimalSelectors();
}
function fillAnimalSelectors(){
 const opts=animals.filter(a=>a.status!=='sold').map(a=>`<option value="${a.id}">${esc(a.animal_code)} — ${esc(a.breed||'Sans race')}</option>`).join('');
 if(typeof animalLot!=='undefined') animalLot.innerHTML='<option value="">Sans lot</option>'+lots.map(l=>`<option value="${l.id}">${esc(l.lot_name)}</option>`).join('');
 if(typeof recordAnimal!=='undefined') recordAnimal.innerHTML='<option value="">Choisir un animal</option>'+opts;
 if(typeof txnAnimal!=='undefined') txnAnimal.innerHTML='<option value="">Aucun</option>'+animals.map(a=>`<option value="${a.id}">${esc(a.animal_code)}</option>`).join('');
 if(typeof txnLot!=='undefined') txnLot.innerHTML='<option value="">Aucun</option>'+lots.map(l=>`<option value="${l.id}">${esc(l.lot_name)}</option>`).join('');
}
function renderLivestock(){
 if(typeof animalCount==='undefined')return;
 const active=animals.filter(a=>a.status!=='sold'&&a.status!=='dead');
 animalCount.textContent=animals.length;activeAnimalCount.textContent=active.length;
 totalWeight.textContent=fmt(active.reduce((s,a)=>s+Number(a.current_weight||0),0)).replace(' MRU',' kg');
 purchaseTotal.textContent=fmt(animals.reduce((s,a)=>s+Number(a.purchase_price||0),0));
 const q=(animalSearch?.value||'').toLowerCase();const list=animals.filter(a=>`${a.animal_code} ${a.breed||''} ${a.sex||''}`.toLowerCase().includes(q));
 animalTable.innerHTML=list.length?'<div class="tablewrap"><table><thead><tr><th>Identifiant</th><th>Sexe</th><th>Race</th><th>Achat</th><th>Prix</th><th>Poids actuel</th><th>Prix public</th><th>Catalogue</th><th>Statut</th><th>Action</th></tr></thead><tbody>'+list.map(a=>`<tr><td><b>${esc(a.animal_code)}</b></td><td>${esc(a.sex||'—')}</td><td>${esc(a.breed||'—')}</td><td>${esc(a.purchase_date||'—')}</td><td>${fmt(a.purchase_price)}</td><td>${a.current_weight?esc(a.current_weight)+' kg':'—'}</td><td>${a.public_price?fmt(a.public_price):'—'}</td><td>${a.catalog_visible?'Oui':'Non'}</td><td>${a.status==='sold'?'Vendu':a.status==='dead'?'Mort':'En stock'}</td><td>${a.status==='sold'?'—':`<button class="btn alt" onclick="selectAnimal('${a.id}')">Suivi</button> <button class="btn" onclick="sellAnimal('${a.id}')">Vendre</button>`}</td></tr>`).join('')+'</tbody></table></div>':'<div class="empty">Aucun animal enregistré.</div>';
 livestockHistory.innerHTML=history.length?'<div class="tablewrap"><table><thead><tr><th>Date</th><th>Type</th><th>Animal</th><th>Détail</th><th>Quantité / poids</th><th>Coût</th></tr></thead><tbody>'+history.map(x=>{let a=animals.find(a=>a.id===x.animal_id);return `<tr><td>${esc(x.record_date||'')}</td><td>${esc(x._kind)}</td><td>${esc(a?.animal_code||'—')}</td><td>${esc(x.description||x.feed_name||x.health_type||'')}</td><td>${x.weight_kg?x.weight_kg+' kg':x.quantity_kg?x.quantity_kg+' kg':'—'}</td><td>${fmt(x.cost||0)}</td></tr>`}).join('')+'</tbody></table></div>':'<div class="empty">Aucun suivi enregistré.</div>';
}
function selectAnimal(id){recordAnimal.value=id;document.getElementById('livestockMsg').innerHTML='<div class="status">Animal sélectionné pour le suivi.</div>';}
async function createLot(){try{let name=prompt('Nom du nouveau lot (ex. Lot Novembre 2026) :');if(!name||!name.trim())return;let {data:{user}}=await client.auth.getUser();let {error}=await client.from('rim_livestock_lots').insert({created_by:user.id,lot_name:name.trim()});if(error)throw error;await loadLivestock();livestockMsg.innerHTML='<div class="status">Lot créé.</div>'}catch(e){livestockMsg.innerHTML='<div class="status err">'+esc(e.message)+'</div>'}}
animalForm.onsubmit=async e=>{e.preventDefault();try{let {data:{user}}=await client.auth.getUser();let photoUrl=null;const file=animalPhoto.files[0];if(file){if(file.size>5*1024*1024)throw Error('Photo limitée à 5 Mo.');if(!file.type.startsWith('image/'))throw Error('Choisissez une image.');const ext=(file.name.split('.').pop()||'jpg').toLowerCase();const path=`${user.id}/${animalCode.value.trim().replace(/[^a-z0-9_-]/gi,'_')}_${Date.now()}.${ext}`;const up=await client.storage.from('rim-animal-photos').upload(path,file,{upsert:true,contentType:file.type});if(up.error)throw up.error;photoUrl=client.storage.from('rim-animal-photos').getPublicUrl(path).data.publicUrl;}let payload={created_by:user.id,animal_code:animalCode.value.trim(),sex:animalSex.value,breed:animalBreed.value.trim()||null,lot_id:animalLot.value||null,purchase_date:animalPurchaseDate.value,purchase_price:Number(animalPurchasePrice.value),initial_weight:animalInitialWeight.value?Number(animalInitialWeight.value):null,current_weight:animalCurrentWeight.value?Number(animalCurrentWeight.value):null,public_price:animalPublicPrice.value?Number(animalPublicPrice.value):null,catalog_visible:animalCatalog.value==='true',public_description:animalPublicDescription.value.trim()||null,photo_url:photoUrl,notes:animalNotes.value.trim()||null};let {error}=await client.from('rim_livestock_animals').insert(payload);if(error)throw error;animalForm.reset();animalPurchaseDate.value=new Date().toISOString().slice(0,10);await loadLivestock();livestockMsg.innerHTML='<div class="status">Animal enregistré avec ses paramètres catalogue.</div>'}catch(e){livestockMsg.innerHTML='<div class="status err">'+esc(e.message)+'</div>'}};
async function addWeight(){try{let id=recordAnimal.value;if(!id)throw Error('Sélectionnez un animal.');let v=Number(weightValue.value);if(!(v>0))throw Error('Saisissez un poids valide.');let {data:{user}}=await client.auth.getUser();let {error}=await client.from('rim_livestock_weight_records').insert({created_by:user.id,animal_id:id,weight_kg:v,record_date:weightDate.value||new Date().toISOString().slice(0,10)});if(error)throw error;let up=await client.from('rim_livestock_animals').update({current_weight:v}).eq('id',id);if(up.error)throw up.error;weightValue.value='';await loadLivestock();livestockMsg.innerHTML='<div class="status">Pesée enregistrée.</div>'}catch(e){livestockMsg.innerHTML='<div class="status err">'+esc(e.message)+'</div>'}}
async function addHealth(){try{let id=recordAnimal.value;if(!id)throw Error('Sélectionnez un animal.');let {data:{user}}=await client.auth.getUser();let {error}=await client.from('rim_livestock_health_records').insert({created_by:user.id,animal_id:id,health_type:healthType.value,cost:Number(healthCost.value||0),description:healthDetail.value.trim()||null,record_date:new Date().toISOString().slice(0,10)});if(error)throw error;if(Number(healthCost.value)>0&&['admin','accountant'].includes(currentRole)){let a=animals.find(x=>x.id===id);let tx=await client.from('rim_internal_transactions').insert({created_by:user.id,transaction_type:'expense',category:'Santé animale',amount:Number(healthCost.value),transaction_date:new Date().toISOString().slice(0,10),payment_method:'Espèces',responsible_name:'',description:'Soin animal '+a.animal_code+' : '+healthType.value,animal_id:id});if(tx.error)throw tx.error;await load()}await loadLivestock();healthCost.value='';healthDetail.value='';livestockMsg.innerHTML='<div class="status">Soin enregistré.</div>'}catch(e){livestockMsg.innerHTML='<div class="status err">'+esc(e.message)+'</div>'}}
async function addFeed(){try{let id=recordAnimal.value;if(!id)throw Error('Sélectionnez un animal.');if(!feedName.value.trim())throw Error('Indiquez l’aliment distribué.');let {data:{user}}=await client.auth.getUser();let cost=Number(feedCost.value||0);let {error}=await client.from('rim_livestock_feed_records').insert({created_by:user.id,animal_id:id,feed_name:feedName.value.trim(),quantity_kg:Number(feedQuantity.value||0),cost,record_date:feedDate.value||new Date().toISOString().slice(0,10)});if(error)throw error;if(cost>0&&['admin','accountant'].includes(currentRole)){let a=animals.find(x=>x.id===id);let tx=await client.from('rim_internal_transactions').insert({created_by:user.id,transaction_type:'expense',category:'Alimentation',amount:cost,transaction_date:feedDate.value||new Date().toISOString().slice(0,10),payment_method:'Espèces',responsible_name:'',description:'Alimentation animal '+a.animal_code+' : '+feedName.value.trim(),animal_id:id});if(tx.error)throw tx.error;await load()}await loadLivestock();feedName.value='';feedQuantity.value='';feedCost.value='';livestockMsg.innerHTML='<div class="status">Alimentation enregistrée.</div>'}catch(e){livestockMsg.innerHTML='<div class="status err">'+esc(e.message)+'</div>'}}
async function sellAnimal(id){try{let a=animals.find(x=>x.id===id);let raw=prompt('Prix de vente en MRU pour '+a.animal_code+' :');if(raw===null)return;let price=Number(raw);if(!(price>0))throw Error('Prix de vente invalide.');let date=new Date().toISOString().slice(0,10);let {data:{user}}=await client.auth.getUser();let upd=await client.from('rim_livestock_animals').update({status:'sold',sale_date:date,sale_price:price}).eq('id',id);if(upd.error)throw upd.error;if(['admin','accountant'].includes(currentRole)){let ins=await client.from('rim_internal_transactions').insert({created_by:user.id,transaction_type:'income',category:'Vente de moutons',amount:price,transaction_date:date,payment_method:'Espèces',responsible_name:'',description:'Vente animal '+a.animal_code,animal_id:id,lot_id:a.lot_id});if(ins.error)throw ins.error;await load();livestockMsg.innerHTML='<div class="status">Vente enregistrée et recette ajoutée à la comptabilité.</div>'}else{livestockMsg.innerHTML='<div class="status">Vente enregistrée dans le cheptel. Le comptable doit saisir la recette dans le journal financier.</div>'}}catch(e){livestockMsg.innerHTML='<div class="status err">'+esc(e.message)+'</div>'}}
function animalFinancialRows(){
 return animals.map(a=>{
  const linked=rows.filter(t=>t.animal_id===a.id);
  const expenses=linked.filter(t=>t.transaction_type==='expense'&&t.category!=='Achat de moutons').reduce((s,t)=>s+Number(t.amount||0),0);
  const purchase=Number(a.purchase_price||0);
  const cost=purchase+expenses;
  const revenue=a.status==='sold'?Number(a.sale_price||linked.filter(t=>t.transaction_type==='income').reduce((s,t)=>s+Number(t.amount||0),0)):0;
  const margin=a.status==='sold'?revenue-cost:null;
  return {...a,purchase,expenses,cost,revenue,margin};
 });
}
function renderProfitability(){
 if(typeof profitTable==='undefined')return;
 const data=animalFinancialRows();
 const sold=data.filter(a=>a.status==='sold');
 const totalCost=data.reduce((s,a)=>s+a.cost,0);
 const totalRevenue=sold.reduce((s,a)=>s+a.revenue,0);
 const totalMargin=sold.reduce((s,a)=>s+(a.margin||0),0);
 pCost.textContent=fmt(totalCost);pRevenue.textContent=fmt(totalRevenue);pMargin.textContent=fmt(totalMargin);pAverage.textContent=fmt(sold.length?totalMargin/sold.length:0);
 const q=(profitSearch?.value||'').toLowerCase(),st=profitStatus?.value||'';
 const filtered=data.filter(a=>(!st||a.status===st)&&(`${a.animal_code} ${a.breed||''} ${a.sex||''}`.toLowerCase().includes(q)));
 profitTable.innerHTML=filtered.length?'<div class="tablewrap"><table><thead><tr><th>Animal</th><th>Lot</th><th>Statut</th><th>Achat</th><th>Autres charges</th><th>Coût total</th><th>Vente</th><th>Marge</th></tr></thead><tbody>'+filtered.map(a=>{const lot=lots.find(l=>l.id===a.lot_id);return `<tr><td><b>${esc(a.animal_code)}</b></td><td>${esc(lot?.lot_name||'—')}</td><td>${a.status==='sold'?'Vendu':a.status==='dead'?'Mort':'En stock'}</td><td>${fmt(a.purchase)}</td><td>${fmt(a.expenses)}</td><td><b>${fmt(a.cost)}</b></td><td>${a.status==='sold'?fmt(a.revenue):'—'}</td><td>${a.margin===null?'<span class="badge">Non réalisée</span>':`<b style="color:${a.margin>=0?'#176b42':'#b42318'}">${fmt(a.margin)}</b>`}</td></tr>`}).join('')+'</tbody></table></div>':'<div class="empty">Aucun animal correspondant.</div>';
 const groups={};data.forEach(a=>{const key=a.lot_id||'none';if(!groups[key])groups[key]={cost:0,revenue:0,margin:0,count:0,sold:0};groups[key].cost+=a.cost;groups[key].count++;if(a.status==='sold'){groups[key].sold++;groups[key].revenue+=a.revenue;groups[key].margin+=a.margin||0}});
 const entries=Object.entries(groups);
 lotProfitTable.innerHTML=entries.length?'<div class="tablewrap"><table><thead><tr><th>Lot</th><th>Animaux</th><th>Vendus</th><th>Coûts cumulés</th><th>Recettes</th><th>Marge réalisée</th></tr></thead><tbody>'+entries.map(([id,g])=>{const lot=lots.find(l=>l.id===id);return `<tr><td><b>${esc(lot?.lot_name||'Sans lot')}</b></td><td>${g.count}</td><td>${g.sold}</td><td>${fmt(g.cost)}</td><td>${fmt(g.revenue)}</td><td><b style="color:${g.margin>=0?'#176b42':'#b42318'}">${fmt(g.margin)}</b></td></tr>`}).join('')+'</tbody></table></div>':'<div class="empty">Aucun lot ni animal enregistré.</div>';
}
function exportProfitCSV(){const data=animalFinancialRows();const out='Identifiant;Lot;Statut;Achat MRU;Autres charges MRU;Cout total MRU;Vente MRU;Marge MRU\n'+data.map(a=>{const lot=lots.find(l=>l.id===a.lot_id);return [a.animal_code,lot?.lot_name||'Sans lot',a.status,a.purchase,a.expenses,a.cost,a.revenue,a.margin??''].map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(';')}).join('\n');const link=document.createElement('a');link.href=URL.createObjectURL(new Blob(['\ufeff'+out],{type:'text/csv;charset=utf-8'}));link.download='RIM_AgroOvin_Rentabilite.csv';link.click();URL.revokeObjectURL(link.href)}

async function loadStock(){
 try{
  const [p,m]=await Promise.all([
   client.from('rim_stock_products').select('*').order('product_name'),
   client.from('rim_stock_movements').select('*').order('movement_date',{ascending:false}).order('created_at',{ascending:false})
  ]);
  if(p.error)throw p.error;if(m.error)throw m.error;
  stockProducts=p.data||[];stockMovements=m.data||[];
  renderStock();
 }catch(e){if(typeof stockMsg!=='undefined')stockMsg.innerHTML='<div class="status err">'+esc(e.message)+'</div>';throw e}
}
function stockBalance(productId){
 return stockMovements.filter(x=>x.product_id===productId).reduce((s,x)=>{
  const q=Number(x.quantity||0);return s+((x.movement_type==='use')?-q:q);
 },0);
}
function renderStock(){
 if(typeof stockProductsTable==='undefined')return;
 const totalQty=stockProducts.reduce((s,p)=>s+Math.max(0,stockBalance(p.id)),0);
 const alerts=stockProducts.filter(p=>stockBalance(p.id)<=Number(p.alert_threshold||0)).length;
 const value=stockProducts.reduce((s,p)=>{
  const entries=stockMovements.filter(m=>m.product_id===p.id&&m.movement_type==='entry');
  const qty=entries.reduce((a,m)=>a+Number(m.quantity||0),0);
  const cost=entries.reduce((a,m)=>a+Number(m.total_cost||0),0);
  const avg=qty>0?cost/qty:0;return s+Math.max(0,stockBalance(p.id))*avg;
 },0);
 stockKinds.textContent=stockProducts.length;stockQuantity.textContent=fmtQty(totalQty);
 stockAlerts.textContent=alerts;stockValue.textContent=fmt(value);
 stockMovementProduct.innerHTML='<option value="">Choisir un produit</option>'+stockProducts.map(p=>`<option value="${p.id}">${esc(p.product_name)} (${fmtQty(stockBalance(p.id))} ${esc(p.unit)})</option>`).join('');
 stockMovementLot.innerHTML='<option value="">Aucun lot</option>'+lots.map(l=>`<option value="${l.id}">${esc(l.lot_name)}</option>`).join('');
 stockProductsTable.innerHTML=stockProducts.length?'<div class="tablewrap"><table><thead><tr><th>Produit</th><th>Catégorie</th><th>Disponible</th><th>Seuil</th><th>État</th></tr></thead><tbody>'+stockProducts.map(p=>{let q=stockBalance(p.id),low=q<=Number(p.alert_threshold||0);return `<tr><td><b>${esc(p.product_name)}</b></td><td>${esc(p.category||'—')}</td><td>${fmtQty(q)} ${esc(p.unit)}</td><td>${fmtQty(p.alert_threshold)} ${esc(p.unit)}</td><td>${low?'<span class="badge" style="background:#fff0ee;color:#a33126">Stock bas</span>':'<span class="badge">Disponible</span>'}</td></tr>`}).join('')+'</tbody></table></div>':'<div class="empty">Aucun produit enregistré.</div>';
 const names=Object.fromEntries(stockProducts.map(p=>[p.id,p.product_name]));
 stockMovementsTable.innerHTML=stockMovements.length?'<div class="tablewrap"><table><thead><tr><th>Date</th><th>Produit</th><th>Mouvement</th><th>Quantité</th><th>Coût</th><th>Commentaire</th></tr></thead><tbody>'+stockMovements.slice(0,100).map(m=>`<tr><td>${esc(m.movement_date)}</td><td>${esc(names[m.product_id]||'Produit')}</td><td>${m.movement_type==='entry'?'Entrée':m.movement_type==='use'?'Consommation':'Ajustement +'}</td><td>${fmtQty(m.quantity)}</td><td>${fmt(m.total_cost||0)}</td><td>${esc(m.notes||'—')}</td></tr>`).join('')+'</tbody></table></div>':'<div class="empty">Aucun mouvement enregistré.</div>';
}
function fmtQty(n){return Number(n||0).toLocaleString('fr-FR',{maximumFractionDigits:2})}
stockProductForm.onsubmit=async e=>{
 e.preventDefault();try{
  const {data:{user}}=await client.auth.getUser();if(!user)throw Error('Session expirée.');
  const payload={created_by:user.id,product_name:stockProductName.value.trim(),category:stockProductCategory.value,unit:stockProductUnit.value,alert_threshold:Number(stockProductThreshold.value),notes:stockProductNotes.value.trim()||null};
  const {error}=await client.from('rim_stock_products').insert(payload);if(error)throw error;
  stockProductForm.reset();stockProductThreshold.value='10';await loadStock();
  stockMsg.innerHTML='<div class="status">Produit ajouté au stock.</div>';
 }catch(e){stockMsg.innerHTML='<div class="status err">'+esc(e.message)+'</div>'}
};
stockMovementForm.onsubmit=async e=>{
 e.preventDefault();try{
  const {data:{user}}=await client.auth.getUser();if(!user)throw Error('Session expirée.');
  const product=stockProducts.find(p=>p.id===stockMovementProduct.value);if(!product)throw Error('Choisissez un produit.');
  const type=stockMovementType.value,qty=Number(stockMovementQuantity.value),cost=Number(stockMovementCost.value||0);
  if(!(qty>0))throw Error('La quantité doit être supérieure à zéro.');
  if(type==='use'&&qty>stockBalance(product.id))throw Error('Stock insuffisant : disponible '+fmtQty(stockBalance(product.id))+' '+product.unit+'.');
  if(type==='entry'&&cost<0)throw Error('Coût invalide.');
  const date=stockMovementDate.value||new Date().toISOString().slice(0,10),lotId=stockMovementLot.value||null;
  const payload={created_by:user.id,product_id:product.id,movement_type:type,quantity:qty,total_cost:type==='entry'?cost:0,movement_date:date,lot_id:lotId,notes:stockMovementNotes.value.trim()||null};
  const {error}=await client.from('rim_stock_movements').insert(payload);if(error)throw error;
  if(type==='entry'&&cost>0&&['admin','accountant'].includes(currentRole)){
   const tx=await client.from('rim_internal_transactions').insert({created_by:user.id,transaction_type:'expense',category:'Alimentation',amount:cost,transaction_date:date,payment_method:'Espèces',responsible_name:'',description:'Achat stock : '+product.product_name});
   if(tx.error)throw tx.error;
  }
  stockMovementForm.reset();stockMovementDate.value=new Date().toISOString().slice(0,10);stockMovementCost.value='0';
  await load();stockMsg.innerHTML='<div class="status">Mouvement enregistré. Stock actualisé.'+((type==='entry'&&cost>0&&!['admin','accountant'].includes(currentRole))?' Le comptable doit saisir la dépense correspondante dans le journal financier.':'')+'</div>';
 }catch(e){stockMsg.innerHTML='<div class="status err">'+esc(e.message)+'</div>'}
};
function exportStockCSV(){
 const lines=['Produit;Catégorie;Unité;Quantité disponible;Seuil alerte'];
 stockProducts.forEach(p=>lines.push([p.product_name,p.category,p.unit,stockBalance(p.id),p.alert_threshold].map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(';')));
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'}));a.download='RIM_AgroOvin_Stocks.csv';a.click();URL.revokeObjectURL(a.href);
}
function exportCSV(){let out='Date;Type;Categorie;Description;Responsable;Paiement;Montant MRU\n'+rows.map(x=>[x.transaction_date,x.transaction_type==='income'?'Recette':'Dépense',x.category,x.description,x.responsible_name,x.payment_method,x.amount].map(v=>`"${String(v||'').replaceAll('"','""')}"`).join(';')).join('\n');let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([out],{type:'text/csv;charset=utf-8'}));a.download='RIM_AgroOvin_journal.csv';a.click()}if(typeof animalPurchaseDate!=='undefined')animalPurchaseDate.value=new Date().toISOString().slice(0,10);if(typeof weightDate!=='undefined')weightDate.value=new Date().toISOString().slice(0,10);if(typeof feedDate!=='undefined')feedDate.value=new Date().toISOString().slice(0,10);if(typeof stockMovementDate!=='undefined')stockMovementDate.value=new Date().toISOString().slice(0,10);if(localStorage.getItem('rim_supabase_url')&&localStorage.getItem('rim_supabase_key')){try{client=getClient();client.auth.getSession().then(r=>{if(r.data.session)start()})}catch(e){}}

// V6 — équipe et rôles
let employees=[],teamRoles=[];
const roleLabels={admin:'Administrateur',accountant:'Comptable',livestock_manager:'Responsable élevage',storekeeper:'Magasinier',viewer:'Consultation'};
let teamIsAdmin=false;
function applyTeamPermissions(){
 const adminOnly=['employeeForm','roleForm'];
 adminOnly.forEach(id=>{const el=document.getElementById(id);if(el){el.querySelectorAll('input,select,textarea,button').forEach(c=>c.disabled=!teamIsAdmin);}});
 document.querySelectorAll('[data-admin-only]').forEach(el=>el.classList.toggle('hidden',!teamIsAdmin));
 const note=document.getElementById('teamPermissionNote');if(note)note.textContent=teamIsAdmin?'Vous êtes administrateur : gestion complète de l’équipe.':'Consultation seule : seul un administrateur peut ajouter, modifier, supprimer ou attribuer des rôles.';
}
async function loadTeam(){
 try{
  const [e,r,u]=await Promise.all([
   client.from('rim_team_employees').select('*').order('full_name'),
   client.from('rim_team_roles').select('*').order('created_at'),
   client.auth.getUser()
  ]);
  if(e.error)throw e.error;if(r.error)throw r.error;
  employees=e.data||[];teamRoles=r.data||[];
  const me=u.data.user, mine=teamRoles.find(x=>x.user_id===me.id);
  teamIsAdmin=mine?.role==='admin';applyTeamPermissions();
  teamCount.textContent=employees.length;teamUsers.textContent=teamRoles.length;
  teamAdmins.textContent=teamRoles.filter(x=>x.role==='admin').length;
  myRole.textContent=roleLabels[mine?.role]||'Non attribué';
  employeesTable.innerHTML=employees.length?'<div class="tablewrap"><table><thead><tr><th>Nom</th><th>Fonction</th><th>Téléphone</th><th>Email</th><th>Recrutement</th><th>Statut</th><th>Compte lié</th><th></th></tr></thead><tbody>'+employees.map(x=>`<tr><td><b>${esc(x.full_name)}</b></td><td>${esc(x.position)}</td><td>${esc(x.phone||'—')}</td><td>${esc(x.email||'—')}</td><td>${esc(x.hire_date||'—')}</td><td>${x.status==='active'?'Actif':'Inactif'}</td><td>${x.auth_user_id?'Oui':'Non'}</td><td>${teamIsAdmin?`<button class="btn danger" onclick="deleteEmployee('${x.id}')">Supprimer</button>`:'Consultation'}</td></tr>`).join('')+'</tbody></table></div>':'<div class="empty">Aucun collaborateur enregistré.</div>';
  rolesTable.innerHTML=teamRoles.length?'<div class="tablewrap"><table><thead><tr><th>UUID utilisateur</th><th>Rôle</th><th>Attribué le</th><th></th></tr></thead><tbody>'+teamRoles.map(x=>`<tr><td><code>${esc(x.user_id)}</code></td><td>${esc(roleLabels[x.role]||x.role)}</td><td>${esc((x.created_at||'').slice(0,10))}</td><td>${x.user_id===me.id?'<span class="badge">Mon compte</span>':(teamIsAdmin?`<button class="btn danger" onclick="removeRole('${x.user_id}')">Retirer</button>`:'Consultation')}</td></tr>`).join('')+'</tbody></table></div>':'<div class="empty">Aucun rôle chargé.</div>';
 }catch(err){teamMsg.innerHTML='<div class="status err">'+esc(err.message)+' — Vérifiez que le SQL V6 a été exécuté.</div>'}
}
employeeForm.onsubmit=async ev=>{ev.preventDefault();try{
 const {data:{user}}=await client.auth.getUser();
 const payload={created_by:user.id,full_name:empName.value.trim(),phone:empPhone.value.trim()||null,position:empPosition.value.trim(),hire_date:empHireDate.value||null,status:empStatus.value,email:empEmail.value.trim()||null,auth_user_id:empUserId.value.trim()||null,notes:empNotes.value.trim()||null};
 const {error}=await client.from('rim_team_employees').insert(payload);if(error)throw error;
 employeeForm.reset();teamMsg.innerHTML='<div class="status">Collaborateur enregistré.</div>';await loadTeam();
 }catch(err){teamMsg.innerHTML='<div class="status err">'+esc(err.message)+'</div>'}};
roleForm.onsubmit=async ev=>{ev.preventDefault();try{
 const {data:{user}}=await client.auth.getUser();
 const {error}=await client.from('rim_team_roles').upsert({user_id:roleUserId.value.trim(),role:roleName.value,created_by:user.id},{onConflict:'user_id'});if(error)throw error;
 roleForm.reset();teamMsg.innerHTML='<div class="status">Rôle attribué.</div>';await loadTeam();
 }catch(err){teamMsg.innerHTML='<div class="status err">'+esc(err.message)+'</div>'}};
async function deleteEmployee(id){if(!confirm('Supprimer cette fiche collaborateur ?'))return;try{const {error}=await client.from('rim_team_employees').delete().eq('id',id);if(error)throw error;await loadTeam()}catch(e){teamMsg.innerHTML='<div class="status err">'+esc(e.message)+'</div>'}}
async function removeRole(id){if(!confirm('Retirer le rôle de cet utilisateur ?'))return;try{const {error}=await client.from('rim_team_roles').delete().eq('user_id',id);if(error)throw error;await loadTeam()}catch(e){teamMsg.innerHTML='<div class="status err">'+esc(e.message)+'</div>'}}
