# Configuration du tableau de bord JL Studio

L’interface `/admin` s’appuie sur Supabase Auth, Postgres et Storage. Les réponses du questionnaire ne sont enregistrées qu’après configuration complète de ces éléments. L’accès administrateur est limité à `lopes.jerome21@gmail.com` par le déclencheur Auth et les politiques RLS du script SQL.

## 1. Créer et sécuriser le projet Supabase

1. Créer un projet Supabase et choisir une région UE adaptée aux contraintes de traitement du projet.
2. Ouvrir **SQL Editor**, exécuter le contenu de `supabase-schema.sql`, puis vérifier que les tables `briefs`, `clients`, `edit_logs`, `prospects`, le compteur anti-abus privé et le bucket `brief-photos` privé existent.
3. Dans **Authentication → URL Configuration**, définir comme URL principale `https://studioweb-eta.vercel.app` et ajouter `https://studioweb-eta.vercel.app/admin` aux URL de redirection autorisées. Ajouter aussi les URL de prévisualisation nécessaires si tu testes des déploiements Preview.
4. Configurer un SMTP transactionnel avant d’utiliser les liens de connexion en production ; le SMTP intégré de test est limité.
5. Dans **Project Settings → API**, relever l’URL du projet, la clé `anon` / publishable et la clé `service_role`.

## 2. Configurer le site et Vercel

1. `admin-config.js` contient l’URL de StudioWeb et la clé publishable. Cette clé peut être exposée au navigateur ; les données restent protégées par RLS.
2. Dans les variables d’environnement du projet Vercel, ajouter `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (clé secrète `sb_secret_…`, uniquement côté serveur) et `SUPABASE_PUBLISHABLE_KEY` (clé publique `sb_publishable_…`). Ajouter `STRIPE_SECRET_KEY` uniquement si la résiliation Stripe est activée. Ne jamais placer la clé secrète Supabase dans un fichier public ou dans `admin-config.js`.
3. Redéployer. Vérifier l’envoi d’un lien magique à l’adresse administrateur, puis l’accès aux trois onglets.

Une demande de questionnaire est enregistrée dans `briefs`, avec son prompt et des chemins privés vers les photos. Le tableau de bord crée des URL de photo à durée limitée. Les prospects, clients et retouches sont gérés sous authentification et RLS. Le compteur de retouches représente les entrées enregistrées depuis le premier jour du mois courant. Le point d’accès public du questionnaire applique une limite de cinq envois par adresse réseau et par heure ; seul un condensat de l’adresse est conservé dans la table de limitation et ses entrées expirent après 48 heures.

## 3. Fonctions nécessitant encore une configuration tierce

- L’avis par e-mail continue à utiliser le modèle EmailJS déjà présent ; vérifier son destinataire et son contenu dans le compte EmailJS. Le message de confirmation signifie que l’envoi au service a abouti, pas que le destinataire l’a effectivement lu.
- La résiliation automatique requiert une clé secrète Stripe et un ID réel d’abonnement Stripe dans la fiche client. Sans Stripe, le bouton est masqué ou l’API refusera l’opération ; aucun paiement n’est traité par le questionnaire.
- Les notifications WhatsApp ne sont pas actives : il faut choisir/configurer l’API Meta ou un prestataire, obtenir les identifiants et, pour un message proactif, un modèle de notification conforme approuvé.
- L’aperçu du site du client n’est pas encore généré, publié ni envoyé automatiquement ; cette première étape de création reste manuelle.

## Points de contrôle avant collecte réelle

- Compléter les champs signalés dans `mentions-legales.html` et `politique-confidentialite.html` avec les données juridiques exactes et une durée de conservation réellement appliquée.
- Configurer les mentions d’information, le processus de suppression à l’échéance, la région et les paramètres de sécurité des prestataires.
- Tester le formulaire avec une demande fictive, contrôler la ligne privée dans Supabase, vérifier les images signées après connexion et confirmer qu’une session non administrateur ne peut rien consulter.
