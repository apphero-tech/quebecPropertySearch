import { LightningElement, track, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { FlowAttributeChangeEvent } from 'lightning/flowSupport';

// Imports Apex (méthodes fonctionnelles)
import getAvailableCollections from '@salesforce/apex/AddressSearchController.getAvailableCollections';
import getStreetSuggestions from '@salesforce/apex/AddressSearchController.getStreetSuggestions';
import getPropertyDetails from '@salesforce/apex/AddressSearchController.getPropertyDetails';
import searchByOwner from '@salesforce/apex/AddressSearchController.searchByOwner';
import searchOwnerSuggestions from '@salesforce/apex/AddressSearchController.searchOwnerSuggestions';
import searchByLot from '@salesforce/apex/AddressSearchController.searchByLot';
import searchByMatricule from '@salesforce/apex/AddressSearchController.searchByMatricule';

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
    // Formulaire propriétaire simplifié
    @track ownerForm = { name: '' };
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
    // Suggestions propriétaire (pattern identique rue)
    @track showOwnerSuggestions = false;
    @track ownerSuggestions = [];
    @track isOwnerLoading = false;
    @track isMouseOverOwnerDropdown = false;
    
    // États de chargement
    @track isLoadingMunicipalities = false;

    @track isLoadingProperty = false;
    
    // Timers pour debouncing
    streetSearchTimeout;
    // Timer suggestions propriétaire
    ownerSearchTimeout;
    
    connectedCallback() {
        // Initialiser la municipalité sélectionnée avec la valeur par défaut
        this.selectedMunicipality = this.defaultMunicipality;
        this.loadMunicipalities();
        // Owner UI init
        this.showOwnerSuggestions = false;
        this.ownerSuggestions = [];
    }
    
    /**
     * Charge la liste des municipalités disponibles
     */
    async loadMunicipalities() {
        try {
            this.isLoadingMunicipalities = true;
            
            // Vérifier la présence d'une clé API avant l'appel Apex
            if (!this.hasApiKey) {
                this.handleMissingApiKey();
                return;
            }
            
            const result = await getAvailableCollections({ apiKey: this.apiKey });
            
            // Traiter et formater les résultats
            this.processMunicipalityResults(result);
            
        } catch (error) {
            this.handleMunicipalityLoadError(error);
        } finally {
            this.isLoadingMunicipalities = false;
        }
    }

    /**
     * Gestion de l'absence de clé API
     */
    handleMissingApiKey() {
        this.municipalityOptions = [];
        this.showErrorToast('Clé API manquante. Veuillez configurer la clé API.');
    }

    /**
     * Traitement des résultats de municipalités
     */
    processMunicipalityResults(result) {
        const collections = this.extractCollectionsFromResult(result);
        
        this.municipalityOptions = collections.map(collection => ({
            label: collection,
            value: collection
        }));
        
        // Sélectionner une municipalité autorisée en priorité
        this.selectPreferredMunicipality();
    }

    /**
     * Extraction des collections depuis le résultat
     */
    extractCollectionsFromResult(result) {
        if (Array.isArray(result)) {
            return result;
        } else if (result && typeof result === 'object') {
            return Array.from(result);
        } else {
            return [];
        }
    }

    /**
     * Sélection de la municipalité préférée
     */
    selectPreferredMunicipality() {
        if (this.municipalityOptions.length > 0) {
            const allowedValues = new Set(this.municipalityOptions.map(o => o.value));
            const preferred = this.selectedMunicipality || this.defaultMunicipality;
            
            if (preferred && allowedValues.has(preferred)) {
                this.selectedMunicipality = preferred;
            } else {
                this.selectedMunicipality = this.municipalityOptions[0].value;
            }
        }
    }

    /**
     * Gestion des erreurs de chargement des municipalités
     */
    handleMunicipalityLoadError(error) {
        console.error('Erreur chargement municipalités:', error);
        this.showToast('Erreur', 'Impossible de charger les municipalités', 'error');
    }
    
    /**
     * Gestionnaire de changement de municipalité
     */
    handleMunicipalityChange(event) {
        this.selectedMunicipality = event.detail.value;
        this.resetFieldsForMunicipalityChange();
    }

    /**
     * Réinitialisation des champs lors du changement de municipalité
     */
    resetFieldsForMunicipalityChange() {
        this.resetStreetAndNumber();
        this.hideStreetSuggestions();
        this.hideOwnerSuggestions();
        this.clearResults();
    }
    
    /**
     * Gestionnaire de changement de type de recherche
     */
    handleSearchTypeChange(event) {
        this.searchType = event.target.value;
        this.clearResults();
        this.resetSearchFieldsForTypeChange();
    }

    /**
     * Réinitialisation des champs lors du changement de type de recherche
     */
    resetSearchFieldsForTypeChange() {
        this.resetAllInputs();
        this.hideStreetSuggestions();
        this.hideOwnerSuggestions();
    }
    
    /**
     * Gestionnaire de saisie pour la rue - SIMPLE
     */
    handleStreetInput(event) {
        const value = event.target.value;
        this.streetInput = value;
        
        // Vérifier si la rue sélectionnée a changé
        this.checkStreetSelectionChange(value);
        
        // Debouncing simple
        this.debounceStreetSearch(value);
    }

    /**
     * Vérification des changements de sélection de rue
     */
    checkStreetSelectionChange(value) {
        if (this.selectedStreet && value !== this.selectedStreet) {
            this.resetStreetSelection();
        }
    }

    /**
     * Réinitialisation de la sélection de rue
     */
    resetStreetSelection() {
        this.selectedStreet = '';
        this.isNumberDisabled = true;
        this.numberInput = '';
    }

    /**
     * Debouncing de la recherche de rue
     */
    debounceStreetSearch(value) {
        clearTimeout(this.streetSearchTimeout);
        
        if (this.hasValidStreetInput()) {
            this.streetSearchTimeout = setTimeout(() => {
                this.callStreetAPI(value);
            }, 300);
        } else {
            this.clearStreetSuggestions();
        }
    }
    
    /**
     * Gestionnaire de focus pour la rue - SIMPLE
     */
    handleStreetFocus() {
        if (this.hasValidStreetInput()) {
            this.callStreetAPI(this.streetInput);
        }
    }

    /**
     * Vérification si l'entrée de rue est valide
     */
    hasValidStreetInput() {
        return this.streetInput.length >= 2;
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
            'BO': 'Boulevard',
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
            
            return `${fullType} ${name}`;
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
        const municipality = this.selectedMunicipality || this.defaultMunicipality || 'Kirkland';
        const line2 = `${municipality} QC ${postalCode}`;
        
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
            this.hideStreetSuggestions();
            
            if (!this.hasApiKey) {
                this.showErrorToast('Clé API manquante. Veuillez configurer la clé API.');
                return;
            }
            
            const result = await getStreetSuggestions({ 
                searchTerm: searchTerm, 
                municipalityCode: this.selectedMunicipality, 
                apiKey: this.apiKey 
            });
            
            this.processStreetSuggestions(result);
            
        } catch (error) {
            this.handleStreetAPIError(error);
        }
    }

    /**
     * Traitement des suggestions de rue
     */
    processStreetSuggestions(result) {
        if (Array.isArray(result) && result.length > 0) {
            this.streetOptions = result.map(street => ({
                label: street,
                value: street
            }));
            this.showStreetSuggestions = true;
        } else {
            this.clearStreetSuggestions();
        }
    }

    /**
     * Gestion des erreurs de l'API des rues
     */
    handleStreetAPIError(error) {
        console.error('Error calling street API:', error);
        this.showErrorToast('Erreur lors de la recherche de rues');
        this.clearStreetSuggestions();
    }

    /**
     * Effacement des suggestions de rue
     */
    clearStreetSuggestions() {
        this.streetOptions = [];
        this.showStreetSuggestions = false;
    }
    
    /**
     * Sélection d'une suggestion de rue - FORMATÉE
     */
    handleStreetSelection(event) {
        const rawValue = event.currentTarget.dataset.value;
        
        // Formater pour l'affichage
        const formattedValue = this.formatStreetName(rawValue);
        
        this.updateStreetSelection(rawValue, formattedValue);
        this.activateNumberField();
        this.hideStreetSuggestions();
        this.resetPropertyDetails();
    }

    /**
     * Mise à jour de la sélection de rue
     */
    updateStreetSelection(rawValue, formattedValue) {
        this.selectedStreet = rawValue; // Garder l'original pour l'API
        this.streetInput = formattedValue; // Afficher le formaté
    }

    /**
     * Activation du champ numéro
     */
    activateNumberField() {
        this.isNumberDisabled = false;
    }
    
    /**
     * Gestionnaires pour les autres types de recherche
     */
    handleNumberInput(event) {
        this.numberInput = event.target.value;
    }
    
    handleOwnerNameChange(event) {
        const value = event.detail.value || '';
        this.ownerForm = { ...this.ownerForm, name: value };
        
        this.validateOwnerSearchForm();
        this.debounceOwnerSearch(value);
    }

    /**
     * Debouncing de la recherche de propriétaire
     */
    debounceOwnerSearch(value) {
        clearTimeout(this.ownerSearchTimeout);
        
        if (this.hasValidOwnerName()) {
            this.ownerSearchTimeout = setTimeout(() => this.searchOwnerSuggestions(), 300);
        } else {
            this.hideOwnerSuggestions();
        }
    }

    async searchOwnerSuggestions() {
        try {
            this.prepareOwnerSearch();
            
            if (!this.hasApiKey) {
                this.handleMissingApiKeyForOwner();
                return;
            }
            
            const result = await searchOwnerSuggestions({
                ownerName: this.ownerForm.name,
                municipalityCode: this.selectedMunicipality,
                apiKey: this.apiKey
            });

            this.processOwnerSuggestions(result);
            
        } catch (e) {
            this.handleOwnerSuggestionsError(e);
        } finally {
            this.isOwnerLoading = false;
        }
    }

    /**
     * Préparation de la recherche de propriétaire
     */
    prepareOwnerSearch() {
        this.isOwnerLoading = true;
        this.showOwnerSuggestions = false;
    }

    /**
     * Gestion de l'absence de clé API pour la recherche de propriétaire
     */
    handleMissingApiKeyForOwner() {
        this.isOwnerLoading = false;
        this.handleMissingApiKey();
    }

    /**
     * Traitement des suggestions de propriétaire
     */
    processOwnerSuggestions(result) {
        if (Array.isArray(result) && result.length > 0) {
            this.ownerSuggestions = result.map((s) => ({
                id: s.id || s.value,
                value: s.value,
                display: s.display || s.value
            }));
            this.showOwnerSuggestions = true;
        } else {
            this.clearOwnerSuggestions();
        }
    }

    /**
     * Gestion des erreurs de suggestions de propriétaire
     */
    handleOwnerSuggestionsError(error) {
        console.error('Erreur suggestions propriétaire:', error);
        // silencieux pour suggestions
        this.clearOwnerSuggestions();
    }

    /**
     * Effacement des suggestions de propriétaire
     */
    clearOwnerSuggestions() {
        this.ownerSuggestions = [];
        this.showOwnerSuggestions = false;
    }

    handleOwnerFocus() {
        if (this.hasValidOwnerName()) {
            this.searchOwnerSuggestions();
        }
    }

    handleOwnerBlur() {
        // identical pattern to street: allow dropdown to stay if mouse over
        setTimeout(() => {
            if (!this.isMouseOverOwnerDropdown) {
                this.hideOwnerSuggestions();
            }
        }, 150);
    }

    handleOwnerDropdownMouseEnter() {
        this.isMouseOverOwnerDropdown = true;
    }

    handleOwnerDropdownMouseLeave() {
        this.isMouseOverOwnerDropdown = false;
    }

    handleOwnerSelection(event) {
        const rawValue = event.currentTarget?.dataset?.ownername;
        const display = event.currentTarget?.dataset?.ownerdisplay || rawValue;
        
        if (!rawValue) return;
        
        // Parser le format "LAST, FIRST" si présent
        const parsedNames = this.parseOwnerNames(display);
        
        this.ownerForm = { 
            ...this.ownerForm, 
            name: display, 
            lastName: parsedNames.lastName, 
            firstName: parsedNames.firstName 
        };
        
        this.hideOwnerSuggestions();
        this.validateOwnerSearchForm();
    }

    /**
     * Parsing des noms de propriétaire au format "LAST, FIRST"
     */
    parseOwnerNames(display) {
        let lastName = display;
        let firstName = '';
        
        if (display && display.includes(', ')) {
            const parts = display.split(', ');
            if (parts.length >= 2) {
                lastName = parts[0];
                firstName = parts[1];
            }
        }
        
        return { lastName, firstName };
    }

    hideOwnerSuggestions() {
        this.showOwnerSuggestions = false;
        this.ownerSuggestions = [];
    }

    validateOwnerSearchForm() {
        // Validation automatique via le getter canSearch
        // Pas besoin de stocker l'état dans une propriété séparée
    }

    /**
     * Vérification si le nom du propriétaire est valide
     */
    hasValidOwnerName() {
        return (this.ownerForm?.name || '').trim().length >= 2;
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
        if (!this.canSearch) {
            this.showErrorToast('Veuillez remplir tous les champs requis pour la recherche');
            return;
        }
        
        this.performSearch();
    }
    
    /**
     * Vérification si la recherche peut être effectuée
     */
    get canSearch() {
        const validators = {
            'address': () => this.isAddressSearchValid(),
            'owner': () => this.isOwnerSearchValid(),
            'matricule': () => this.isMatriculeSearchValid(),
            'lot': () => this.isLotSearchValid()
        };
        
        const validator = validators[this.searchType];
        return validator ? validator() : false;
    }

    /**
     * Validation de la recherche par adresse
     */
    isAddressSearchValid() {
        return this.selectedStreet && this.numberInput.trim();
    }

    /**
     * Validation de la recherche par propriétaire
     */
    isOwnerSearchValid() {
        return (this.ownerForm?.name || '').trim().length >= 2;
    }

    /**
     * Validation de la recherche par matricule
     */
    isMatriculeSearchValid() {
        return this.matriculeInput.trim();
    }

    /**
     * Validation de la recherche par lot
     */
    isLotSearchValid() {
        return this.lotInput.trim();
    }
    
    /**
     * État du bouton de recherche
     */
    get searchDisabled() {
        return !this.hasApiKey || !this.canSearch || this.isLoadingProperty;
    }


    
    /**
     * Exécution de la recherche
     */
    async performSearch() {
        this.isLoadingProperty = true;
        this.clearResults();
        
        try {
            if (!this.hasApiKey) {
                this.isLoadingProperty = false;
                this.showErrorToast('Clé API manquante. Veuillez configurer la clé API.');
                return;
            }
    
            let result;
            
            if (this.searchType === 'address') {
                result = await this.searchByAddress();
            } else if (this.searchType === 'owner') {
                await this.searchByOwner();
                return; // La méthode gère déjà l'affichage
            } else if (this.searchType === 'matricule') {
                result = await this.searchByMatricule();
            } else if (this.searchType === 'lot') {
                result = await this.searchByLot();
            } else {
                this.handleUnknownSearchType();
                return;
            }
            
            // Traitement des résultats pour les recherches non-propriétaire
            this.processSearchResult(result);
            
        } catch (error) {
            this.handleSearchError(error);
        } finally {
            this.isLoadingProperty = false;
        }
    }

    /**
     * Recherche par adresse
     */
    async searchByAddress() {
        return await getPropertyDetails({
            streetName: this.selectedStreet,
            streetNumber: this.numberInput.trim(),
            municipalityCode: this.selectedMunicipality,
            apiKey: this.apiKey
        });
    }

    /**
     * Recherche par propriétaire
     */
    async searchByOwner() {
        const ownerName = (this.ownerForm?.name || '').trim();
        if (!ownerName) {
            this.isLoadingProperty = false;
            return;
        }

        const lastName = (this.ownerForm?.lastName || '').trim();
        const firstName = (this.ownerForm?.firstName || '').trim();
        
        const listResult = await searchByOwner({
            name: lastName || ownerName,
            firstName: firstName || '',
            ownerType: null,
            municipalityCode: this.selectedMunicipality,
            apiKey: this.apiKey
        });

        this.processOwnerSearchResult(listResult);
    }

    /**
     * Recherche par matricule
     */
    async searchByMatricule() {
        return await searchByMatricule({
            matriculeNumber: this.matriculeInput.trim(),
            municipalityCode: this.selectedMunicipality,
            apiKey: this.apiKey
        });
    }

    /**
     * Recherche par lot
     */
    async searchByLot() {
        return await searchByLot({
            lotNumber: this.lotInput.trim(),
            municipalityCode: this.selectedMunicipality,
            apiKey: this.apiKey
        });
    }

    /**
     * Traitement des résultats de recherche
     */
    processSearchResult(result) {
        if (result && result.RLUEx && result.RLUEx.RL0101) {
            // Propriété trouvée - Afficher les détails
            this.formatAndDisplayProperty(result);
            this.showPropertyDetails = true;
            this.showNoResults = false;
            
            // Vider tout pour nouvelle recherche
            this.resetAllSearchFields();
        } else {
            // Aucune propriété - Afficher message
            this.showPropertyDetails = false;
            this.showNoResults = true;
            this.noResultsMessage = `Aucune propriété trouvée. Vérifiez les informations saisies.`;
            
            // Vider seulement le numéro, garder la rue
            this.resetNumberFieldOnly();
        }
    }

    /**
     * Traitement des résultats de recherche par propriétaire
     */
    processOwnerSearchResult(listResult) {
        if (Array.isArray(listResult) && listResult.length > 0) {
            // Formater chaque propriété trouvée
            const mapped = listResult.map(doc => this.formatOwnerSearchProperty(doc)).filter(Boolean);
            
            this.properties = mapped;
            this.showPropertyDetails = true;
            this.showNoResults = false;
        } else {
            this.properties = [];
            this.showPropertyDetails = false;
            this.showNoResults = true;
            this.noResultsMessage = 'Aucune propriété trouvée pour ce propriétaire.';
        }
    }

    /**
     * Formatage d'une propriété de recherche par propriétaire
     */
    formatOwnerSearchProperty(doc) {
        try {
            return {
                id: doc._id || 'unknown',
                addressLine1: this.formatOwnerSearchAddress(doc),
                addressLine2: this.formatOwnerSearchMunicipality(doc),
                fullAddress: this.formatOwnerSearchFullAddress(doc),
                // Autres propriétés nécessaires pour l'affichage
                rl0101Ax: this.extractOwnerSearchValue(doc, 'RLUEx.RL0101.RL0101x.RL0101Ax'),
                rl0101Gx: this.extractOwnerSearchValue(doc, 'RLUEx.RL0101.RL0101x.RL0101Gx'),
                rl0101Ex: this.extractOwnerSearchValue(doc, 'RLUEx.RL0101.RL0101x.RL0101Ex'),
                rl0201Ax: this.extractOwnerSearchValue(doc, 'RLUEx.RL0201.RL0201x.RL0201Ax'),
                rl0201Bx: this.extractOwnerSearchValue(doc, 'RLUEx.RL0201.RL0201x.RL0201Bx'),
                rl0106A: this.extractOwnerSearchValue(doc, 'RLUEx.RL0106A'),
                rl0404A: this.extractOwnerSearchValue(doc, 'RLUEx.RL0404A'),
                postalCode: this.extractOwnerSearchValue(doc, 'RLUEx.RL0101.RL0101x.POSTALCODE')
            };
        } catch (error) {
            console.error('Error formatting owner search result:', error);
            return null;
        }
    }

    /**
     * Gestion des types de recherche inconnus
     */
    handleUnknownSearchType() {
        this.showNoResults = true;
        this.noResultsMessage = 'Type de recherche non pris en charge';
    }

    /**
     * Gestion des erreurs de recherche
     */
    handleSearchError(error) {
        if (this.searchType === 'owner') {
            console.error('Search owner error:', (error && (error.body && error.body.message)) ? error.body.message : error);
        } else {
            console.error('Search error:', error);
        }
        
        this.showToast('Erreur', 'Erreur lors de la recherche', 'error');
        this.showPropertyDetails = false;
        this.showNoResults = true;
        this.noResultsMessage = 'Erreur lors de la recherche';
        
        // Ne pas toucher aux champs de la recherche propriétaire
        if (this.searchType !== 'owner') {
            this.resetNumberFieldOnly();
        }
    }
    
    /**
     * Formatage et affichage des propriétés (MAPPING MONGODB COMPLET)
     */
    formatAndDisplayProperty(mongoData) {
        try {
            // Extraire les données MongoDB selon la structure exacte
            const extractedData = this.extractMongoData(mongoData);
            
            // Créer l'objet propriété formaté avec TOUS les champs
            const property = {
                // === INFORMATIONS GÉNÉRALES ===
                ...this.extractGeneralInfo(mongoData),
                
                // === ADRESSE FORMAT CANADA POSTE ===
                ...this.formatCanadaPostAddress(mongoData),
                
                // === SECTION 1 : IDENTIFICATION DE L'UNITÉ D'ÉVALUATION ===
                ...this.extractIdentificationInfo(extractedData.rl0101x, extractedData.rl0103x, extractedData.rl0104, mongoData),
                
                // === SECTION 2 : IDENTIFICATION DU PROPRIÉTAIRE ===
                // Traitement des propriétaires avec TOUS les champs MongoDB
                ...this.processOwnersComplete(extractedData.rl0201x, extractedData.rl0201),
                
                // === SECTION 3 : CARACTÉRISTIQUES DE L'UNITÉ D'ÉVALUATION ===
                ...this.extractCharacteristicsInfo(mongoData),
                
                // === SECTION 4 : VALEURS ET ÉVALUATION ===
                ...this.extractValuationInfo(mongoData),
                
                // === SECTION 5 : RENSEIGNEMENTS ANNEXABLES ===
                ...this.extractAnnexableInfo(extractedData.rl0504x, extractedData.annexesUnite, extractedData.annexesGlobal),
                
                // === SECTION 6 : RÉPARTITIONS FISCALES ===
                ...this.extractFiscalInfo(extractedData.rl0502, extractedData.rl0503),
                
                // === SECTION 7 : SECTIONS SPÉCIALES RLZU ===
                ...this.extractSpecialSections(extractedData.rlzu3001, extractedData.rlzu5001)
            };
            
            // Mettre à jour l'interface utilisateur
            this.updateUIWithProperty(property);
            
        } catch (error) {
            console.error('Error formatting property:', error);
            this.showErrorToast('Erreur lors du formatage des données de propriété');
        }
    }

    /**
     * Extraction des données MongoDB principales
     */
    extractMongoData(mongoData) {
        const rluex = mongoData.RLUEx || {};
        const rl0101 = rluex.RL0101 || {};
        const rl0101x = rl0101.RL0101x || {};
        const rl0103 = rluex.RL0103 || {};
        const rl0103x = rl0103.RL0103x || {};
        const rl0104 = rluex.RL0104 || {};
        const rl0201 = rluex.RL0201 || {};
        const rl0201x = rl0201.RL0201x || {};
        
        // === SECTIONS FISCALES COMPLÈTES ===
        const rl0502 = rluex.RL0502 || {};
        const rl0503 = rluex.RL0503 || {};
        const rl0504 = rluex.RL0504 || {};
        const rl0504x = rl0504.RL0504x || [];
        
        // === SECTIONS ANNEXES COMPLÈTES ===
        const annexesUnite = rluex.RENSEIGNEMENTS_ANNEXABLES_UNITE || {};
        const annexesGlobal = mongoData.RENSEIGNEMENTS_ANNEXABLES_GLOBAL || {};
        
        // === SECTIONS SPÉCIALES RLZU ===
        const rlzu3001 = annexesGlobal.RLZU3001 || {};
        const rlzu5001 = annexesGlobal.RLZU5001 || {};
        
        return {
            rl0101x, rl0103x, rl0104, rl0201x, rl0201, 
            rl0502, rl0503, rl0504x, 
            annexesUnite, annexesGlobal, rlzu3001, rlzu5001
        };
    }

    /**
     * Mise à jour de l'interface utilisateur avec la propriété
     */
    updateUIWithProperty(property) {
        this.properties = [property];
        this.showPropertyDetails = true;
        this.showNoResults = false;
        
        // Notifier le Flow Builder si nécessaire
        this.notifyFlowOfPropertySelection(property);
    }

    /**
     * Extraction des informations générales
     */
    extractGeneralInfo(mongoData) {
        return {
            // === INFORMATIONS GÉNÉRALES COMPLÈTES ===
            id: mongoData._id || 'unknown',
            version: this.getSecureValue(mongoData, 'VERSION'),
            codeMunicipalite: this.getSecureValue(mongoData, 'RLM01A'),
            anneeRole: this.getSecureValue(mongoData, 'RLM02A'),
            
            // === INFORMATIONS SUPPLÉMENTAIRES ===
            rlm03A: this.getSecureValue(mongoData, 'RLM03A'), // Code type rôle
            rlm04A: this.getSecureValue(mongoData, 'RLM04A'), // Date création rôle
            rlm05A: this.getSecureValue(mongoData, 'RLM05A'), // Code statut rôle
            rlm06A: this.getSecureValue(mongoData, 'RLM06A'), // Code version rôle
            rlm07A: this.getSecureValue(mongoData, 'RLM07A')  // Code organisme responsable
        };
    }

    /**
     * Extraction des informations d'identification
     */
    extractIdentificationInfo(rl0101x, rl0103x, rl0104, rluex) {
        return {
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
            
            // === AUTRES INFORMATIONS D'IDENTIFICATION COMPLÈTES ===
            rl0105A: this.getSecureValue(rluex, 'RL0105A'), // Code d'utilisation
            rl0106A: this.getSecureValue(rluex, 'RL0106A'), // Matricule
            rl0107A: this.getSecureValue(rluex, 'RL0107A'), // Code de l'évaluateur
            
            // === INFORMATIONS SUPPLÉMENTAIRES ===
            rl0108A: this.getSecureValue(rluex, 'RL0108A'), // Code type propriété
            rl0109A: this.getSecureValue(rluex, 'RL0109A'), // Code statut propriété
            rl0110A: this.getSecureValue(rluex, 'RL0110A'), // Code zone spéciale
            rl0111A: this.getSecureValue(rluex, 'RL0111A'), // Code restriction
            rl0112A: this.getSecureValue(rluex, 'RL0112A')  // Code environnement
        };
    }

    /**
     * Extraction des informations du propriétaire - VERSION COMPLÈTE
     * Traite TOUS les champs MongoDB disponibles
     */
    extractOwnerInfo(rl0201x, rl0201) {
        return {
            // === TRAITEMENT PROPRIÉTAIRES MULTIPLES (RL0201x peut être objet ou tableau) ===
            // Groupe Identité du propriétaire (RL0201x) - TOUS les champs
            rl0201Ax: this.getSecureValue(rl0201x, 'RL0201Ax'), // Nom légal du propriétaire
            rl0201Bx: this.getSecureValue(rl0201x, 'RL0201Bx'), // Prénom du propriétaire
            rl0201Cx: this.getSecureValue(rl0201x, 'RL0201Cx'), // Adresse postale non structurée
            rl0201Dx: this.getSecureValue(rl0201x, 'RL0201Dx'), // Municipalité adresse postale
            rl0201Ex: this.getSecureValue(rl0201x, 'RL0201Ex'), // Code postal adresse postale
            rl0201Fx: this.getSecureValue(rl0201x, 'RL0201Fx'), // Complément d'adresse ⚠️ SOUVENT MANQUANT
            rl0201Gx: this.getSecureValue(rl0201x, 'RL0201Gx'), // Date inscription au rôle
            rl0201Hx: this.getSecureValue(rl0201x, 'RL0201Hx'), // Statut propriétaire imposition scolaire
            rl0201Ix: this.getSecureValue(rl0201x, 'RL0201Ix'), // Numéro civique adresse postale
            rl0201Jx: this.getSecureValue(rl0201x, 'RL0201Jx'), // Fraction adresse postale ⚠️ SOUVENT MANQUANT
            rl0201Kx: this.getSecureValue(rl0201x, 'RL0201Kx'), // Code générique adresse postale
            rl0201Lx: this.getSecureValue(rl0201x, 'RL0201Lx'), // Code de lien adresse postale ⚠️ SOUVENT MANQUANT
            rl0201Mx: this.getSecureValue(rl0201x, 'RL0201Mx'), // Nom voie publique adresse postale
            rl0201Nx: this.getSecureValue(rl0201x, 'RL0201Nx'), // Point cardinal adresse postale ⚠️ SOUVENT MANQUANT
            rl0201Ox: this.getSecureValue(rl0201x, 'RL0201Ox'), // Numéro appartement/local ⚠️ SOUVENT MANQUANT
            rl0201Px: this.getSecureValue(rl0201x, 'RL0201Px'), // Fraction appartement/local ⚠️ SOUVENT MANQUANT
            rl0201Qx: this.getSecureValue(rl0201x, 'RL0201Qx'), // Province/état ⚠️ SOUVENT MANQUANT
            rl0201Rx: this.getSecureValue(rl0201x, 'RL0201Rx'), // Pays ⚠️ SOUVENT MANQUANT
            rl0201Sx: this.getSecureValue(rl0201x, 'RL0201Sx'), // Case postale ⚠️ SOUVENT MANQUANT
            rl0201Tx: this.getSecureValue(rl0201x, 'RL0201Tx'), // Succursale postale ⚠️ SOUVENT MANQUANT
            
            // Informations supplémentaires propriétaire
            rl0201U: this.getSecureValue(rl0201, 'RL0201U') // Code des conditions d'inscription
        };
    }

    /**
     * Traitement complet des propriétaires avec TOUS les champs MongoDB
     * Gère les propriétaires multiples et formate les adresses complètes
     */
    processOwnersComplete(rl0201x, rl0201) {
        try {
            const proprietaireData = rl0201x;
            const proprietaires = Array.isArray(proprietaireData)
                ? proprietaireData
                : (proprietaireData ? [proprietaireData] : []);

            const processedOwners = proprietaires
                .map((prop, index) => {
                    if (!prop) return null;

                    // Nom et prénom
                    const nom = prop.RL0201Ax || 'Non disponible';
                    const prenom = prop.RL0201Bx || '';
                    
                    // Statut et dates
                    const statutCode = prop.RL0201Hx;
                    const dateInscription = prop.RL0201Gx || '';

                    // ADRESSE COMPLETE DU PROPRIÉTAIRE
                    const adresseComplete = {
                        // Adresse structurée
                        numeroCivique: prop.RL0201Ix || '',
                        fractionAdresse: prop.RL0201Jx || '', // ✅ MANQUANT
                        codeGenerique: prop.RL0201Kx || '',
                        codeLien: prop.RL0201Lx || '', // ✅ MANQUANT
                        nomVoiePublique: prop.RL0201Mx || '',
                        pointCardinal: prop.RL0201Nx || '', // ✅ MANQUANT
                        numeroAppartement: prop.RL0201Ox || '', // ✅ MANQUANT
                        fractionAppartement: prop.RL0201Px || '', // ✅ MANQUANT
                        
                        // Adresse non structurée
                        adresseNonStructuree: prop.RL0201Cx || '',
                        
                        // Localisation
                        municipalite: prop.RL0201Dx || '',
                        codePostal: prop.RL0201Ex || '',
                        province: prop.RL0201Qx || '', // ✅ MANQUANT (souvent "QC")
                        pays: prop.RL0201Rx || '', // ✅ MANQUANT (souvent "CA")
                        
                        // Compléments
                        complementAdresse: prop.RL0201Fx || '', // ✅ MANQUANT
                        casePostale: prop.RL0201Sx || '', // ✅ MANQUANT
                        succursalePostale: prop.RL0201Tx || '' // ✅ MANQUANT
                    };

                    return {
                        id: `owner_${index + 1}`,
                        fullName: prenom ? `${nom}, ${prenom}` : nom,
                        nom: nom,
                        prenom: prenom,
                        statutCode: statutCode,
                        statutLabel: this.getStatutLabel(statutCode),
                        dateInscription: dateInscription,
                        dateInscriptionFormatted: this.formatDate(dateInscription),
                        
                        // ADRESSE COMPLÈTE
                        adresse: adresseComplete,
                        
                        // Adresse formatée pour affichage
                        adresseFormatee: this.formatOwnerAddress(adresseComplete),
                        
                        // Champs existants (pour compatibilité)
                        adressePostale: prop.RL0201Cx || '',
                        ville: prop.RL0201Dx || '',
                        codePostal: prop.RL0201Ex || ''
                    };
                })
                .filter(owner => owner !== null);

            // Retourner l'objet avec tous les propriétaires traités
            return {
                owners: processedOwners,
                hasMultipleOwners: processedOwners.length > 1,
                hasTwoOwners: processedOwners.length === 2,
                conditionInscription: this.getSecureValue(rl0201, 'RL0201U'),
                hasSpecialCondition: this.getSecureValue(rl0201, 'RL0201U') !== '1',
                conditionInscriptionText: this.getConditionInscriptionLabel(this.getSecureValue(rl0201, 'RL0201U'))
            };

        } catch (error) {
            console.error('Erreur traitement propriétaires:', error);
            // En cas d'erreur, format inattendu est rencontré
            return {
                owners: [],
                hasMultipleOwners: false,
                hasTwoOwners: false,
                conditionInscription: this.getSecureValue(rl0201, 'RL0201U'),
                hasSpecialCondition: false,
                conditionInscriptionText: this.getSecureValue(rl0201, 'RL0201U')
            };
        }
    }

    /**
     * Extraction des caractéristiques de l'unité d'évaluation
     */
    extractCharacteristicsInfo(rluex) {
        return {
            // === CARACTÉRISTIQUES DU TERRAIN ===
            rl0301A: this.getSecureValue(rluex, 'RL0301A'), // Dimension linéaire/mesure frontale
            rl0302A: this.getSecureValue(rluex, 'RL0302A'), // Superficie du terrain
            rl0303A: this.getSecureValue(rluex, 'RL0303A'), // Code zonage agricole
            rl0304A: this.getSecureValue(rluex, 'RL0304A'), // Superficie exploitation agricole totale
            rl0305A: this.getSecureValue(rluex, 'RL0305A'), // Superficie exploitation agricole en zone
            rl0314A: this.getSecureValue(rluex, 'RL0314A'), // Superficie imposition maximale
            rl0315A: this.getSecureValue(rluex, 'RL0315A'), // Superficie vocation forestière totale
            rl0316A: this.getSecureValue(rluex, 'RL0316A'), // Superficie vocation forestière en zone agricole
            rl0320A: this.getSecureValue(rluex, 'RL0320A'), // Superficie agricole exploitable non exploitée
            
            // === CARACTÉRISTIQUES DU BÂTIMENT PRINCIPAL ===
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
            
            // === CARACTÉRISTIQUES SUPPLÉMENTAIRES ===
            rl0319A: this.getSecureValue(rluex, 'RL0319A'), // Code qualité construction
            rl0321A: this.getSecureValue(rluex, 'RL0321A'), // Code accessibilité
            rl0322A: this.getSecureValue(rluex, 'RL0322A'), // Code équipements spéciaux
            rl0323A: this.getSecureValue(rluex, 'RL0323A'), // Code restrictions
            rl0324A: this.getSecureValue(rluex, 'RL0324A')  // Code environnement
        };
    }

    /**
     * Extraction des informations de valorisation
     */
    extractValuationInfo(rluex) {
        return {
            // === VALEURS FONCIÈRES COMPLÈTES ===
            rl0401A: this.getSecureValue(rluex, 'RL0401A'), // Date d'évaluation
            rl0402A: this.getSecureValue(rluex, 'RL0402A'), // Valeur du terrain
            rl0403A: this.getSecureValue(rluex, 'RL0403A'), // Valeur du bâtiment
            rl0404A: this.getSecureValue(rluex, 'RL0404A'), // Valeur totale
            rl0405A: this.getSecureValue(rluex, 'RL0405A'), // Valeur imposable
            
            // === INFORMATIONS FISCALES COMPLÈTES ===
            rl0406A: this.getSecureValue(rluex, 'RL0406A'), // Code d'exonération
            rl0407A: this.getSecureValue(rluex, 'RL0407A'), // Code de classification
            rl0408A: this.getSecureValue(rluex, 'RL0408A'), // Code de facteur d'ajustement
            rl0409A: this.getSecureValue(rluex, 'RL0409A'), // Facteur d'ajustement
            rl0410A: this.getSecureValue(rluex, 'RL0410A'), // Code de facteur d'ajustement
            
            // === VALEURS SUPPLÉMENTAIRES ===
            rl0411A: this.getSecureValue(rluex, 'RL0411A'), // Valeur unitaire terrain
            rl0412A: this.getSecureValue(rluex, 'RL0412A'), // Valeur unitaire bâtiment
            rl0413A: this.getSecureValue(rluex, 'RL0413A'), // Valeur de marché estimée
            rl0414A: this.getSecureValue(rluex, 'RL0414A'), // Valeur d'assurance
            rl0415A: this.getSecureValue(rluex, 'RL0415A')  // Valeur de remplacement
        };
    }

    /**
     * Extraction des renseignements annexables
     */
    extractAnnexableInfo(rl0504x, annexesUnite, annexesGlobal) {
        return {
            // Renseignements annexables de l'unité
            rl0504x: this.formatRL0504Details(rl0504x),
            annexesUnite: annexesUnite,
            annexesGlobal: annexesGlobal
        };
    }

    /**
     * Extraction des informations fiscales et répartitions
     */
    extractFiscalInfo(rl0502, rl0503) {
        return {
            // === RÉPARTITIONS FISCALES COMPLÈTES ===
            rl0502A: this.getSecureValue(rl0502, 'RL0502A'), // Pourcentage imposable
            rl0503A: this.getSecureValue(rl0503, 'RL0503A'), // Code tarification
            
            // Informations supplémentaires fiscales
            rl0502B: this.getSecureValue(rl0502, 'RL0502B'), // Code d'exonération
            rl0502C: this.getSecureValue(rl0502, 'RL0502C'), // Date d'exonération
            rl0503B: this.getSecureValue(rl0503, 'RL0503B'), // Description tarification
            rl0503C: this.getSecureValue(rl0503, 'RL0503C')  // Facteur d'ajustement
        };
    }

    /**
     * Extraction des sections spéciales RLZU
     */
    extractSpecialSections(rlzu3001, rlzu5001) {
        return {
            // === SECTIONS SPÉCIALES RLZU ===
            rlzu3001A: this.getSecureValue(rlzu3001, 'RLZU3001A'), // Autre superficie
            rlzu3001B: this.getSecureValue(rlzu3001, 'RLZU3001B'), // Type superficie
            rlzu3001C: this.getSecureValue(rlzu3001, 'RLZU3001C'), // Description superficie
            
            rlzu5001A: this.getSecureValue(rlzu5001, 'RLZU5001A'), // Pourcentage copropriété
            rlzu5001B: this.getSecureValue(rlzu5001, 'RLZU5001B'), // Type copropriété
            rlzu5001C: this.getSecureValue(rlzu5001, 'RLZU5001C')  // Description copropriété
        };
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
     * Méthode unifiée pour réinitialiser les champs selon le type spécifié
     * @param {string} type - Type de reset: 'all', 'number', 'inputs', 'street', 'results'
     */
    resetFields(type = 'all') {
        switch (type) {
            case 'all':
                this.resetAllFields();
                break;
            case 'number':
                this.resetNumberField();
                break;
            case 'inputs':
                this.resetInputFields();
                break;
            case 'street':
                this.resetStreetFields();
                break;
            case 'results':
                this.resetResultFields();
                break;
        }
    }

    /**
     * Réinitialisation de tous les champs
     */
    resetAllFields() {
        this.streetInput = '';
        this.selectedStreet = '';
        this.numberInput = '';
        this.ownerForm = { name: '', firstName: '', lastName: '' };
        this.matriculeInput = '';
        this.lotInput = '';
        this.isNumberDisabled = true;
        this.streetOptions = [];
        this.showStreetSuggestions = false;
        this.showOwnerSuggestions = false;
        this.ownerSuggestions = [];
    }

    /**
     * Réinitialisation du champ numéro
     */
    resetNumberField() {
        this.numberInput = '';
        this.isNumberDisabled = false;
    }

    /**
     * Réinitialisation des champs de saisie
     */
    resetInputFields() {
        this.streetInput = '';
        this.selectedStreet = '';
        this.numberInput = '';
        this.ownerForm = { name: '', firstName: '', lastName: '' };
        this.matriculeInput = '';
        this.lotInput = '';
        this.isNumberDisabled = true;
        this.hideStreetSuggestions();
    }

    /**
     * Réinitialisation des champs de rue
     */
    resetStreetFields() {
        this.streetInput = '';
        this.selectedStreet = '';
        this.numberInput = '';
        this.isNumberDisabled = true;
        this.hideStreetSuggestions();
        this.resetPropertyDetails();
    }

    /**
     * Réinitialisation des champs de résultats
     */
    resetResultFields() {
        this.properties = [];
        this.showPropertyDetails = false;
        this.showNoResults = false;
    }
    
    // Méthodes de compatibilité pour maintenir l'API existante
    resetAllSearchFields() {
        this.resetFields('all');
    }
    
    resetNumberFieldOnly() {
        this.resetFields('number');
    }
    
    resetAllInputs() {
        this.resetFields('inputs');
    }
    
    resetStreetAndNumber() {
        this.resetFields('street');
    }
    
    resetNumber() {
        this.resetFields('number');
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
     * Vérifie la présence d'une clé API valide
     */
    get hasApiKey() {
        const key = this.apiKey;
        if (typeof key === 'string') {
            return key.trim().length > 0;
        }
        return Boolean(key);
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
            
            // Mettre à jour les propriétés sélectionnées
            this.updateSelectedPropertyValues(property);
            
            // Notifier le Flow Builder
            this.dispatchFlowEvents();
            
        } catch (e) {
            // Intentionally no-op to avoid changing existing behavior
        }
    }

    /**
     * Mise à jour des valeurs de propriété sélectionnée
     */
    updateSelectedPropertyValues(property) {
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
    }

    /**
     * Dispatch des événements Flow
     */
    dispatchFlowEvents() {
        const events = [
            { name: 'selectedPropertyId', value: this.selectedPropertyId },
            { name: 'selectedPropertyFullAddress', value: this.selectedPropertyFullAddress },
            { name: 'selectedPropertyOwnerName', value: this.selectedPropertyOwnerName },
            { name: 'selectedPropertyAssessedValue', value: this.selectedPropertyAssessedValue },
            { name: 'selectedPropertyPostalCode', value: this.selectedPropertyPostalCode },
            { name: 'selectedPropertyMatricule', value: this.selectedPropertyMatricule },
            { name: 'selectedPropertyData', value: this.selectedPropertyData }
        ];
        
        events.forEach(event => {
            this.dispatchEvent(new FlowAttributeChangeEvent(event.name, event.value));
        });
    }

    /**
     * Méthodes utilitaires pour la recherche par propriétaire
     */
    
    /**
     * Extrait une valeur d'un document MongoDB en utilisant un chemin pointé
     * @param {Object} doc - Le document MongoDB
     * @param {string} path - Le chemin pointé (ex: 'RLUEx.RL0101.RL0101x.RL0101Ax')
     * @returns {string} La valeur extraite ou 'Non disponible'
     */
    extractOwnerSearchValue(doc, path) {
        try {
            const keys = path.split('.');
            let value = doc;
            
            for (const key of keys) {
                if (value && typeof value === 'object' && key in value) {
                    value = value[key];
                } else {
                    return 'Non disponible';
                }
            }
            
            return value !== null && value !== undefined ? String(value) : 'Non disponible';
        } catch (error) {
            console.error(`Error extracting value for path ${path}:`, error);
            return 'Non disponible';
        }
    }
    
    /**
     * Formate l'adresse pour la recherche par propriétaire
     * @param {Object} doc - Le document MongoDB
     * @returns {string} L'adresse formatée
     */
    formatOwnerSearchAddress(doc) {
        try {
            const number = this.extractOwnerSearchValue(doc, 'RLUEx.RL0101.RL0101x.RL0101Ax');
            const streetType = this.extractOwnerSearchValue(doc, 'RLUEx.RL0101.RL0101x.RL0101Ex');
            const streetName = this.extractOwnerSearchValue(doc, 'RLUEx.RL0101.RL0101x.RL0101Gx');
            
            if (number === 'Non disponible' || streetName === 'Non disponible') {
                return 'Adresse non disponible';
            }
            
            const fullStreetType = this.getFullStreetType(streetType);
            return `${number} ${fullStreetType} ${streetName}`;
        } catch (error) {
            console.error('Error formatting owner search address:', error);
            return 'Adresse non disponible';
        }
    }
    
    /**
     * Formate la municipalité pour la recherche par propriétaire
     * @param {Object} doc - Le document MongoDB
     * @returns {string} La municipalité formatée
     */
    formatOwnerSearchMunicipality(doc) {
        try {
            const municipality = this.extractOwnerSearchValue(doc, 'RLUEx.RL0201.RL0201x.RL0201Dx');
            const postalCode = this.extractOwnerSearchValue(doc, 'RLUEx.RL0101.RL0101x.POSTALCODE');
            
            if (municipality === 'Non disponible') {
                return 'Municipalité non disponible';
            }
            
            if (postalCode !== 'Non disponible') {
                return `${municipality} QC ${postalCode}`;
            }
            
            return `${municipality} QC`;
        } catch (error) {
            console.error('Error formatting owner search municipality:', error);
            return 'Municipalité non disponible';
        }
    }
    
    /**
     * Formate l'adresse complète pour la recherche par propriétaire
     * @param {Object} doc - Le document MongoDB
     * @returns {string} L'adresse complète formatée
     */
    formatOwnerSearchFullAddress(doc) {
        try {
            const address = this.formatOwnerSearchAddress(doc);
            const municipality = this.formatOwnerSearchMunicipality(doc);
            
            if (address === 'Adresse non disponible' || municipality === 'Municipalité non disponible') {
                return 'Adresse complète non disponible';
            }
            
            return `${address}, ${municipality}`;
        } catch (error) {
            console.error('Error formatting owner search full address:', error);
            return 'Adresse complète non disponible';
        }
    }

    /**
     * Formatage de l'adresse du propriétaire
     */
    formatOwnerAddress(adresse) {
        if (!adresse) return 'Non disponible';
        
        let parts = [];
        
        // Numéro civique + fraction
        if (adresse.numeroCivique) {
            let numero = adresse.numeroCivique;
            if (adresse.fractionAdresse) {
                numero += `-${adresse.fractionAdresse}`;
            }
            parts.push(numero);
        }
        
        // Voie publique avec code générique
        if (adresse.nomVoiePublique) {
            let voie = '';
            if (adresse.codeGenerique && adresse.codeGenerique !== 'BO') {
                voie = `${adresse.codeGenerique} ${adresse.nomVoiePublique}`;
            } else {
                voie = `BOUL ${adresse.nomVoiePublique}`;
            }
            
            // Point cardinal
            if (adresse.pointCardinal) {
                voie += ` ${adresse.pointCardinal}`;
            }
            
            parts.push(voie);
        }
        
        // Appartement/local
        if (adresse.numeroAppartement) {
            let appt = `App. ${adresse.numeroAppartement}`;
            if (adresse.fractionAppartement) {
                appt += `-${adresse.fractionAppartement}`;
            }
            parts.push(appt);
        }
        
        // Complément d'adresse
        if (adresse.complementAdresse) {
            parts.push(adresse.complementAdresse);
        }
        
        let adresseComplete = parts.join(' ');
        
        // Ajouter ville, province, code postal
        if (adresse.municipalite) {
            adresseComplete += `, ${adresse.municipalite}`;
        }
        
        if (adresse.province && adresse.province !== 'QC') {
            adresseComplete += `, ${adresse.province}`;
        }
        
        if (adresse.codePostal) {
            adresseComplete += ` ${adresse.codePostal}`;
        }
        
        if (adresse.pays && adresse.pays !== 'CA') {
            adresseComplete += `, ${adresse.pays}`;
        }
        
        return adresseComplete || adresse.adresseNonStructuree || 'Non disponible';
    }

    /**
     * Obtenir le libellé du statut du propriétaire
     */
    getStatutLabel(statutCode) {
        const statuts = {
            '1': 'Personne physique',
            '2': 'Personne morale',
            '3': 'Gouvernement',
            '4': 'Organisme religieux',
            '5': 'Fiducie'
        };
        return statuts[statutCode] || `Code ${statutCode}`;
    }

    /**
     * Obtenir le libellé de la condition d'inscription
     */
    getConditionInscriptionLabel(code) {
        const conditions = {
            '1': 'Inscription normale',
            '2': 'Inscription conditionnelle',
            '3': 'Inscription provisoire',
            '4': 'Inscription en litige'
        };
        return conditions[code] || `Condition ${code}`;
    }
}
