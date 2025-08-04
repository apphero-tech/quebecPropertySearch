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
            
            if (result && result.fullAddress) {
                // ✅ Propriété trouvée - Afficher les détails
                this.displayPropertyDetails(result);
                this.showPropertyDetails = true;
                this.showNoResults = false;
            } else {
                // ❌ Aucune propriété - Afficher message amélioré avec option de voir les numéros disponibles
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
        this.propertyAddress = details.fullAddress || '';
        this.propertyOwner = details.ownerName || '';
        this.propertyValue = details.totalValue || '';
        this.propertyPostalCode = details.postalCode || '';
        this.propertyLandValue = details.landValue || '';
        this.propertyBuildingValue = details.buildingValue || '';
        this.propertyTotalValue = details.totalValue || '';
        this.propertyAcquisitionDate = details.acquisitionDate || '';
        this.propertyEvaluationDate = details.evaluationDate || '';
        
        console.log('✅ Propriété trouvée:', details);
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
} 