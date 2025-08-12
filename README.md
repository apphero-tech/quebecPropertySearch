# Recherche de Propriétés Québec (Salesforce LWC) - v2.0

## Vue d'ensemble

Ce projet fournit un composant Lightning Web Component (LWC) **v2.0** pour rechercher des propriétés québécoises via une API externe et afficher les détails complets selon la structure de données du rôle d'évaluation (MongoDB). L'interface respecte SLDS, est responsive et axée accessibilité.

**🚀 NOUVELLE VERSION 2.0** : Mapping MongoDB complet + Recherche par Propriétaire

## 🏢 **Orgs déployés**

### **Eva-Jer (Org principal)**
- **Alias** : `Eva-Jer`
- **Username** : `eva-dev_jerome@apphero.tech`
- **Org ID** : `00Da500001MCkxgEAD`
- **Instance** : `https://d5h00000mcqxgeac.develop.my.salesforce.com`
- **API Version** : 60.0
- **Statut** : ✅ Déployé et opérationnel

### **DEVALFA (Org secondaire)**
- **Alias** : `DEVALFA`
- **Username** : `alfa_jerome@apphero.tech`
- **Org ID** : `00Dau00000866HREAY`
- **Instance** : `https://alfa2-dev-ed.develop.my.salesforce.com`
- **API Version** : 64.0
- **Statut** : ✅ Déployé et opérationnel

### **MyDevOrg (Org secondaire)**
- **Alias** : `MyDevOrg`
- **Username** : `jerome435@agentforce.com`
- **API Version** : 64.0
- **Statut** : ✅ Déployé et opérationnel

## État actuel (source de vérité)

- LWC principal: `force-app/main/default/lwc/propertySearch/`
  - `propertySearch.html`, `propertySearch.js`, `propertySearch.css`, `propertySearch.js-meta.xml`
- Apex: `force-app/main/default/classes/AddressSearchController.cls`
- Intégrations: `remoteSiteSettings/PropertySearchAPI*`
- Cibles d'exposition: App, Record, Home, Tab et Flow Screen

## 🆕 Fonctionnalités v2.0

### 🔍 **Recherche par Propriétaire (NOUVEAU)**
- **Recherche par nom de famille** (personne physique ou morale)
- **Recherche combinée** nom + prénom
- **Autocomplétion intelligente** des propriétaires avec debouncing (300ms)
- **Support des propriétaires multiples** (2+ propriétaires)
- **Gestion des types** : personnes physiques, morales, gouvernement, organismes religieux, fiducies
- **Formatage intelligent** des adresses complètes des propriétaires

### 📋 **Mapping MongoDB Complet (100% des champs)**
- **Section Propriétaire** : TOUS les champs RL0201x (A-X, U) maintenant mappés
- **Champs précédemment manquants** : RL0201Fx, RL0201Jx, RL0201Lx, RL0201Nx, RL0201Ox, RL0201Px, RL0201Qx, RL0201Rx, RL0201Sx, RL0201Tx
- **Section Évaluateur** : Champs RL060x complètement intégrés
- **Caractéristiques avancées** : RL030x étendus (étages, année construction, qualité, etc.)
- **Sections annexes** : RLZU et RLZG entièrement traités

### 🏠 **Améliorations de l'affichage**
- **Formatage intelligent** des adresses complètes propriétaires
- **Support des numéros d'appartement**, fractions, compléments d'adresse
- **Libellés explicites** pour les statuts et conditions
- **Gestion robuste** des propriétaires multiples
- **Interface utilisateur enrichie** avec toutes les données disponibles
- **Cartes propriétaires mono-colonne** (stack) pour une meilleure lisibilité
- **Sections 3–8** en encarts plats SLDS, champs vides masqués, traductions ciblées

### ✅ **Fonctionnalités existantes maintenues**
- **Recherche par Adresse** (Voie publique + Numéro civique)
- **Autocomplétion des rues** avec debouncing (300ms)
- **Recherche par Matricule** et **Recherche par Lot**
- **Formatage d'adresse** selon le standard Canada Poste
- **Interface responsive** et accessible

## Configuration du composant (App Builder)

Propriétés exposées dans `propertySearch.js-meta.xml`:
- `apiKey` (String, requis): clé API transmise au composant (ne pas la stocker en dur)
- `defaultMunicipality` (String, défaut: "Kirkland"): municipalité par défaut

**Bonnes pratiques exigées par le projet:**
- Passer la clé API et la ville en propriétés du composant (pas dans le code)
- Ne pas générer de fausses données

## Compatibilité Flow Builder

