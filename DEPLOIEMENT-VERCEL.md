# Déployer STUDIOWEB sur Vercel

Le dépôt contient un site statique HTML/CSS/JavaScript. `vercel.json` indique à Vercel de publier la racine du dépôt ; il n'y a ni commande de build ni dépendance à installer.

## Importer le dépôt

1. Connecte-toi à Vercel avec ton compte, puis importe le dépôt GitHub `romeji/STUDIOWEB`.
2. Dans les réglages du projet, choisis `Other` comme framework, laisse la commande de build vide, conserve `.` comme répertoire de sortie, et utilise la racine du dépôt.
3. Lance le déploiement de prévisualisation et vérifie le site et ses liens.
4. Si tout est correct, déploie en production ; Vercel attribuera une adresse `*.vercel.app`.
5. Pour utiliser ton propre domaine, ajoute-le dans les réglages du projet Vercel et applique les entrées DNS indiquées par Vercel. Ne modifie les DNS qu'après avoir contrôlé le déploiement.

Vercel CLI a été appelé depuis ce poste pour vérifier l'accès : le compte est actuellement déconnecté. Je n'ai pas créé de compte ni envoyé le code vers un espace Vercel temporaire. Une connexion au compte est donc nécessaire pour rattacher ce dépôt et terminer le déploiement.

## Forfait pour un usage commercial

Ce projet présente et vend des prestations. Les règles de Vercel réservent Hobby aux usages personnels et non commerciaux. Vercel affiche actuellement Pro à 20 $US par mois, hors taxes, avec 20 $US de crédits d'utilisation inclus ; un dépassement peut occasionner des frais supplémentaires. Vérifie le prix et les conditions affichés sur ton compte avant de souscrire.

Le déploiement de cette page vitrine sur Vercel ne crée pas, à lui seul, le service de génération de sites, l'envoi automatisé des maquettes, la gestion des abonnements, les paiements ou l'hébergement des vitrines clientes. Ces fonctions demanderont une application serveur et des services supplémentaires ; leur consommation et leurs coûts devront être évalués séparément.
