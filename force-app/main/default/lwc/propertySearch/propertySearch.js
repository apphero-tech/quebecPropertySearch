import { LightningElement, track, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { FlowAttributeChangeEvent } from 'lightning/flowSupport';
import { NavigationMixin } from 'lightning/navigation';

// Imports Apex (méthodes fonctionnelles)
import getAvailableCollections from '@salesforce/apex/AddressSearchController.getAvailableCollections';
import getStreetSuggestions from '@salesforce/apex/AddressSearchController.getStreetSuggestions';
import getPropertyDetails from '@salesforce/apex/AddressSearchController.getPropertyDetails';
import searchByOwner from '@salesforce/apex/AddressSearchController.searchByOwner';
import searchOwnerSuggestions from '@salesforce/apex/AddressSearchController.searchOwnerSuggestions';
import searchByLot from '@salesforce/apex/AddressSearchController.searchByLot';
import searchByMatricule from '@salesforce/apex/AddressSearchController.searchByMatricule';
import saveCompleteProperty from '@salesforce/apex/AddressSearchController.saveCompleteProperty';

export default class PropertySearch extends NavigationMixin(LightningElement) {
    
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
    // Retourne la première valeur non vide et non placeholder ("Non disponible", "Inconnu")
    preferValue(...values) {
        for (const v of values) {
            if (v === undefined || v === null) continue;
            const s = String(v).trim();
            if (!s) continue;
            const lower = s.toLowerCase();
            if (lower === 'non disponible' || lower === 'inconnu' || lower === 'n/a' || s === '-') continue;
            return v;
        }
        return '';
    }

    /**
     * Extraction directe depuis le DOM visible (principe: "lis ce que tu vois")
     * - Adresse (titre carte / entête)
     * - Nom propriétaire (premier nom affiché en Section 2)
     * - Matricule (span data-field="matricule" ou libellé)
     * - Valeur totale (span data-field="total-value" ou libellé)
     * - Code postal (libellé)
     */
    extractDataFromDOM() {
        const getText = (el) => (el && typeof el.textContent === 'string') ? el.textContent.trim() : '';

        // Helper: trouver la valeur après un <strong>Label :</strong>
        const queryLabeledValue = (labelText) => {
            try {
                const paragraphs = this.template.querySelectorAll('p');
                for (const p of paragraphs) {
                    const strong = p.querySelector('strong');
                    if (strong) {
                        const label = (strong.textContent || '').replace(/\s+/g, ' ').trim();
                        const normalizedLabel = label.replace(/\s*:\s*$/, '').toLowerCase();
                        if (normalizedLabel === (labelText || '').toLowerCase()) {
                            // Retourner le texte du paragraphe sans le label
                            const raw = (p.textContent || '').trim();
                            const withoutLabel = raw.replace(new RegExp('^\n?\s*' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*'), '').trim();
                            return withoutLabel;
                        }
                    }
                }
            } catch (e) {
                // no-op
            }
            return '';
        };

        // Adresse: privilégier l'en-tête principal, sinon le bloc "Adresse de la propriété"
        const addressMain = this.template.querySelector('.slds-text-heading_medium');
        let address = getText(addressMain);
        if (!address) {
            const addressAlt = this.template.querySelector('p.slds-text-heading_small.slds-m-bottom_x-small');
            address = getText(addressAlt);
        }

        // Nom propriétaire: Section 2, premier <strong> dans un paragraphe de classe régulière
        let ownerName = '';
        try {
            const ownerSection = this.template.querySelector('lightning-accordion-section[name="section2"]');
            const ownerStrong = ownerSection ? ownerSection.querySelector('.slds-text-body_regular strong') : null;
            ownerName = getText(ownerStrong);
            if (!ownerName) {
                const anyOwner = this.template.querySelector('.slds-text-body_regular strong');
                ownerName = getText(anyOwner);
            }
        } catch (e) {
            // no-op
        }

        // Matricule: data-field si présent, sinon par libellé "Matricule"
        let matricule = '';
        try {
            const matriculeEl = this.template.querySelector('[data-field="matricule"]');
            matricule = getText(matriculeEl) || queryLabeledValue('Matricule');
        } catch (e) { /* no-op */ }

        // Valeur totale: data-field si présent, sinon par libellé
        let totalValue = '';
        try {
            const totalValueEl = this.template.querySelector('[data-field="total-value"]');
            totalValue = getText(totalValueEl) || queryLabeledValue("Valeur totale de l'immeuble inscrite au rôle");
        } catch (e) { /* no-op */ }

        // Code postal: par libellé "Code postal"
        const postalCode = queryLabeledValue('Code postal');

        const extracted = { address, ownerName, matricule, totalValue, postalCode };
        return extracted;
    }
    
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
     * ÉTAPE 1 - Adresse formatée Canada Poste (utilise RL0201Dx pour la ville)
     * Format: [Numéro] [Type traduit] [Nom], [Ville] QC [Code postal]
     */
    getFormattedPropertyAddress(data) {
        try {
            const getPath = (obj, path) => {
                if (!obj) return '';
                const parts = path.split('.');
                let cur = obj;
                for (const p of parts) {
                    if (cur && typeof cur === 'object' && p in cur) {
                        cur = cur[p];
                    } else {
                        return '';
                    }
                }
                return cur == null ? '' : String(cur);
            };

            const civicNumber = getPath(data, 'RLUEx.RL0101.RL0101x.RL0101Ax') || data.rl0101Ax || '';
            const streetTypeCode = getPath(data, 'RLUEx.RL0101.RL0101x.RL0101Ex') || data.rl0101Ex || '';
            const streetName = getPath(data, 'RLUEx.RL0101.RL0101x.RL0101Gx') || data.rl0101Gx || '';
            // Utiliser la municipalité sélectionnée (même source que l'adresse de la propriété)
            // et ne pas utiliser la ville du propriétaire (RL0201Dx)
            const municipality = this.selectedMunicipality || this.defaultMunicipality || '';
            const postalCode = getPath(data, 'RLUEx.RL0101.RL0101x.POSTALCODE') || data.postalCode || '';

            const fullStreetType = this.getFullStreetType(streetTypeCode);
            const line1 = `${civicNumber} ${fullStreetType} ${streetName}`.trim();
            if (!line1 || !municipality) return '';
            return `${line1}, ${municipality} QC ${postalCode}`.trim();
        } catch (_e) {
            return '';
        }
    }

    // (Badge propriétaire supprimé — rendu en texte par propriétaire)

    /**
     * ÉTAPE 2 - Propriétaires formatés (nom, adresse, date)
     */
    getFormattedOwners(data) {
        const safeArray = (val) => (Array.isArray(val) ? val : (val ? [val] : []));
        const getOwners = (obj) => {
            try {
                const nested = obj && obj.RLUEx && obj.RLUEx.RL0201 && obj.RLUEx.RL0201.RL0201x;
                if (nested) return safeArray(nested);
                if (obj && obj.RL0201x) return safeArray(obj.RL0201x);
                return [];
            } catch (_e) {
                return [];
            }
        };
        const owners = getOwners(data);
        return owners.map((o) => {
            const statut = o && o.RL0201Hx != null ? String(o.RL0201Hx) : '';
            const lastName = o && o.RL0201Ax ? String(o.RL0201Ax).trim() : '';
            const firstNameRaw = o && o.RL0201Bx ? String(o.RL0201Bx).trim() : '';
            const firstName = firstNameRaw ? (firstNameRaw.charAt(0).toUpperCase() + firstNameRaw.slice(1).toLowerCase()) : '';
            const formattedName = (statut === '1' && firstName) ? `${firstName} ${lastName}` : lastName;
            const baseAddress = o && o.RL0201Cx ? String(o.RL0201Cx).trim() : '';
            const city = o && o.RL0201Dx ? String(o.RL0201Dx).trim() : '';
            const postal = o && o.RL0201Ex ? String(o.RL0201Ex).trim() : '';
            let fullAddress = baseAddress;
            if (city) {
                fullAddress = fullAddress ? `${fullAddress}, ${city}` : city;
                fullAddress += ' QC';
                if (postal) fullAddress += ` ${postal}`;
            }
            const registrationDate = o && o.RL0201Gx ? String(o.RL0201Gx).trim() : '';
            const id = `${formattedName}__${fullAddress}__${registrationDate}`;
            const ownerTypeText = this.getStatutLabel(statut);
            return { id, formattedName, ownerTypeText, fullAddress, registrationDate };
        });
    }

    // Getters d'exposition (première propriété affichée)
    get formattedPropertyAddress() {
        const p = (this.properties && this.properties[0]) || null;
        return (p && p.formattedPropertyAddress) ? p.formattedPropertyAddress : (p ? this.getFormattedPropertyAddress(p) : '');
    }

    // ownerTypeLabel/ownerTypeVariant retirés (plus utilisés)

    get propertyOwners() {
        const p = (this.properties && this.properties[0]) || null;
        if (p && Array.isArray(p.formattedOwners)) return p.formattedOwners;
        return p ? this.getFormattedOwners(p) : [];
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
     * Gestionnaire: clic sur "Save Assessment" (appel Apex)
     */
    handleSaveAssessment() {
        if (!this.selectedPropertyData) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Erreur',
                message: 'Aucune propriété sélectionnée',
                variant: 'error'
            }));
            return;
        }
        const sp = typeof this.selectedPropertyData === 'string'
            ? JSON.parse(this.selectedPropertyData)
            : (this.selectedPropertyData || {});
        const p0 = (this.properties && this.properties[0]) ? this.properties[0] : undefined;
        const firstOwnerName = p0 && Array.isArray(p0.owners) && p0.owners.length > 0 ? p0.owners[0].fullName : undefined;
        // Dernier recours: dériver une valeur totale à partir des composantes terrain/bâtiment
        let derivedTotalValue;
        try {
            const tryParse = (v) => {
                if (v === undefined || v === null) return undefined;
                const s = String(v).replace(/[^0-9.,-]/g, '').replace(',', '.');
                const num = parseFloat(s);
                return Number.isFinite(num) ? num : undefined;
            };
            const vTerrain = p0 ? tryParse(p0.rl0402A) : undefined;
            const vBatiment = p0 ? tryParse(p0.rl0403A) : undefined;
            if (vTerrain !== undefined || vBatiment !== undefined) {
                const sum = (vTerrain || 0) + (vBatiment || 0);
                derivedTotalValue = sum > 0 ? String(sum) : undefined;
            }
        } catch (e) {
            // no-op
        }
        const propertyToSave = {
            // Priorité: données normalisées (sp.*) -> attributs Flow exposés -> données brutes du résultat -> dérivés
            matricule: this.preferValue(
                sp.matricule,
                this.selectedPropertyMatricule,
                p0 ? p0.rl0106A : undefined,
                this.matriculeInput
            ),
            address: this.preferValue(
                sp.fullAddress,
                this.selectedPropertyFullAddress,
                p0 ? p0.fullAddress : undefined
            ),
            ownerName: this.preferValue(
                sp.ownerName,
                this.selectedPropertyOwnerName,
                p0 ? p0.rl0201Ax : undefined,
                firstOwnerName
            ) || 'Propriétaire non défini',
            totalValue: this.preferValue(
                sp.assessedValue,
                this.selectedPropertyAssessedValue,
                p0 ? p0.rl0404A : undefined,
                p0 ? p0.rl0413A : undefined,
                p0 ? p0.rl0415A : undefined,
                derivedTotalValue
            ),
            postalCode: this.preferValue(
                sp.postalCode,
                this.selectedPropertyPostalCode,
                p0 ? p0.postalCode : undefined
            )
        };

        saveCompleteProperty({ propertyData: JSON.stringify(propertyToSave) })
            .then((result) => {
                let assessmentId;
                try {
                    const parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
                    assessmentId = parsedResult && parsedResult.assessmentId;
                } catch (e) {
                    // parsing failed; continue with basic toast
                }
                
                if (assessmentId) {
                    // Generate a standard record URL and include it as a clickable link in the toast
                    this[NavigationMixin.GenerateUrl]({
                        type: 'standard__recordPage',
                        attributes: {
                            recordId: assessmentId,
                            objectApiName: 'Assessment__c',
                            actionName: 'view'
                        }
                    }).then((url) => {
                        const evt = new ShowToastEvent({
                            title: 'Succès',
                            message: `Évaluation sauvegardée ! ID: ${assessmentId} — {0}`,
                            messageData: [
                                { url: url, label: "Voir l'évaluation" }
                            ],
                            variant: 'success',
                            mode: 'sticky'
                        });
                        this.dispatchEvent(evt);
                    }).catch(() => {
                        // Fallback toast without link
                        this.showToast('Succès', `Évaluation sauvegardée ! ID: ${assessmentId}`,'success');
                    });
                    this.lastAssessmentId = assessmentId;
                } else {
                    this.showToast('Succès', 'Évaluation sauvegardée !','success');
                }
            })
            .catch((error) => {
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Erreur',
                    message: 'Erreur sauvegarde: ' + (error && error.body && error.body.message ? error.body.message : 'Inconnue'),
                    variant: 'error'
                }));
            });
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
                formattedPropertyAddress: this.getFormattedPropertyAddress(doc),
                formattedOwners: this.getFormattedOwners(doc),
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
            // Diagnostic de la structure reçue
            // Nettoyage: suppression des logs de debug excessifs (phase propriétaire)
            // Extraire les données MongoDB selon la structure exacte
            const extractedData = this.extractMongoData(mongoData);
            // DEBUG additionnel demandé
            // (debug supprimé)
            
            // Créer l'objet propriété formaté avec TOUS les champs
            let property = {
                // === INFORMATIONS GÉNÉRALES ===
                ...this.extractGeneralInfo(mongoData),
                
                // === ADRESSE FORMAT CANADA POSTE ===
                ...this.formatCanadaPostAddress(mongoData),
                
                // === SECTION 1 : IDENTIFICATION DE L'UNITÉ D'ÉVALUATION ===
                ...this.extractIdentificationInfo(mongoData),

                // === SECTION 2 (partie champs propriétaires en accès direct) ===
                rl0201Ax: this.getSecureValue(mongoData, 'RLUEx.RL0201.RL0201x.RL0201Ax'),
                rl0201Bx: this.getSecureValue(mongoData, 'RLUEx.RL0201.RL0201x.RL0201Bx'),
                rl0201Cx: this.getSecureValue(mongoData, 'RLUEx.RL0201.RL0201x.RL0201Cx'),
                rl0201Dx: this.getSecureValue(mongoData, 'RLUEx.RL0201.RL0201x.RL0201Dx'),
                rl0201Ex: this.getSecureValue(mongoData, 'RLUEx.RL0201.RL0201x.RL0201Ex'),
                rl0201Fx: this.getSecureValue(mongoData, 'RLUEx.RL0201.RL0201x.RL0201Fx'),
                rl0201Gx: this.getSecureValue(mongoData, 'RLUEx.RL0201.RL0201x.RL0201Gx'),
                rl0201Hx: this.getSecureValue(mongoData, 'RLUEx.RL0201.RL0201x.RL0201Hx'),
                rl0201Ix: this.getSecureValue(mongoData, 'RLUEx.RL0201.RL0201x.RL0201Ix'),
                rl0201Kx: this.getSecureValue(mongoData, 'RLUEx.RL0201.RL0201x.RL0201Kx'),
                rl0201Mx: this.getSecureValue(mongoData, 'RLUEx.RL0201.RL0201x.RL0201Mx'),
                rl0201Qx: this.getSecureValue(mongoData, 'RLUEx.RL0201.RL0201x.RL0201Qx'),
                rl0201Rx: this.getSecureValue(mongoData, 'RLUEx.RL0201.RL0201x.RL0201Rx'),
                // Condition d'inscription (niveau RL0201)
                rl0201U: this.getSecureValue(mongoData, 'RLUEx.RL0201.RL0201U'),
                
                // === SECTION 2 : IDENTIFICATION DU PROPRIÉTAIRE ===
                // Traitement des propriétaires avec TOUS les champs MongoDB
                ...this.processOwnersComplete(extractedData.rl0201x, extractedData.rl0201),
                
                // === SECTION 3 : CARACTÉRISTIQUES DE L'UNITÉ D'ÉVALUATION ===
                ...this.extractCharacteristicsInfo(mongoData),
                
                // === SECTION 4 : VALEURS ET ÉVALUATION ===
                ...this.extractValuationInfo(mongoData),
                
                // === SECTION 5 : RENSEIGNEMENTS ANNEXABLES ===
                ...this.extractAnnexableInfo(mongoData),
                
                // === SECTION 6 : RÉPARTITIONS FISCALES ===
                ...this.extractFiscalInfo(mongoData),
                
                // === SECTION 6bis : DÉCLARATION PAR L'ÉVALUATEUR ===
                rl0601A: this.getSecureValue(mongoData, 'RL0601A'),
                rl0601B: this.getSecureValue(mongoData, 'RL0601B'),
                rl0602A: this.getSecureValue(mongoData, 'RL0602A'),
                rl0603A: this.getSecureValue(mongoData, 'RL0603A'),
                rl0604A: this.getSecureValue(mongoData, 'RL0604A'),
                rl0605A: this.getSecureValue(mongoData, 'RL0605A'),

                // === SECTION 7 : SECTIONS SPÉCIALES RLZU ===
                ...this.extractSpecialSections(mongoData)
            };
            // Ajouts Phase 1: champs formatés par propriété
            property.formattedPropertyAddress = this.getFormattedPropertyAddress(mongoData) || this.getFormattedPropertyAddress(property);
            property.formattedOwners = this.getFormattedOwners(mongoData);
            // Section 1: valeurs d'affichage nettoyées (pas de "Non disponible")
            const sdv = (v) => this.sanitizeDisplayValue(v);
            // Dossier et classification
            property.displayNumeroDossier = sdv(property.rl0106A);
            const utilCode = sdv(property.rl0105A);
            const utilLabel = this.getUtilisationLabel(utilCode);
            property.displayUtilisation = utilLabel ? `${utilLabel} (Code: ${utilCode})` : (utilCode ? `(Code: ${utilCode})` : '');
            property.displayUniteVoisinage = sdv(property.rl0107A);
            // Informations du rôle
            property.displayVersion = sdv(property.version);
            property.displayCodeMunicipalite = sdv(property.codeMunicipalite);
            property.displayAnneeRole = sdv(property.anneeRole);
            // Identification cadastrale
            property.displayRl0104A = sdv(property.rl0104A);
            property.displayRl0104B = sdv(property.rl0104B);
            property.displayRl0104C = sdv(property.rl0104C);
            property.displayRl0104G = sdv(property.rl0104G);
            property.displayRl0104D = sdv(property.rl0104D);

            // === SECTION 3 : CARACTÉRISTIQUES (affichage épuré) ===
            // Bâtiment principal
            property.displayRl0306A = sdv(property.rl0306A);
            property.displayRl0307A = sdv(property.rl0307A);
            {
                const cTypeCode = sdv(property.rl0307B);
                const cTypeLabel = this.getConstructionTypeLabel(cTypeCode);
                property.displayRl0307B = cTypeLabel || (cTypeCode ? `(Code: ${cTypeCode})` : '');
            }
            property.displayRl0317A = sdv(property.rl0317A);
            // Terrain
            property.displayRl0302A = sdv(property.rl0302A);
            property.displayRl0301A = sdv(property.rl0301A);
            {
                const zCode = sdv(property.rl0303A);
                const zLabel = this.getZonageAgricoleLabel(zCode);
                property.displayRl0303A = zLabel || (zCode ? `(Code: ${zCode})` : '');
            }
            property.displayRl0305A = sdv(property.rl0305A);
            // Autres caractéristiques
            property.displayRl0309A = sdv(property.rl0309A);
            property.displayRl0310A = sdv(property.rl0310A);
            property.displayRl0311A = sdv(property.rl0311A);
            property.displayRl0312A = sdv(property.rl0312A);

            // === SECTION 4 : VALEURS (affichage épuré) ===
            property.displayRl0401A = sdv(property.rl0401A);
            // Valeurs en vigueur
            property.displayRl0402A = this.formatNumber(sdv(property.rl0402A));
            property.displayRl0403A = this.formatNumber(sdv(property.rl0403A));
            property.displayRl0404A = this.formatNumber(sdv(property.rl0404A));
            property.displayRl0411A = this.formatNumber(sdv(property.rl0411A));
            property.displayRl0412A = this.formatNumber(sdv(property.rl0412A));
            // Valeur comparative (brut ou numérique formaté)
            property.displayRl0405A = this.formatNumber(sdv(property.rl0405A));
            property.displayRl0406A = sdv(property.rl0406A);
            property.displayRl0407A = sdv(property.rl0407A);
            property.displayRl0408A = this.formatNumber(sdv(property.rl0408A));
            property.displayRl0409A = this.formatNumber(sdv(property.rl0409A));
            property.displayRl0410A = this.formatNumber(sdv(property.rl0410A));

            // === SECTION 5 : RÉPARTITION FISCALE (affichage épuré) ===
            // Catégories de base
            property.displayRl0501A = sdv(property.rl0501A);
            property.displayRl0502A = sdv(property.rl0502A);
            property.displayRl0502B = sdv(property.rl0502B);
            property.displayRl0502C = sdv(property.rl0502C);
            property.displayRl0503A = sdv(property.rl0503A);
            property.displayRl0503B = sdv(property.rl0503B);
            property.displayRl0503C = sdv(property.rl0503C);
            // Secteur
            property.displayRl0508A = sdv(property.rl0508A);

            // === SECTION 6 : DÉCLARATION PAR L'ÉVALUATEUR (affichage épuré) ===
            property.displayRl0601A = sdv(property.rl0601A); // Nom de l'évaluateur
            property.displayRl0601B = sdv(property.rl0601B); // Prénom de l'évaluateur
            property.displayRl0602A = sdv(property.rl0602A); // Titre de l'évaluateur
            property.displayRl0603A = sdv(property.rl0603A); // Organisme municipal responsable
            property.displayRl0604A = sdv(property.rl0604A); // Date de signature
            property.displayRl0605A = sdv(property.rl0605A); // Lieu de signature
            // Libellés dérivés pour affichage (statut et condition)
            const fallbackOwner = property.owners && property.owners.length ? property.owners[0] : undefined;
            let statutCodeForBadge = property.rl0201Hx || '';
            // Si code invalide/non disponible au niveau propriété, basculer sur le 1er propriétaire
            if (String(statutCodeForBadge) !== '1' && String(statutCodeForBadge) !== '2') {
                statutCodeForBadge = (fallbackOwner ? fallbackOwner.statutCode : '') || '';
            }
            if (String(statutCodeForBadge) !== '1' && String(statutCodeForBadge) !== '2') {
                statutCodeForBadge = '';
            }
            property.statutImpositionCode = statutCodeForBadge;
            property.statutImpositionLabel = this.getStatutImpositionLabel(property.statutImpositionCode);
            property.conditionInscriptionLabel = this.getConditionInscriptionLabel(property.rl0201U);

            // === SECTION 7 : INFORMATIONS ANNEXABLES GLOBALES (affichage épuré) ===
            property.displayRlzg0001 = sdv(property.rlzg0001);
            property.displayRlzg0002 = sdv(property.rlzg0002);
            property.displayRlzu3001A = sdv(property.rlzu3001A);
            property.displayRlzu3001B = sdv(property.rlzu3001B);
            property.displayRlzu3001C = sdv(property.rlzu3001C);
            property.displayRlzu5001A = sdv(property.rlzu5001A);
            property.displayRlzu5001B = sdv(property.rlzu5001B);
            property.displayRlzu5001C = sdv(property.rlzu5001C);

            // === SECTION 8 : RENSEIGNEMENTS ANNEXABLES DE L'UNITÉ (affichage épuré) ===
            property.displayRlzu3005A = sdv(property.rlzu3005A);
            property.displayRlzu3005B = sdv(property.rlzu3005B);
            property.displayRlzu3005C = sdv(property.rlzu3005C);
            property.displayRlzu3006B = sdv(property.rlzu3006B);
            property.displayRlzu3007x = sdv(property.rlzu3007x);
            property.displayRlzu3101 = sdv(property.rlzu3101);
            property.displayRlzu3102 = sdv(property.rlzu3102);
            property.displayRlzu3103 = sdv(property.rlzu3103);
            property.displayRlzu3104 = this.formatNumber(sdv(property.rlzu3104));
            property.displayRlzu4001 = this.formatNumber(sdv(property.rlzu4001));
            property.displayRlzu4002 = this.formatNumber(sdv(property.rlzu4002));

            // Mapping compatible pour la logique d'adresse unifiée (accès brut RL0201x)
            property.RL0201x = [];
            if (mongoData && mongoData.RLUEx && mongoData.RLUEx.RL0201 && mongoData.RLUEx.RL0201.RL0201x) {
                const raw = mongoData.RLUEx.RL0201.RL0201x;
                property.RL0201x = Array.isArray(raw) ? raw : [raw];
            }
            // (debug supprimé)
            // Visibilité conditionnelle des sections et normalisation des détails
            const hasAnyValue = (...vals) => vals.some(v => v !== undefined && v !== null && String(v).trim() && String(String(v)).trim().toLowerCase() !== 'non disponible');
            property.rl0504Details = Array.isArray(property.rl0504x) ? property.rl0504x : [];
            property.section3Visible = hasAnyValue(
                property.rl0301A,
                property.rl0302A,
                property.rl0303A,
                property.rl0311A,
                property.rl0312A,
                property.rl0320A
            );
            // (debug supprimé)
            
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
            rluex,
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
    extractIdentificationInfo(mongoData) {
        return {
            // Groupe Adresse (RL0101x)
            rl0101Ax: this.getSecureValue(mongoData, 'RLUEx.RL0101.RL0101x.RL0101Ax'),
            rl0101Bx: this.getSecureValue(mongoData, 'RLUEx.RL0101.RL0101x.RL0101Bx'),
            rl0101Cx: this.getSecureValue(mongoData, 'RLUEx.RL0101.RL0101x.RL0101Cx'),
            rl0101Dx: this.getSecureValue(mongoData, 'RLUEx.RL0101.RL0101x.RL0101Dx'),
            rl0101Ex: this.getSecureValue(mongoData, 'RLUEx.RL0101.RL0101x.RL0101Ex'),
            rl0101Fx: this.getSecureValue(mongoData, 'RLUEx.RL0101.RL0101x.RL0101Fx'),
            rl0101Gx: this.getSecureValue(mongoData, 'RLUEx.RL0101.RL0101x.RL0101Gx'),
            rl0101Hx: this.getSecureValue(mongoData, 'RLUEx.RL0101.RL0101x.RL0101Hx'),
            rl0101Ix: this.getSecureValue(mongoData, 'RLUEx.RL0101.RL0101x.RL0101Ix'),
            rl0101Jx: this.getSecureValue(mongoData, 'RLUEx.RL0101.RL0101x.RL0101Jx'),
            postalCode: this.getSecureValue(mongoData, 'RLUEx.RL0101.RL0101x.POSTALCODE'),

            // Groupe Numéro de dossier (RL0103x)
            rl0103Ax: this.getSecureValue(mongoData, 'RLUEx.RL0103.RL0103x.RL0103Ax'),

            // Groupe Détails cadastraux (RL0104)
            rl0104A: this.getSecureValue(mongoData, 'RLUEx.RL0104.RL0104A'),
            rl0104B: this.getSecureValue(mongoData, 'RLUEx.RL0104.RL0104B'),
            rl0104C: this.getSecureValue(mongoData, 'RLUEx.RL0104.RL0104C'),
            rl0104D: this.getSecureValue(mongoData, 'RLUEx.RL0104.RL0104D'),
            rl0104E: this.getSecureValue(mongoData, 'RLUEx.RL0104.RL0104E'),
            rl0104F: this.getSecureValue(mongoData, 'RLUEx.RL0104.RL0104F'),
            rl0104G: this.getSecureValue(mongoData, 'RLUEx.RL0104.RL0104G'),
            rl0104H: this.getSecureValue(mongoData, 'RLUEx.RL0104.RL0104H'),

            // === AUTRES INFORMATIONS D'IDENTIFICATION COMPLÈTES ===
            rl0105A: this.getSecureValue(mongoData, 'RLUEx.RL0105A'),
            rl0106A: this.getSecureValue(mongoData, 'RLUEx.RL0106A'),
            rl0107A: this.getSecureValue(mongoData, 'RLUEx.RL0107A'),

            // === INFORMATIONS SUPPLÉMENTAIRES ===
            rl0108A: this.getSecureValue(mongoData, 'RLUEx.RL0108A'),
            rl0109A: this.getSecureValue(mongoData, 'RLUEx.RL0109A'),
            rl0110A: this.getSecureValue(mongoData, 'RLUEx.RL0110A'),
            rl0111A: this.getSecureValue(mongoData, 'RLUEx.RL0111A'),
            rl0112A: this.getSecureValue(mongoData, 'RLUEx.RL0112A')
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
                    const nom = this.sanitizeDisplayValue(prop.RL0201Ax) || 'Non disponible';
                    const prenom = this.sanitizeDisplayValue(prop.RL0201Bx);
                    
                    // Statut et dates
                    const statutCode = prop.RL0201Hx || '';
                    const dateInscription = prop.RL0201Gx || '';

                    // ADRESSE COMPLETE DU PROPRIÉTAIRE
                    const adresseComplete = {
                        // Adresse structurée
                        numeroCivique: this.sanitizeDisplayValue(prop.RL0201Ix),
                        fractionAdresse: this.sanitizeDisplayValue(prop.RL0201Jx),
                        codeGenerique: this.sanitizeDisplayValue(prop.RL0201Kx),
                        codeLien: this.sanitizeDisplayValue(prop.RL0201Lx),
                        nomVoiePublique: this.sanitizeDisplayValue(prop.RL0201Mx),
                        pointCardinal: this.sanitizeDisplayValue(prop.RL0201Nx),
                        numeroAppartement: this.sanitizeDisplayValue(prop.RL0201Ox),
                        fractionAppartement: this.sanitizeDisplayValue(prop.RL0201Px),
                        
                        // Adresse non structurée
                        adresseNonStructuree: this.sanitizeDisplayValue(prop.RL0201Cx),
                        
                        // Localisation
                        municipalite: this.sanitizeDisplayValue(prop.RL0201Dx),
                        codePostal: this.sanitizeDisplayValue(prop.RL0201Ex),
                        province: this.sanitizeDisplayValue(prop.RL0201Qx),
                        pays: this.sanitizeDisplayValue(prop.RL0201Rx),
                        
                        // Compléments
                        complementAdresse: this.sanitizeDisplayValue(prop.RL0201Fx),
                        casePostale: this.sanitizeDisplayValue(prop.RL0201Sx),
                        succursalePostale: this.sanitizeDisplayValue(prop.RL0201Tx)
                    };

                    return {
                        id: `owner_${index + 1}`,
                        fullName: prenom ? `${nom}, ${prenom}` : nom,
                        nom: nom,
                        prenom: prenom,
                        statutCode: statutCode,
                        statutLabel: this.getStatutImpositionLabel(statutCode),
                        dateInscription: dateInscription,
                        dateInscriptionFormatted: this.formatDate(dateInscription),
                        
                        // ADRESSE COMPLÈTE
                        adresse: adresseComplete,
                        
                        // Adresse formatée pour affichage
                        adresseFormatee: this.formatOwnerAddress(adresseComplete),
                        
                        // Champs existants (pour compatibilité)
                        adressePostale: this.sanitizeDisplayValue(prop.RL0201Cx),
                        ville: this.sanitizeDisplayValue(prop.RL0201Dx),
                        codePostal: this.sanitizeDisplayValue(prop.RL0201Ex)
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
    extractCharacteristicsInfo(mongoData) {
        return {
            // === CARACTÉRISTIQUES DU TERRAIN ===
            rl0301A: this.getSecureValue(mongoData, 'RLUEx.RL0301A'),
            rl0302A: this.getSecureValue(mongoData, 'RLUEx.RL0302A'),
            rl0303A: this.getSecureValue(mongoData, 'RLUEx.RL0303A'),
            rl0304A: this.getSecureValue(mongoData, 'RLUEx.RL0304A'),
            rl0305A: this.getSecureValue(mongoData, 'RLUEx.RL0305A'),
            rl0314A: this.getSecureValue(mongoData, 'RLUEx.RL0314A'),
            rl0315A: this.getSecureValue(mongoData, 'RLUEx.RL0315A'),
            rl0316A: this.getSecureValue(mongoData, 'RLUEx.RL0316A'),
            rl0320A: this.getSecureValue(mongoData, 'RLUEx.RL0320A'),
            
            // === CARACTÉRISTIQUES DU BÂTIMENT PRINCIPAL ===
            rl0306A: this.getSecureValue(mongoData, 'RLUEx.RL0306A'),
            rl0307A: this.getSecureValue(mongoData, 'RLUEx.RL0307A'),
            rl0307B: this.getSecureValue(mongoData, 'RLUEx.RL0307B'),
            rl0308A: this.getSecureValue(mongoData, 'RLUEx.RL0308A'),
            rl0309A: this.getSecureValue(mongoData, 'RLUEx.RL0309A'),
            rl0310A: this.getSecureValue(mongoData, 'RLUEx.RL0310A'),
            rl0311A: this.getSecureValue(mongoData, 'RLUEx.RL0311A'),
            rl0312A: this.getSecureValue(mongoData, 'RLUEx.RL0312A'),
            rl0313A: this.getSecureValue(mongoData, 'RLUEx.RL0313A'),
            rl0317A: this.getSecureValue(mongoData, 'RLUEx.RL0317A'),
            rl0318A: this.getSecureValue(mongoData, 'RLUEx.RL0318A'),
            
            // === CARACTÉRISTIQUES SUPPLÉMENTAIRES ===
            rl0319A: this.getSecureValue(mongoData, 'RLUEx.RL0319A'),
            rl0321A: this.getSecureValue(mongoData, 'RLUEx.RL0321A'),
            rl0322A: this.getSecureValue(mongoData, 'RLUEx.RL0322A'),
            rl0323A: this.getSecureValue(mongoData, 'RLUEx.RL0323A'),
            rl0324A: this.getSecureValue(mongoData, 'RLUEx.RL0324A')
        };
    }

    /**
     * Extraction des informations de valorisation
     */
    extractValuationInfo(mongoData) {
        return {
            // === VALEURS FONCIÈRES COMPLÈTES ===
            rl0401A: this.getSecureValue(mongoData, 'RLUEx.RL0401A'),
            rl0402A: this.getSecureValue(mongoData, 'RLUEx.RL0402A'),
            rl0403A: this.getSecureValue(mongoData, 'RLUEx.RL0403A'),
            rl0404A: this.getSecureValue(mongoData, 'RLUEx.RL0404A'),
            rl0405A: this.getSecureValue(mongoData, 'RLUEx.RL0405A'),
            
            // === INFORMATIONS FISCALES COMPLÈTES ===
            rl0406A: this.getSecureValue(mongoData, 'RLUEx.RL0406A'),
            rl0407A: this.getSecureValue(mongoData, 'RLUEx.RL0407A'),
            rl0408A: this.getSecureValue(mongoData, 'RLUEx.RL0408A'),
            rl0409A: this.getSecureValue(mongoData, 'RLUEx.RL0409A'),
            rl0410A: this.getSecureValue(mongoData, 'RLUEx.RL0410A'),
            
            // === VALEURS SUPPLÉMENTAIRES ===
            rl0411A: this.getSecureValue(mongoData, 'RLUEx.RL0411A'),
            rl0412A: this.getSecureValue(mongoData, 'RLUEx.RL0412A'),
            rl0413A: this.getSecureValue(mongoData, 'RLUEx.RL0413A'),
            rl0414A: this.getSecureValue(mongoData, 'RLUEx.RL0414A'),
            rl0415A: this.getSecureValue(mongoData, 'RLUEx.RL0415A')
        };
    }

    /**
     * Extraction des renseignements annexables
     */
    extractAnnexableInfo(mongoData) {
        const rl0504x = this.getSecureValue(mongoData, 'RLUEx.RL0504.RL0504x', []);
        const annexesUnite = this.getSecureValue(mongoData, 'RLUEx.RENSEIGNEMENTS_ANNEXABLES_UNITE', {});
        const annexesGlobal = this.getSecureValue(mongoData, 'RENSEIGNEMENTS_ANNEXABLES_GLOBAL', {});

        // RLZU1007/1008 details
        const rlzu1007Details = this.formatRLZU1007Details(annexesUnite.RLZU1007);
        const rlzu1008Details = this.formatRLZU1008Details(annexesUnite.RLZU1008);

        // RLZU2001 details: handle object or array for RLZU2001x
        let rlzu2001Details = [];
        const rlzu2001 = annexesUnite.RLZU2001;
        if (rlzu2001 && rlzu2001.RLZU2001x) {
            const src = rlzu2001.RLZU2001x;
            if (Array.isArray(src)) {
                rlzu2001Details = src.map((it) => ({
                    numeroBatiment: this.getSecureValue(it, 'RLZU2001Ax'),
                    coutRemplacement: this.getSecureValue(it, 'RLZU2001Bx'),
                    classe: this.getSecureValue(it, 'RLZU2001Ex'),
                    typeConstruction: this.getSecureValue(it, 'RLZU2001Fx')
                }));
            } else {
                rlzu2001Details = this.formatRLZU2001Details(rlzu2001);
            }
        }

        return {
            // Détails RL0504 déjà formatés
            rl0504x: this.formatRL0504DetailsFromArray(rl0504x),

            // RLZG (annexables global)
            rlzg0001: this.getSecureValue(annexesGlobal, 'RLZG0001'),
            rlzg0002: this.getSecureValue(annexesGlobal, 'RLZG0002'),

            // RLZU (annexables unité) - détails structurés
            rlzu1007Details,
            rlzu1008Details,
            rlzu2001Details,

            // RLZU (annexables unité) - champs plats
            rlzu3005A: this.getSecureValue(annexesUnite, 'RLZU3005A'),
            rlzu3005B: this.getSecureValue(annexesUnite, 'RLZU3005B'),
            rlzu3005C: this.getSecureValue(annexesUnite, 'RLZU3005C'),
            rlzu3006B: this.getSecureValue(annexesUnite, 'RLZU3006B'),
            rlzu3007x: this.getSecureValue(annexesUnite, 'RLZU3007x'),
            rlzu3101: this.getSecureValue(annexesUnite, 'RLZU3101'),
            rlzu3102: this.getSecureValue(annexesUnite, 'RLZU3102'),
            rlzu3103: this.getSecureValue(annexesUnite, 'RLZU3103'),
            rlzu3104: this.getSecureValue(annexesUnite, 'RLZU3104'),
            rlzu4001: this.getSecureValue(annexesUnite, 'RLZU4001'),
            rlzu4002: this.getSecureValue(annexesUnite, 'RLZU4002')
        };
    }

    /**
     * Extraction des informations fiscales et répartitions
     */
    extractFiscalInfo(mongoData) {
        const rl0502 = this.getSecureValue(mongoData, 'RLUEx.RL0502', {});
        const rl0503 = this.getSecureValue(mongoData, 'RLUEx.RL0503', {});
        const rluex = this.getSecureValue(mongoData, 'RLUEx', {});
        return {
            // === RÉPARTITIONS FISCALES COMPLÈTES ===
            rl0502A: this.getSecureValue(rl0502, 'RL0502A'), // Pourcentage imposable
            rl0503A: this.getSecureValue(rl0503, 'RL0503A'), // Code tarification
            
            // Informations supplémentaires fiscales
            rl0502B: this.getSecureValue(rl0502, 'RL0502B'), // Code d'exonération
            rl0502C: this.getSecureValue(rl0502, 'RL0502C'), // Date d'exonération
            rl0503B: this.getSecureValue(rl0503, 'RL0503B'), // Description tarification
            rl0503C: this.getSecureValue(rl0503, 'RL0503C'), // Facteur d'ajustement

            // Autres champs attendus par le template
            rl0501A: this.getSecureValue(rluex, 'RL0501A'),
            rl0508A: this.getSecureValue(rluex, 'RL0508A')
        };
    }

    /**
     * Extraction des sections spéciales RLZU
     */
    extractSpecialSections(mongoData) {
        // RLZU3001 peut se trouver soit dans GLOBAL, soit dans UNITE selon les municipalités
        const rlzu3001Global = this.getSecureValue(mongoData, 'RENSEIGNEMENTS_ANNEXABLES_GLOBAL.RLZU3001', {});
        const rlzu3001Unite = this.getSecureValue(mongoData, 'RLUEx.RENSEIGNEMENTS_ANNEXABLES_UNITE.RLZU3001', {});
        const rlzu3001 = (rlzu3001Global && Object.keys(rlzu3001Global).length) ? rlzu3001Global : rlzu3001Unite;

        // RLZU5001: informations de copropriété (généralement globales)
        const rlzu5001 = this.getSecureValue(mongoData, 'RENSEIGNEMENTS_ANNEXABLES_GLOBAL.RLZU5001', {});
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
     * Fonction utilitaire améliorée pour l'accès sécurisé aux propriétés MongoDB
     * Supporte les chemins imbriqués (ex: "RLUEx.RL0201.RL0201x.RL0201Ax")
     */
    getSecureValue(obj, path, defaultValue = 'Non disponible') {
        try {
            if (!obj) return defaultValue;
            if (typeof path === 'string' && path.includes('.')) {
                const parts = path.split('.');
                let current = obj;
                for (let i = 0; i < parts.length; i++) {
                    if (current === null || current === undefined) return defaultValue;
                    if (typeof current !== 'object') return defaultValue;
                    current = current[parts[i]];
                }
                return (current !== null && current !== undefined) ? current : defaultValue;
            }
            const value = obj[path];
            return (value !== null && value !== undefined) ? value : defaultValue;
        } catch (error) {
            return defaultValue;
        }
    }

    /**
     * Diagnostic structure MongoDB pour identifier les données disponibles
     */
    debugMongoStructure(mongoData, label = 'Document MongoDB') {
        // no-op in production; kept for occasional targeted diagnostics if needed
    }
    
    /**
     * Formatage des détails RL0504 (Détail des valeurs par usage)
     */
    formatRL0504DetailsFromArray(rl0504x) {
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

    // === Normalisation d'affichage ===
    sanitizeDisplayValue(value) {
        if (value === undefined || value === null) return '';
        const str = String(value).trim();
        if (!str) return '';
        return str.toLowerCase() === 'non disponible' ? '' : str;
    }

    // === Fonctions utilitaires de traduction des codes (propriétaire) ===
    getStatutImpositionLabel(code) {
        const labels = {
            '1': 'Personne physique',
            '2': 'Personne morale'
        };
        return labels[code] || 'Non défini';
    }

    getConditionInscriptionLabel(code) {
        const labels = {
            '1': 'Propriétaire',
            '2': 'Emphytéote',
            '3': 'Copropriété divise',
            '4': "Locataire terrain de l'État",
            '5': "Occupant immeuble exempté",
            '6': 'Bâtiment privé sur terrain public',
            '7': 'Roulotte devenue immeuble',
            '8': 'Copropriété indivise',
            '9': 'Disposition spécifique'
        };
        return labels[code] || 'Non défini';
    }

    getTypeVoieLabel(code) {
        const types = {
            'AL': 'Allée', 'AR': 'Ancienne route', 'AT': 'Autoroute', 'AV': 'Avenue',
            'BO': 'Boulevard', 'CA': 'Carré', 'CE': 'Cercle', 'CH': 'Chemin',
            'CL': 'Circle', 'CO': 'Cours', 'CR': 'Croissant', 'CS': 'Concession',
            'CT': 'Côte', 'DE': 'Desserte', 'DO': 'Domaine', 'DR': 'Drive',
            'DS': 'Descente', 'EC': 'Échangeur', 'EP': 'Esplanade', 'GA': 'Garden',
            'IM': 'Impasse', 'JA': 'Jardin', 'KO': 'Court', 'KR': 'Crescent',
            'LC': 'Lac', 'LN': 'Lane', 'MO': 'Montée', 'PL': 'Place',
            'PR': 'Promenade', 'PS': 'Plateau', 'PU': 'Plateau', 'RA': 'Rang',
            'RD': 'Road', 'RG': 'Ridge', 'RL': 'Ruelle', 'RO': 'Route',
            'RU': 'Rue', 'SN': 'Sentier', 'SQ': 'Square', 'ST': 'Street',
            'TA': 'Terrace', 'TC': 'Trait-carré', 'TE': 'Terrasse', 'TL': 'Trail',
            'TV': 'Traverse', 'VO': 'Voie'
        };
        if (!code) return '';
        return types[String(code).toUpperCase()] || code;
    }

    getLienAdresseLabel(code) {
        const liens = {
            'A': 'à', 'B': `à l'`, 'C': 'à la', 'D': 'au', 'E': 'aux',
            'F': 'chez', 'G': 'chez les', 'H': `d'`, 'I': `d'en`,
            'J': `de l'`, 'K': `de l'`, 'L': 'de la', 'M': 'des',
            'N': 'du', 'O': 'en', 'P': 'l', 'Q': 'la', 'R': 'le',
            'S': 'les', 'T': 'sur', 'U': `sur l'`, 'V': 'sur la',
            'W': 'sur les', 'X': 'sur les'
        };
        if (!code) return '';
        return liens[String(code).toUpperCase()] || code;
    }

    // === Traduction code d'utilisation prédominante (RL0105A) ===
    getUtilisationLabel(code) {
        if (!code) return '';
        const map = {
            '1000': 'Résidentiel',
            '2000': 'Agricole',
            '3000': 'Forestier',
            '4000': 'Infrastructure',
            '5000': 'Commercial',
            '6000': 'Services'
        };
        const key = String(code);
        return map[key] || '';
    }

    // === Traduction type de construction (RL0307B) ===
    getConstructionTypeLabel(code) {
        if (!code) return '';
        const map = { 'R': 'Rénovation', 'N': 'Neuf', 'E': 'Existant' };
        const key = String(code).toUpperCase();
        return map[key] || '';
    }

    // === Traduction zonage agricole (RL0303A) ===
    getZonageAgricoleLabel(code) {
        if (!code && code !== 0) return '';
        const map = { '0': 'Non zoné', '1': 'Partiellement zoné', '2': 'Entièrement zoné' };
        const key = String(code);
        return map[key] || '';
    }

    // === Formatage nombre (fr-CA) ===
    formatNumber(value) {
        if (value === undefined || value === null) return '';
        const str = String(value).replace(/\s/g, '').replace(/\u00A0/g, '');
        const num = Number(str.replace(',', '.'));
        if (Number.isFinite(num)) {
            try {
                return new Intl.NumberFormat('fr-CA').format(num);
            } catch (_e) {
                return String(num);
            }
        }
        return this.sanitizeDisplayValue(value);
    }
    
    // === Détermination si on doit utiliser l'adresse structurée pour tous les propriétaires ===
    get shouldUseStructuredAddress() {
        try {
            const ownersRaw = this.properties && this.properties[0] && this.properties[0].RL0201x ? this.properties[0].RL0201x : [];
            if (!ownersRaw || ownersRaw.length === 0) return false;
            return ownersRaw.every(owner => owner && owner.RL0201Ix && owner.RL0201Kx && owner.RL0201Mx);
        } catch (e) {
            return false;
        }
    }

    // === Adresse unifiée selon la règle de cohérence ===
    getUnifiedAddress(ownerData) {
        if (!ownerData) return '';
        if (this.shouldUseStructuredAddress) {
            const parts = [];
            if (ownerData.RL0201Ix) parts.push(ownerData.RL0201Ix);
            if (ownerData.RL0201Kx) parts.push(this.getTypeVoieLabel(ownerData.RL0201Kx));
            if (ownerData.RL0201Lx) parts.push(this.getLienAdresseLabel(ownerData.RL0201Lx));
            if (ownerData.RL0201Mx) parts.push(ownerData.RL0201Mx);
            return parts.join(' ');
        }
        return ownerData.RL0201Cx || '';
    }

    // === Nom formaté propriétaire (Prénom Nom si personne physique et données complètes) ===
    getFormattedOwnerName(ownerData) {
        try {
            const statut = this.sanitizeDisplayValue(ownerData && ownerData.RL0201Hx);
            const nom = this.sanitizeDisplayValue(ownerData && ownerData.RL0201Ax);
            const prenom = this.sanitizeDisplayValue(ownerData && ownerData.RL0201Bx);
            if (statut === '1' && nom && prenom) {
                return `${prenom} ${nom}`;
            }
            return nom || '';
        } catch (e) {
            return '';
        }
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
        if (!adresse) return '';
        
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
            const typeVoie = this.getTypeVoieLabel(adresse.codeGenerique);
            if (typeVoie) {
                voie = `${typeVoie} ${adresse.nomVoiePublique}`;
            } else {
                voie = adresse.nomVoiePublique;
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
        
        return adresseComplete || adresse.adresseNonStructuree || '';
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
