// Configuration publique de RIM AgroOvin Connect.
// La clé « publishable » est faite pour être visible dans le navigateur : la protection des données
// repose sur les règles de sécurité de la base (dossier sql). NE JAMAIS mettre ici une clé
// « service_role » ou « secret ».
window.RIM_CONFIG = Object.freeze({
  url: 'https://yxvfmigqkcbiodtgjooi.supabase.co',
  key: 'sb_publishable_Xp3rhQbII8gAXxVaJPuRKg_bPEJBnCm',
  // Adresse de retour des emails de confirmation et de réinitialisation (doit se terminer par /).
  // Elle doit aussi figurer dans Supabase › Authentication › URL Configuration › Redirect URLs.
  siteUrl: 'https://saidouba41.github.io/rim-agro-ovin-connect/',
  photoBucket: 'animal-photos'
});
