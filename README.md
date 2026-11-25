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

## V7 — correctifs appliqués

Ordre d'exécution SQL : V6.1, V6.2, Espace client V1.0, puis `sql/RIM_AgroOvin_V7_Correctifs_Securite_et_Commandes.sql`.
Sauvegarder la base avant. Puis publier les fichiers HTML de ce paquet.

Corrigé : lecture équipe limitée aux membres (1.1) · inscription interne supprimée, absence de rôle = accès refusé (1.2) ·
vue `rim_catalogue_public` à la place de l'accès public à la table (1.3) · validation des paiements, profil client (nom + WhatsApp),
fonction `rim_complete_order` (vente + recette), limite de 3 réservations en attente et expiration à 48 h, transitions de statut
contrôlées avec historique, photos réservées à l'équipe (2.1 à 2.6) · version `supabase-js` fixée (3).

Reste à faire : 1.4 (RLS du portail public : exporter le SQL des tables `listings`, `profiles`, `conversations`, `messages`,
`service_requests`, `admin_roles`), tests avec 3 comptes, activer le captcha et la confirmation email dans Supabase (Authentication).
Non testé contre votre base Supabase réelle : exécuter d'abord sur un projet de test.
