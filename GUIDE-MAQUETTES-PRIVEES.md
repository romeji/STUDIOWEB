# Prévisualisation des maquettes clients

`MODELE-MAQUETTE-PREVISUALISATION.html` est le gabarit commun des premières propositions JL Studio. Il contient la barre « JL STUDIO WEB / VOTRE MAQUETTE IA », le contact par e-mail, l’engagement d’ajustements sans facturation jusqu’à validation du rendu, et le bouton violet vers le questionnaire des formules.

## Utilisation

1. Dupliquer le gabarit pour chaque client et remplacer uniquement le contenu de `#client-site` par les pages/sections de son site vitrine.
2. Garder les coordonnées client privées hors du code et n’afficher que les coordonnées explicitement destinées au site public.
3. Héberger la maquette dans un emplacement non indexé et transmettre un lien difficile à deviner. Supprimer ou désactiver cet aperçu après la période convenue.
4. Après la période d’aperçu, convenir de la formule, du périmètre et des modifications avant le paiement et la publication définitive.

Le questionnaire ajoute désormais ces exigences au prompt de création pour que toute nouvelle maquette conserve le même habillage et les mêmes actions.

## Limite de confidentialité

`noindex`, un lien difficile à deviner et l’absence du dépôt source public réduisent la découverte et l’exposition. Ils ne rendent pas le code incopiable : le navigateur doit recevoir le HTML, le CSS, les scripts et les images pour afficher la page. Les protections de sélection ou du clic droit ne changent pas cela et ne sont pas utilisées ici.

Le dépôt actuel prépare et envoie le brief, mais la génération, l’hébergement temporaire, l’expiration automatique de chaque maquette et l’envoi de son URL restent des étapes manuelles. Pour empêcher les visiteurs non autorisés d’ouvrir un aperçu, la prochaine évolution devra ajouter une route protégée par jeton à durée limitée et stocker les fichiers hors d’un dépôt GitHub public.