- **Cible activée**: `lightning__FlowScreen`
- **Entrées sur l'écran Flow**: `apiKey` (requis), `defaultMunicipality`
- **Sorties disponibles dans le Flow**:
  - `selectedPropertyId`
  - `selectedPropertyFullAddress`
  - `selectedPropertyOwnerName`
  - `selectedPropertyAssessedValue`
  - `selectedPropertyPostalCode`
  - `selectedPropertyMatricule`
  - `selectedPropertyData` (JSON complet)

**Remarque**: Le comportement et l'UI restent inchangés; la sélection met automatiquement à jour les sorties Flow.

## 🚀 Déploiement

**Prérequis**: Salesforce CLI (sf), accès à un org.

### **Déployer sur Eva-Jer (org principal)**
```bash
# Déployer tout le projet
sf project deploy start --source-dir force-app/main/default

# Déployer uniquement le composant LWC
sf project deploy start --source-dir force-app/main/default/lwc/propertySearch
```

### **Déployer sur DEVALFA**
```bash
# Ordre recommandé (full): Objects -> Apex -> LWC -> Tabs -> Application -> Remote Site (optionnel)
sf project deploy start --source-dir force-app/main/default/objects --target-org DEVALFA
sf project deploy start --source-dir force-app/main/default/classes --target-org DEVALFA
sf project deploy start --source-dir force-app/main/default/lwc/propertySearch --target-org DEVALFA
sf project deploy start --source-dir force-app/main/default/tabs --target-org DEVALFA
sf project deploy start --source-dir force-app/main/default/applications/Property_Search_App.app-meta.xml --target-org DEVALFA
# (optionnel si nécessaire)
sf project deploy start --source-dir force-app/main/default/remoteSiteSettings --target-org DEVALFA
```

### **Déployer sur MyDevOrg**
```bash
# Ordre recommandé (full): Objects -> Apex -> LWC -> Tabs -> Application -> Remote Site (optionnel)
sf project deploy start --source-dir force-app/main/default/objects --target-org MyDevOrg
sf project deploy start --source-dir force-app/main/default/classes --target-org MyDevOrg
sf project deploy start --source-dir force-app/main/default/lwc/propertySearch --target-org MyDevOrg
sf project deploy start --source-dir force-app/main/default/tabs --target-org MyDevOrg
sf project deploy start --source-dir force-app/main/default/applications/Property_Search_App.app-meta.xml --target-org MyDevOrg
# (optionnel si nécessaire)
sf project deploy start --source-dir force-app/main/default/remoteSiteSettings --target-org MyDevOrg
```

**Note importante** : L'application `Property_Search_App` ne référence plus l'onglet personnalisé `Search` pour assurer la compatibilité multi-org.

Le composant est disponible sur App Builder (App, Home, Record) et Tab.

**Dans Flow Builder**: ajouter un écran, puis ajouter le composant dans la section Custom.

## 📖 Utilisation

### Ajouter le composant
- Ajouter le composant dans App Builder
- Renseigner `apiKey` et, si besoin, `defaultMunicipality`

### Recherche par Adresse
- Saisir 2+ caractères de rue → suggestions s'affichent
- Sélectionner la rue (le champ reste éditable)
- Saisir le numéro civique → Rechercher
- Si aucun résultat: la rue est conservée, seul le numéro est vidé

### 🔍 **Recherche par Propriétaire (NOUVEAU)**
- Sélectionner le type de recherche "Par Propriétaire"
- Saisir 2+ caractères du nom → suggestions s'affichent
- Sélectionner le propriétaire dans la liste
- Cliquer sur "Rechercher" pour obtenir toutes les propriétés
- **Résultats multiples** : Affichage en liste avec toutes les propriétés du propriétaire

### Recherche par Matricule
- Saisir le numéro de matricule cadastral
- Cliquer sur "Rechercher"

### Recherche par Lot
- Saisir le numéro de lot
- Cliquer sur "Rechercher"

## 🎯 Détails UX/UI clés

- **Champ rue**: jamais désactivé pendant les requêtes
- **Alignement des suggestions**: container relatif + dropdown absolute 100% largeur
- **Formatage d'affichage des rues**: "Boulevard HYMUS" (pas de parenthèses)
- **Titre carte résultat**: adresse format Canada Poste (ligne 1 + ligne 2)
- **Interface responsive**: adaptée mobile et desktop
- **Animations fluides**: transitions et états de chargement

## 📊 Structure des données MongoDB supportées

