# Aperçus et paiement des maquettes

Le parcours est maintenant organisé autour d’un document extérieur (`maquette.html`) et du site généré chargé dans une iframe sandboxée. La barre JL Studio est séparée : ses règles CSS ne sont pas appliquées au document client. Les consignes du formulaire demandent à l’IA de livrer uniquement le site client avec son propre HTML/CSS.

Dans `/admin`, ouvre la demande et colle le document HTML complet généré par l’IA. Le serveur l’enregistre dans Supabase, crée un jeton aléatoire privé valable 30 jours et met le statut du brief à « Aperçu envoyé ». Le dashboard prépare ensuite un courriel contenant le lien. Pour renouveler un lien après expiration, ouvre la demande et clique sans recoller le code déjà stocké.

Le bouton « Choisir votre formule » mène à une page qui présente les trois offres. Le client sélectionne son offre, puis est redirigé vers Stripe Checkout. Les frais de création ponctuels et le premier mois sont présentés au premier règlement; l’abonnement mensuel est ensuite géré par Stripe. Les moyens de paiement proposés sont ceux activés dans le tableau Stripe et éligibles à cette session d’abonnement. Le webhook met le statut du client à jour après confirmation Stripe.

## Migration Supabase requise

Avant le déploiement, exécuter le fichier `supabase-schema.sql` dans Supabase > SQL Editor. Il ajoute le HTML de maquette, le jeton haché et sa date d’expiration aux briefs, ainsi que le lien entre une demande et sa fiche client. Aucune clé Supabase ou Stripe n’est placée dans le navigateur.

## Confidentialité et limites techniques

L’aperçu est servi uniquement avec un jeton non devinable dont seul le condensat est enregistré. Il expire au bout de 30 jours. Le document client s’exécute dans une iframe sandboxée sans même origine, sans droit de navigation du parent; son CSS et son JavaScript ne contrôlent pas la page JL Studio. Le clic droit et quelques raccourcis sont neutralisés comme dissuasion légère, mais ne rendent pas le code incopiable : un visiteur peut toujours inspecter le document livré à son navigateur.
