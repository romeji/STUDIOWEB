# Configuration du tableau de bord JL Studio

L’interface `/admin` s’appuie sur Supabase Auth, Postgres et Storage. Les réponses du questionnaire ne sont enregistrées qu’après configuration complète de ces éléments. L’accès administrateur est limité à `lopes.jerome21@gmail.com` par le déclencheur Auth et les politiques RLS du script SQL.

## 1. Créer et sécuriser le projet Supabase

1. Créer un projet Supabase et choisir une région UE adaptée aux contraintes de traitement du projet.
2. Ouvrir **SQL Editor**, exécuter le contenu de `supabase-schema.sql`, puis vérifier que les tables `briefs`, `clients`, `edit_logs`, `prospects`, le compteur anti-abus privé et le bucket `brief-photos` privé existent. La migration `supabase-resiliation-client.sql` ajoute les dates de demande et de fin programmée ; elle a déjà été appliquée au projet StudioWeb lié.
3. Dans **Authentication → URL Configuration**, définir `https://jlstudioweb.fr` comme URL principale, puis ajouter aux URL de redirection autorisées `https://jlstudioweb.fr/admin`, `https://www.jlstudioweb.fr/admin` et `https://jlstudioweb.fr/**`. Les liens de secours et de récupération du mot de passe doivent revenir sur le domaine principal.
4. Configurer un SMTP transactionnel avant d’utiliser les liens de connexion ou de récupération en production ; le SMTP intégré de test est limité. Ajouter `https://jlstudioweb.fr` aux URL de redirection autorisées.
5. Dans **Project Settings → API**, relever l’URL du projet, la clé `anon` / publishable et la clé `service_role`.

## 2. Configurer le site et Vercel

1. `admin-config.js` contient l’URL de StudioWeb et la clé publishable. Cette clé peut être exposée au navigateur ; les données restent protégées par RLS.
2. Dans les variables d’environnement du projet Vercel, ajouter `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (clé secrète `sb_secret_…`, uniquement côté serveur) et `SUPABASE_PUBLISHABLE_KEY` (clé publique `sb_publishable_…`). Ajouter aussi `CORRECTION_LINK_SECRET`, une valeur aléatoire secrète d’au moins 32 caractères, et la conserver stable : sa rotation invaliderait les liens permanents de retouche déjà envoyés. À défaut, le code utilise `SUPABASE_SECRET_KEY` comme clé de signature. Ajouter `STRIPE_SECRET_KEY` uniquement si la résiliation Stripe est activée. Ne jamais placer les clés secrètes dans un fichier public ou dans `admin-config.js`.
3. Dans **Authentication → Providers → Email**, laisser Email activé, puis dans **Authentication → URL Configuration** choisir `https://jlstudioweb.fr` comme URL du site. L’administration accepte un mot de passe Supabase Auth pour `lopes.jerome21@gmail.com`; si aucun mot de passe n’a encore été créé, utiliser la récupération de mot de passe Supabase une fois, puis se connecter au quotidien par mot de passe. Le lien magique reste disponible comme secours.
4. Dans **Authentication → Sessions**, privilégier une durée de session raisonnable (par exemple 7 jours) avec renouvellement automatique activé afin d’éviter une reconnexion fréquente sur le même appareil.
5. Redéployer. Tester la connexion par mot de passe, la persistance de session, la récupération du mot de passe et les trois onglets.

Une demande de questionnaire est enregistrée dans `briefs`, avec son prompt et des chemins privés vers les photos. Le tableau de bord crée des URL de photo à durée limitée. Les prospects, clients et retouches sont gérés sous authentification et RLS. Le compteur de retouches représente les entrées enregistrées depuis le premier jour du mois courant. Le point d’accès public du questionnaire applique une limite de cinq envois par adresse réseau et par heure ainsi qu’une demande de démo par adresse e-mail tous les 30 jours. Le second contrôle utilise un HMAC de l’adresse, non réversible sans la clé secrète du serveur ; sa table et ses fonctions RPC ne sont accessibles qu’au rôle `service_role`, avec RLS activée et aucun accès `anon`/`authenticated`. Les réservations inachevées expirent après 15 minutes et les empreintes anciennes sont nettoyées lors des demandes suivantes.

