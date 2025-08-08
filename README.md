# Recherche de Propriétés Québec (Salesforce LWC)

## Vue d'ensemble

Ce projet fournit un composant Lightning Web Component (LWC) pour rechercher des propriétés québécoises via une API externe et afficher les détails complets selon la structure de données du rôle d'évaluation (MongoDB). L'interface respecte SLDS, est responsive et axée accessibilité.

## État actuel (source de vérité)

- LWC principal: `force-app/main/default/lwc/propertySearch/`
  - `propertySearch.html`, `propertySearch.js`, `propertySearch.css`, `propertySearch.js-meta.xml`
- Apex: `force-app/main/default/classes/AddressSearchController.cls`
- Intégrations: `remoteSiteSettings/PropertySearchAPI*` (Named Credentials retirés)
- Cibles d'exposition: App, Record, Home, Tab et Flow Screen

## Fonctionnalités implémentées

- Recherche par Adresse (Voie publique + Numéro civique)
- Autocomplétion des rues avec debouncing (300ms)
- Champ rue toujours éditable (jamais grisé pendant l'appel API)
- Liste de suggestions alignée sous le champ (même largeur)
- Formatage d'adresse selon le standard Canada Poste
- Conservation de la rue quand aucun résultat et vidage du numéro uniquement
- Affichage des résultats en sections (accordion) couvrant la structure MongoDB fournie

Fonctionnalités à venir (TODO) : Recherche par Propriétaire, Matricule, Lot (endpoints Apex dédiés).

## Configuration du composant (App Builder)

Propriétés exposées dans `propertySearch.js-meta.xml`:
- `apiKey` (String, requis): clé API transmise au composant (ne pas la stocker en dur)
- `defaultMunicipality` (String, défaut: "Kirkland"): municipalité par défaut

Bonnes pratiques exigées par le projet:
- Passer la clé API et la ville en propriétés du composant (pas dans le code)
- Ne pas générer de fausses données

## Compatibilité Flow Builder

- Cible activée: `lightning__FlowScreen`
- Entrées sur l'écran Flow: `apiKey` (requis), `defaultMunicipality`
- Sorties disponibles dans le Flow:
  - `selectedPropertyId`
  - `selectedPropertyFullAddress`
  - `selectedPropertyOwnerName`
  - `selectedPropertyAssessedValue`
  - `selectedPropertyPostalCode`
  - `selectedPropertyMatricule`
  - `selectedPropertyData` (JSON complet)
- Remarque: le comportement et l'UI restent inchangés; la sélection met automatiquement à jour les sorties Flow.

## Déploiement

 Prérequis: Salesforce CLI (sf), accès à un org (par défaut: alias `Eva-Jer`).

Déployer tout le projet:

```bash
sf project deploy start --source-dir force-app/main/default
```

 Le composant est disponible sur App Builder (App, Home, Record) et Tab.
 
 Dans Flow Builder: ajouter un écran, puis ajouter le composant dans la section Custom.

## Utilisation

- Ajouter le composant dans App Builder
- Renseigner `apiKey` et, si besoin, `defaultMunicipality`
- Recherche par Adresse:
  - Saisir 2+ caractères de rue → suggestions s'affichent
  - Sélectionner la rue (le champ reste éditable)
  - Saisir le numéro civique → Rechercher
  - Si aucun résultat: la rue est conservée, seul le numéro est vidé

## Détails UX/UI clés

- Champ rue: jamais désactivé pendant les requêtes
- Alignement des suggestions: container relatif + dropdown absolute 100% largeur
- Formatage d'affichage des rues: "Boulevard HYMUS" (pas de parenthèses)
- Titre carte résultat: adresse format Canada Poste (ligne 1 + ligne 2)

## Structure du dépôt (pertinente)

```
force-app/main/default/
├── classes/
│   └── AddressSearchController.cls
├── lwc/
│   └── propertySearch/
│       ├── propertySearch.html
│       ├── propertySearch.js
│       ├── propertySearch.css
│       └── propertySearch.js-meta.xml
└── remoteSiteSettings/
    └── PropertySearchAPI.remoteSite-meta.xml
```

## Dépannage (rapide)

- Le champ rue devient gris: vérifier qu'il n'y a pas `disabled={isLoadingStreets}` dans `propertySearch.html` et que `isLoadingStreets` n'est pas utilisé dans le JS.
- Suggestions mal alignées: vérifier la présence de `.street-input-container` et `.street-suggestions` dans le CSS et le HTML.
- Aucun résultat alors que la saisie est correcte: contrôler `municipalityCode` utilisé côté Apex (actuellement `66102`) et la clé API.

## Sécurité

- Ne jamais exposer la clé API en clair dans le code client
 - Le contrôleur n'embarque plus de clé API en dur; `testDirectAPI` requiert maintenant `apiKey` en paramètre
 - Utilisation actuelle: Remote Site Settings (Named Credentials non requis pour ce composant dans l'état actuel)

## Licence / Auteurs

Projet interne. Documentation générée à partir de l'état actuel du code et des décisions fonctionnelles.