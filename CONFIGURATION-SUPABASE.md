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

Pour le nouvel aperçu privé et le parcours de paiement, exécuter aussi `supabase-maquette-paiements.sql` dans le SQL Editor, y compris si le schéma principal a déjà été installé. Le script est réexécutable et ajoute les états d’envoi des e-mails. Pour la boîte de réception des formulaires, les demandes de correction et l’historique client, exécuter ensuite `supabase-client-communications.sql`. Le HTML complet est conservé dans `briefs.generated_site_html`; le lien envoyé au client est un jeton aléatoire dont seul le condensat est stocké et expire au bout de 30 jours. Le code est renvoyé au navigateur uniquement après validation de ce jeton. L’iframe est sandboxée et le contenu client n’hérite d’aucun CSS de JL Studio.

## 3. Courriels transactionnels (Resend)

Dans Vercel → Project → Settings → Environment Variables, ajouter pour Production et Preview selon les tests souhaités :

- `RESEND_API_KEY` : clé secrète Resend, côté serveur uniquement.
- `RESEND_FROM_EMAIL` : expéditeur vérifié dans Resend, par exemple `JL Studio Web <contact@votre-domaine.fr>`.
- `RESEND_REPLY_TO` : facultatif, `jerome.lopes21@gmail.com`.

Vérifier le domaine expéditeur dans Resend et publier ses enregistrements DNS SPF/DKIM avant l’envoi aux prospects. `onboarding@resend.dev` est réservé aux essais autorisés par Resend, pas à la production. Après avoir ajouté/modifié ces variables, redéployer Vercel.

Le serveur envoie automatiquement : la confirmation questionnaire avec le délai annoncé de 48 h maximum, le lien privé dès la génération de l’aperçu, puis le récapitulatif de formule et du premier règlement après confirmation Stripe. Après le questionnaire, une fonction de fond appelle Vercel AI Gateway et le modèle Amazon Nova Pro via Bedrock en région UE. Le HTML est enregistré dans Supabase, puis un lien de prévisualisation de 30 jours est créé et envoyé par e-mail. L’administration voit l’état, le modèle et l’usage de jetons, peut ouvrir l’aperçu dans le tableau de bord, et peut relancer une génération en échec. En cas d’indisponibilité du modèle, le client reçoit le délai de secours de 48 h et le brief reste consultable pour une reprise manuelle. Les photos jointes sont transmises au modèle avec les réponses; le nom, l’e-mail et le téléphone de suivi sont retirés du prompt. Vercel prolonge l’exécution de la fonction de fond via `waitUntil`; la durée de fonction est réglée à 60 secondes et l’appel du modèle s’arrête au bout de 40 secondes. Le redémarrage administrateur partage `/api/briefs` pour respecter la limite Hobby de 12 fonctions par déploiement.

Vercel AI Gateway utilise automatiquement le jeton OIDC `VERCEL_OIDC_TOKEN` dans une fonction Vercel si l’accès OIDC du projet est activé. Sur un ancien projet, vérifier **Settings → Security → Secure Backend Access with OIDC Federation**. Sinon, ajouter une clé de serveur `AI_GATEWAY_API_KEY` à Vercel. Le modèle est configurable côté serveur par `AI_SITE_MODEL`; la valeur par défaut est `amazon/nova-pro` avec routage Bedrock uniquement. Aucune clé IA ne doit être ajoutée au HTML ou au dépôt. Les requêtes sont limitées à un seul lancement par brief et à 8 000 jetons de sortie au maximum. Les rapports de consommation sont également visibles dans AI Gateway.

La génération est un appel IA facturé à l’usage du fournisseur, déclenché seulement quand un questionnaire valide est envoyé. Le modèle actuellement sélectionné est annoncé avec rétention nulle et sans entraînement dans le catalogue Vercel; vérifier les paramètres et conditions de l’équipe avant d’ouvrir la collecte réelle.