Pour le nouvel aperçu privé et le parcours de paiement, exécuter aussi `supabase-maquette-paiements.sql` dans le SQL Editor, y compris si le schéma principal a déjà été installé. Le script est réexécutable et ajoute les états d’envoi des e-mails. Pour la boîte de réception des formulaires, les demandes de correction et l’historique client, exécuter ensuite `supabase-client-communications.sql`. Le HTML complet est conservé dans `briefs.generated_site_html`; le lien d’aperçu envoyé au client est un jeton aléatoire dont seul le condensat est stocké et qui expire au bout de 30 jours. Après le paiement, le courriel de bienvenue fournit en plus un lien permanent de retouche signé et rattaché à la fiche client ; conservez `CORRECTION_LINK_SECRET` inchangé pour le maintenir valide. Le code de l’aperçu n’est renvoyé au navigateur qu’après validation de son jeton. L’iframe est sandboxée et le contenu client n’hérite d’aucun CSS de JL Studio.

Pour activer la limite d’une démo par e-mail, exécuter `supabase-limite-maquette-par-email.sql` dans le SQL Editor. Le formulaire refuse ensuite toute nouvelle démo faite avec la même adresse dans une fenêtre glissante de 30 jours. La vérification est transactionnelle et sûre face aux doubles envois simultanés.

## 3. Courriels transactionnels (Resend)

Dans Vercel → Project → Settings → Environment Variables, ajouter pour Production et Preview selon les tests souhaités :

- `RESEND_API_KEY` : clé secrète Resend, côté serveur uniquement.
- `RESEND_FROM_EMAIL` : expéditeur vérifié dans Resend, par exemple `JL Studio Web <contact@votre-domaine.fr>`.
- `RESEND_REPLY_TO` : facultatif, `jerome.lopes21@gmail.com`.

Vérifier le domaine expéditeur dans Resend et publier ses enregistrements DNS SPF/DKIM avant l’envoi aux prospects. `onboarding@resend.dev` est réservé aux essais autorisés par Resend, pas à la production. Après avoir ajouté/modifié ces variables, redéployer Vercel.

Après le questionnaire, le client reçoit une confirmation et Jérôme prépare manuellement l’aperçu avec son abonnement ChatGPT. Aucune API OpenAI n’est appelée par le site et aucune dépense API n’est déclenchée. Une notification interne est envoyée à l’adresse JL Studio avec le prompt, les réponses et les photos en pièces jointes. Dans **Admin → Demandes**, ouvrir le brief, consulter les réponses/photos, copier le prompt avec le bouton prévu, le coller dans ChatGPT, puis coller le document HTML complet dans le champ d’aperçu. L’enregistrement crée le lien privé valable 30 jours et déclenche le courriel au client via Resend. Le délai annoncé au client est de 48 heures maximum. Le bouton de relance automatique a été désactivé.

Après paiement confirmé, préparez et publiez le site final chez l’hébergeur choisi. Dans **Admin → Clients**, téléchargez le HTML depuis la demande, puis utilisez « Enregistrer / envoyer le lien officiel » pour saisir l’adresse HTTPS publiée. Le dashboard enregistre cette adresse et envoie au client son courriel de livraison. La publication chez un hébergeur n’est pas déclenchée automatiquement.

Les messages du formulaire de contact et de correction de maquette sont transmis à `lopes.jerome21@gmail.com`, un accusé de réception est envoyé à l’auteur, et les deux catégories apparaissent dans **Admin → Messages**. Les courriels sortants associés au brief/client sont enregistrés et consultables dans l’historique de sa fiche.

## 4. Fonctions nécessitant encore une configuration tierce

