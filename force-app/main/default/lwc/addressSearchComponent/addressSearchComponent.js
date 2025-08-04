import { LightningElement, track, wire, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

// Imports Apex (méthodes fonctionnelles)
import getAvailableCollections from '@salesforce/apex/AddressSearchController.getAvailableCollections';
import getStreetSuggestions from '@salesforce/apex/AddressSearchController.getStreetSuggestions';
import getPropertyDetails from '@salesforce/apex/AddressSearchController.getPropertyDetails';

export default class AddressSearchComponent extends LightningElement {
    
    // Paramètres configurables
    @api apiKey;
    @api defaultMunicipality = 'Kirkland';
    
    // États des données
    @track municipalityOptions = [];
    @track selectedMunicipality;
    @track streetInput = '';
    @track selectedStreet = '';
    @track numberInput = '';
    
    // États UI
    @track showStreetSuggestions = false;
    @track streetSuggestions = [];
    @track isNumberDisabled = true;
    @track showPropertyDetails = false;
    @track showNoResults = false;
    @track noResultsMessage = '';
    @track propertyDetails = null;
    @track showAvailableNumbers = false;
    @track availableNumbers = [];
    @track isLoadingNumbers = false;
    @track propertyAddress = '';
    @track propertyOwner = '';
    @track propertyValue = '';
    @track propertyPostalCode = '';
    @track propertyLandValue = '';
    @track propertyBuildingValue = '';
    @track propertyTotalValue = '';
    @track propertyAcquisitionDate = '';
    @track propertyEvaluationDate = '';
    
    // États de chargement
    @track isLoadingMunicipalities = false;
    @track isLoadingStreets = false;
    @track isLoadingProperty = false;
    
    // Timers pour debouncing
    streetSearchTimeout;
    searchTimeout;
    
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
        console.log('Municipalité sélectionnée:', this.selectedMunicipality);
    }
    
    /**
     * Gestionnaire de saisie pour la rue
     */
    handleStreetInput(event) {
        const value = event.target.value;
        this.streetInput = value;
        this.selectedStreet = '';
        this.resetNumber();
        
        // Debouncing pour éviter trop d'appels API
        clearTimeout(this.streetSearchTimeout);
        this.streetSearchTimeout = setTimeout(() => {
            if (value.length >= 2) {
                this.searchStreets(value);
            } else {
                this.hideStreetSuggestions();
            }
        }, 300);
    }
    
    /**
     * Recherche des suggestions de rues
     */
    async searchStreets(searchTerm) {
        try {
            this.isLoadingStreets = true;
            this.showStreetSuggestions = false;
            
            console.log('=== DEBUG searchStreets ===');
            console.log('Search term:', searchTerm);
            console.log('Selected municipality:', this.selectedMunicipality);
            console.log('API key:', this.apiKey);
            console.log('API key length:', this.apiKey ? this.apiKey.length : 0);
            
            const result = await getStreetSuggestions({ 
                searchTerm: searchTerm, 
                municipalityCode: this.selectedMunicipality, 
                apiKey: this.apiKey 
            });
            
            console.log('Raw Apex result for streets:', result);
            console.log('Type of result:', typeof result);
            console.log('Is Array:', Array.isArray(result));
            
            // ✅ Correction : Gestion robuste avec spread operator pour forcer la réactivité
            if (Array.isArray(result) && result.length > 0) {
                this.streetSuggestions = [...result];
                this.showStreetSuggestions = true;
            } else if (result && typeof result === 'object') {
                // Si c'est un objet Proxy, essayer de le convertir
                this.streetSuggestions = [...Array.from(result)];
                this.showStreetSuggestions = this.streetSuggestions.length > 0;
            } else {
                console.log('Result is not an array:', result);
                this.streetSuggestions = [];
                this.showStreetSuggestions = false;
            }
            
            console.log('Final streetSuggestions:', this.streetSuggestions);
            console.log('Number of suggestions:', this.streetSuggestions.length);
            console.log('showStreetSuggestions:', this.showStreetSuggestions);
            
        } catch (error) {
            console.error('Erreur recherche rues:', error);
            this.showToast('Erreur', 'Impossible de récupérer les suggestions de rues', 'error');
            this.hideStreetSuggestions();
        } finally {
            this.isLoadingStreets = false;
        }
    }
    
    /**
     * Sélection d'une suggestion de rue
     */
    handleStreetSelection(event) {
        const selectedValue = event.currentTarget.dataset.value;
        this.selectedStreet = selectedValue;
        this.streetInput = selectedValue;
        this.showStreetSuggestions = false;
        this.isNumberDisabled = false;
        
        console.log('Rue sélectionnée:', selectedValue);
        
        // Réinitialiser les détails de propriété
        this.resetPropertyDetails();
    }
    
    /**
     * Gestionnaire de saisie pour le numéro
     */
    handleNumberInput(event) {
        const value = event.target.value;
        this.numberInput = value;
        this.validateSearchForm();
        
        // Recherche automatique après 2 secondes d'inactivité
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            if (this.canSearch) {
                this.performSearch();
            }
        }, 2000);
    }
    
    /**
     * Gestionnaire du bouton de recherche
     */
    handleSearch() {
        this.performSearch();
    }
    
    /**
     * Validation du formulaire de recherche
     */
    validateSearchForm() {
        // Masquer les résultats précédents
        this.showPropertyDetails = false;
        this.showNoResults = false;
    }
    
    /**
     * Vérifier si la recherche peut être effectuée
     */
    get canSearch() {
        return this.selectedStreet && 
               this.numberInput && 
               this.numberInput.trim().length > 0;
    }
    
    /**
     * Vérifier si le bouton de recherche doit être désactivé
     */
    get searchDisabled() {
        return !this.canSearch;
    }
    
    /**
     * Méthode de recherche simplifiée
     */
    async performSearch() {
        if (!this.canSearch) return;
        
        this.isLoadingProperty = true;
        this.clearResults();
        
        try {
            console.log('Searching for:', this.selectedStreet, this.numberInput);
            
            const result = await getPropertyDetails({
                streetName: this.selectedStreet,
                streetNumber: this.numberInput.trim(),
                municipalityCode: this.selectedMunicipality,
                apiKey: this.apiKey
            });
            
            if (result && result.RLUEx && result.RLUEx.RL0101) {
                // ✅ Propriété trouvée - Afficher les détails
                console.log('✅ Propriété trouvée, affichage des détails');
                this.displayPropertyDetails(result);
                this.showPropertyDetails = true;
                this.showNoResults = false;
            } else {
                // ❌ Aucune propriété - Afficher message amélioré avec option de voir les numéros disponibles
                console.log('❌ Aucune propriété trouvée, résultat:', result);
                console.log('❌ Structure RLUEx:', result?.RLUEx);
                console.log('❌ Structure RL0101:', result?.RLUEx?.RL0101);
                this.showPropertyDetails = false;
                this.showNoResults = true;
                this.noResultsMessage = `Aucune propriété trouvée au ${this.numberInput} ${this.selectedStreet}. Vérifiez le numéro civique ou essayez un numéro différent.`;
                this.showAvailableNumbers = true; // Afficher l'option de voir les numéros disponibles
            }
            
        } catch (error) {
            console.error('Search error:', error);
            this.showToast('Erreur', 'Erreur lors de la recherche', 'error');
            this.showPropertyDetails = false;
            this.showNoResults = true;
            this.noResultsMessage = 'Erreur lors de la recherche';
        } finally {
            this.isLoadingProperty = false;
        }
    }
    
    /**
     * Affichage des détails de propriété
     */
    displayPropertyDetails(details) {
        this.propertyDetails = details;
        
        // Créer l'adresse complète à partir des données MongoDB
        if (details.RLUEx && details.RLUEx.RL0101 && details.RLUEx.RL0101.RL0101x) {
            const address = details.RLUEx.RL0101.RL0101x;
            const streetNumber = address.RL0101Ax || '';
            const streetType = address.RL0101Ex || '';
            const streetName = address.RL0101Gx || '';
            this.propertyAddress = `${streetNumber} ${streetType} ${streetName}`.trim();
        } else {
            this.propertyAddress = 'Adresse non disponible';
        }
        
        // Les autres propriétés seront gérées par les getters
        this.propertyOwner = '';
        this.propertyValue = '';
        this.propertyPostalCode = '';
        this.propertyLandValue = '';
        this.propertyBuildingValue = '';
        this.propertyTotalValue = '';
        this.propertyAcquisitionDate = '';
        this.propertyEvaluationDate = '';
        
        console.log('✅ Propriété trouvée (MongoDB):', details);
    }
    
    /**
     * Formater un montant avec séparateurs de milliers et symbole $
     */
    formatCurrency(amount) {
        if (!amount || amount === '0') return 'Non disponible';
        return new Intl.NumberFormat('fr-CA', {
            style: 'currency',
            currency: 'CAD'
        }).format(parseFloat(amount));
    }
    
    /**
     * Formater une date au format dd/mm/yyyy
     */
    formatDate(dateString) {
        if (!dateString) return 'Non disponible';
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('fr-CA');
        } catch (error) {
            return dateString;
        }
    }
    
    /**
     * Formater une superficie avec unités
     */
    formatArea(area) {
        if (!area || area === '0') return 'Non disponible';
        return `${parseFloat(area).toLocaleString('fr-CA')} m²`;
    }
    
    /**
     * Formater une mesure frontale
     */
    formatFrontage(frontage) {
        if (!frontage || frontage === '0') return 'Non disponible';
        return `${parseFloat(frontage).toLocaleString('fr-CA')} m`;
    }
    
    /**
     * Obtenir le nom complet de l'adresse
     */
    get fullAddress() {
        if (!this.propertyDetails?.RLUEx?.RL0101?.RL0101x) return 'Non disponible';
        const address = this.propertyDetails.RLUEx.RL0101.RL0101x;
        return `${address.RL0101Ax} ${address.RL0101Ex} ${address.RL0101Gx}`;
    }
    
    /**
     * Obtenir le code postal formaté
     */
    get formattedPostalCode() {
        if (!this.propertyDetails?.RLUEx?.RL0101?.RL0101x?.POSTALCODE) return 'Non disponible';
        return this.propertyDetails.RLUEx.RL0101.RL0101x.POSTALCODE;
    }
    
    /**
     * Obtenir le matricule
     */
    get matricule() {
        if (!this.propertyDetails?.RLUEx?.RL0103?.RL0103x?.RL0103Ax) return 'Non disponible';
        return this.propertyDetails.RLUEx.RL0103.RL0103x.RL0103Ax;
    }
    
    /**
     * Obtenir le numéro de lot formaté
     */
    get lotNumber() {
        if (!this.propertyDetails?.RLUEx?.RL0104) return 'Non disponible';
        const lot = this.propertyDetails.RLUEx.RL0104;
        return `${lot.RL0104A}-${lot.RL0104B}-${lot.RL0104C}-${lot.RL0104D}`;
    }
    
    /**
     * Obtenir le nom du propriétaire
     */
    get ownerName() {
        if (!this.propertyDetails?.RLUEx?.RL0201?.RL0201x?.RL0201Ax) return 'Non disponible';
        return this.propertyDetails.RLUEx.RL0201.RL0201x.RL0201Ax;
    }
    
    /**
     * Obtenir l'adresse du propriétaire
     */
    get ownerAddress() {
        if (!this.propertyDetails?.RLUEx?.RL0201?.RL0201x) return 'Non disponible';
        const owner = this.propertyDetails.RLUEx.RL0201.RL0201x;
        return `${owner.RL0201Cx}, ${owner.RL0201Dx} ${owner.RL0201Ex}`;
    }
    
    /**
     * Obtenir la date d'acquisition formatée
     */
    get acquisitionDate() {
        if (!this.propertyDetails?.RLUEx?.RL0201?.RL0201x?.RL0201Gx) return 'Non disponible';
        return this.formatDate(this.propertyDetails.RLUEx.RL0201.RL0201x.RL0201Gx);
    }
    
    /**
     * Obtenir le nombre de propriétaires
     */
    get ownerCount() {
        if (!this.propertyDetails?.RLUEx?.RL0201?.RL0201U) return 'Non disponible';
        return this.propertyDetails.RLUEx.RL0201.RL0201U;
    }
    
    /**
     * Obtenir la mesure frontale formatée
     */
    get frontage() {
        if (!this.propertyDetails?.RLUEx?.RL0301A) return 'Non disponible';
        return this.formatFrontage(this.propertyDetails.RLUEx.RL0301A);
    }
    
    /**
     * Obtenir la superficie formatée
     */
    get area() {
        if (!this.propertyDetails?.RLUEx?.RL0302A) return 'Non disponible';
        return this.formatArea(this.propertyDetails.RLUEx.RL0302A);
    }
    
    /**
     * Obtenir le facteur d'ajustement
     */
    get adjustmentFactor() {
        if (!this.propertyDetails?.RLUEx?.RL0303A) return 'Non disponible';
        return this.propertyDetails.RLUEx.RL0303A;
    }
    
    /**
     * Obtenir la date de référence formatée
     */
    get referenceDate() {
        if (!this.propertyDetails?.RLUEx?.RL0401A) return 'Non disponible';
        return this.formatDate(this.propertyDetails.RLUEx.RL0401A);
    }
    
    /**
     * Obtenir la valeur du terrain formatée
     */
    get landValue() {
        if (!this.propertyDetails?.RLUEx?.RL0402A) return 'Non disponible';
        return this.formatCurrency(this.propertyDetails.RLUEx.RL0402A);
    }
    
    /**
     * Obtenir la valeur du bâtiment formatée
     */
    get buildingValue() {
        if (!this.propertyDetails?.RLUEx?.RL0403A) return 'Non disponible';
        return this.formatCurrency(this.propertyDetails.RLUEx.RL0403A);
    }
    
    /**
     * Obtenir la valeur de l'immeuble formatée
     */
    get propertyValue() {
        if (!this.propertyDetails?.RLUEx?.RL0404A) return 'Non disponible';
        return this.formatCurrency(this.propertyDetails.RLUEx.RL0404A);
    }
    
    /**
     * Obtenir la valeur imposable formatée
     */
    get taxableValue() {
        if (!this.propertyDetails?.RLUEx?.RL0405A) return 'Non disponible';
        return this.formatCurrency(this.propertyDetails.RLUEx.RL0405A);
    }
    
    /**
     * Obtenir la valeur exonérée formatée
     */
    get exemptValue() {
        if (!this.propertyDetails?.RLUEx?.RL0501A) return 'Non disponible';
        return this.formatCurrency(this.propertyDetails.RLUEx.RL0501A);
    }
    
    /**
     * Obtenir les détails des exonérations
     */
    get exemptions() {
        if (!this.propertyDetails?.RLUEx?.RL0504?.RL0504x) return [];
        return this.propertyDetails.RLUEx.RL0504.RL0504x;
    }
    
    /**
     * Obtenir le nom de l'évaluateur
     */
    get evaluatorName() {
        if (!this.propertyDetails?.RL0601A) return 'Non disponible';
        return this.propertyDetails.RL0601A;
    }
    
    /**
     * Obtenir le prénom de l'évaluateur
     */
    get evaluatorFirstName() {
        if (!this.propertyDetails?.RL0601B) return 'Non disponible';
        return this.propertyDetails.RL0601B;
    }
    
    /**
     * Obtenir le titre de l'évaluateur
     */
    get evaluatorTitle() {
        if (!this.propertyDetails?.RL0602A) return 'Non disponible';
        return this.propertyDetails.RL0602A;
    }
    
    /**
     * Obtenir l'organisme municipal de l'évaluateur
     */
    get evaluatorOrganization() {
        if (!this.propertyDetails?.RL0603A) return 'Non disponible';
        return this.propertyDetails.RL0603A;
    }
    
    /**
     * Obtenir la date de signature formatée
     */
    get signatureDate() {
        if (!this.propertyDetails?.RL0604A) return 'Non disponible';
        return this.formatDate(this.propertyDetails.RL0604A);
    }
    
    /**
     * Obtenir le lieu de signature
     */
    get signatureLocation() {
        if (!this.propertyDetails?.RL0605A) return 'Non disponible';
        return this.propertyDetails.RL0605A;
    }
    
    /**
     * Obtenir le prénom du propriétaire
     */
    get ownerFirstName() {
        if (!this.propertyDetails?.RLUEx?.RL0201?.RL0201x?.RL0201Bx) return 'Non disponible';
        return this.propertyDetails.RLUEx.RL0201.RL0201x.RL0201Bx;
    }
    
    /**
     * Obtenir le type de propriétaire
     */
    get ownerType() {
        if (!this.propertyDetails?.RLUEx?.RL0201?.RL0201x?.RL0201Hx) return 'Non disponible';
        const typeCode = this.propertyDetails.RLUEx.RL0201.RL0201x.RL0201Hx;
        const typeMap = {
            '1': 'Personne physique',
            '2': 'Personne morale',
            '3': 'Gouvernement'
        };
        return typeMap[typeCode] || `Type ${typeCode}`;
    }
    
    /**
     * Obtenir l'adresse complète du propriétaire
     */
    get ownerFullAddress() {
        if (!this.propertyDetails?.RLUEx?.RL0201?.RL0201x) return 'Non disponible';
        const owner = this.propertyDetails.RLUEx.RL0201.RL0201x;
        return `${owner.RL0201Ix} ${owner.RL0201Kx} ${owner.RL0201Mx}, ${owner.RL0201Dx} ${owner.RL0201Ex}`;
    }
    
    /**
     * Obtenir la version des informations annexables globales
     */
    get globalInfoVersion() {
        if (!this.propertyDetails?.RENSEIGNEMENTS_ANNEXABLES_GLOBAL?.RLZG0001) return 'Non disponible';
        return this.propertyDetails.RENSEIGNEMENTS_ANNEXABLES_GLOBAL.RLZG0001;
    }
    
    /**
     * Obtenir la date de mise à jour des informations annexables globales
     */
    get globalInfoDate() {
        if (!this.propertyDetails?.RENSEIGNEMENTS_ANNEXABLES_GLOBAL?.RLZG0002) return 'Non disponible';
        return this.formatDate(this.propertyDetails.RENSEIGNEMENTS_ANNEXABLES_GLOBAL.RLZG0002);
    }
    
    /**
     * Obtenir le nombre d'unités
     */
    get unitCount() {
        if (!this.propertyDetails?.RLUEx?.RENSEIGNEMENTS_ANNEXABLES_UNITE?.RLZU1007?.RLZU1007x?.RLZU1007Ax) return 'Non disponible';
        return this.propertyDetails.RLUEx.RENSEIGNEMENTS_ANNEXABLES_UNITE.RLZU1007.RLZU1007x.RLZU1007Ax;
    }
    
    /**
     * Obtenir la superficie unitaire formatée
     */
    get unitArea() {
        if (!this.propertyDetails?.RLUEx?.RENSEIGNEMENTS_ANNEXABLES_UNITE?.RLZU1008?.RLZU1008x?.RLZU1008Bx) return 'Non disponible';
        return this.formatArea(this.propertyDetails.RLUEx.RENSEIGNEMENTS_ANNEXABLES_UNITE.RLZU1008.RLZU1008x.RLZU1008Bx);
    }
    
    /**
     * Obtenir la valeur unitaire formatée
     */
    get unitValue() {
        if (!this.propertyDetails?.RLUEx?.RENSEIGNEMENTS_ANNEXABLES_UNITE?.RLZU2001?.RLZU2001x?.RLZU2001Bx) return 'Non disponible';
        return this.formatCurrency(this.propertyDetails.RLUEx.RENSEIGNEMENTS_ANNEXABLES_UNITE.RLZU2001.RLZU2001x.RLZU2001Bx);
    }
    
    /**
     * Obtenir le type de propriété
     */
    get propertyType() {
        if (!this.propertyDetails?.RLUEx?.RENSEIGNEMENTS_ANNEXABLES_UNITE?.RLZU3005A) return 'Non disponible';
        const typeCode = this.propertyDetails.RLUEx.RENSEIGNEMENTS_ANNEXABLES_UNITE.RLZU3005A;
        const typeMap = {
            'R': 'Résidentiel',
            'C': 'Commercial',
            'I': 'Industriel',
            'A': 'Agricole'
        };
        return typeMap[typeCode] || `Type ${typeCode}`;
    }
    
    /**
     * Obtenir la catégorie de propriété
     */
    get propertyCategory() {
        if (!this.propertyDetails?.RLUEx?.RENSEIGNEMENTS_ANNEXABLES_UNITE?.RLZU3005B) return 'Non disponible';
        return this.propertyDetails.RLUEx.RENSEIGNEMENTS_ANNEXABLES_UNITE.RLZU3005B;
    }
    
    /**
     * Obtenir la date d'évaluation formatée
     */
    get evaluationDate() {
        if (!this.propertyDetails?.RLUEx?.RENSEIGNEMENTS_ANNEXABLES_UNITE?.RLZU3101) return 'Non disponible';
        return this.formatDate(this.propertyDetails.RLUEx.RENSEIGNEMENTS_ANNEXABLES_UNITE.RLZU3101);
    }
    
    /**
     * Obtenir le numéro d'ordre
     */
    get orderNumber() {
        if (!this.propertyDetails?.RLUEx?.RL0105A) return 'Non disponible';
        return this.propertyDetails.RLUEx.RL0105A;
    }
    
    /**
     * Obtenir le numéro de dossier
     */
    get fileNumber() {
        if (!this.propertyDetails?.RLUEx?.RL0106A) return 'Non disponible';
        return this.propertyDetails.RLUEx.RL0106A;
    }
    
    /**
     * Obtenir le numéro de cadastre
     */
    get cadastreNumber() {
        if (!this.propertyDetails?.RLUEx?.RL0107A) return 'Non disponible';
        return this.propertyDetails.RLUEx.RL0107A;
    }
    
    /**
     * Effacer les résultats précédents
     */
    clearResults() {
        this.showPropertyDetails = false;
        this.showNoResults = false;
        this.propertyDetails = null;
    }
    
    /**
     * Gestionnaire de clic en dehors des suggestions
     */
    handleClickOutside() {
        this.hideStreetSuggestions();
    }
    
    /**
     * Masquer les suggestions de rues
     */
    hideStreetSuggestions() {
        this.showStreetSuggestions = false;
    }
    
    /**
     * Réinitialiser les champs rue et numéro
     */
    resetStreetAndNumber() {
        this.streetInput = '';
        this.selectedStreet = '';
        this.numberInput = '';
        this.isNumberDisabled = true;
        this.hideStreetSuggestions();
        this.clearResults();
    }
    
    /**
     * Réinitialiser le champ numéro
     */
    resetNumber() {
        this.numberInput = '';
        this.isNumberDisabled = true;
        this.clearResults();
    }
    
    /**
     * Réinitialiser les détails de propriété
     */
    resetPropertyDetails() {
        this.showPropertyDetails = false;
        this.hasPropertyDetails = false;
        this.propertyDetails = null;
        this.propertyAddress = '';
        this.propertyOwner = '';
        this.propertyValue = '';
        this.propertyPostalCode = '';
        this.propertyLandValue = '';
        this.propertyBuildingValue = '';
        this.propertyTotalValue = '';
        this.propertyAcquisitionDate = '';
        this.propertyEvaluationDate = '';
    }
    
    /**
     * Affichage d'un toast
     */
    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({
            title: title,
            message: message,
            variant: variant
        }));
    }
    
    // Getters pour les classes CSS
    get streetSuggestionsClass() {
        return this.showStreetSuggestions ? 'suggestions visible' : 'suggestions hidden';
    }
    
    get streetInputClass() {
        return this.isLoadingStreets ? 'slds-input loading' : 'slds-input';
    }
    
    get numberInputClass() {
        return this.isNumberDisabled ? 'slds-input slds-is-disabled' : 'slds-input';
    }
    
    get hasPropertyDetails() {
        return this.showPropertyDetails && this.propertyAddress;
    }
    
    /**
     * Obtenir la valeur foncière unitaire formatée
     */
    get landUnitValue() {
        if (!this.propertyDetails?.RLUEx?.RENSEIGNEMENTS_ANNEXABLES_UNITE?.RLZU4001) return 'Non disponible';
        return this.formatCurrency(this.propertyDetails.RLUEx.RENSEIGNEMENTS_ANNEXABLES_UNITE.RLZU4001);
    }
    
    /**
     * Obtenir la valeur bâtiment unitaire formatée
     */
    get buildingUnitValue() {
        if (!this.propertyDetails?.RLUEx?.RENSEIGNEMENTS_ANNEXABLES_UNITE?.RLZU4002) return 'Non disponible';
        return this.formatCurrency(this.propertyDetails.RLUEx.RENSEIGNEMENTS_ANNEXABLES_UNITE.RLZU4002);
    }
    
    /**
     * Obtenir les détails des exonérations formatés
     */
    get exemptionDetails() {
        if (!this.propertyDetails?.RLUEx?.RL0504?.RL0504x) return [];
        return this.propertyDetails.RLUEx.RL0504.RL0504x.map(exemption => ({
            code: exemption.RL0504Ax || 'N/A',
            value: this.formatCurrency(exemption.RL0504Dx),
            type: this.getExemptionType(exemption.RL0504Ex),
            description: exemption.RL0504Bx ? `Code ${exemption.RL0504Bx}` : 'N/A'
        }));
    }
    
    /**
     * Obtenir le type d'exonération
     */
    getExemptionType(typeCode) {
        const typeMap = {
            'T': 'Terrain',
            'B': 'Bâtiment',
            'I': 'Immeuble'
        };
        return typeMap[typeCode] || `Type ${typeCode}`;
    }
} 