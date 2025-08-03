import { LightningElement, api, track } from 'lwc';
import searchByAddress from '@salesforce/apex/PropertySearchController.searchByAddress';
import searchByOwner from '@salesforce/apex/PropertySearchController.searchByOwner';
import searchByMatricule from '@salesforce/apex/PropertySearchController.searchByMatricule';
import searchByLot from '@salesforce/apex/PropertySearchController.searchByLot';
import discoverStreetNames from '@salesforce/apex/PropertySearchController.discoverStreetNames';
import getAvailableDoorNumbers from '@salesforce/apex/PropertySearchController.getAvailableDoorNumbers';

export default class QuebecPropertySearch extends LightningElement {
    @api municipalityCode = '66102';
    @api apiKey = '2NnAYsFxQn5VLoVaRmqmq94qDIjDADW09Sg8dr7N';
    @api municipalityName = 'Ma municipalité';
    @api showMunicipalityName = false;
    @api maxResults = 10;

    // Search type management
    @track selectedSearchType = 'address';
    @track isAddressSearch = true;
    @track isOwnerSearch = false;
    @track isMatriculeSearch = false;
    @track isLotSearch = false;

    // Form data
    @track addressForm = {
        street: '',
        number: ''
    };
    @track ownerForm = {
        firstName: '',
        lastName: ''
    };
    @track matriculeForm = {
        matricule: ''
    };
    @track lotForm = {
        lot: ''
    };

    // UI state
    @track isLoading = false;
    @track isSearchDisabled = true;
    @track isNumberDisabled = true;
    @track hasResults = false;
    @track showNoResults = false;
    @track searchResults = [];

    // Street suggestions
    @track showStreetSuggestions = false;
    @track streetSuggestions = [];
    @track isStreetLoading = false;
    @track streetSearchTimeout;

    // Number suggestions
    @track showNumberSuggestions = false;
    @track numberSuggestions = [];
    @track isNumberLoading = false;
    @track numberSearchTimeout;

    // Mouse tracking for dropdowns
    @track isMouseOverStreetDropdown = false;
    @track isMouseOverNumberDropdown = false;

    get searchTypeOptions() {
        return [
            { label: 'Recherche par Adresse', value: 'address' },
            { label: 'Recherche par Propriétaire', value: 'owner' },
            { label: 'Recherche par Matricule', value: 'matricule' },
            { label: 'Recherche par Lot', value: 'lot' }
        ];
    }

    // Search type change handler
    handleSearchTypeChange(event) {
        this.selectedSearchType = event.detail.value;
        this.resetForms();
        this.updateSearchTypeVisibility();
        this.validateSearchForm();
    }

    updateSearchTypeVisibility() {
        this.isAddressSearch = this.selectedSearchType === 'address';
        this.isOwnerSearch = this.selectedSearchType === 'owner';
        this.isMatriculeSearch = this.selectedSearchType === 'matricule';
        this.isLotSearch = this.selectedSearchType === 'lot';
    }

    resetForms() {
        this.addressForm = { street: '', number: '' };
        this.ownerForm = { firstName: '', lastName: '' };
        this.matriculeForm = { matricule: '' };
        this.lotForm = { lot: '' };
        this.hideAllSuggestions();
        this.clearResults();
    }

    // Address form handlers
    handleAddressStreetChange(event) {
        this.addressForm.street = event.detail.value;
        this.validateSearchForm();
    }

    handleAddressNumberChange(event) {
        this.addressForm.number = event.detail.value;
        this.validateSearchForm();
    }

    // Owner form handlers
    handleOwnerFirstNameChange(event) {
        this.ownerForm.firstName = event.detail.value;
        this.validateSearchForm();
    }

    handleOwnerLastNameChange(event) {
        this.ownerForm.lastName = event.detail.value;
        this.validateSearchForm();
    }

    // Matricule form handlers
    handleMatriculeChange(event) {
        this.matriculeForm.matricule = event.detail.value;
        this.validateSearchForm();
    }

