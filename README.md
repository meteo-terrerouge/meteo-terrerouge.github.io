# Bulletin local Météo-France

Utilise les API de données ouvertes de Météo-France et Open-Meteo pour les tendances de J+8 à J+16.

GitHub Actions récupère les données météo et publie le site.

## Prérequis

1. Sur le [portail API Météo-France](https://portail-api.meteofrance.fr/web/), souscrire aux API suivantes, puis générer un jeton de type **API Key** :
   - Modèle AROME ;
   - Modèle ARPEGE ;
   - Modèle AROME Prévision d’Ensemble ;
   - Modèle ARPEGE Prévision d’Ensemble ;
   - Modèle AROME Prévision Immédiate Agrégée Fusionnée (PIAF) ;
   - Bulletin Vigilance.

2. Prévoir un **jeton GitHub personnel à permissions fines**, limité au fork créé lors de l’installation, avec les permissions **Actions, Contents et Workflows en lecture et écriture**.

## Installation

1. Forker ce dépôt et nommer le fork `<compte>.github.io` pour l’adresse `https://<compte>.github.io/`.
2. Copier `site.private.example.conf` dans `site.private.conf`. Renseigner les paramètres du site, `meteoFranceToken` avec la clé Météo-France et `githubToken` avec le jeton GitHub.
3. Dans **Settings → Secrets and variables → Actions**, créer le secret **`BULLETIN_CONFIG`** contenant l’intégralité du fichier. Conserver le fichier privé, sans le commiter.
4. Activer les workflows dans **Actions**.
5. Dans **Settings → Pages → Build and deployment → Source**, sélectionner **GitHub Actions**.
6. Lancer le workflow **Préparer les données météo** avec `group: all` et `publish: true`.

Une fois le workflow terminé, le site est accessible à **`https://<compte>.github.io/`**. Les données météo sont ensuite actualisées automatiquement.

## Licence

Copyright (C) 2026 nicklausFR.

Le code source de ce projet est distribué sous la licence **GNU General Public License version 3 uniquement (GPL-3.0-only)**. Vous pouvez le redistribuer et le modifier selon les termes du fichier [LICENSE](LICENSE).

Ce programme est distribué sans aucune garantie, dans les limites prévues par cette licence.

Les composants tiers conservent leurs licences respectives, notamment celles indiquées dans `THIRD_PARTY` et `public/vendor`. Les données et services météo restent soumis aux conditions de leurs fournisseurs.