Les messages du formulaire de contact et de correction de maquette sont transmis à `lopes.jerome21@gmail.com`, un accusé de réception est envoyé à l’auteur, et les deux catégories apparaissent dans **Admin → Messages**. Les courriels sortants associés au brief/client sont enregistrés et consultables dans l’historique de sa fiche.

## 4. Fonctions nécessitant encore une configuration tierce

- L’avis administratif par e-mail continue à utiliser le modèle EmailJS déjà présent ; vérifier son destinataire et son contenu dans le compte EmailJS. Le message de confirmation signifie que l’envoi au service a abouti, pas que le destinataire l’a effectivement lu.
- La résiliation automatique requiert une clé secrète Stripe et un ID réel d’abonnement Stripe dans la fiche client. Sans Stripe, le bouton est masqué ou l’API refusera l’opération ; aucun paiement n’est traité par le questionnaire.
- Les notifications WhatsApp ne sont pas actives : il faut choisir/configurer l’API Meta ou un prestataire, obtenir les identifiants et, pour un message proactif, un modèle de notification conforme approuvé.
- La création du site est automatique après enregistrement d’un questionnaire. Le bouton de relance dans `/admin` réessaie les générations en échec. Si le site a été généré mais que l’e-mail d’aperçu n’est pas parti, laisser le champ HTML vide et cliquer sur « Enregistrer les changements / renouveler le lien » pour envoyer un nouveau lien.

## 5. Paiement Stripe (mode test par défaut)

- Dans Vercel, ajouter `STRIPE_MODE=test` et une clé Stripe restreinte de test `STRIPE_SECRET_KEY`. Le code refuse une clé live tant que `STRIPE_MODE` reste à `test`.
- Permissions minimales de cette clé pour le flux actuel : lire/créer les produits et tarifs, créer des Checkout Sessions, lire et modifier les abonnements. Ne pas la placer dans le dépôt ni dans un fichier public.
- Depuis **Developers → Webhooks** du compte Stripe en mode test, ajouter `https://studioweb-eta.vercel.app/api/stripe/webhook`. Sélectionner `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.paid` et `invoice.payment_failed`. Ajouter la signature `whsec_…` au projet Vercel sous `STRIPE_WEBHOOK_SECRET`.
- Le parcours du client passe par le bouton violet de son aperçu : sélection de formule, puis session hébergée Stripe Checkout en mode abonnement. Le premier règlement inclut le mois initial et les frais de création ponctuels (49 €/mois + 199 €, 89 €/mois + 149 €, ou 129 €/mois + 99 €). Les prix sont créés ou retrouvés automatiquement.
- Stripe Checkout utilise les moyens activés dans **Settings → Payments** et filtre ceux compatibles avec le client et l’abonnement (par exemple cartes et portefeuilles disponibles, et prélèvement SEPA s’il est activé/éligible). Le tableau de bord met le client actif après confirmation par webhook. Le lien d’aperçu expire après 30 jours ; une session Checkout commencée expire après 24 heures. L’administration déclenche l’envoi automatique du courriel d’aperçu via Resend.
- Avant de passer en live, remplacez la clé test par une clé restreinte live, réglez `STRIPE_MODE=live`, créez un webhook live séparé et configurez sa signature dans Vercel. Vérifier aussi la fiscalité française avec le comptable ; Stripe Tax ne doit pas être activé sans inscription fiscale applicable.

## Points de contrôle avant collecte réelle

- Compléter les champs signalés dans `mentions-legales.html` et `politique-confidentialite.html` avec les données juridiques exactes et une durée de conservation réellement appliquée.
- Configurer les mentions d’information, le processus de suppression à l’échéance, la région et les paramètres de sécurité des prestataires.
- Tester le formulaire avec une demande fictive, contrôler la ligne privée dans Supabase, vérifier les images signées après connexion et confirmer qu’une session non administrateur ne peut rien consulter.