    // Lot form handlers
    handleLotChange(event) {
        this.lotForm.lot = event.detail.value;
        this.validateSearchForm();
    }

    // Street search functionality
    handleStreetKeyUp(event) {
        const value = event.target.value;
        console.log('handleStreetKeyUp called with value:', value);

        if (!value || value.length < 3) {
            console.log('Value too short or empty, hiding suggestions');
            this.hideStreetSuggestions();
            return;
        }

        // Clear existing timeout
        if (this.streetSearchTimeout) {
            clearTimeout(this.streetSearchTimeout);
        }

        // Set new timeout
        this.streetSearchTimeout = setTimeout(() => {
            console.log('Timeout triggered, calling searchStreetSuggestions with:', value);
            this.searchStreetSuggestions(value);
        }, 300);
    }

    handleStreetFocus(event) {
        const value = event.target.value;
        console.log('handleStreetFocus called with value:', value);

        if (value && value.length >= 3) {
            this.searchStreetSuggestions(value);
        }
    }

    handleStreetBlur() {
        console.log('Street blur event triggered');
        // Delay hiding to allow for dropdown clicks
        setTimeout(() => {
            if (!this.isMouseOverStreetDropdown) {
                this.hideStreetSuggestions();
            }
        }, 200);
    }

    handleStreetDropdownMouseEnter() {
        console.log('Mouse entered street dropdown');
        this.isMouseOverStreetDropdown = true;
    }

    handleStreetDropdownMouseLeave() {
        console.log('Mouse left street dropdown');
        this.isMouseOverStreetDropdown = false;
    }

    handleStreetSuggestionClick(event) {
        const selectedValue = event.currentTarget.dataset.value;
        console.log('Street selected:', selectedValue);
        
        this.addressForm.street = selectedValue;
        this.addressForm.number = ''; // Clear number field
        this.hideStreetSuggestions();
        this.validateSearchForm();
    }

    async searchStreetSuggestions(searchTerm) {
        console.log('searchStreetSuggestions called with:', searchTerm);
        console.log('municipalityCode:', this.municipalityCode);
        console.log('apiKey:', this.apiKey);

        this.isStreetLoading = true;
        this.showStreetSuggestions = true;

        try {
            console.log('Calling discoverStreetNames Apex method...');
            const suggestions = await discoverStreetNames({
                searchTerm: searchTerm,
                municipalityCode: this.municipalityCode,
                apiKey: this.apiKey
            });

            console.log('Apex method returned:', suggestions);
            this.streetSuggestions = suggestions || [];
            console.log('Final streetSuggestions:', this.streetSuggestions);
            console.log('showStreetSuggestions:', this.showStreetSuggestions);

        } catch (error) {
            console.error('Error searching street suggestions:', error);
            this.streetSuggestions = [];
        } finally {
            this.isStreetLoading = false;
        }
    }

    hideStreetSuggestions() {
        console.log('Hiding street suggestions');
        this.showStreetSuggestions = false;
        this.streetSuggestions = [];
        this.isStreetLoading = false;
    }

    // Number search functionality
    handleNumberKeyUp(event) {
        const value = event.target.value;
        console.log('handleNumberKeyUp called with value:', value);

        if (!this.addressForm.street) {
            console.log('No street selected, not showing suggestions');
            return;
        }

        if (!value || value.length < 1) {
            this.hideNumberSuggestions();
            return;
        }

        // Clear existing timeout
        if (this.numberSearchTimeout) {
            clearTimeout(this.numberSearchTimeout);
        }

        // Set new timeout
        this.numberSearchTimeout = setTimeout(() => {
            console.log('Timeout triggered, calling searchNumberSuggestions with:', value);
            this.searchNumberSuggestions(value);
        }, 300);
    }

    handleNumberFocus(event) {
        const value = event.target.value;
        console.log('handleNumberFocus called with value:', value);

        if (!this.addressForm.street) {
            console.log('Current street:', this.addressForm.street);
            console.log('No street selected or no value, not showing suggestions on focus');
            return;
        }

        if (value && value.length >= 1) {
            this.searchNumberSuggestions(value);
        }
    }

