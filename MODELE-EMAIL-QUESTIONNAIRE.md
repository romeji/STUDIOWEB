# Modèle d’email pour demander le brief

**Lien unique du questionnaire :** https://studioweb-eta.vercel.app/questionnaire

## Premier email

**Objet :** Préparons le premier aperçu du site de [Nom de l’établissement]

Bonjour [Prénom],

Comme convenu, voici le questionnaire qui va me permettre de découvrir votre activité et de préparer un premier aperçu de votre site :

👉 https://studioweb-eta.vercel.app/questionnaire

Vous pouvez le remplir en quelques minutes. À partir de vos réponses, je préparerai une première proposition que je vous enverrai par email. Nous pourrons ensuite l’adapter et l’améliorer ensemble avant toute décision.

Le questionnaire ne vous engage pas à souscrire. Les formules et leurs conditions sont présentées sur le site.

À bientôt,

[Votre prénom]
JL Studio
[Téléphone] · [Instagram]

## Après réception du questionnaire

Quand Supabase et Resend sont configurés, le serveur enregistre le dossier et envoie au client un e-mail de confirmation annonçant une maquette sous 48 heures maximum. Le prompt et les réponses sont consultables dans `/admin`. La notification de demande destinée à JL Studio est toujours déclenchée par le formulaire EmailJS.

La création de la première maquette reste manuelle : ouvrir le dossier, utiliser son prompt pour produire le site vitrine, puis coller le HTML dans `/admin`. L’enregistrement crée un lien privé et déclenche l’e-mail « votre maquette est prête ». Le client peut alors demander des ajustements puis choisir sa formule; Stripe Checkout facture les frais de création et le premier mois. Après confirmation du webhook Stripe, le client reçoit automatiquement le récapitulatif de bienvenue. La production du site, les retours créatifs et sa publication restent des étapes humaines.

Pour activer les e-mails clients, configurer `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (domaine vérifié) et facultativement `RESEND_REPLY_TO` dans Vercel, puis exécuter `supabase-maquette-paiements.sql` dans Supabase.
