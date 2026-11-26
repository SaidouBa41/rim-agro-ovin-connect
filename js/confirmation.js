// Confirmation d'email et réinitialisation de mot de passe par « token_hash ».
// Le lien de l'email pointe directement vers ce site (pas de redirection Supabase) :
// il ne dépend donc ni du « Site URL » de Supabase, ni de la réécriture des liens par Brevo.
(function () {
  var p = new URLSearchParams(location.search);

  function banner(text, ok) {
    var d = document.createElement('div');
    d.setAttribute('role', 'status');
    d.style.cssText = 'padding:14px 18px;margin:0;text-align:center;font:600 15px system-ui,sans-serif;' +
      (ok ? 'background:#e3f4ea;color:#14573a' : 'background:#fdeceb;color:#9b2920');
    d.textContent = text;
    document.body.insertBefore(d, document.body.firstChild);
  }

  if (p.get('confirme') === '1') {
    banner('Votre adresse email est confirmée. Vous pouvez maintenant vous connecter.', true);
    history.replaceState({}, '', location.pathname);
    return;
  }

  var hash = p.get('token_hash'), type = p.get('type');
  if (!hash || !type) return;
  if (['email', 'signup', 'recovery', 'invite', 'magiclink', 'email_change'].indexOf(type) < 0) return;

  var client = window.supabase.createClient(RIM_CONFIG.url, RIM_CONFIG.key);
  client.auth.verifyOtp({ token_hash: hash, type: type === 'signup' ? 'email' : type }).then(function (r) {
    if (r.error) {
      history.replaceState({}, '', location.pathname);
      banner('Ce lien de confirmation est invalide ou expiré. Refaites une inscription, ou utilisez « Mot de passe oublié ».', false);
      return;
    }
    // La session est enregistrée : on recharge la page pour que le site la prenne en compte.
    if (type === 'recovery') location.replace(location.pathname + '#type=recovery');
    else location.replace(location.pathname + '?confirme=1');
  }).catch(function () {
    banner('Impossible de vérifier le lien pour le moment. Réessayez dans quelques instants.', false);
  });
})();