    handleNumberBlur() {
        console.log('Number blur event triggered');
        setTimeout(() => {
            if (!this.isMouseOverNumberDropdown) {
                this.hideNumberSuggestions();
            }
        }, 200);
    }

    handleNumberDropdownMouseEnter() {
        console.log('Mouse entered number dropdown');
        this.isMouseOverNumberDropdown = true;
    }

    handleNumberDropdownMouseLeave() {
        console.log('Mouse left number dropdown');
        this.isMouseOverNumberDropdown = false;
    }

    handleNumberSuggestionClick(event) {
        const selectedValue = event.currentTarget.dataset.value;
        console.log('Number selected:', selectedValue);
        
        this.addressForm.number = selectedValue;
        this.hideNumberSuggestions();
        this.validateSearchForm();
    }

    async searchNumberSuggestions(searchTerm) {
        console.log('searchNumberSuggestions called with:', searchTerm);

        this.isNumberLoading = true;
        this.showNumberSuggestions = true;

        try {
            const suggestions = await getAvailableDoorNumbers({
                streetName: this.addressForm.street,
                municipalityCode: this.municipalityCode,
                apiKey: this.apiKey
            });

            // Filter suggestions based on search term
            this.numberSuggestions = suggestions ? suggestions.filter(num => 
                num.toString().startsWith(searchTerm)
            ) : [];

        } catch (error) {
            console.error('Error searching number suggestions:', error);
            this.numberSuggestions = [];
        } finally {
            this.isNumberLoading = false;
        }
    }

    hideNumberSuggestions() {
        console.log('Hiding number suggestions');
        this.showNumberSuggestions = false;
        this.numberSuggestions = [];
        this.isNumberLoading = false;
    }

    hideAllSuggestions() {
        this.hideStreetSuggestions();
        this.hideNumberSuggestions();
    }

    // Form validation
    validateSearchForm() {
        let isValid = false;

        switch (this.selectedSearchType) {
            case 'address':
                isValid = this.addressForm.street && this.addressForm.number;
                this.isNumberDisabled = !this.addressForm.street;
                break;
            case 'owner':
                isValid = this.ownerForm.firstName && this.ownerForm.lastName;
                break;
            case 'matricule':
                isValid = this.matriculeForm.matricule;
                break;
            case 'lot':
                isValid = this.lotForm.lot;
                break;
        }

        this.isSearchDisabled = !isValid;
    }

    // Search execution
    async handleSearch() {
        if (this.isSearchDisabled) return;

        this.isLoading = true;
        this.clearResults();

        try {
            let result;

            switch (this.selectedSearchType) {
                case 'address':
                    result = await searchByAddress({
                        street: this.addressForm.street,
                        streetNumber: this.addressForm.number,
                        municipalityCode: this.municipalityCode,
                        apiKey: this.apiKey
                    });
                    break;
                case 'owner':
                    result = await searchByOwner({
                        lastName: this.ownerForm.lastName,
                        firstName: this.ownerForm.firstName,
                        municipalityCode: this.municipalityCode,
                        apiKey: this.apiKey
                    });
                    break;
                case 'matricule':
                    result = await searchByMatricule({
                        matricule: this.matriculeForm.matricule,
                        municipalityCode: this.municipalityCode,
                        apiKey: this.apiKey
                    });
                    break;
                case 'lot':
                    result = await searchByLot({
                        lotNumber: this.lotForm.lot,
                        municipalityCode: this.municipalityCode,
                        apiKey: this.apiKey
                    });
                    break;
            }

            if (result && result.success && result.results && result.results.length > 0) {
                this.searchResults = result.results;
                this.hasResults = true;
                this.showNoResults = false;
            } else {
                this.showNoResults = true;
                this.hasResults = false;
            }

        } catch (error) {
            console.error('Search error:', error);
            this.showNoResults = true;
            this.hasResults = false;
        } finally {
            this.isLoading = false;
        }
    }

    clearResults() {
        this.searchResults = [];
        this.hasResults = false;
        this.showNoResults = false;
    }
}