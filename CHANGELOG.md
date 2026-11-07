# Historique

24/10/2026 13:09 — v0.001 — Base autonome du bulletin météo local : prévisions statiques, construction locale et collecte manuelle GitHub Actions.

24/10/2026 14:12 — v0.002 — Identité, composants et profil initial neutres ; aucun lieu ni coordonnées prédéfinis.
24/10/2026 16:47 — v0.003 — Administration commune pour demander la mise à jour du site depuis la source principale, en conservant sa configuration.
24/10/2026 19:28 — v0.004 — Configuration privée unique par installation ; administration utilisant ce fichier, sans saisie séparée des jetons.
24/10/2026 19:53 — v0.005 — Nom complet dans un champ unique, identifiant automatique et fichier privé .conf avec commentaires # sur le département et l’altitude.
24/10/2026 22:13 — v0.006 — Retrait du lien vers l’administration dans la page publique.

26/10/2026 09:06 — v0.007 — Frise 3 h : pluie en dégradé de bleu, légende verticale en mm/h à la place de l’axe des ordonnées sans lignes horizontales ; résumé avec la présentation commune des journées, cumuls datés « jusqu’à », barres de pluie par créneau et un pictogramme par créneau régulier, représentant aussi les brefs épisodes de pluie ou d’orage sur petit écran ; neige sur fond blanc uniforme, barres blanches délimitées sur les côtés et à la base par un contour bleu fin, traits verticaux raccordés aux congères, sommet formé par la congère avec la même bordure bleue fine, flocons décoratifs désactivés et réactivables dans le code, barres au même espacement que la pluie et congères toujours irrégulières sur les paliers horizontaux, même étroits ; échelle adaptative en cm/h fondée uniquement sur la hauteur, libellés Pluie/Neige placés au-dessus des échelles, barre neige blanche avec congère au maximum de son échelle ; adaptation aux écrans étroits avec regroupement visuel des barres, cumuls conservés et trois créneaux météo minimum.

04/11/2026 18:32 — v0.028 — Frise 3 h compatible avec le mode sombre ; traces de pluie libellées « gouttes » ; Tendances en synthèses quotidiennes sans phrases ni quatre périodes ; nombres de gouttes et flocons selon les quantités, y compris en pluie et neige mêlées. Couverture incomplète indiquée par « jusqu’à » et l’heure réelle de fin des données. Frise 3 h : correction de la nature estimée lorsque PIAF est humide et le modèle sec ; pluie en barres bleues et échelle mm/h, neige en barres blanches avec congères et échelle cm/h indépendante, comme dans l’aperçu local.

04/11/2026 18:55 — v0.029 — Le premier jour Tendance commence sur une nouvelle ligne de cartes.

04/11/2026 19:03 — v0.030 — La frise 3 h suit le thème de la page : claire sans Dark Reader, sombre avec l’extension, sans fond sombre imposé par le thème système.

04/11/2026 19:18 — v0.031 — Dans le résumé de la frise 3 h, une goutte barrée remplace le texte « Pas de pluie » ; la limite horaire reste affichée si la couverture est incomplète.

06/11/2026 11:24 — v0.032 — Choix de collecte des API météo entre GitHub Actions et serveur personnel ; hébergement du site indépendant, avec installation serveur sans compte GitHub. Nowcasting/radar et archives prévus comme deux modules serveur distincts.

06/11/2026 13:20 — v0.033 — Autorisation de l’origine API configurée dans la politique de connexion du navigateur, pour charger les données depuis le serveur personnel ou une source JSON externe.

06/11/2026 13:38 — v0.034 — Survol de la frise 3 h limité au cumul PIAF, à l’intensité selon la nature des précipitations et à une flèche de tendance.

06/11/2026 14:24 — v0.035 — Dans la frise 24 h, cumuls PIAF seuls sur les trois prochaines heures, conservation des pas de cinq minutes en mm et des intensités en mm/h, sans remplacer les données manquantes par un autre modèle.

06/11/2026 14:33 — v0.036 — Raccord continu entre les échéances PIAF réellement disponibles et les modèles dans la frise 24 h, sans bande d’indisponibilité artificielle, sans chevauchement et sans prolongation des cumuls PIAF.

06/11/2026 18:10 — v0.037 — Suppression des rectangles d’indisponibilité des précipitations sur la frise 24 h ; repère discret en bas du graphique pour préserver la lecture continue des autres courbes.

06/11/2026 18:25 — v0.038 — Neige représentée en blanc avec des congères sur les frises 24 h, comme sur la frise 3 h ; conservation des cumuls, unités et interruptions des précipitations.

06/11/2026 18:38 — v0.039 — Couleurs d’avertissement fondées en priorité sur AROME puis ARPEGE dans leurs échéances couvertes ; Open-Meteo prend le relais uniquement sur les créneaux non couverts, sans mélange de cumuls et de probabilités entre modèles.

07/11/2026 22:15 — v0.040 — Sur les cartes Tendance, un flocon jusqu’à 5 cm de neige par jour, deux au-delà de 5 cm et trois au-delà de 15 cm, y compris en pluie et neige mêlées. Les seuils s’appliquent au cumul avant arrondi.
