# Détails techniques des API

## [PIAF Météo-France](https://portail-api.meteofrance.fr/web/fr/api/PrevisionImmediatePrecipitations) {#api-piaf}

PIAF prévoit les précipitations **par tranches de 5 min**, jusqu’à **3 h**. Chaque valeur PT5M est un cumul en **mm** sur sa tranche. Le bulletin la multiplie par 12 pour afficher l’intensité en **mm/h**. PIAF alimente la frise 3 h et prend la priorité sur la frise 24 h pendant sa période de validité.

## [AROME Météo-France](https://portail-api.meteofrance.fr/web/fr/api/AROME) {#api-arome}

Prévisions **au pas horaire** de température, précipitations, nébulosité, vent et rafales, jusqu’à **48 h** selon le cycle. C’est le modèle prioritaire à courte échéance. Le bulletin croise la densité de foudre prévue et les précipitations pour signaler un orage possible.

## [PE-AROME Météo-France](https://portail-api.meteofrance.fr/web/fr/api/AROME-PI) {#api-pe-arome}

Jusqu’à **25 scénarios** pour estimer la probabilité de pluie et la dispersion des prévisions à courte échéance. Repère sur la carte des mailles.

## [ARPEGE Météo-France](https://portail-api.meteofrance.fr/web/fr/api/ARPEGE) {#api-arpege}

Température, pluie, nuages, vent et rafales. Le bulletin combine l’énergie convective et la pluie convective pour obtenir un signal d’orage. ARPEGE prend le relais d’AROME. Les cumuls sur plusieurs heures sont répartis sur leur créneau pour dessiner la frise.

## [PE-ARPEGE Météo-France](https://portail-api.meteofrance.fr/web/fr/api/ARPEGE) {#api-pe-arpege}

Jusqu’à **35 scénarios** pour estimer l’incertitude et la probabilité de pluie à plusieurs jours. Repère sur la carte des mailles.

## [Vigilance Météo-France](https://vigilance.meteofrance.fr/) {#api-vigilance}

La carte officielle fournit le **phénomène, le niveau et la période** pour le département. Le bulletin reprend ces données dans les pastilles **Vigilance**.

## [Open-Meteo](https://open-meteo.com/en/docs) {#api-open-meteo}

Séries horaires de température, pluie, neige, probabilité de précipitations, nuages, vent et codes météo. Open-Meteo complète les données absentes des modèles Météo-France et prolonge la prévision jusqu’à **16 jours**. Le service choisit automatiquement les modèles.

## À quelle fréquence le bulletin interroge-t-il les API ? {#actualisation}

| Source | Âge des données en cache avant une nouvelle demande |
| --- | --- |
| PIAF | Plus de 4 min |
| AROME | Plus de 1 h |
| ARPEGE | Plus de 6 h |
| Vigilance | Plus de 30 min |
| Open-Meteo | Plus de 1 h |

Le serveur vérifie le cache chaque minute. Pour PIAF, il relance donc la collecte environ toutes les **5 min** en fonctionnement normal. Le **pas de 5 min** désigne la durée de chaque tranche prévue et les **3 h** désignent l’horizon de prévision. Une nouvelle demande peut renvoyer le même cycle du fournisseur.

# Prévisions de la semaine

Les vignettes résument jusqu’à trois moments de la journée. Le cumul couvre la journée de **minuit à minuit**.

## Que veut dire « Tendance » ? {#tendance}

- **Étiquette « Tendance » à partir de huit jours**. Les températures et le cumul affichés donnent un ordre de grandeur pour la journée. Le moment des précipitations et la quantité prévue peuvent encore beaucoup changer d’une mise à jour à l’autre.
- **Flèche ↗ ou ↘ à côté d’une valeur ou d’un pictogramme**. Les dernières mises à jour d’une même source revoient la prévision à la hausse ou à la baisse pour le même jour ou créneau. Le bulletin exige au moins trois acquisitions comparables.

## Comment utiliser le graphique 24 h ? {#graphique-24h}

