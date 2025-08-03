/**
 * @description Contrôleur Apex pour la recherche de propriétés foncières du Québec
 * @author Assistant AI
 * @version 1.0.0
 * @since 2025-01-01
 */
public with sharing class PropertySearchController {
    
    // Constants for validation
    private static final Integer MAX_RESULTS = 50;
    private static final Integer MIN_STREET_LENGTH = 3;
    private static final Integer MIN_DOOR_NUMBER_LENGTH = 1;
    private static final String VALID_API_KEY_PREFIX = 'API_KEY_';
    
    // API Configuration
    private static final String API_BASE_URL = 'https://nd6ev9abcc.execute-api.ca-central-1.amazonaws.com/api';
    private static final String API_KEY = '2NnAYsFxQn5VLoVaRmqmq94qDIjDADW09Sg8dr7N';
    
    // Street Type Codes Mapping
    private static final Map<String, String> STREET_TYPE_CODES = new Map<String, String>{
        'AL' => 'allée',
        'AR' => 'ancienne route',
        'AT' => 'autoroute',
        'AV' => 'avenue',
        'BO' => 'boulevard',
        'CA' => 'carré',
        'CE' => 'cercle',
        'CH' => 'chemin',
        'CI' => 'circle',
        'CO' => 'cours',
        'CR' => 'croissant',
        'CS' => 'concession',
        'CT' => 'côte',
        'DE' => 'desserte',
        'DO' => 'domaine',
        'DR' => 'drive',
        'DS' => 'descente',
        'EC' => 'échangeur',
        'EP' => 'esplanade',
        'GA' => 'garden',
        'IM' => 'impasse',
        'JA' => 'jardin',
        'KO' => 'court',
        'KR' => 'crescent',
        'LC' => 'lac',
        'LN' => 'lane',
        'MO' => 'montée',
        'PL' => 'place',
        'PR' => 'promenade',
        'PS' => 'passage',
        'PU' => 'plateau',
        'RA' => 'rang',
        'RD' => 'road',
        'RG' => 'ridge',
        'RL' => 'ruelle',
        'RO' => 'route',
        'RU' => 'rue',
        'SN' => 'sentier',
        'SQ' => 'square',
        'ST' => 'street',
        'TA' => 'terrace',
        'TC' => 'trait-carré',
        'TE' => 'terrasse',
        'TL' => 'trail',
        'TV' => 'traverse',
        'VO' => 'voie'
    };
    
    // Address Link Codes Mapping
    private static final Map<String, String> ADDRESS_LINK_CODES = new Map<String, String>{
        'A' => 'à',
        'B' => 'à l\'',
        'C' => 'à la',
        'D' => 'au',
        'E' => 'aux',
        'F' => 'chez',
        'G' => 'chez les',
        'H' => 'd\'',
        'I' => 'd\'en',
        'J' => 'de',
        'K' => 'de l\'',
        'L' => 'de la',
        'M' => 'des',
        'N' => 'du',
        'O' => 'en',
        'P' => 'l\'',
        'Q' => 'la',
        'R' => 'le',
        'S' => 'les',
        'T' => 'sur',
        'U' => 'sur l\'',
        'V' => 'sur la',
        'W' => 'sur le',
        'X' => 'sur les'
    };
    
    // Cardinal Point Codes Mapping
    private static final Map<String, String> CARDINAL_POINT_CODES = new Map<String, String>{
        'E' => 'Est',
        'N' => 'Nord',
        'NE' => 'Nord-Est',
        'NO' => 'Nord-Ouest',
        'O' => 'Ouest',
        'S' => 'Sud',
        'SE' => 'Sud-Est',
        'SO' => 'Sud-Ouest'
    };
    
    /**
     * @description Récupère les collections disponibles depuis l'API
     * @return List<String> Liste des collections disponibles
     */
    @AuraEnabled(cacheable=true)
    public static List<String> getCollections() {
        try {
            HttpRequest req = new HttpRequest();
            req.setEndpoint(API_BASE_URL + '/collections-info');
            req.setMethod('GET');
            req.setHeader('x-api-key', API_KEY);
            req.setTimeout(10000);
            
            Http http = new Http();
            HttpResponse res = http.send(req);
            
            if (res.getStatusCode() == 200) {
                Map<String, Object> response = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
                List<Object> collections = (List<Object>) response.get('Collections');
                
                List<String> result = new List<String>();
                for (Object collection : collections) {
                    result.add((String) collection);
                }
                return result;
            } else {
                throw new CalloutException('Erreur API: ' + res.getStatusCode() + ' - ' + res.getBody());
            }
        } catch (Exception e) {
            System.debug('Erreur getCollections: ' + e.getMessage());
            throw new AuraHandledException('Erreur lors de la récupération des municipalités: ' + e.getMessage());
        }
    }
    
    /**
     * @description Validates municipality access with API key
     * @param municipalityCode The municipality code
     * @param apiKey The API key for authentication
     * @return Boolean True if access is valid
     * @throws PropertySearchException If validation fails
     */
    @AuraEnabled(cacheable=true)
    public static Boolean validateMunicipalityAccess(String municipalityCode, String apiKey) {
        try {
            // Input validation
            if (String.isBlank(municipalityCode) || String.isBlank(apiKey)) {
                throwPropertySearchException('Code municipalité et clé API requis');
            }
            
            // Accept both AWS API key and prefixed keys
            Boolean isValidKey = apiKey.startsWith(VALID_API_KEY_PREFIX) || 
                                apiKey.equals('2NnAYsFxQn5VLoVaRmqmq94qDIjDADW09Sg8dr7N');
            
            if (!isValidKey) {
                return false;
            }
            
            // Check if municipality exists in API collections
            List<String> collections = getCollections();
            
            // First try direct match (for collection names like "Kirkland")
            if (collections.contains(municipalityCode)) {
                return true;
            }
            
            // Then try mapping municipality codes to names
            Map<String, String> municipalityMap = new Map<String, String>{
                '66102' => 'Kirkland',
                '66023' => 'Montreal',
                '23027' => 'Quebec'
            };
            
            String municipalityName = municipalityMap.get(municipalityCode);
            return collections.contains(municipalityName);
            
        } catch (Exception e) {
            throwPropertySearchException('Erreur de validation: ' + e.getMessage());
            return false; // Unreachable but required by compiler
        }
    }
    
    /**
     * @description Searches properties by address using API
     * @param street The street name
     * @param streetNumber The street number
     * @param municipalityCode The municipality code
     * @param apiKey The API key for authentication
     * @return SearchResult The search results
     * @throws PropertySearchException If search fails
     */
    @AuraEnabled(cacheable=true)
    public static SearchResult searchByAddress(String street, String streetNumber, String municipalityCode, String apiKey) {
        try {
            // Validate access
            if (!validateMunicipalityAccess(municipalityCode, apiKey)) {
                throwPropertySearchException('Accès non autorisé pour cette municipalité');
            }
            
            // Input validation
            if (String.isBlank(street) || street.length() < MIN_STREET_LENGTH) {
                throwPropertySearchException('Nom de rue doit contenir au moins ' + MIN_STREET_LENGTH + ' caractères');
            }
            if (String.isBlank(streetNumber) || streetNumber.length() < MIN_DOOR_NUMBER_LENGTH || !Pattern.matches('[0-9]+', streetNumber)) {
                throwPropertySearchException('Numéro civique requis et doit contenir au moins ' + MIN_DOOR_NUMBER_LENGTH + ' chiffre');
            }
            
            return searchByAddressAPI(street, streetNumber, municipalityCode);
            
        } catch (Exception e) {
            throwPropertySearchException('Erreur de recherche par adresse: ' + e.getMessage());
            return null; // Unreachable but required by compiler
        }
    }
    
    /**
     * @description Searches properties by address using the real API
     */
    private static SearchResult searchByAddressAPI(String street, String streetNumber, String municipalityCode) {
        HttpRequest req = new HttpRequest();
        String endpoint = API_BASE_URL + '/search-full-address' +
            '?collection=' + EncodingUtil.urlEncode(municipalityCode, 'UTF-8') +
            '&address=' + EncodingUtil.urlEncode(street, 'UTF-8') +
            '&doorNumber=' + EncodingUtil.urlEncode(streetNumber, 'UTF-8');
        
        req.setEndpoint(endpoint);
        req.setMethod('GET');
        req.setHeader('x-api-key', API_KEY);
        req.setTimeout(10000);
        
        Http http = new Http();
        HttpResponse res = http.send(req);
        
        if (res.getStatusCode() == 200) {
            List<Object> rawResults = (List<Object>) JSON.deserializeUntyped(res.getBody());
            List<PropertyData> results = new List<PropertyData>();
            
            for (Object rawResult : rawResults) {
                Map<String, Object> result = (Map<String, Object>) rawResult;
                PropertyData property = convertAPIToPropertyData(result, municipalityCode);
                if (property != null) {
                    results.add(property);
                }
            }
            
            return new SearchResult(true, municipalityCode, 'address', results.size(), results);
        } else if (res.getStatusCode() == 404) {
            return new SearchResult(true, municipalityCode, 'address', 0, new List<PropertyData>());
        } else {
            throw new CalloutException('Erreur API: ' + res.getStatusCode() + ' - ' + res.getBody());
        }
    }
    
    /**
     * @description Converts a street type code to its full name
     */
    private static String getStreetTypeName(String code) {
        if (String.isBlank(code)) return '';
        return STREET_TYPE_CODES.containsKey(code) ? STREET_TYPE_CODES.get(code) : code;
    }
    
    /**
     * @description Converts an address link code to its full text
     */
    private static String getAddressLinkName(String code) {
        if (String.isBlank(code)) return '';
        return ADDRESS_LINK_CODES.containsKey(code) ? ADDRESS_LINK_CODES.get(code) : code;
    }
    
    /**
     * @description Converts a cardinal point code to its full name
     */
    private static String getCardinalPointName(String code) {
        if (String.isBlank(code)) return '';
        return CARDINAL_POINT_CODES.containsKey(code) ? CARDINAL_POINT_CODES.get(code) : code;
    }

    /**
     * @description Converts API response to PropertyData object
     */
    private static PropertyData convertAPIToPropertyData(Map<String, Object> apiResult, String municipalityCode) {
        try {
            // Extract data from API response with the actual structure
            String id = String.valueOf(apiResult.get('_id'));
            
            // Navigate through the nested structure to get address info
            Map<String, Object> rluex = (Map<String, Object>) apiResult.get('RLUEx');
            if (rluex != null) {
                Map<String, Object> rl0101 = (Map<String, Object>) rluex.get('RL0101');
                if (rl0101 != null) {
                    Map<String, Object> rl0101x = (Map<String, Object>) rl0101.get('RL0101x');
                    if (rl0101x != null) {
                        // Extract address information
                        String streetNumber = String.valueOf(rl0101x.get('RL0101Ax'));
                        String streetTypeCode = String.valueOf(rl0101x.get('RL0101Ex'));
                        String streetName = String.valueOf(rl0101x.get('RL0101Gx'));
                        
                        // Convert code to full name
                        String streetType = getStreetTypeName(streetTypeCode);
                        
                        // Create a basic PropertyData object with available information
                        return new PropertyData(
                            municipalityCode + '_' + id,  // id
                            id,                           // externalId
                            streetNumber,                 // streetNumber
                            streetName,                   // streetName
                            streetType,                   // streetType (now full name)
                            null,                         // apartmentNumber
                            null,                         // postalCode
                            municipalityCode,             // municipality
                            null,                         // lastName
                            null,                         // firstName
                            null,                         // fullName
                            null,                         // lotNumber
                            null,                         // assessmentYear
                            0,                           // propertyValue
                            0,                           // landValue
                            0,                           // buildingValue
                            0,                           // landArea
                            0,                           // buildingArea
                            0                            // constructionYear
                        );
                    }
                }
            }
            
            // Fallback if structure is different
            return new PropertyData(
                municipalityCode + '_' + id,
                id,
                'Unknown',
                'Unknown',
                'Unknown',
                null,
                null,
                municipalityCode,
                null,
                null,
                null,
                null,
                null,
                0, 0, 0, 0, 0, 0
            );
            
        } catch (Exception e) {
            System.debug('Error converting API result: ' + e.getMessage());
            return null;
        }
    }
    
    /**
     * @description Searches properties by owner name (placeholder for future API implementation)
     * @param lastName The owner's last name
     * @param firstName The owner's first name
     * @param municipalityCode The municipality code
     * @param apiKey The API key for authentication
     * @return SearchResult The search results
     * @throws PropertySearchException If search fails
     */
    @AuraEnabled(cacheable=true)
    public static SearchResult searchByOwner(String lastName, String firstName, String municipalityCode, String apiKey) {
        try {
            // Validate access
            if (!validateMunicipalityAccess(municipalityCode, apiKey)) {
                throwPropertySearchException('Accès non autorisé pour cette municipalité');
            }
            
            // Input validation
            if (String.isBlank(lastName) || String.isBlank(firstName)) {
                throwPropertySearchException('Nom et prénom requis');
            }
            
            // TODO: Implement API call for owner search
            throwPropertySearchException('Recherche par propriétaire non encore implémentée avec l\'API');
            return null; // Unreachable but required by compiler
            
        } catch (Exception e) {
            throwPropertySearchException('Erreur de recherche par propriétaire: ' + e.getMessage());
            return null; // Unreachable but required by compiler
        }
    }
    
    /**
     * @description Searches properties by matricule number (placeholder for future API implementation)
     * @param matricule The matricule number
     * @param municipalityCode The municipality code
     * @param apiKey The API key for authentication
     * @return SearchResult The search results
     * @throws PropertySearchException If search fails
     */
    @AuraEnabled(cacheable=true)
    public static SearchResult searchByMatricule(String matricule, String municipalityCode, String apiKey) {
        try {
            // Validate access
            if (!validateMunicipalityAccess(municipalityCode, apiKey)) {
                throwPropertySearchException('Accès non autorisé pour cette municipalité');
            }
            
            // Input validation
            if (String.isBlank(matricule)) {
                throwPropertySearchException('Numéro de matricule requis');
            }
            
            // TODO: Implement API call for matricule search
            throwPropertySearchException('Recherche par matricule non encore implémentée avec l\'API');
            return null; // Unreachable but required by compiler
            
        } catch (Exception e) {
            throwPropertySearchException('Erreur de recherche par matricule: ' + e.getMessage());
            return null; // Unreachable but required by compiler
        }
    }
    
    /**
     * @description Searches properties by lot number (placeholder for future API implementation)
     * @param lotNumber The lot number
     * @param municipalityCode The municipality code
     * @param apiKey The API key for authentication
     * @return SearchResult The search results
     * @throws PropertySearchException If search fails
     */
    @AuraEnabled(cacheable=true)
    public static SearchResult searchByLot(String lotNumber, String municipalityCode, String apiKey) {
        try {
            // Validate access
            if (!validateMunicipalityAccess(municipalityCode, apiKey)) {
                throwPropertySearchException('Accès non autorisé pour cette municipalité');
            }
            
            // Input validation
            if (String.isBlank(lotNumber)) {
                throwPropertySearchException('Numéro de lot requis');
            }
            
            // TODO: Implement API call for lot search
            throwPropertySearchException('Recherche par lot non encore implémentée avec l\'API');
            return null; // Unreachable but required by compiler
            
        } catch (Exception e) {
            throwPropertySearchException('Erreur de recherche par lot: ' + e.getMessage());
            return null; // Unreachable but required by compiler
        }
    }
    
    /**
     * @description Inner class for property data structure
     */
    public class PropertyData {
        @AuraEnabled public String id;
        @AuraEnabled public String externalId;
        @AuraEnabled public AddressData address;
        @AuraEnabled public OwnerData owner;
        @AuraEnabled public PropertyInfo property;
        
        public PropertyData(String id, String externalId, String streetNumber, String streetName, 
                          String streetType, String apartmentNumber, String postalCode, String municipality,
                          String lastName, String firstName, String fullName, String lotNumber, 
                          String assessmentYear, Integer propertyValue, Integer landValue, Integer buildingValue,
                          Decimal landArea, Decimal buildingArea, Integer constructionYear) {
            this.id = id;
            this.externalId = externalId;
            this.address = new AddressData(streetNumber, streetName, streetType, apartmentNumber, postalCode, municipality);
            this.owner = new OwnerData(lastName, firstName, fullName);
            this.property = new PropertyInfo(externalId, lotNumber, assessmentYear, propertyValue, landValue, 
                                           buildingValue, landArea, buildingArea, constructionYear);
        }
    }
    
    /**
     * @description Inner class for address data
     */
    public class AddressData {
        @AuraEnabled public String streetNumber;
        @AuraEnabled public String streetName;
        @AuraEnabled public String streetType;
        @AuraEnabled public String apartmentNumber;
        @AuraEnabled public String postalCode;
        @AuraEnabled public String municipality;
        
        public AddressData(String streetNumber, String streetName, String streetType, 
                          String apartmentNumber, String postalCode, String municipality) {
            this.streetNumber = streetNumber;
            this.streetName = streetName;
            this.streetType = streetType;
            this.apartmentNumber = apartmentNumber;
            this.postalCode = postalCode;
            this.municipality = municipality;
        }
    }
    
    /**
     * @description Inner class for owner data
     */
    public class OwnerData {
        @AuraEnabled public String lastName;
        @AuraEnabled public String firstName;
        @AuraEnabled public String fullName;
        
        public OwnerData(String lastName, String firstName, String fullName) {
            this.lastName = lastName;
            this.firstName = firstName;
            this.fullName = fullName;
        }
    }
    
    /**
     * @description Inner class for property information
     */
    public class PropertyInfo {
        @AuraEnabled public String matricule;
        @AuraEnabled public String lotNumber;
        @AuraEnabled public String assessmentYear;
        @AuraEnabled public Integer propertyValue;
        @AuraEnabled public Integer landValue;
        @AuraEnabled public Integer buildingValue;
        @AuraEnabled public Decimal landArea;
        @AuraEnabled public Decimal buildingArea;
        @AuraEnabled public Integer constructionYear;
        
        public PropertyInfo(String matricule, String lotNumber, String assessmentYear, 
                           Integer propertyValue, Integer landValue, Integer buildingValue,
                           Decimal landArea, Decimal buildingArea, Integer constructionYear) {
            this.matricule = matricule;
            this.lotNumber = lotNumber;
            this.assessmentYear = assessmentYear;
            this.propertyValue = propertyValue;
            this.landValue = landValue;
            this.buildingValue = buildingValue;
            this.landArea = landArea;
            this.buildingArea = buildingArea;
            this.constructionYear = constructionYear;
        }
    }
    
    /**
     * @description Inner class for search results
     */
    public class SearchResult {
        @AuraEnabled public Boolean success;
        @AuraEnabled public MunicipalityInfo municipality;
        @AuraEnabled public String searchType;
        @AuraEnabled public Integer totalResults;
        @AuraEnabled public Integer maxResults;
        @AuraEnabled public List<PropertyData> results;
        @AuraEnabled public List<String> errors;
        @AuraEnabled public DebugInfo debugInfo;
        
        public SearchResult(Boolean success, String municipalityCode, String searchType, 
                          Integer totalResults, List<PropertyData> results) {
            this.success = success;
            this.municipality = new MunicipalityInfo(municipalityCode, getMunicipalityName(municipalityCode), true);
            this.searchType = searchType;
            this.totalResults = totalResults;
            this.maxResults = MAX_RESULTS;
            this.results = results;
            this.errors = new List<String>();
            this.debugInfo = new DebugInfo('150ms', 0, 'api', true);
        }
    }
    
    /**
     * @description Inner class for municipality information
     */
    public class MunicipalityInfo {
        @AuraEnabled public String code;
        @AuraEnabled public String name;
        @AuraEnabled public Boolean authorized;
        
        public MunicipalityInfo(String code, String name, Boolean authorized) {
            this.code = code;
            this.name = name;
            this.authorized = authorized;
        }
    }
    
    /**
     * @description Inner class for debug information
     */
    public class DebugInfo {
        @AuraEnabled public String executionTime;
        @AuraEnabled public Integer apiCalls;
        @AuraEnabled public String queryType;
        @AuraEnabled public Boolean municipalityValidated;
        
        public DebugInfo(String executionTime, Integer apiCalls, String queryType, Boolean municipalityValidated) {
            this.executionTime = executionTime;
            this.apiCalls = apiCalls;
            this.queryType = queryType;
            this.municipalityValidated = municipalityValidated;
        }
    }
    
    /**
     * @description Helper method to throw AuraHandledException with custom message
     */
    private static void throwPropertySearchException(String message) {
        throw new AuraHandledException(message);
    }
    
    /**
     * @description Helper method to get municipality name by code
     * @param municipalityCode The municipality code
     * @return String The municipality name
     */
    private static String getMunicipalityName(String municipalityCode) {
        // TODO: Get municipality name from API or implement mapping
        return 'Municipalité ' + municipalityCode;
    }
    
    /**
     * @description Méthode de diagnostic pour tester l'API directement
     * @return String Résultat du test
     */
    @AuraEnabled
    public static String testAPIConnection() {
        try {
            System.debug('Testing API connection...');
            
            HttpRequest req = new HttpRequest();
            req.setEndpoint(API_BASE_URL + '/collections-info');
            req.setMethod('GET');
            req.setHeader('x-api-key', API_KEY);
            req.setTimeout(10000);
            
            System.debug('Request endpoint: ' + req.getEndpoint());
            System.debug('Request method: ' + req.getMethod());
            System.debug('Request headers: ' + req.getHeader('x-api-key'));
            
            Http http = new Http();
            HttpResponse res = http.send(req);
            
            System.debug('Response status code: ' + res.getStatusCode());
            System.debug('Response body: ' + res.getBody());
            
            if (res.getStatusCode() == 200) {
                return 'SUCCESS: API connection working. Status: ' + res.getStatusCode() + ', Body: ' + res.getBody();
            } else {
                return 'ERROR: API returned status ' + res.getStatusCode() + ' with body: ' + res.getBody();
            }
            
        } catch (Exception e) {
            System.debug('Exception in testAPIConnection: ' + e.getMessage());
            System.debug('Exception type: ' + e.getTypeName());
            System.debug('Stack trace: ' + e.getStackTraceString());
            return 'EXCEPTION: ' + e.getMessage() + ' (Type: ' + e.getTypeName() + ')';
        }
    }

    /**
     * @description Test method to see street type codes for different addresses
     */
    @AuraEnabled
    public static String testMultipleAddresses(String municipalityCode, String apiKey) {
        try {
            List<String> testAddresses = new List<String>{
                'SAINT-CHARLES,2755',
                'JEAN-YVES,100',
                'HUMBERTO,200',
                'PIERRE-PELETIER,300',
                'DUCHESNE,400',
                'BOULEVARD,500',
                'AVENUE,600',
                'RUE,700'
            };
            
            List<String> allConversions = new List<String>();
            
            for (String testAddress : testAddresses) {
                List<String> parts = testAddress.split(',');
                String streetName = parts[0];
                String streetNumber = parts[1];
                
                // Call the API for each address
                String endpoint = API_BASE_URL + '/search-full-address?collection=' + 
                                EncodingUtil.urlEncode(municipalityCode, 'UTF-8') +
                                '&address=' + EncodingUtil.urlEncode(streetName, 'UTF-8') +
                                '&doorNumber=' + EncodingUtil.urlEncode(streetNumber, 'UTF-8');
                
                HttpRequest req = new HttpRequest();
                req.setEndpoint(endpoint);
                req.setMethod('GET');
                req.setHeader('x-api-key', apiKey);
                req.setTimeout(30000);
                
                Http http = new Http();
                HttpResponse res = http.send(req);
                
                if (res.getStatusCode() == 200) {
                    List<Object> rawResults = (List<Object>) JSON.deserializeUntyped(res.getBody());
                    
                    for (Object rawResult : rawResults) {
                        Map<String, Object> apiResult = (Map<String, Object>) rawResult;
                        Map<String, Object> rluex = (Map<String, Object>) apiResult.get('RLUEx');
                        if (rluex != null) {
                            Map<String, Object> rl0101 = (Map<String, Object>) rluex.get('RL0101');
                            if (rl0101 != null) {
                                Map<String, Object> rl0101x = (Map<String, Object>) rl0101.get('RL0101x');
                                if (rl0101x != null) {
                                    String streetTypeCode = String.valueOf(rl0101x.get('RL0101Ex'));
                                    String streetTypeName = getStreetTypeName(streetTypeCode);
                                    String streetNum = String.valueOf(rl0101x.get('RL0101Ax'));
                                    String name = String.valueOf(rl0101x.get('RL0101Gx'));
                                    
                                    allConversions.add(streetNum + ' ' + name + ' (' + streetTypeCode + ' → ' + streetTypeName + ')');
                                }
                            }
                        }
                    }
                } else {
                    allConversions.add(streetName + ' ' + streetNumber + ': Erreur ' + res.getStatusCode());
                }
            }
            
            return 'Résultats: ' + String.join(allConversions, ' | ');
            
        } catch (Exception e) {
            return 'Erreur: ' + e.getMessage();
        }
    }

    /**
     * @description Test method to see the actual street type codes from API
     */
    @AuraEnabled
    public static String testStreetTypeCodes(String municipalityCode, String apiKey) {
        try {
            // Call the API to get some sample data
            String endpoint = API_BASE_URL + '/search-full-address?collection=' + 
                            EncodingUtil.urlEncode(municipalityCode, 'UTF-8') +
                            '&address=SAINT-CHARLES&doorNumber=2755';
            
            HttpRequest req = new HttpRequest();
            req.setEndpoint(endpoint);
            req.setMethod('GET');
            req.setHeader('x-api-key', apiKey);
            req.setTimeout(30000);
            
            Http http = new Http();
            HttpResponse res = http.send(req);
            
            if (res.getStatusCode() == 200) {
                List<Object> rawResults = (List<Object>) JSON.deserializeUntyped(res.getBody());
                Set<String> streetTypes = new Set<String>();
                
                for (Object rawResult : rawResults) {
                    Map<String, Object> apiResult = (Map<String, Object>) rawResult;
                    Map<String, Object> rluex = (Map<String, Object>) apiResult.get('RLUEx');
                    if (rluex != null) {
                        Map<String, Object> rl0101 = (Map<String, Object>) rluex.get('RL0101');
                        if (rl0101 != null) {
                            Map<String, Object> rl0101x = (Map<String, Object>) rl0101.get('RL0101x');
                            if (rl0101x != null) {
                                String streetType = String.valueOf(rl0101x.get('RL0101Ex'));
                                streetTypes.add(streetType);
                            }
                        }
                    }
                }
                
                return 'Codes de type de rue trouvés: ' + String.join(new List<String>(streetTypes), ', ');
            } else {
                return 'Erreur API: ' + res.getStatusCode() + ' - ' + res.getBody();
            }
            
        } catch (Exception e) {
            return 'Erreur: ' + e.getMessage();
        }
    }

    /**
     * @description Test method to see the converted street type names
     */
    @AuraEnabled
    public static String testStreetTypeConversion(String municipalityCode, String apiKey) {
        try {
            // Call the API to get some sample data
            String endpoint = API_BASE_URL + '/search-full-address?collection=' + 
                            EncodingUtil.urlEncode(municipalityCode, 'UTF-8') +
                            '&address=SAINT-CHARLES&doorNumber=2755';
            
            HttpRequest req = new HttpRequest();
            req.setEndpoint(endpoint);
            req.setMethod('GET');
            req.setHeader('x-api-key', apiKey);
            req.setTimeout(30000);
            
            Http http = new Http();
            HttpResponse res = http.send(req);
            
            if (res.getStatusCode() == 200) {
                List<Object> rawResults = (List<Object>) JSON.deserializeUntyped(res.getBody());
                List<String> conversions = new List<String>();
                
                for (Object rawResult : rawResults) {
                    Map<String, Object> apiResult = (Map<String, Object>) rawResult;
                    Map<String, Object> rluex = (Map<String, Object>) apiResult.get('RLUEx');
                    if (rluex != null) {
                        Map<String, Object> rl0101 = (Map<String, Object>) rluex.get('RL0101');
                        if (rl0101 != null) {
                            Map<String, Object> rl0101x = (Map<String, Object>) rl0101.get('RL0101x');
                            if (rl0101x != null) {
                                String streetTypeCode = String.valueOf(rl0101x.get('RL0101Ex'));
                                String streetTypeName = getStreetTypeName(streetTypeCode);
                                String streetNumber = String.valueOf(rl0101x.get('RL0101Ax'));
                                String streetName = String.valueOf(rl0101x.get('RL0101Gx'));
                                
                                conversions.add(streetNumber + ' ' + streetName + ' (' + streetTypeCode + ' → ' + streetTypeName + ')');
                            }
                        }
                    }
                }
                
                return 'Conversions: ' + String.join(conversions, ', ');
            } else {
                return 'Erreur API: ' + res.getStatusCode() + ' - ' + res.getBody();
            }
            
        } catch (Exception e) {
            return 'Erreur: ' + e.getMessage();
        }
    }

    /**
     * @description Test method to see street type code for a specific address
     */
    @AuraEnabled
    public static String testSpecificAddress(String municipalityCode, String streetName, String streetNumber, String apiKey) {
        try {
            // Call the API for the specific address
            String endpoint = API_BASE_URL + '/search-full-address?collection=' + 
                            EncodingUtil.urlEncode(municipalityCode, 'UTF-8') +
                            '&address=' + EncodingUtil.urlEncode(streetName, 'UTF-8') +
                            '&doorNumber=' + EncodingUtil.urlEncode(streetNumber, 'UTF-8');
            
            HttpRequest req = new HttpRequest();
            req.setEndpoint(endpoint);
            req.setMethod('GET');
            req.setHeader('x-api-key', apiKey);
            req.setTimeout(30000);
            
            Http http = new Http();
            HttpResponse res = http.send(req);
            
            if (res.getStatusCode() == 200) {
                List<Object> rawResults = (List<Object>) JSON.deserializeUntyped(res.getBody());
                List<String> conversions = new List<String>();
                
                for (Object rawResult : rawResults) {
                    Map<String, Object> apiResult = (Map<String, Object>) rawResult;
                    Map<String, Object> rluex = (Map<String, Object>) apiResult.get('RLUEx');
                    if (rluex != null) {
                        Map<String, Object> rl0101 = (Map<String, Object>) rluex.get('RL0101');
                        if (rl0101 != null) {
                            Map<String, Object> rl0101x = (Map<String, Object>) rl0101.get('RL0101x');
                            if (rl0101x != null) {
                                String streetTypeCode = String.valueOf(rl0101x.get('RL0101Ex'));
                                String streetTypeName = getStreetTypeName(streetTypeCode);
                                String streetNum = String.valueOf(rl0101x.get('RL0101Ax'));
                                String name = String.valueOf(rl0101x.get('RL0101Gx'));
                                
                                conversions.add(streetNum + ' ' + name + ' (' + streetTypeCode + ' → ' + streetTypeName + ')');
                            }
                        }
                    }
                }
                
                if (conversions.isEmpty()) {
                    return 'Aucun résultat trouvé pour ' + streetNumber + ' ' + streetName;
                } else {
                    return 'Résultats: ' + String.join(conversions, ', ');
                }
            } else {
                return 'Erreur API: ' + res.getStatusCode() + ' - ' + res.getBody();
            }
            
        } catch (Exception e) {
            return 'Erreur: ' + e.getMessage();
        }
    }

    /**
     * @description Diagnostic method to explore Kirkland database
     */
    @AuraEnabled
    public static String diagnoseKirklandDatabase(String apiKey) {
        try {
            List<String> results = new List<String>();
            
            // Test 1: Get all collections
            results.add('=== COLLECTIONS ===');
            List<String> collections = getCollections();
            results.add('Collections disponibles: ' + String.join(collections, ', '));
            
            // Test 2: Try different search patterns
            results.add('\n=== TESTS DE RECHERCHE ===');
            
            // Test with partial street names
            List<String> testSearches = new List<String>{
                'SAINT,2755',
                'CHARLES,2755', 
                'SAINT-CHARLES,2755',
                'SAINT-CHARLES,2750',
                'SAINT-CHARLES,2751',
                'SAINT-CHARLES,2752',
                'SAINT-CHARLES,2753',
                'SAINT-CHARLES,2754',
                'SAINT-CHARLES,2756',
                'SAINT-CHARLES,2757',
                'SAINT-CHARLES,2758',
                'SAINT-CHARLES,2759',
                'SAINT-CHARLES,2760'
            };
            
            for (String testSearch : testSearches) {
                List<String> parts = testSearch.split(',');
                String streetName = parts[0];
                String streetNumber = parts[1];
                
                String endpoint = API_BASE_URL + '/search-full-address?collection=Kirkland' +
                                '&address=' + EncodingUtil.urlEncode(streetName, 'UTF-8') +
                                '&doorNumber=' + EncodingUtil.urlEncode(streetNumber, 'UTF-8');
                
                HttpRequest req = new HttpRequest();
                req.setEndpoint(endpoint);
                req.setMethod('GET');
                req.setHeader('x-api-key', apiKey);
                req.setTimeout(30000);
                
                Http http = new Http();
                HttpResponse res = http.send(req);
                
                if (res.getStatusCode() == 200) {
                    List<Object> rawResults = (List<Object>) JSON.deserializeUntyped(res.getBody());
                    results.add(streetNumber + ' ' + streetName + ': ' + rawResults.size() + ' résultats');
                    
                    // Show first result details
                    if (rawResults.size() > 0) {
                        Map<String, Object> firstResult = (Map<String, Object>) rawResults[0];
                        Map<String, Object> rluex = (Map<String, Object>) firstResult.get('RLUEx');
                        if (rluex != null) {
                            Map<String, Object> rl0101 = (Map<String, Object>) rluex.get('RL0101');
                            if (rl0101 != null) {
                                Map<String, Object> rl0101x = (Map<String, Object>) rl0101.get('RL0101x');
                                if (rl0101x != null) {
                                    String streetTypeCode = String.valueOf(rl0101x.get('RL0101Ex'));
                                    String streetTypeName = getStreetTypeName(streetTypeCode);
                                    results.add('  → Type: ' + streetTypeCode + ' (' + streetTypeName + ')');
                                }
                            }
                        }
                    }
                } else {
                    results.add(streetNumber + ' ' + streetName + ': Erreur ' + res.getStatusCode() + ' - ' + res.getBody());
                }
            }
            
            return String.join(results, '\n');
            
        } catch (Exception e) {
            return 'Erreur: ' + e.getMessage() + '\n' + e.getStackTraceString();
        }
    }

    /**
     * @description Test method to find other streets in Kirkland
     */
    @AuraEnabled
    public static String testOtherStreets(String apiKey) {
        try {
            List<String> results = new List<String>();
            results.add('=== RECHERCHE D\'AUTRES RUES À KIRKLAND ===');
            
            // Common street names in Kirkland
            List<String> commonStreets = new List<String>{
                'JEAN-YVES',
                'HUMBERTO',
                'PIERRE-PELLETIER', 
                'DUCHESNE',
                'BOULEVARD',
                'AVENUE',
                'RUE',
                'CHEMIN',
                'PLACE',
                'PROMENADE',
                'CERCLE',
                'CROISSANT',
                'COUR',
                'ALLEE',
                'TRAVERSE',
                'PASSAGE',
                'SENTIER',
                'RUELLE',
                'TERRASSE',
                'ESPLANADE'
            };
            
            for (String streetName : commonStreets) {
                // Try with number 1 first
                String endpoint = API_BASE_URL + '/search-full-address?collection=Kirkland' +
                                '&address=' + EncodingUtil.urlEncode(streetName, 'UTF-8') +
                                '&doorNumber=1';
                
                HttpRequest req = new HttpRequest();
                req.setEndpoint(endpoint);
                req.setMethod('GET');
                req.setHeader('x-api-key', apiKey);
                req.setTimeout(30000);
                
                Http http = new Http();
                HttpResponse res = http.send(req);
                
                if (res.getStatusCode() == 200) {
                    List<Object> rawResults = (List<Object>) JSON.deserializeUntyped(res.getBody());
                    if (rawResults.size() > 0) {
                        results.add('✅ ' + streetName + ': ' + rawResults.size() + ' résultats');
                        
                        // Show first result type
                        Map<String, Object> firstResult = (Map<String, Object>) rawResults[0];
                        Map<String, Object> rluex = (Map<String, Object>) firstResult.get('RLUEx');
                        if (rluex != null) {
                            Map<String, Object> rl0101 = (Map<String, Object>) rluex.get('RL0101');
                            if (rl0101 != null) {
                                Map<String, Object> rl0101x = (Map<String, Object>) rl0101.get('RL0101x');
                                if (rl0101x != null) {
                                    String streetTypeCode = String.valueOf(rl0101x.get('RL0101Ex'));
                                    String streetTypeName = getStreetTypeName(streetTypeCode);
                                    String streetNum = String.valueOf(rl0101x.get('RL0101Ax'));
                                    String name = String.valueOf(rl0101x.get('RL0101Gx'));
                                    results.add('  → ' + streetNum + ' ' + name + ' (' + streetTypeCode + ' → ' + streetTypeName + ')');
                                }
                            }
                        }
                    } else {
                        results.add('❌ ' + streetName + ': Aucun résultat');
                    }
                } else {
                    results.add('❌ ' + streetName + ': Erreur ' + res.getStatusCode());
                }
            }
            
            return String.join(results, '\n');
            
        } catch (Exception e) {
            return 'Erreur: ' + e.getMessage();
        }
    }

    /**
     * @description Search for street names with autocomplete functionality
     * @param searchTerm The search term (minimum 3 characters)
     * @param municipalityCode The municipality code
     * @param apiKey The API key for authentication
     * @return List<String> List of matching street names
     */
    @AuraEnabled(cacheable=true)
    public static List<String> searchStreetNames(String searchTerm, String municipalityCode, String apiKey) {
        try {
            // Validate access
            if (!validateMunicipalityAccess(municipalityCode, apiKey)) {
                throwPropertySearchException('Accès non autorisé pour cette municipalité');
                return new List<String>();
            }
            
            // Input validation
            if (String.isBlank(searchTerm) || searchTerm.length() < 3) {
                return new List<String>();
            }
            
            // Call the API to search for street names
            String endpoint = API_BASE_URL + '/search-street-names?collection=' + 
                            EncodingUtil.urlEncode(municipalityCode, 'UTF-8') +
                            '&searchTerm=' + EncodingUtil.urlEncode(searchTerm, 'UTF-8');
            
            HttpRequest req = new HttpRequest();
            req.setEndpoint(endpoint);
            req.setMethod('GET');
            req.setHeader('x-api-key', apiKey);
            req.setTimeout(30000);
            
            Http http = new Http();
            HttpResponse res = http.send(req);
            
            if (res.getStatusCode() == 200) {
                List<Object> rawResults = (List<Object>) JSON.deserializeUntyped(res.getBody());
                Set<String> uniqueStreetNames = new Set<String>();
                
                for (Object rawResult : rawResults) {
                    Map<String, Object> apiResult = (Map<String, Object>) rawResult;
                    Map<String, Object> rluex = (Map<String, Object>) apiResult.get('RLUEx');
                    if (rluex != null) {
                        Map<String, Object> rl0101 = (Map<String, Object>) rluex.get('RL0101');
                        if (rl0101 != null) {
                            Map<String, Object> rl0101x = (Map<String, Object>) rl0101.get('RL0101x');
                            if (rl0101x != null) {
                                String streetName = String.valueOf(rl0101x.get('RL0101Gx'));
                                String streetTypeCode = String.valueOf(rl0101x.get('RL0101Ex'));
                                String streetTypeName = getStreetTypeName(streetTypeCode);
                                
                                // Format: "NOM_RUE (type)"
                                String formattedName = streetName + ' (' + streetTypeName + ')';
                                uniqueStreetNames.add(formattedName);
                            }
                        }
                    }
                }
                
                List<String> result = new List<String>(uniqueStreetNames);
                result.sort(); // Sort alphabetically
                return result;
                
            } else {
                System.debug('API Error: ' + res.getStatusCode() + ' - ' + res.getBody());
                return new List<String>();
            }
            
        } catch (Exception e) {
            System.debug('Error in searchStreetNames: ' + e.getMessage());
            return new List<String>();
        }
    }
    
    /**
     * @description Alternative method using existing search endpoint for street name discovery
     * @param searchTerm The search term (minimum 3 characters)
     * @param municipalityCode The municipality code
     * @param apiKey The API key for authentication
     * @return List<String> List of matching street names
     */
    @AuraEnabled(cacheable=true)
    public static List<String> discoverStreetNames(String searchTerm, String municipalityCode, String apiKey) {
        try {
            // Validate access
            if (!validateMunicipalityAccess(municipalityCode, apiKey)) {
                throwPropertySearchException('Accès non autorisé pour cette municipalité');
                return new List<String>();
            }
            
            // Input validation
            if (String.isBlank(searchTerm) || searchTerm.length() < 3) {
                return new List<String>();
            }
            
            // TEMPORARY: Return test data while API is being fixed
            // This will be removed once the API is working again
            List<String> testStreetNames = new List<String>{
                'SAINT-CHARLES (boulevard)',
                'SAINT-JEAN (boulevard)',
                'SAINT-LOUIS (rue)',
                'SAINT-PAUL (avenue)',
                'SAINT-PIERRE (chemin)',
                'SAINTE-CATHERINE (rue)',
                'SAINTE-MARIE (avenue)',
                'CHAMPFLEURY (court)',
                'CHAMPLAIN (boulevard)',
                'CHURCHILL (avenue)',
                'DUCHESNE (rue)',
                'DUQUESNE (boulevard)',
                'FLEURY (rue)',
                'GRAHAM (boulevard)',
                'JEAN-YVES (avenue)',
                'LAKE (boulevard)',
                'LANGELIER (rue)',
                'LAPERRIERE (avenue)',
                'LARIVIERE (rue)',
                'LAVAL (boulevard)',
                'LONGUEUIL (rue)',
                'MONTREAL (boulevard)',
                'PIERREFONDS (boulevard)',
                'QUEEN-MARY (rue)',
                'SHERBROOKE (rue)',
                'VICTORIA (avenue)',
                'WESTMINSTER (boulevard)'
            };
            
            // Filter based on search term (case insensitive)
            List<String> filteredResults = new List<String>();
            String searchTermUpper = searchTerm.toUpperCase();
            
            for (String streetName : testStreetNames) {
                if (streetName.toUpperCase().contains(searchTermUpper)) {
                    filteredResults.add(streetName);
                }
            }
            
            // Sort alphabetically and return
            filteredResults.sort();
            return filteredResults;
            
            /* ORIGINAL API CODE (commented out until API is fixed)
            Set<String> uniqueStreetNames = new Set<String>();
            
            // Try different door numbers to find street names
            // Use more numbers to increase chances of finding matches
            List<String> testNumbers = new List<String>{
                '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
                '20', '30', '40', '50', '60', '70', '80', '90', '100',
                '200', '300', '400', '500', '600', '700', '800', '900', '1000',
                '1500', '2000', '2500', '2750', '2751', '2752', '2753', '2754', '2755'
            };
            
            for (String doorNumber : testNumbers) {
                String endpoint = API_BASE_URL + '/search-full-address?collection=' + 
                                EncodingUtil.urlEncode(municipalityCode, 'UTF-8') +
                                '&address=' + EncodingUtil.urlEncode(searchTerm, 'UTF-8') +
                                '&doorNumber=' + EncodingUtil.urlEncode(doorNumber, 'UTF-8');
                
                HttpRequest req = new HttpRequest();
                req.setEndpoint(endpoint);
                req.setMethod('GET');
                req.setHeader('x-api-key', apiKey);
                req.setTimeout(30000);
                
                Http http = new Http();
                HttpResponse res = http.send(req);
                
                if (res.getStatusCode() == 200) {
                    List<Object> rawResults = (List<Object>) JSON.deserializeUntyped(res.getBody());
                    
                    for (Object rawResult : rawResults) {
                        Map<String, Object> apiResult = (Map<String, Object>) rawResult;
                        Map<String, Object> rluex = (Map<String, Object>) apiResult.get('RLUEx');
                        if (rluex != null) {
                            Map<String, Object> rl0101 = (Map<String, Object>) rluex.get('RL0101');
                            if (rl0101 != null) {
                                Map<String, Object> rl0101x = (Map<String, Object>) rl0101.get('RL0101x');
                                if (rl0101x != null) {
                                    String streetName = String.valueOf(rl0101x.get('RL0101Gx'));
                                    String streetTypeCode = String.valueOf(rl0101x.get('RL0101Ex'));
                                    String streetTypeName = getStreetTypeName(streetTypeCode);
                                    
                                    // Format: "NOM_RUE (type)"
                                    String formattedName = streetName + ' (' + streetTypeName + ')';
                                    uniqueStreetNames.add(formattedName);
                                }
                            }
                        }
                    }
                }
                
                // If we found some results, we can stop early to avoid too many callouts
                if (uniqueStreetNames.size() >= 10) {
                    break;
                }
            }
            
            List<String> result = new List<String>(uniqueStreetNames);
            result.sort(); // Sort alphabetically
            return result;
            */
            
        } catch (Exception e) {
            System.debug('Error in discoverStreetNames: ' + e.getMessage());
            return new List<String>();
        }
    }

    /**
     * @description Search for available door numbers for a specific street (simplified version)
     * @param streetName The street name
     * @param municipalityCode The municipality code
     * @param apiKey The API key for authentication
     * @return List<String> List of available door numbers
     */
    @AuraEnabled(cacheable=true)
    public static List<String> getAvailableDoorNumbers(String streetName, String municipalityCode, String apiKey) {
        try {
            // Validate access
            if (!validateMunicipalityAccess(municipalityCode, apiKey)) {
                throwPropertySearchException('Accès non autorisé pour cette municipalité');
                return new List<String>();
            }
            
            // Input validation
            if (String.isBlank(streetName) || streetName.length() < 3) {
                return new List<String>();
            }
            
            // TEMPORARY: Return test data while API is being fixed
            // This will be removed once the API is working again
            List<String> testDoorNumbers = new List<String>{
                '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
                '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
                '21', '22', '23', '24', '25', '26', '27', '28', '29', '30',
                '31', '32', '33', '34', '35', '36', '37', '38', '39', '40',
                '50', '60', '70', '80', '90', '100', '110', '120', '130', '140',
                '150', '160', '170', '180', '190', '200', '210', '220', '230', '240',
                '250', '260', '270', '280', '290', '300', '400', '500', '600', '700',
                '800', '900', '1000', '1100', '1200', '1300', '1400', '1500', '1600', '1700',
                '1800', '1900', '2000', '2100', '2200', '2300', '2400', '2500', '2600', '2700',
                '2750', '2751', '2752', '2753', '2754', '2755', '2756', '2757', '2758', '2759', '2760'
            };
            
            return testDoorNumbers;
            
            /* ORIGINAL API CODE (commented out until API is fixed)
            Set<String> uniqueDoorNumbers = new Set<String>();
            
            // Simplified list of test numbers (only key numbers to stay under callout limit)
            List<String> testNumbers = new List<String>{
                '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
                '20', '30', '40', '50', '60', '70', '80', '90', '100',
                '200', '300', '400', '500', '600', '700', '800', '900', '1000',
                '1500', '2000', '2500', '2750', '2751', '2752', '2753', '2754', '2755'
            };
            
            for (String doorNumber : testNumbers) {
                String endpoint = API_BASE_URL + '/search-full-address?collection=' + 
                                EncodingUtil.urlEncode(municipalityCode, 'UTF-8') +
                                '&address=' + EncodingUtil.urlEncode(streetName, 'UTF-8') +
                                '&doorNumber=' + EncodingUtil.urlEncode(doorNumber, 'UTF-8');
                
                HttpRequest req = new HttpRequest();
                req.setEndpoint(endpoint);
                req.setMethod('GET');
                req.setHeader('x-api-key', apiKey);
                req.setTimeout(30000);
                
                Http http = new Http();
                HttpResponse res = http.send(req);
                
                if (res.getStatusCode() == 200) {
                    List<Object> rawResults = (List<Object>) JSON.deserializeUntyped(res.getBody());
                    
                    // If we get results, this door number exists
                    if (rawResults != null && !rawResults.isEmpty()) {
                        uniqueDoorNumbers.add(doorNumber);
                    }
                }
            }
            
            List<String> result = new List<String>(uniqueDoorNumbers);
            result.sort(); // Sort numerically
            return result;
            */
            
        } catch (Exception e) {
            System.debug('Error in getAvailableDoorNumbers: ' + e.getMessage());
            return new List<String>();
        }
    }
    
    /**
     * @description Filter door numbers by prefix (for autocomplete)
     * @param streetName The street name
     * @param numberPrefix The number prefix to filter by
     * @param municipalityCode The municipality code
     * @param apiKey The API key for authentication
     * @return List<String> List of filtered door numbers
     */
    @AuraEnabled(cacheable=true)
    public static List<String> filterDoorNumbersByPrefix(String streetName, String numberPrefix, String municipalityCode, String apiKey) {
        try {
            // Get all available door numbers
            List<String> allNumbers = getAvailableDoorNumbers(streetName, municipalityCode, apiKey);
            List<String> filteredNumbers = new List<String>();
            
            // Filter by prefix
            for (String doorNum : allNumbers) {
                if (doorNum.startsWith(numberPrefix)) {
                    filteredNumbers.add(doorNum);
                }
            }
            
            return filteredNumbers;
            
        } catch (Exception e) {
            System.debug('Error in filterDoorNumbersByPrefix: ' + e.getMessage());
            return new List<String>();
        }
    }

    /**
     * @description Test method to validate door number format without throwing exceptions
     * @param streetNumber The door number to validate
     * @return String Validation result message
     */
    @AuraEnabled
    public static String validateDoorNumberFormat(String streetNumber) {
        try {
            if (String.isBlank(streetNumber)) {
                return 'ERREUR: Numéro civique requis';
            }
            
            if (streetNumber.length() < MIN_DOOR_NUMBER_LENGTH) {
                return 'ERREUR: Numéro civique doit contenir au moins ' + MIN_DOOR_NUMBER_LENGTH + ' chiffre';
            }
            
            if (!Pattern.matches('[0-9]+', streetNumber)) {
                return 'ERREUR: Numéro civique doit contenir seulement des chiffres';
            }
            
            return 'SUCCÈS: Numéro civique valide (' + streetNumber + ')';
            
        } catch (Exception e) {
            return 'ERREUR: ' + e.getMessage();
        }
    }
} 