- L’avis administratif par e-mail continue à utiliser le modèle EmailJS déjà présent ; vérifier son destinataire et son contenu dans le compte EmailJS. Le message de confirmation signifie que l’envoi au service a abouti, pas que le destinataire l’a effectivement lu.
- La résiliation Stripe est programmée à la fin de la période déjà payée, jamais immédiatement. Le client peut demander un lien sécurisé depuis `/resiliation` ou utiliser celui du courriel de bienvenue ; après confirmation, le site reste actif jusqu’à l’échéance, puis le webhook Stripe synchronise le statut. La demande, la date d’effet et les e-mails sont visibles dans l’historique du client. Le client conserve son domaine ; le code de transfert et les informations sont fournis sur demande sous cinq jours ouvrés.
- Les notifications WhatsApp ne sont pas actives : il faut choisir/configurer l’API Meta ou un prestataire, obtenir les identifiants et, pour un message proactif, un modèle de notification conforme approuvé.
- La création du site est manuelle dans ChatGPT afin d’éviter les frais API. Si le site a été enregistré mais que l’e-mail d’aperçu n’est pas parti, laisser le champ HTML vide et cliquer sur « Enregistrer les changements / renouveler le lien » pour envoyer un nouveau lien.

## 5. Paiement Stripe (mode test par défaut)

Le suivi des rétractations consommateurs est géré dans `clients` par la migration `supabase-consumer-withdrawal.sql` (consentement/Version des CGV, type de souscripteur, date de contrat, demande et statut de remboursement). Cette migration est appliquée au projet Supabase `undmdvgcddcqbmmgdvpa`.

- Dans Vercel, ajouter `STRIPE_MODE=test` et une clé Stripe restreinte de test `STRIPE_SECRET_KEY`. Le code refuse une clé live tant que `STRIPE_MODE` reste à `test`.
- Permissions minimales de cette clé pour le flux actuel : lire/créer les produits et tarifs, créer des Checkout Sessions, lire/annuler les abonnements, lire les paiements de facture et créer des remboursements. Ne pas la placer dans le dépôt ni dans un fichier public.
- Depuis **Developers → Webhooks** du compte Stripe en mode test, ajouter `https://jlstudioweb.fr/api/stripe/webhook`. Sélectionner `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.paid` et `invoice.payment_failed`. Ajouter la signature `whsec_…` au projet Vercel sous `STRIPE_WEBHOOK_SECRET`.
- Le parcours du client passe par le bouton violet de son aperçu : sélection de formule, puis session hébergée Stripe Checkout en mode abonnement. Le premier règlement inclut le mois initial et les frais de création ponctuels (49 €/mois + 199 €, 89 €/mois + 149 €, ou 129 €/mois + 99 €). Les prix sont créés ou retrouvés automatiquement.
- Stripe Checkout utilise les moyens activés dans **Settings → Payments** et filtre ceux compatibles avec le client et l’abonnement (par exemple cartes et portefeuilles disponibles, et prélèvement SEPA s’il est activé/éligible). Le tableau de bord met le client actif après confirmation par webhook. Le lien d’aperçu expire après 30 jours ; une session Checkout commencée expire après 24 heures. L’administration déclenche l’envoi automatique du courriel d’aperçu via Resend.
- Avant de passer en live, remplacez la clé test par une clé restreinte live, réglez `STRIPE_MODE=live`, créez un webhook live séparé et configurez sa signature dans Vercel. Vérifier aussi la fiscalité française avec le comptable ; Stripe Tax ne doit pas être activé sans inscription fiscale applicable.

## Points de contrôle avant collecte réelle

- Compléter les champs signalés dans `mentions-legales.html` et `politique-confidentialite.html` avec les données juridiques exactes et une durée de conservation réellement appliquée.
- Configurer les mentions d’information, le processus de suppression à l’échéance, la région et les paramètres de sécurité des prestataires.
- Tester le formulaire avec une demande fictive, contrôler la ligne privée dans Supabase, vérifier les images signées après connexion et confirmer qu’une session non administrateur ne peut rien consulter.
