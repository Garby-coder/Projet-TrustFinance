# Design Spec — Référence Make (Dashboard élève)

Source de vérité :
- Images : design/make/*.png
- Objectif : reproduire la maquette Make en CSS pur, sans ajouter de dépendances.

## Layout global
- Page = 100vh, pas de scroll global.
- Scroll internes :
  - Colonne gauche (liste modules + leçons)
  - Colonne centrale (contenu leçon / quiz si long)
- Grille :
  - Sidebar icônes à gauche (décorative)
  - Top row : dropdown + 4 cartes (Start / Mes tâches / Calendrier / Profil)
  - Body : 2 colonnes (liste à gauche / contenu à droite)

## Style global
- Thème sombre premium.
- Cartes : arrondis, bordures fines, léger glass.
- Accent : doré (#AF8732) utilisé avec parcimonie.
- États :
  - Terminé (vert discret)
  - En cours (accent doré)
  - Verrouillé (gris + texte explicatif)

## Modules & leçons
- Modules en liste (cards).
- Quand un module est sélectionné :
  - Les leçons apparaissent "dans" le module (accordion).
  - Ligne verticale + connecteurs vers chaque leçon.
  - Leçon terminée ressort plus (badge + check).
  - Rond gris cliquable pour marquer terminé (UI).

## Quiz
- Bouton "Quiz" dans le module.
- UI type cards questions + choix.

## Modals (tâches / calendrier / profil / badges)
- Backdrop sombre + blur.
- Panel opaque (pas transparent).
- Scroll interne si contenu long.