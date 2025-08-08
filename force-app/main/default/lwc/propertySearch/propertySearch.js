import { LightningElement, track, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { FlowAttributeChangeEvent } from 'lightning/flowSupport';

// Imports Apex (méthodes fonctionnelles)
import getAvailableCollections from '@salesforce/apex/AddressSearchController.getAvailableCollections';
import getStreetSuggestions from '@salesforce/apex/AddressSearchController.getStreetSuggestions';
import getPropertyDetails from '@salesforce/apex/AddressSearchController.getPropertyDetails';

export default class PropertySearch extends LightningElement {
    
    // Paramètres configurables
    @api apiKey;
    @api defaultMunicipality = 'Kirkland';
    
    // Types de recherche
    @track searchType = 'address';
    @track searchTypes = [
        { label: 'Par Adresse', value: 'address' },
        { label: 'Par Propriétaire', value: 'owner' },
        { label: 'Par Matricule', value: 'matricule' },
        { label: 'Par Lot', value: 'lot' }
    ];
    
    // États des données
    @track municipalityOptions = [];
    @track selectedMunicipality;
    @track streetInput = '';
    @track selectedStreet = '';
    @track numberInput = '';
    @track ownerInput = '';
    @track matriculeInput = '';
    @track lotInput = '';
    
    // États UI
    @track showStreetSuggestions = false;
    @track streetOptions = [];
    @track isNumberDisabled = true;
    @track showPropertyDetails = false;
    @track showNoResults = false;
    @track noResultsMessage = '';
    @track properties = [];
    
    // États de chargement
    @track isLoadingMunicipalities = false;

    @track isLoadingProperty = false;
    
    // Timers pour debouncing
    streetSearchTimeout;
    
    connectedCallback() {
        // Initialiser la municipalité sélectionnée avec la valeur par défaut
        this.selectedMunicipality = this.defaultMunicipality;
        this.loadMunicipalities();
    }
    
    /**
     * Charge la liste des municipalités disponibles
     */
    async loadMunicipalities() {
        try {
            this.isLoadingMunicipalities = true;
            
            console.log('Calling getAvailableCollections...');
            
            const result = await getAvailableCollections({ apiKey: this.apiKey });
            
            console.log('Raw Apex result for collections:', result);
            console.log('Type of result:', typeof result);
            console.log('Is Array:', Array.isArray(result));
            
            // Gestion robuste du résultat
            let collections = [];
            if (Array.isArray(result)) {
                collections = result;
            } else if (result && typeof result === 'object') {
                collections = Array.from(result);
            } else {
                console.log('Collections result is not an array:', result);
                collections = [];
            }
            
            this.municipalityOptions = collections.map(collection => ({
                label: collection,
                value: collection
            }));
            
            // Sélectionner la municipalité par défaut
            if (this.municipalityOptions.length > 0 && !this.selectedMunicipality) {
                this.selectedMunicipality = this.defaultMunicipality;
            }
            
            console.log('Final municipalityOptions:', this.municipalityOptions);
            console.log('Number of municipalities:', this.municipalityOptions.length);
            
        } catch (error) {
            console.error('Erreur chargement municipalités:', error);
            this.showToast('Erreur', 'Impossible de charger les municipalités', 'error');
        } finally {
            this.isLoadingMunicipalities = false;
        }
    }
    
    /**
     * Gestionnaire de changement de municipalité
     */
    handleMunicipalityChange(event) {
        this.selectedMunicipality = event.detail.value;
        this.resetStreetAndNumber();
    }
    
    /**
     * Gestionnaire de changement de type de recherche
     */
    handleSearchTypeChange(event) {
        this.searchType = event.target.value;
        this.clearResults();
        this.resetAllInputs();
    }
    
    /**
     * Gestionnaire de saisie pour la rue - SIMPLE
     */
    handleStreetInput(event) {
        const value = event.target.value;
        this.streetInput = value;
        
        // Si on modifie une rue déjà sélectionnée, réinitialiser la sélection
        if (this.selectedStreet && value !== this.selectedStreet) {
            this.selectedStreet = '';
            this.isNumberDisabled = true;
            this.numberInput = '';
        }
        
        // Debouncing simple
        clearTimeout(this.streetSearchTimeout);
        
        if (value.length >= 2) {
            this.streetSearchTimeout = setTimeout(() => {
                this.callStreetAPI(value);
            }, 300);
        } else {
            this.hideStreetSuggestions();
            this.streetOptions = [];
        }
    }
    
    /**
     * Gestionnaire de focus pour la rue - SIMPLE
     */
    handleStreetFocus() {
        if (this.streetInput.length >= 2) {
            this.callStreetAPI(this.streetInput);
        }
    }
    
    /**
     * Fonction pour convertir les codes vers noms complets de types de voies
     */
    getFullStreetType(code) {
        const streetTypes = {
            'AL': 'Allée',
            'AR': 'Ancienne route', 
            'AV': 'Avenue',
            'BD': 'Boulevard',
            'BO': 'Boulevard',  // ✅ S'assurer que BO = Boulevard
            'CH': 'Chemin',
            'CR': 'Carré',
            'CT': 'Cour',
            'IMP': 'Impasse',
            'PAS': 'Passage',
            'PL': 'Place',
            'PROM': 'Promenade',
            'RG': 'Rang',
            'RTE': 'Route',
            'RU': 'Rue',
            'SQ': 'Square',
            'TR': 'Terrasse'
        };
        
        const result = streetTypes[code?.toUpperCase()] || code;
        
        // ✅ S'assurer que la première lettre est majuscule
        return result.charAt(0).toUpperCase() + result.slice(1).toLowerCase();
    }
    
    /**
     * Formater le nom de rue pour l'affichage
     */
    formatStreetName(streetName) {
        // Ex: "HYMUS (boulevard)" → "Boulevard HYMUS"
        if (streetName.includes('(') && streetName.includes(')')) {
            const name = streetName.split('(')[0].trim();
            const typeInParens = streetName.split('(')[1].replace(')', '').trim();
            const fullType = this.getFullStreetType(typeInParens);
            
            // ✅ AJOUTER la majuscule à la première lettre
            const capitalizedType = fullType.charAt(0).toUpperCase() + fullType.slice(1).toLowerCase();
            
            return `${capitalizedType} ${name}`;
        }
        
        return streetName;
    }
    
    /**
     * Formater l'adresse selon le format Canada Poste
     */
    formatCanadaPostAddress(property) {
        // Extraire les données MongoDB
        const civicNumber = property.RLUEx?.RL0101?.RL0101x?.RL0101Ax || '';
        const streetTypeCode = property.RLUEx?.RL0101?.RL0101x?.RL0101Ex || '';
        const streetName = property.RLUEx?.RL0101?.RL0101x?.RL0101Gx || '';
        const postalCode = property.RLUEx?.RL0101?.RL0101x?.POSTALCODE || '';
        
        // Convertir le code type en nom complet
        const fullStreetType = this.getFullStreetType(streetTypeCode);
        
        // Format Canada Poste
        const line1 = `${civicNumber} ${fullStreetType} ${streetName}`.trim();
        const line2 = `Kirkland QC ${postalCode}`;
        
        return {
            fullAddress: `${line1}, ${line2}`,
            addressLine1: line1,
            addressLine2: line2
        };
    }
    
    /**
     * Appel API pour l'autocomplétion des rues - SIMPLE
     */
    async callStreetAPI(searchTerm) {
        try {
            this.showStreetSuggestions = false;
            
            const result = await getStreetSuggestions({ 
                searchTerm: searchTerm, 
                municipalityCode: '66102', 
                apiKey: this.apiKey 
            });
            
            // Formater les résultats pour streetOptions
            if (Array.isArray(result) && result.length > 0) {
                this.streetOptions = result.map(street => ({
                    label: street,
                    value: street
                }));
                this.showStreetSuggestions = true;
            } else {
                this.streetOptions = [];
                this.showStreetSuggestions = false;
            }
            
        } catch (error) {
            console.error('Error calling street API:', error);
            this.showErrorToast('Erreur lors de la recherche de rues');
            this.streetOptions = [];
            this.showStreetSuggestions = false;
        }
    }
    
    /**
     * Sélection d'une suggestion de rue - FORMATÉE
     */
    handleStreetSelection(event) {
        const rawValue = event.currentTarget.dataset.value;
        
        // Formater pour l'affichage
        const formattedValue = this.formatStreetName(rawValue);
        
        this.selectedStreet = rawValue; // Garder l'original pour l'API
        this.streetInput = formattedValue; // Afficher le formaté
        
        // Activer le champ numéro
        this.isNumberDisabled = false;
        
        // Fermer les suggestions
        this.showStreetSuggestions = false;
        
        this.resetPropertyDetails();
    }
    
    /**
     * Gestionnaires pour les autres types de recherche
     */
    handleNumberInput(event) {
        this.numberInput = event.target.value;
    }
    
    handleOwnerInput(event) {
        this.ownerInput = event.target.value;
    }
    
    handleMatriculeInput(event) {
        this.matriculeInput = event.target.value;
    }
    
    handleLotInput(event) {
        this.lotInput = event.target.value;
    }
    
    /**
     * Gestionnaire de recherche
     */
    handleSearch() {
        if (!this.canSearch) return;
        
        this.performSearch();
    }
    
    /**
     * Vérification si la recherche peut être effectuée
     */
    get canSearch() {
        switch (this.searchType) {
            case 'address':
                return this.selectedStreet && this.numberInput.trim();
            case 'owner':
                return this.ownerInput.trim();
            case 'matricule':
                return this.matriculeInput.trim();
            case 'lot':
                return this.lotInput.trim();
            default:
                return false;
        }
    }
    
    /**
     * État du bouton de recherche
     */
    get searchDisabled() {
        return !this.canSearch || this.isLoadingProperty;
    }
    
    /**
     * Exécution de la recherche
     */
    async performSearch() {
        this.isLoadingProperty = true;
        this.clearResults();
        
        try {
            console.log('Searching for:', this.searchType);
            
            let result;
            
            if (this.searchType === 'address') {
                result = await getPropertyDetails({
                    streetName: this.selectedStreet,
                    streetNumber: this.numberInput.trim(),
                    municipalityCode: '66102',
                    apiKey: this.apiKey
                });
            } else {
                // TODO: Créer des méthodes Apex spécifiques pour chaque type de recherche
                console.log('Autres types de recherche non encore implémentés');
                this.showNoResults = true;
                this.noResultsMessage = 'Ce type de recherche sera bientôt disponible';
                // ✅ Réinitialiser les champs même pour les types non implémentés
                this.resetAllSearchFields();
                return;
            }
            
            if (result && result.RLUEx && result.RLUEx.RL0101) {
                // ✅ Propriété trouvée - Afficher les détails
                console.log('✅ Propriété trouvée, affichage des détails');
                this.formatAndDisplayProperty(result);
                this.showPropertyDetails = true;
                this.showNoResults = false;
                
                // ✅ RÉSULTAT TROUVÉ - Vider tout pour nouvelle recherche
                this.resetAllSearchFields();
                
            } else {
                // ❌ Aucune propriété - Afficher message
                console.log('❌ Aucune propriété trouvée, résultat:', result);
                this.showPropertyDetails = false;
                this.showNoResults = true;
                this.noResultsMessage = `Aucune propriété trouvée. Vérifiez les informations saisies.`;
                
                // ✅ NOUVEAU : Vider seulement le numéro, garder la rue
                this.resetNumberFieldOnly();
            }
            
        } catch (error) {
            console.error('Search error:', error);
            this.showToast('Erreur', 'Erreur lors de la recherche', 'error');
            this.showPropertyDetails = false;
            this.showNoResults = true;
            this.noResultsMessage = 'Erreur lors de la recherche';
            
            // ✅ En cas d'erreur aussi, garder la rue
            this.resetNumberFieldOnly();
        } finally {
            this.isLoadingProperty = false;
        }
    }
    
    /**
     * Formatage et affichage des propriétés (MAPPING MONGODB COMPLET)
     */
    formatAndDisplayProperty(mongoData) {
        try {
            console.log('Formatting MongoDB data:', mongoData);
            
            // Extraire les données MongoDB selon la structure exacte
            const rluex = mongoData.RLUEx || {};
            const rl0101 = rluex.RL0101 || {};
            const rl0101x = rl0101.RL0101x || {};
            const rl0103 = rluex.RL0103 || {};
            const rl0103x = rl0103.RL0103x || {};
            const rl0104 = rluex.RL0104 || {};
            const rl0201 = rluex.RL0201 || {};
            const rl0201x = rl0201.RL0201x || {};
            const rl0504 = rluex.RL0504 || {};
            const rl0504x = rl0504.RL0504x || [];
            const annexesUnite = rluex.RENSEIGNEMENTS_ANNEXABLES_UNITE || {};
            const annexesGlobal = mongoData.RENSEIGNEMENTS_ANNEXABLES_GLOBAL || {};
            
            // Créer l'objet propriété formaté avec TOUS les champs
            const property = {
                // === INFORMATIONS GÉNÉRALES ===
                id: mongoData._id || 'unknown',
                version: this.getSecureValue(mongoData, 'VERSION'),
                codeMunicipalite: this.getSecureValue(mongoData, 'RLM01A'),
                anneeRole: this.getSecureValue(mongoData, 'RLM02A'),
                
                // === ADRESSE FORMAT CANADA POSTE ===
                ...this.formatCanadaPostAddress(mongoData),
                
                // === SECTION 1 : IDENTIFICATION DE L'UNITÉ D'ÉVALUATION ===
                
                // Groupe Adresse (RL0101x)
                rl0101Ax: this.getSecureValue(rl0101x, 'RL0101Ax'), // Numéro civique
                rl0101Bx: this.getSecureValue(rl0101x, 'RL0101Bx'), // Fraction numéro inférieur
                rl0101Cx: this.getSecureValue(rl0101x, 'RL0101Cx'), // Numéro supérieur
                rl0101Dx: this.getSecureValue(rl0101x, 'RL0101Dx'), // Fraction numéro supérieur
                rl0101Ex: this.getSecureValue(rl0101x, 'RL0101Ex'), // Code générique (type rue)
                rl0101Fx: this.getSecureValue(rl0101x, 'RL0101Fx'), // Code de lien
                rl0101Gx: this.getSecureValue(rl0101x, 'RL0101Gx'), // Nom voie publique
                rl0101Hx: this.getSecureValue(rl0101x, 'RL0101Hx'), // Point cardinal
                rl0101Ix: this.getSecureValue(rl0101x, 'RL0101Ix'), // Numéro appartement/local
                rl0101Jx: this.getSecureValue(rl0101x, 'RL0101Jx'), // Partie complémentaire
                postalCode: this.getSecureValue(rl0101x, 'POSTALCODE'), // Code postal
                
                // Groupe Numéro de dossier (RL0103x)
                rl0103Ax: this.getSecureValue(rl0103x, 'RL0103Ax'), // Numéro de dossier
                
                // Groupe Détails cadastraux (RL0104)
                rl0104A: this.getSecureValue(rl0104, 'RL0104A'), // Numéro de lot
                rl0104B: this.getSecureValue(rl0104, 'RL0104B'), // Partie de lot
                rl0104C: this.getSecureValue(rl0104, 'RL0104C'), // Rang/Concession
                rl0104D: this.getSecureValue(rl0104, 'RL0104D'), // Subdivision
                rl0104E: this.getSecureValue(rl0104, 'RL0104E'), // Numéro bâtiment
                rl0104F: this.getSecureValue(rl0104, 'RL0104F'), // Numéro local
                rl0104G: this.getSecureValue(rl0104, 'RL0104G'), // Code géographique
                rl0104H: this.getSecureValue(rl0104, 'RL0104H'), // Discriminant
                
                // Autres informations d'identification
                rl0105A: this.getSecureValue(rluex, 'RL0105A'), // Code d'utilisation
                rl0106A: this.getSecureValue(rluex, 'RL0106A'), // Matricule
                rl0107A: this.getSecureValue(rluex, 'RL0107A'), // Code de l'évaluateur
                
                // === SECTION 2 : IDENTIFICATION DU PROPRIÉTAIRE ===
                
                // Groupe Identité du propriétaire (RL0201x)
                rl0201Ax: this.getSecureValue(rl0201x, 'RL0201Ax'), // Nom légal du propriétaire
                rl0201Bx: this.getSecureValue(rl0201x, 'RL0201Bx'), // Prénom du propriétaire
                rl0201Cx: this.getSecureValue(rl0201x, 'RL0201Cx'), // Adresse postale non structurée
                rl0201Dx: this.getSecureValue(rl0201x, 'RL0201Dx'), // Municipalité
                rl0201Ex: this.getSecureValue(rl0201x, 'RL0201Ex'), // Code postal
                rl0201Fx: this.getSecureValue(rl0201x, 'RL0201Fx'), // Complément d'adresse/contact
                rl0201Gx: this.getSecureValue(rl0201x, 'RL0201Gx'), // Date initiale d'inscription
                rl0201Hx: this.getSecureValue(rl0201x, 'RL0201Hx'), // Statut imposition scolaire
                rl0201Ix: this.getSecureValue(rl0201x, 'RL0201Ix'), // Numéro civique postal
                rl0201Kx: this.getSecureValue(rl0201x, 'RL0201Kx'), // Type voie postal
                rl0201Mx: this.getSecureValue(rl0201x, 'RL0201Mx'), // Nom voie postal
                rl0201Qx: this.getSecureValue(rl0201x, 'RL0201Qx'), // Province/état
                rl0201Rx: this.getSecureValue(rl0201x, 'RL0201Rx'), // Pays
                
                // Informations supplémentaires propriétaire
                rl0201U: this.getSecureValue(rl0201, 'RL0201U'), // Code des conditions d'inscription
                
                // === SECTION 3 : CARACTÉRISTIQUES DE L'UNITÉ D'ÉVALUATION ===
                
                // Caractéristiques du terrain
                rl0301A: this.getSecureValue(rluex, 'RL0301A'), // Dimension linéaire/mesure frontale
                rl0302A: this.getSecureValue(rluex, 'RL0302A'), // Superficie du terrain
                rl0303A: this.getSecureValue(rluex, 'RL0303A'), // Code zonage agricole
                rl0304A: this.getSecureValue(rluex, 'RL0304A'), // Superficie exploitation agricole totale
                rl0305A: this.getSecureValue(rluex, 'RL0305A'), // Superficie exploitation agricole en zone
                rl0314A: this.getSecureValue(rluex, 'RL0314A'), // Superficie imposition maximale
                rl0315A: this.getSecureValue(rluex, 'RL0315A'), // Superficie vocation forestière totale
                rl0316A: this.getSecureValue(rluex, 'RL0316A'), // Superficie vocation forestière en zone agricole
                rl0320A: this.getSecureValue(rluex, 'RL0320A'), // Superficie agricole exploitable non exploitée
                
                // Caractéristiques du bâtiment principal
                rl0306A: this.getSecureValue(rluex, 'RL0306A'), // Nombre maximal d'étages
                rl0307A: this.getSecureValue(rluex, 'RL0307A'), // Année construction originelle
                rl0307B: this.getSecureValue(rluex, 'RL0307B'), // Mention réelle/estimée
                rl0308A: this.getSecureValue(rluex, 'RL0308A'), // Aire d'étages
                rl0309A: this.getSecureValue(rluex, 'RL0309A'), // Code lien physique
                rl0310A: this.getSecureValue(rluex, 'RL0310A'), // Code genre construction
                rl0311A: this.getSecureValue(rluex, 'RL0311A'), // Nombre d'étages
                rl0312A: this.getSecureValue(rluex, 'RL0312A'), // Nombre d'unités locatives
                rl0313A: this.getSecureValue(rluex, 'RL0313A'), // Code d'utilisation
                rl0317A: this.getSecureValue(rluex, 'RL0317A'), // Superficie bâtiment
                rl0318A: this.getSecureValue(rluex, 'RL0318A'), // Code type construction
                rl0319A: this.getSecureValue(rluex, 'RL0319A'), // Code classe construction
                
                // === SECTION 4 : VALEURS AU RÔLE D'ÉVALUATION ===
                
                // Information de référence
                rl0401A: this.getSecureValue(rluex, 'RL0401A'), // Date de référence des conditions du marché
                
                // Valeurs au rôle en vigueur
                rl0402A: this.getSecureValue(rluex, 'RL0402A'), // Valeur du terrain inscrite au rôle
                rl0403A: this.getSecureValue(rluex, 'RL0403A'), // Valeur du/des bâtiments inscrite au rôle
                rl0404A: this.getSecureValue(rluex, 'RL0404A'), // Valeur totale de l'immeuble inscrite au rôle
                rl0405A: this.getSecureValue(rluex, 'RL0405A'), // Valeur du même immeuble au rôle antérieur
                
                // Détail des valeurs par usage (RL0504x) - Tableau complet
                rl0504Details: this.formatRL0504Details(rl0504x),
                
                // === SECTION 5 : RÉPARTITION FISCALE ===
                
                // Catégories de base
                rl0501A: this.getSecureValue(rluex, 'RL0501A'), // Terrains vagues desservis
                rl0502A: this.getSecureValue(rluex, 'RL0502A'), // Classe immeubles non résidentiels
                rl0503A: this.getSecureValue(rluex, 'RL0503A'), // Classe immeubles industriels
                
                // Secteur
                rl0508A: this.getSecureValue(rluex, 'RL0508A'), // Code du secteur pour taxation
                
                // === SECTION 6 : DÉCLARATION DE DÉPÔT DU RÔLE PAR L'ÉVALUATEUR ===
                
                // Identité de l'évaluateur
                rl0601A: this.getSecureValue(mongoData, 'RL0601A'), // Nom de l'évaluateur signataire du rôle
                rl0601B: this.getSecureValue(mongoData, 'RL0601B'), // Prénom de l'évaluateur signataire du rôle
                rl0602A: this.getSecureValue(mongoData, 'RL0602A'), // Titre de l'évaluateur signataire du rôle
                rl0603A: this.getSecureValue(mongoData, 'RL0603A'), // Nom de l'organisme municipal responsable du rôle d'évaluation
                rl0604A: this.getSecureValue(mongoData, 'RL0604A'), // Date de la signature par l'évaluateur
                rl0605A: this.getSecureValue(mongoData, 'RL0605A'), // Lieu de la signature par l'évaluateur
                
                // === SECTION 7 : INFORMATIONS ANNEXABLES GLOBALES ===
                
                // Métadonnées globales
                rlzg0001: this.getSecureValue(annexesGlobal, 'RLZG0001'), // Version des informations
                rlzg0002: this.getSecureValue(annexesGlobal, 'RLZG0002'), // Date de mise à jour
                
                // === SECTION 8 : RENSEIGNEMENTS ANNEXABLES DE L'UNITÉ ===
                
                // Logements (RLZU1007)
                rlzu1007Details: this.formatRLZU1007Details(annexesUnite.RLZU1007),
                
                // Terrains (RLZU1008)
                rlzu1008Details: this.formatRLZU1008Details(annexesUnite.RLZU1008),
                
                // Bâtiments (RLZU2001)
                rlzu2001Details: this.formatRLZU2001Details(annexesUnite.RLZU2001),
                
                // Usage et construction
                rlzu3005A: this.getSecureValue(annexesUnite, 'RLZU3005A'), // Usage principal
                rlzu3005B: this.getSecureValue(annexesUnite, 'RLZU3005B'), // Sous-usage
                rlzu3005C: this.getSecureValue(annexesUnite, 'RLZU3005C'), // Logement accessoire
                rlzu3006B: this.getSecureValue(annexesUnite, 'RLZU3006B'), // Revenus
                rlzu3007x: this.getSecureValue(annexesUnite, 'RLZU3007x'), // Code de construction
                
                // Dates importantes
                rlzu3101: this.getSecureValue(annexesUnite, 'RLZU3101'), // Date début évaluation
                rlzu3102: this.getSecureValue(annexesUnite, 'RLZU3102'), // Date mise en vigueur
                rlzu3103: this.getSecureValue(annexesUnite, 'RLZU3103'), // Date fin validité
                
                // Valeurs annexables
                rlzu3104: this.getSecureValue(annexesUnite, 'RLZU3104'), // Valeur au rôle
                rlzu4001: this.getSecureValue(annexesUnite, 'RLZU4001'), // Valeur terrain municipale
                rlzu4002: this.getSecureValue(annexesUnite, 'RLZU4002')  // Valeur bâtiment municipale
            };
            
            console.log('Formatted property:', property);

            // === TRAITEMENT PROPRIÉTAIRES MULTIPLES (RL0201x peut être objet ou tableau) ===
            try {
                const proprietaireData = rluex?.RL0201?.RL0201x;
                const proprietaires = Array.isArray(proprietaireData)
                    ? proprietaireData
                    : (proprietaireData ? [proprietaireData] : []);

                const processedOwners = proprietaires
                    .map((prop, index) => {
                        if (!prop) return null;

                        const nom = prop.RL0201Ax || 'Non disponible';
                        const prenom = prop.RL0201Bx || '';
                        const statutCode = prop.RL0201Hx;
                        const dateInscription = prop.RL0201Gx || '';

                        return {
                            id: `owner_${index + 1}`,
                            fullName: prenom ? `${prenom} ${nom}` : nom,
                            lastName: nom,
                            firstName: prenom,
                            statutCode: statutCode,
                            status: statutCode === '1' ? 'Personne physique' : 'Personne morale',

                            // Adresse complète (codes MEFQ)
                            adressePostale: prop.RL0201Cx || '',
                            numeroCivique: prop.RL0201Ix || '',
                            fractionAdresse: prop.RL0201Jx || '',
                            codeGenerique: prop.RL0201Kx || '',
                            codeLien: prop.RL0201Lx || '',
                            voiePublique: prop.RL0201Mx || '',
                            pointCardinal: prop.RL0201Nx || '',
                            numeroAppartement: prop.RL0201Ox || '',
                            fractionAppartement: prop.RL0201Px || '',

                            // Géographie
                            municipalite: prop.RL0201Dx || '',
                            codePostal: prop.RL0201Ex || '',
                            province: prop.RL0201Qx || '',
                            pays: prop.RL0201Rx || '',

                            // Postal spécialisé
                            casePostale: prop.RL0201Sx || '',
                            succursalePostale: prop.RL0201Tx || '',

                            // Dates et complément
                            dateInscription: dateInscription,
                            complementAdresse: prop.RL0201Fx || ''
                        };
                    })
                    .filter(Boolean);

                property.owners = processedOwners;
                property.hasMultipleOwners = processedOwners.length > 1;
                property.hasTwoOwners = processedOwners.length === 2;

                const conditionInscription = rluex?.RL0201?.RL0201U || '';
                property.conditionInscription = conditionInscription;
                property.hasSpecialCondition = Boolean(conditionInscription && conditionInscription !== '1');
                // Pour l'instant, afficher le code tel quel; mappage descriptif possible ultérieurement
                property.conditionInscriptionText = conditionInscription;
            } catch (e) {
                // Ne pas bloquer l'affichage si un format inattendu est rencontré
                property.owners = [];
                property.hasMultipleOwners = false;
                property.hasTwoOwners = false;
                property.conditionInscription = this.getSecureValue(rl0201, 'RL0201U');
                property.hasSpecialCondition = false;
                property.conditionInscriptionText = property.conditionInscription;
            }
            
            // Afficher la propriété
            this.properties = [property];
            this.notifyFlowOfPropertySelection(property);
            
        } catch (error) {
            console.error('Error formatting property:', error);
            this.showToast('Erreur', 'Erreur lors du formatage des données', 'error');
        }
    }
    
    /**
     * Fonction utilitaire pour l'accès sécurisé aux propriétés
     */
    getSecureValue(obj, path, defaultValue = 'Non disponible') {
        try {
            if (!obj) return defaultValue;
            const value = obj[path];
            return value !== null && value !== undefined ? value : defaultValue;
        } catch (error) {
            console.log(`Erreur accès sécurisé ${path}:`, error);
            return defaultValue;
        }
    }
    
    /**
     * Formatage des détails RL0504 (Détail des valeurs par usage)
     */
    formatRL0504Details(rl0504x) {
        if (!Array.isArray(rl0504x) || rl0504x.length === 0) {
            return [];
        }
        
        return rl0504x.map((item, index) => ({
            id: index,
            codeTarification: this.getSecureValue(item, 'RL0504Ax'),
            numeroTarification: this.getSecureValue(item, 'RL0504Bx'),
            codeUtilisation: this.getSecureValue(item, 'RL0504Cx'),
            valeur: this.getSecureValue(item, 'RL0504Dx'),
            type: this.getSecureValue(item, 'RL0504Ex'),
            pourcentage: this.getSecureValue(item, 'RL0504Fx'),
            typeLabel: this.getTypeLabel(this.getSecureValue(item, 'RL0504Ex'))
        }));
    }
    
    /**
     * Formatage des détails RLZU1007 (Logements)
     */
    formatRLZU1007Details(rlzu1007) {
        if (!rlzu1007 || !rlzu1007.RLZU1007x) {
            return [];
        }
        
        const rlzu1007x = rlzu1007.RLZU1007x;
        return [{
            numeroLogement: this.getSecureValue(rlzu1007x, 'RLZU1007Ax'),
            superficieLogement: this.getSecureValue(rlzu1007x, 'RLZU1007Bx')
        }];
    }
    
    /**
     * Formatage des détails RLZU1008 (Terrains)
     */
    formatRLZU1008Details(rlzu1008) {
        if (!rlzu1008 || !rlzu1008.RLZU1008x) {
            return [];
        }
        
        const rlzu1008x = rlzu1008.RLZU1008x;
        return [{
            numero: this.getSecureValue(rlzu1008x, 'RLZU1008Ax'),
            frontage: this.getSecureValue(rlzu1008x, 'RLZU1008Bx'),
            superficie: this.getSecureValue(rlzu1008x, 'RLZU1008Cx'),
            formeTerrain: this.getSecureValue(rlzu1008x, 'RLZU1008Dx')
        }];
    }
    
    /**
     * Formatage des détails RLZU2001 (Bâtiments)
     */
    formatRLZU2001Details(rlzu2001) {
        if (!rlzu2001 || !rlzu2001.RLZU2001x) {
            return [];
        }
        
        const rlzu2001x = rlzu2001.RLZU2001x;
        return [{
            numeroBatiment: this.getSecureValue(rlzu2001x, 'RLZU2001Ax'),
            coutRemplacement: this.getSecureValue(rlzu2001x, 'RLZU2001Bx'),
            classe: this.getSecureValue(rlzu2001x, 'RLZU2001Ex'),
            typeConstruction: this.getSecureValue(rlzu2001x, 'RLZU2001Fx')
        }];
    }
    
    /**
     * Obtenir le libellé du type de valeur
     */
    getTypeLabel(type) {
        const typeLabels = {
            'T': 'Terrain',
            'B': 'Bâtiment',
            'I': 'Imposable'
        };
        return typeLabels[type] || type;
    }
    
    /**
     * Formatage des montants en dollars
     */
    formatCurrency(value) {
        if (!value || value === 'Non disponible') return 'Non disponible';
        const numValue = parseFloat(value);
        if (isNaN(numValue)) return value;
        return new Intl.NumberFormat('fr-CA', {
            style: 'currency',
            currency: 'CAD'
        }).format(numValue);
    }
    
    /**
     * Formatage des dates
     */
    formatDate(value) {
        if (!value || value === 'Non disponible') return 'Non disponible';
        try {
            const date = new Date(value);
            if (isNaN(date.getTime())) return value;
            return date.toLocaleDateString('fr-CA');
        } catch (error) {
            return value;
        }
    }
    
    /**
     * Formatage des superficies
     */
    formatArea(value) {
        if (!value || value === 'Non disponible') return 'Non disponible';
        const numValue = parseFloat(value);
        if (isNaN(numValue)) return value;
        return `${numValue.toLocaleString('fr-CA')} m²`;
    }
    
    /**
     * Méthodes utilitaires
     */
    clearResults() {
        this.properties = [];
        this.showPropertyDetails = false;
        this.showNoResults = false;
        this.noResultsMessage = '';
    }
    
    /**
     * ✅ NOUVELLE MÉTHODE - Vider tout (succès)
     */
    resetAllSearchFields() {
        console.log('🔄 Réinitialisation complète des champs (succès)...');
        
        // Vider les champs
        this.streetInput = '';
        this.selectedStreet = '';
        this.numberInput = '';
        
        // Réactiver/désactiver
        this.isNumberDisabled = true;
        
        // Vider les options
        this.streetOptions = [];
        this.showStreetSuggestions = false;
        
        console.log('✅ Tous les champs réinitialisés pour nouvelle recherche');
    }
    
    /**
     * ✅ NOUVELLE MÉTHODE - Vider seulement le numéro (pas de résultat)
     */
    resetNumberFieldOnly() {
        console.log('🔄 Réinitialisation du numéro seulement (pas de résultat)...');
        
        // Garder la rue sélectionnée
        // this.selectedStreet → GARDER
        // this.streetInput → GARDER
        
        // Vider seulement le numéro
        this.numberInput = '';
        
        // Le champ numéro reste actif pour nouvelle saisie
        this.isNumberDisabled = false;
        
        console.log('✅ Numéro vidé, rue conservée pour nouvelle tentative');
    }
    
    resetAllInputs() {
        this.streetInput = '';
        this.selectedStreet = '';
        this.numberInput = '';
        this.ownerInput = '';
        this.matriculeInput = '';
        this.lotInput = '';
        this.isNumberDisabled = true;
        this.hideStreetSuggestions();
    }
    
    resetStreetAndNumber() {
        this.streetInput = '';
        this.selectedStreet = '';
        this.numberInput = '';
        this.isNumberDisabled = true;
        this.hideStreetSuggestions();
        this.resetPropertyDetails();
    }
    
    resetNumber() {
        this.numberInput = '';
        this.isNumberDisabled = true;
    }
    
    resetPropertyDetails() {
        this.properties = [];
        this.showPropertyDetails = false;
        this.showNoResults = false;
    }
    
    hideStreetSuggestions() {
        this.showStreetSuggestions = false;
    }
    
    showToast(title, message, variant) {
        const evt = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant
        });
        this.dispatchEvent(evt);
    }
    
    showErrorToast(message) {
        this.showToast('Erreur', message, 'error');
    }
    
    /**
     * Getters pour les variantes des boutons
     */
    get addressButtonVariant() {
        return this.searchType === 'address' ? 'brand' : 'neutral';
    }
    
    get ownerButtonVariant() {
        return this.searchType === 'owner' ? 'brand' : 'neutral';
    }
    
    get matriculeButtonVariant() {
        return this.searchType === 'matricule' ? 'brand' : 'neutral';
    }
    
    get lotButtonVariant() {
        return this.searchType === 'lot' ? 'brand' : 'neutral';
    }
    
    /**
     * Getters pour l'affichage conditionnel
     */
    get isAddressSearch() {
        return this.searchType === 'address';
    }
    
    get isOwnerSearch() {
        return this.searchType === 'owner';
    }
    
    get isMatriculeSearch() {
        return this.searchType === 'matricule';
    }
    
    get isLotSearch() {
        return this.searchType === 'lot';
    }
    
    /**
     * Getter pour afficher la rue sélectionnée avec le bon format
     */
    get displaySelectedStreet() {
        if (this.selectedStreet) {
            return this.formatStreetName(this.selectedStreet);
        }
        return '';
    }
    

    
    /**
     * Colonnes pour le tableau RL0504
     */
    get rl0504Columns() {
        return [
            { label: 'Code tarification', fieldName: 'codeTarification', type: 'text' },
            { label: 'Numéro tarification', fieldName: 'numeroTarification', type: 'text' },
            { label: 'Code utilisation', fieldName: 'codeUtilisation', type: 'text' },
            { label: 'Valeur', fieldName: 'valeur', type: 'text' },
            { label: 'Type', fieldName: 'typeLabel', type: 'text' },
            { label: 'Pourcentage', fieldName: 'pourcentage', type: 'text' }
        ];
    }

    @api selectedPropertyId;
    @api selectedPropertyFullAddress;
    @api selectedPropertyOwnerName;
    @api selectedPropertyAssessedValue;
    @api selectedPropertyPostalCode;
    @api selectedPropertyMatricule;
    @api selectedPropertyData;

    notifyFlowOfPropertySelection(property) {
        try {
            if (!property) {
                return;
            }
            this.selectedPropertyId = property.id;
            this.selectedPropertyFullAddress = property.fullAddress;
            this.selectedPropertyOwnerName = property.rl0201Ax;
            this.selectedPropertyAssessedValue = property.rl0404A;
            this.selectedPropertyPostalCode = property.postalCode;
            this.selectedPropertyMatricule = property.rl0106A;
            this.selectedPropertyData = JSON.stringify({
                id: property.id,
                fullAddress: property.fullAddress,
                ownerName: property.rl0201Ax,
                assessedValue: property.rl0404A,
                postalCode: property.postalCode,
                matricule: property.rl0106A
            });
            this.dispatchEvent(new FlowAttributeChangeEvent('selectedPropertyId', this.selectedPropertyId));
            this.dispatchEvent(new FlowAttributeChangeEvent('selectedPropertyFullAddress', this.selectedPropertyFullAddress));
            this.dispatchEvent(new FlowAttributeChangeEvent('selectedPropertyOwnerName', this.selectedPropertyOwnerName));
            this.dispatchEvent(new FlowAttributeChangeEvent('selectedPropertyAssessedValue', this.selectedPropertyAssessedValue));
            this.dispatchEvent(new FlowAttributeChangeEvent('selectedPropertyPostalCode', this.selectedPropertyPostalCode));
            this.dispatchEvent(new FlowAttributeChangeEvent('selectedPropertyMatricule', this.selectedPropertyMatricule));
            this.dispatchEvent(new FlowAttributeChangeEvent('selectedPropertyData', this.selectedPropertyData));
        } catch (e) {
            // Intentionally no-op to avoid changing existing behavior
        }
    }
}
