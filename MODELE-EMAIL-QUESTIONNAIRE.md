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

Le formulaire appelle EmailJS (`service_nubowcp`, modèle `template_afutqdp`). Vérifier dans le tableau de bord EmailJS que le destinataire du modèle est bien la boîte JL Studio et que le corps du message affiche `{{message}}` : ce champ contient le complément du client suivi du prompt de création détaillé. Le formulaire affiche sa confirmation uniquement si EmailJS accepte l’envoi.

Le questionnaire ne génère pas encore le site, son hébergement temporaire, un e-mail automatique au client ni un lien de paiement. Après réception, lire le brief, utiliser le prompt pour préparer la première maquette, l’héberger manuellement pour prévisualisation, puis répondre au client avec son lien. Recueillir ses retours et confirmer par écrit le périmètre et la formule avant la mise en ligne et le paiement. Les réponses sont transmises au service EmailJS configuré pour ce formulaire.