1. **Cliquez ou touchez une vignette** pour ouvrir sa frise de minuit à minuit. Pour aujourd’hui, le voile gris couvre les heures passées et le trait vertical marque l’heure actuelle.
2. **Lisez les échelles**. La courbe indique la température en °C. Les barres bleues indiquent l’intensité de pluie en mm/h et les barres blanches l’intensité de neige en cm/h. Les deux se superposent en cas de mélange.
3. **Survolez un point ou une barre** pour lire l’heure, la valeur et la source. L’infobulle distingue l’intensité de la quantité prévue sur le créneau. Si **« afficher le détail par heure »** est proposé, cochez-le pour déplier la frise.
4. **Utilisez les boutons du graphique** pour afficher ou masquer la température, les précipitations, le vent moyen, les rafales ou la nébulosité. Température et précipitations sont visibles à l’ouverture.

## Avertissements du bulletin et vigilance officielle

### Quelle pluie signalent les « + » ? {#signes-cumul}

| Repère de pluie | Exemple d’épisode prévu |
| --- | --- |
| `+` `+` | Pluie soutenue, par exemple **10 mm en 3 h** (jaune). |
| `+` `+` `+` | Pluie forte à très forte, par exemple **20 mm en 3 h** (orange) ou **40 mm en 3 h** (rouge). Le survol précise le niveau. |

Les « + » attirent l’attention sur une pluie qui peut tomber en peu de temps. Par exemple, **12 mm en 2 h** peuvent valoir deux « + » même si le cumul de la journée est de **12 mm**. Le cumul journalier déclenche à lui seul deux « + » dès **40 mm** et trois dès **50 mm**. Le chiffre du cumul passe alors en gras.

« Gouttes » indique un cumul positif de **0,1 mm ou moins**.

### Couleurs des avertissements du bulletin {#couleurs-bulletin}

| Fond du créneau | Cumul du créneau | Cumul sur 3 h | Vent moyen ou rafales |
| --- | --- | --- | --- |
| **Jaune** | ≥ 15 mm | ≥ 10 mm | ≥ 40 ou 60 km/h |
| **Orange** | ≥ 30 mm | ≥ 20 mm | ≥ 60 ou 80 km/h |
| **Rouge** | ≥ 60 mm | ≥ 40 mm | ≥ 80 ou 100 km/h |

Le fond coloré repère le créneau concerné. La frise des trois prochaines heures utilise aussi l’intensité PIAF, à partir de **10, 20 et 40 mm/h** pour le jaune, l’orange et le rouge.

Le bulletin privilégie AROME, puis ARPEGE et Open-Meteo. Pour Open-Meteo, le seuil de pluie demande aussi **70 %** de probabilité. Un orage concomitant peut renforcer l’avertissement. Pluie orange et vent orange pour un même scénario donnent un avertissement rouge.

### Couleurs de la vigilance Météo-France {#couleurs-vigilance}

| Niveau officiel | Signification |
| --- | --- |
| **Vert** | Aucune vigilance particulière |
| **Jaune** | Danger possible par endroits. Restez attentif. |
| **Orange** | Phénomène dangereux. Suivez les conseils des autorités. |
| **Rouge** | Phénomène d’intensité exceptionnelle. Suivez les consignes des autorités. |

La pastille **Vigilance** reprend le niveau officiel du département. Son pictogramme précise le phénomène.

