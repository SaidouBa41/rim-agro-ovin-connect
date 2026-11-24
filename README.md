# RIM AgroOvin Connect — paquet de finalisation

Ce paquet organise les trois espaces dans une même arborescence et ajoute deux liens de navigation au portail public.

## Structure

- `index.html` : portail public et point d'entrée GitHub Pages.
- `espaces/clients/index.html` : application Espace Client V1.0.
- `espaces/interne/index.html` : application interne V6.3.
- `sql/` : scripts SQL source V1.0, V6.1 et V6.2 fournis dans la conversation.
- `archives/` : copies intactes des fichiers HTML sources.
- `assets/` : répertoires réservés aux futures ressources communes.

## Installation dans GitHub

1. Sauvegarder le dépôt actuel.
2. Décompresser ce paquet sur l'ordinateur.
3. Téléverser le contenu du dossier `RIM_AgroOvin_Connect_Finalisation` à la racine du dépôt, en conservant l'arborescence.
4. Vérifier la branche et le dossier source configurés dans GitHub Pages.
5. Tester les trois liens sur le site publié.

## Configuration et sécurité

- Les deux applications autonomes conservent leur code et leur configuration Supabase d'origine.
- Vérifier les URL et clés Supabase présentes dans chaque application. Ne jamais publier une clé `service_role`.
- Les scripts SQL fournis sont des copies des migrations source V1.0, V6.1 et V6.2. La migration corrective V1.1 discutée ensuite doit être conservée séparément dans le dépôt SQL si elle n'est pas déjà enregistrée.
- Ce paquet ne modifie pas les schémas Supabase et ne prouve pas un test fonctionnel complet des rôles, RLS, commandes et paiements.
- Le portail public conserve son fonctionnement existant ; les liens client et équipe sont ajoutés à sa navigation.