### **Section Propriétaire (RL0201x)**
- **Identité**: Nom légal, prénom, statut, date d'inscription
- **Adresse complète**: Numéro civique, fraction, voie publique, appartement, compléments
- **Localisation**: Municipalité, code postal, province, pays
- **Informations postales**: Case postale, succursale postale

### **Section Caractéristiques (RL030x)**
- **Terrain**: Superficie, zonage agricole, vocation forestière
- **Bâtiment**: Nombre d'étages, année construction, qualité, accessibilité
- **Mesures**: Superficies en multiples unités (m², pieds², acres, hectares, etc.)

### **Section Évaluation (RL040x)**
- **Valeurs**: Terrain, bâtiment, totale, imposable
- **Facteurs**: Codes d'exonération, classification, ajustements
- **Valeurs spéciales**: Marché estimé, assurance, remplacement

### **Section Fiscale (RL050x)**
- **Répartitions**: Pourcentages imposables, codes tarification
- **Détails**: Détail des valeurs par usage (RL0504x)

### **Sections Spéciales (RLZU)**
- **Logements**: Détails des unités locatives
- **Terrains**: Caractéristiques des parcelles
- **Bâtiments**: Informations de construction
- **Copropriétés**: Pourcentages et types

## 🏗️ Structure du dépôt (pertinente)

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

## 🔧 Dépannage (rapide)

- **Le champ rue devient gris**: vérifier qu'il n'y a pas `disabled={isLoadingStreets}` dans `propertySearch.html`
- **Suggestions mal alignées**: vérifier la présence de `.street-input-container` et `.street-suggestions` dans le CSS et le HTML
- **Aucun résultat**: contrôler `municipalityCode` utilisé côté Apex et la clé API
- **Recherche propriétaire ne fonctionne pas**: vérifier que l'endpoint `searchOwnerSuggestions` est déployé

## 🛡️ Sécurité

- **Ne jamais exposer la clé API** en clair dans le code client
- **Le contrôleur n'embarque plus de clé API** en dur
- **Utilisation actuelle**: Remote Site Settings (Named Credentials non requis)

## 📈 État fonctionnel v2.0

- ✅ **Recherche par Adresse**: Fonctionnelle et optimisée
- ✅ **Recherche par Propriétaire**: Nouvelle fonctionnalité opérationnelle
- ✅ **Recherche par Matricule**: Fonctionnelle
- ✅ **Recherche par Lot**: Fonctionnelle
- ✅ **Mapping MongoDB**: Complet (100% des champs)
- ✅ **Interface utilisateur**: Enrichie et responsive
- ✅ **Compatibilité Flow**: Maintenue
- ✅ **Gestion d'erreurs**: Robuste

## 🎯 Version recommandée

**Cette version peut être marquée comme v2.0** car elle constitue une amélioration majeure avec :

- Nouvelle fonctionnalité de recherche par propriétaire
- Mapping de données MongoDB complet
- Interface utilisateur enrichie
- Gestion robuste des propriétaires multiples

**Cette version est prête pour la production** et peut servir de référence stable dans le dépôt guide.

## 📝 Historique des versions

- **v1.0**: Recherche par adresse, mapping MongoDB de base
- **v2.0**: Recherche par propriétaire, mapping MongoDB complet, interface enrichie

## 📄 Licence / Auteurs

Projet interne. Documentation générée à partir de l'état actuel du code et des décisions fonctionnelles.

---

## 🚀 **Résumé des déploiements**

### **Eva-Jer (Org principal)**
- **Deploy ID** : `0Afa500002OkoKjCAJ`
- **Temps de déploiement** : 2.71 secondes
- **Statut** : ✅ Déployé et opérationnel

### **DEVALFA (Org secondaire)**
- **Deploy IDs** : 
  - Objects: `0Afau000005BaA9CAK`
  - Classes Apex : `0Afau000005BaBlCAK`
  - LWC : `0Afau000005BaDNCA0`
  - Tabs : `0Afau000005BaIDCA0`
  - Application : `0Afau000005BaJpCAK`
- **Statut** : ✅ Déployé et opérationnel

### **MyDevOrg (Org secondaire)**
- **Deploy IDs** : 
  - Objects: `0AfgK000008PUEPSA4`
  - Classes Apex : `0AfgK000008PUHdSAO`
  - LWC : `0AfgK000008PUW9SAO`
  - Tabs : `0AfgK000008PQE2SAO`
  - Application : `0AfgK000008PUXlSAO`
- **Statut** : ✅ Déployé et opérationnel

**Les trois orgs cibles sont synchronisés avec la version 2.0.0 complète.** 🎉
**Les deux orgs sont maintenant synchronisés avec la version 2.0.0 complète !** 🎉