[Guide de la Vigilance de Météo-France](https://vigilance.meteofrance.fr/fr/guide-vigilance-meteo)

# Pictogrammes météo {#pictogrammes-meteo}

Les pictogrammes combinent l’état du ciel, les précipitations et les phénomènes associés. Le soleil et la lune distinguent le jour de la nuit ; le nombre de gouttes ou de flocons indique l’intensité. La voiture en dérapage signale la pluie verglaçante.

## Nébulosité — 6 niveaux

|  | Pas de nuages | Très peu nuageux | Peu nuageux | Nuageux | Très nuageux | Couvert |
| --- | --- | --- | --- | --- | --- | --- |
| Jour | ![Pas de nuages, jour](pictogrammes/ciel-jour-1.svg) | ![Très peu nuageux, jour](pictogrammes/ciel-jour-tres-peu-nuageux.svg) | ![Peu nuageux, jour](pictogrammes/ciel-jour-2.svg) | ![Nuageux, jour](pictogrammes/ciel-jour-3.svg) | ![Très nuageux, jour](pictogrammes/ciel-jour-4.svg) | ![Couvert, jour](pictogrammes/ciel-jour-5.svg) |
| Nuit | ![Pas de nuages, nuit](pictogrammes/ciel-nuit-1.svg) | ![Très peu nuageux, nuit](pictogrammes/ciel-nuit-tres-peu-nuageux.svg) | ![Peu nuageux, nuit](pictogrammes/ciel-nuit-2.svg) | ![Nuageux, nuit](pictogrammes/ciel-nuit-3.svg) | ![Très nuageux, nuit](pictogrammes/ciel-nuit-4.svg) | ![Couvert, nuit](pictogrammes/ciel-nuit-5.svg) |

## Pluie — 5 intensités

| Très faible | Faible | Modérée | Forte | Très forte |
| --- | --- | --- | --- | --- |
| ![1 goutte](pictogrammes/pluie-1.svg) | ![2 gouttes](pictogrammes/pluie-2.svg) | ![3 gouttes](pictogrammes/pluie-3.svg) | ![4 gouttes](pictogrammes/pluie-4.svg) | ![5 gouttes](pictogrammes/pluie-5.svg) |

## Neige — 3 intensités

| Neige faible | Neige modérée | Neige forte |
| --- | --- | --- |
| ![1 flocon](pictogrammes/neige-1.svg) | ![2 flocons](pictogrammes/neige-2.svg) | ![3 flocons](pictogrammes/neige-3.svg) |

## Autres phénomènes

| Pluie et neige mêlées | Brouillard | Pluie verglaçante |
| --- | --- | --- |
| ![Gouttes et flocons](pictogrammes/pluie-neige.svg) | ![Brouillard](pictogrammes/brouillard.svg) | ![Pluie et symbole de dérapage](pictogrammes/pluie-verglacante.svg) |

## Phénomènes associés

| Orage | Grêle | Vent |
| --- | --- | --- |
| ![Éclair](pictogrammes/orage.svg) | ![Trois billes de grêle et G à droite](pictogrammes/grele.svg?v=4) | ![Vent](pictogrammes/vent.svg) |

## Exemples combinés

Chaque exemple ci-dessous est réellement composé à partir du pictogramme de ciel et des calques de phénomènes correspondants.

| Jour · pluie faible · vent | Jour · orage · pluie forte | Nuit · orage · grêle · vent |
| --- | --- | --- |
| ![Jour, pluie faible et vent](pictogrammes/ciel-jour-3.svg)![](pictogrammes/calque-pluie-2.svg)![](pictogrammes/calque-vent.svg) | ![Jour, orage et pluie forte](pictogrammes/ciel-jour-5.svg)![](pictogrammes/calque-pluie-4.svg)![](pictogrammes/calque-orage.svg) | ![Nuit, orage, grêle et vent](pictogrammes/ciel-nuit-3.svg)![](pictogrammes/calque-vent.svg)![](pictogrammes/calque-orage.svg)![](pictogrammes/calque-grele.svg) |

| Nuit · pluie modérée | Nuit · neige modérée | Jour · brouillard |
| --- | --- | --- |
| ![Nuit et pluie modérée](pictogrammes/ciel-nuit-3.svg)![](pictogrammes/calque-pluie-3.svg) | ![Nuit et neige modérée](pictogrammes/ciel-nuit-3.svg)![](pictogrammes/calque-neige-2.svg) | ![Jour et brouillard](pictogrammes/ciel-jour-1.svg)![](pictogrammes/calque-brouillard.svg) |
