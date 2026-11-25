RIM AgroOvin Connect — V1.1 accès visiteurs / clients

Fichiers :
- RIM_AgroOvin_Portal_Public_V26_1.html : portail public avec rôle d'inscription neutralisé côté client.
- RIM_AgroOvin_Espace_Client_V1_1_Acces_Clients.html : catalogue public, demande client, contrôle visuel des réservations, interface admin des demandes.
- RIM_AgroOvin_Migration_002_Demandes_Clients.sql : tables et RLS de demandes client, fonction d'approbation, contrôle de réservation et retrait du catalogue à la confirmation admin.

Prérequis : tables de réservation V1.0/V1.1 et fonction rim_client_is_admin() existantes. Exécuter le SQL après sauvegarde et tester d'abord en environnement de test.

Le statut confirmé déclenche le retrait du mouton du catalogue. Un refus/annulation le rend à nouveau visible s'il n'est ni vendu ni mort. La clé Supabase publishable reste à configurer dans le client HTML. Le déploiement GitHub/Supabase n'a pas été effectué.
