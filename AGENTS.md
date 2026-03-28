# Description de l'application

Hackipedia permets de prendre connaissance de manière plus rapide et amusante du contenu d'une page wikipedia sur un personnage historique.

Lorsque l’utilisateur est sur une page Wikipédia (par exemple https://fr.wikipedia.org/wiki/mypage), un bouton « résumé » est injecté au début de la page. 
Lorsque l’utilisateur clique sur ce bouton, une "bottom sheet" apparaît contenant un résumé de la page de manière très visuelle.

# Architecture technique
L'application est une extension chrome, effectuant des appels à openai (via une clé stockée en local).
Elle utilise le framework react, est réactive, et se destine en premier à un usage mobile.