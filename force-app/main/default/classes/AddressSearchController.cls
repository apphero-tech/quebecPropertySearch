public with sharing class AddressSearchController {
    
    // Configuration API
    private static final String API_BASE_URL = 'https://nd6ev9abcc.execute-api.ca-central-1.amazonaws.com/api';
    
    /**
     * Convertit un code municipalité en nom de collection utilisé par l'API
     * Retourne null si non supporté
     */
    private static String getCollectionName(String municipalityCode) {
        if (String.isBlank(municipalityCode)) {
            return null;
        }
        Map<String, String> codeToCollection = new Map<String, String>{
            '66102' => 'Kirkland',
            '66023' => 'Montreal',
            '23027' => 'Quebec'
        };
        // 1) Si une correspondance code→collection existe, l'utiliser
        if (codeToCollection.containsKey(municipalityCode)) {
            return codeToCollection.get(municipalityCode);
        }
        // 2) Sinon, considérer l'entrée comme un nom de collection renvoyé par l'API
        //    (permet Val-Morin, etc.)
        return municipalityCode;
    }
    
    /**
     * Recherche des suggestions de rues basées sur un terme de recherche
     * @param searchTerm Le terme de recherche (ex: "HYM")
     * @return Liste des suggestions de rues formatées
     */
    @AuraEnabled(cacheable=true)
    public static List<String> getStreetSuggestions(String searchTerm, String municipalityCode, String apiKey) {
        try {
            System.debug('=== AddressSearchController.getStreetSuggestions START ===');
            System.debug('Search term: ' + searchTerm);
            System.debug('Municipality code: ' + municipalityCode);
            if (String.isBlank(apiKey)) {
                System.debug('Missing API key, returning empty list');
                return new List<String>();
            }
            
            if (String.isBlank(searchTerm) || searchTerm.length() < 2) {
                System.debug('Search term too short, returning empty list');
                return new List<String>();
            }
            
            // Déterminer la collection à partir du code municipalité
            String collectionName = getCollectionName(municipalityCode);
            if (String.isBlank(collectionName)) {
                System.debug('Unsupported municipality: ' + municipalityCode);
                return new List<String>();
            }
            
            // Construction et exécution de la requête via helper
            String endpoint = API_BASE_URL + '/distinct-streets';
            Map<String, String> qp = new Map<String, String>{
                'collection' => collectionName,
                'address' => searchTerm
            };
            HttpRequest req = PropertySearchHttp.buildGet(endpoint, qp, apiKey, 30000);
            HttpResponse res = PropertySearchHttp.send(req);
            System.debug('Response status: ' + (res == null ? -1 : res.getStatusCode()));
            System.debug('Response body: ' + (res == null ? 'null' : res.getBody()));
            String body = PropertySearchHttp.getBodyIfOk(res);
            if (body == null) {
                System.debug('API Error or null response, returning empty list');
                return new List<String>();
            }
            // Parsing sécurisé de la réponse JSON
            List<String> suggestions = parseStreetSuggestions(body);
            

            
            System.debug('Final suggestions: ' + suggestions);
            System.debug('Final suggestions count: ' + suggestions.size());
            System.debug('Final suggestions is null: ' + (suggestions == null));
            System.debug('=== AddressSearchController.getStreetSuggestions END ===');
            
            return suggestions;
            
        } catch (Exception e) {
            System.debug('Exception in getStreetSuggestions: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            return new List<String>();
        }
    }
    
    /**
     * Parsing sécurisé des suggestions de rues depuis la réponse JSON
     * @param jsonResponse La réponse JSON de l'API
     * @return Liste des suggestions formatées
     */
    private static List<String> parseStreetSuggestions(String jsonResponse) {
        List<String> suggestions = new List<String>();
        
        try {
            if (String.isBlank(jsonResponse)) {
                System.debug('Empty JSON response');
                return suggestions;
            }
            
            // Parsing du JSON principal
            Object jsonObj = JSON.deserializeUntyped(jsonResponse);
            if (!(jsonObj instanceof Map<String, Object>)) {
                System.debug('JSON root is not a Map');
                return suggestions;
            }
            
            Map<String, Object> rootMap = (Map<String, Object>) jsonObj;
            System.debug('Root map keys: ' + rootMap.keySet());
            
            // Structure API réelle: {"streets": [{"RL0101Gx": "HYMUS", "RL0101Ex": "BO"}]}
            Object streetsObj = rootMap.get('streets');
            if (streetsObj instanceof List<Object>) {
                List<Object> streetsList = (List<Object>) streetsObj;
                System.debug('Streets list size: ' + streetsList.size());
                
                for (Object street : streetsList) {
                    if (street instanceof Map<String, Object>) {
                        Map<String, Object> streetMap = (Map<String, Object>) street;
                        String streetName = extractStreetNameFromMongoDB(streetMap);
                        if (String.isNotBlank(streetName)) {
                            suggestions.add(streetName);
                        }
                    }
                }
            }
            
            System.debug('Final suggestions count: ' + suggestions.size());
            
        } catch (Exception e) {
            System.debug('Exception in parseStreetSuggestions: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
        }
        
        return suggestions;
    }
    

    
    /**
     * Extraction du nom de rue depuis un objet MongoDB
     * @param streetMap L'objet contenant les données de rue MongoDB
     * @return Le nom de rue formaté ou null
     */
    private static String extractStreetNameFromMongoDB(Map<String, Object> streetMap) {
        try {
            System.debug('MongoDB street map keys: ' + streetMap.keySet());
            
            // Extraction du nom de rue (RL0101Gx)
            Object streetNameObj = streetMap.get('RL0101Gx');
            if (!(streetNameObj instanceof String) || String.isBlank((String) streetNameObj)) {
                System.debug('RL0101Gx is not a valid string');
                return null;
            }
            
            String streetName = (String) streetNameObj;
            
            // Extraction du type de rue (RL0101Ex)
            Object streetTypeObj = streetMap.get('RL0101Ex');
            String streetType = '';
            if (streetTypeObj instanceof String && String.isNotBlank((String) streetTypeObj)) {
                streetType = (String) streetTypeObj;
            }
            
            // Formatage du résultat
            String formattedStreet = streetName;
            if (String.isNotBlank(streetType)) {
                // Conversion des codes de type de rue
                String typeDisplay = convertStreetType(streetType);
                if (String.isNotBlank(typeDisplay)) {
                    formattedStreet += ' (' + typeDisplay + ')';
                }
            }
            
            System.debug('Extracted MongoDB street: ' + formattedStreet);
            return formattedStreet;
            
        } catch (Exception e) {
            System.debug('Exception in extractStreetNameFromMongoDB: ' + e.getMessage());
            return null;
        }
    }
    
    /**
     * Conversion des codes de type de rue MongoDB en texte lisible
     * @param typeCode Le code de type (ex: "BO", "RU", etc.)
     * @return Le type de rue en texte lisible
     */
    private static String convertStreetType(String typeCode) {
        Map<String, String> typeMapping = new Map<String, String>{
            'BO' => 'boulevard',
            'RU' => 'rue',
            'AV' => 'avenue',
            'CH' => 'chemin',
            'CR' => 'crescent',
            'DR' => 'drive',
            'PL' => 'place',
            'ST' => 'street',
            'BL' => 'blvd'
        };
        
        return typeMapping.get(typeCode.toUpperCase());
    }
    
    /**
     * Récupère la liste des collections disponibles
     * @return Liste des collections
     */
    @AuraEnabled(cacheable=true)
    public static List<String> getAvailableCollections(String apiKey) {
        try {
            System.debug('=== AddressSearchController.getAvailableCollections START ===');
            if (String.isBlank(apiKey)) {
                System.debug('Missing API key, returning empty list');
                return new List<String>();
            }
            
            // Construction et exécution de la requête via helper
            String endpoint = API_BASE_URL + '/collections-info';
            HttpRequest req = PropertySearchHttp.buildGet(endpoint, new Map<String,String>(), apiKey, 30000);
            HttpResponse res = PropertySearchHttp.send(req);
            System.debug('Response status: ' + (res == null ? -1 : res.getStatusCode()));
            System.debug('Response body: ' + (res == null ? 'null' : res.getBody()));
            String body = PropertySearchHttp.getBodyIfOk(res);
            if (body == null) {
                System.debug('API Error or null response, returning empty list');
                return new List<String>();
            }
            
            // Parsing de la réponse JSON
            List<String> allCollections = parseCollectionsInfo(body);

            // Retourner directement les collections renvoyées par l'API (les permissions sont gérées côté API)
            System.debug('All collections from API (no client-side filtering): ' + allCollections);
            System.debug('Final collections count: ' + allCollections.size());
            System.debug('=== AddressSearchController.getAvailableCollections END ===');
            
            return allCollections;
            
        } catch (Exception e) {
            System.debug('Exception in getAvailableCollections: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            return new List<String>();
        }
    }
    
    /**
     * Parsing des informations des collections
     * @param jsonResponse La réponse JSON de l'API
     * @return Liste des collections
     */
    private static List<String> parseCollectionsInfo(String jsonResponse) {
        List<String> collections = new List<String>();
        
        try {
            if (String.isBlank(jsonResponse)) {
                System.debug('Empty JSON response');
                return collections;
            }
            
            // Parsing du JSON principal
            Object jsonObj = JSON.deserializeUntyped(jsonResponse);
            
            // Structure: {"Collections": ["Val-Morin", "Saint-Adolphe", ...]}
            if (jsonObj instanceof Map<String, Object>) {
                Map<String, Object> rootMap = (Map<String, Object>) jsonObj;
                Object collectionsObj = rootMap.get('Collections');
                
                if (collectionsObj instanceof List<Object>) {
                    List<Object> collectionsList = (List<Object>) collectionsObj;
                    System.debug('Collections list size: ' + collectionsList.size());
                    
                    for (Object collection : collectionsList) {
                        if (collection instanceof String) {
                            collections.add((String) collection);
                        }
                    }
                }
            } else if (jsonObj instanceof List<Object>) {
                // Fallback: structure directe
                List<Object> collectionsList = (List<Object>) jsonObj;
                System.debug('Collections list size: ' + collectionsList.size());
                
                for (Object collection : collectionsList) {
                    if (collection instanceof String) {
                        collections.add((String) collection);
                    }
                }
            }
            
            System.debug('Parsed collections count: ' + collections.size());
            
        } catch (Exception e) {
            System.debug('Exception in parseCollectionsInfo: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
        }
        
        return collections;
    }
    
    /**
     * Recherche des numéros de rue disponibles pour une rue donnée
     * @param streetName Le nom de la rue (ex: "HYMUS (boulevard)")
     * @param municipalityCode Le code de la municipalité
     * @param apiKey La clé API
     * @return Liste des numéros disponibles
     */
    // Removed getStreetNumbers (unused, expensive callout loop)
    
    /**
     * Test direct de l'API pour vérifier les données MongoDB réelles
     * @param streetName Le nom de la rue à tester
     * @return Réponse brute de l'API
     */
    // Removed testDirectAPI (debug-only, not used by LWC)

    /**
     * Test direct de l'endpoint distinct-owner pour debug
     */
    // Removed testOwnerEndpoint (debug-only, not used by LWC)
    
    /**
     * Recherche des détails complets d'une propriété
     * @param streetName Le nom de la rue
     * @param streetNumber Le numéro de rue
     * @return Détails de la propriété
     */
    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getPropertyDetails(String streetName, String streetNumber, String municipalityCode, String apiKey) {
        try {
            System.debug('=== AddressSearchController.getPropertyDetails START ===');
            System.debug('Street: ' + streetName + ', Number: ' + streetNumber);
            System.debug('Street is blank: ' + String.isBlank(streetName));
            System.debug('Number is blank: ' + String.isBlank(streetNumber));
            if (String.isBlank(apiKey)) {
                System.debug('Missing API key, returning null');
                return null;
            }
            
            // Déterminer la collection à partir du code municipalité
            String collectionName = getCollectionName(municipalityCode);
            if (String.isBlank(collectionName)) {
                System.debug('Unsupported municipality: ' + municipalityCode);
                return null;
            }
            
            if (String.isBlank(streetName) || String.isBlank(streetNumber)) {
                System.debug('Missing parameters, returning null');
                return null;
            }
            
            // ✅ NOUVEAU : Nettoyer le nom de rue si nécessaire
            String cleanStreetName = streetName;
            if (streetName.contains('(')) {
                cleanStreetName = streetName.split('\\(')[0].trim();
                System.debug('Cleaned street name: ' + cleanStreetName);
            }
            
            // ✅ ÉTAPE 1 : Recherche pour obtenir l'ID du document
            String searchEndpoint = API_BASE_URL + '/search-full-address';
            Map<String, String> searchQp = new Map<String, String>{
                'collection' => collectionName,
                'address' => cleanStreetName,
                'doorNumber' => streetNumber
            };
            HttpRequest searchReq = PropertySearchHttp.buildGet(searchEndpoint, searchQp, apiKey, 30000);
            HttpResponse searchRes = PropertySearchHttp.send(searchReq);
            System.debug('Search response status: ' + (searchRes == null ? -1 : searchRes.getStatusCode()));
            System.debug('Search response body: ' + (searchRes == null ? 'null' : searchRes.getBody()));
            String searchBody = PropertySearchHttp.getBodyIfOk(searchRes);
            if (searchBody == null) {
                System.debug('Search API Error or null response');
                return null;
            }
            
            // ✅ ÉTAPE 2 : Extraire l'ID du document depuis la réponse de recherche
            String documentId = extractDocumentId(searchRes.getBody());
            if (String.isBlank(documentId)) {
                System.debug('No document ID found in search response');
                return null;
            }
            
            System.debug('Extracted document ID: ' + documentId);
            
            // ✅ ÉTAPE 3 : Récupérer le document complet avec l'ID
            String documentEndpoint = API_BASE_URL + '/document/' + documentId;
            Map<String, String> docQp = new Map<String, String>{
                'collection' => collectionName
            };
            HttpRequest documentReq = PropertySearchHttp.buildGet(documentEndpoint, docQp, apiKey, 30000);
            HttpResponse documentRes = PropertySearchHttp.send(documentReq);
            System.debug('Document response status: ' + (documentRes == null ? -1 : documentRes.getStatusCode()));
            System.debug('Document response body: ' + (documentRes == null ? 'null' : documentRes.getBody()));
            String docBody = PropertySearchHttp.getBodyIfOk(documentRes);
            if (docBody == null) {
                System.debug('Document API Error or null response');
                return null;
            }
            
            // ✅ ÉTAPE 4 : Parser le document complet et retourner directement le Map
            Map<String, Object> document = parseCompletePropertyDetails(docBody);
            
            System.debug('Final document: ' + document);
            System.debug('=== AddressSearchController.getPropertyDetails END ===');
            
            return document;
            
        } catch (Exception e) {
            System.debug('Exception in getPropertyDetails: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            return null;
        }
    }

    /**
     * Recherche de propriétés par propriétaire (personne physique ou morale)
     * @param name Nom de famille (physique) ou nom d'entreprise (morale)
     * @param firstName Prénom (optionnel pour personne physique)
     * @param ownerType 'physical' ou 'moral' (peut être null → heuristique côté client)
     * @param municipalityCode Code municipalité (autorisé: 'Kirkland' ou '66102')
     * @param apiKey Clé API
     * @return Liste de documents MongoDB correspondant à la recherche
     */
    @AuraEnabled(cacheable=true)
    public static List<Object> searchByOwner(String name, String firstName, String ownerType, String municipalityCode, String apiKey) {
        List<Object> documents = new List<Object>();
        try {
            System.debug('=== SEARCH BY OWNER DEBUG ===');
            System.debug('Input lastName (name): ' + name);
            System.debug('Input firstName: ' + firstName);
            System.debug('Municipality: ' + municipalityCode);
            System.debug('=== AddressSearchController.searchByOwner START ===');
            System.debug('Params - name: ' + name + ', firstName: ' + firstName + ', ownerType: ' + ownerType + ', municipalityCode: ' + municipalityCode);
            if (String.isBlank(apiKey)) {
                System.debug('Missing API key, returning empty list');
                return documents;
            }

            // Déterminer la collection à partir du code municipalité
            String collectionName = getCollectionName(municipalityCode);
            if (String.isBlank(collectionName)) {
                System.debug('Unsupported municipality: ' + municipalityCode);
                return documents;
            }

            if (String.isBlank(name)) {
                return documents;
            }

            // Base URL (contract confirmé: last_name / first_name)
            String endpoint = API_BASE_URL + '/search-owner';

            // Construire les URLs selon la stratégie validée
            List<Object> result;
            // Contrat API: always use last_name (uppercase) and optional first_name (uppercase)
            String ln = String.isBlank(name) ? '' : name.toUpperCase();
            String fn = String.isBlank(firstName) ? '' : firstName.toUpperCase();
            Map<String,String> qp = new Map<String,String>{
                'collection' => collectionName,
                'last_name' => ln
            };
            if (String.isNotBlank(fn)) {
                qp.put('first_name', fn);
            }
            HttpRequest req = PropertySearchHttp.buildGet(endpoint, qp, apiKey, 30000);
            HttpResponse resp = PropertySearchHttp.send(req);
            System.debug('Owner search URL: ' + req.getEndpoint());
            System.debug('Owner search status: ' + (resp == null ? -1 : resp.getStatusCode()));
            System.debug('Owner search body: ' + (resp == null ? 'null' : resp.getBody()));
            String body = PropertySearchHttp.getBodyIfOk(resp);
            result = body == null ? new List<Object>() : parseOwnerSearchResponse(body);
            if (!result.isEmpty()) {
                System.debug('API returned ' + result.size() + ' items');
                return result;
            }
            // As a permissive fallback, retry last_name only if first_name was provided and got no result
            if (String.isNotBlank(fn)) {
                Map<String,String> qp2 = new Map<String,String>{
                    'collection' => collectionName,
                    'last_name' => ln
                };
                HttpRequest req2 = PropertySearchHttp.buildGet(endpoint, qp2, apiKey, 30000);
                HttpResponse resp2 = PropertySearchHttp.send(req2);
                System.debug('Fallback URL (last_name only): ' + req2.getEndpoint());
                String body2 = PropertySearchHttp.getBodyIfOk(resp2);
                result = body2 == null ? new List<Object>() : parseOwnerSearchResponse(body2);
                if (!result.isEmpty()) {
                    return result;
                }
            }

            System.debug('No owner results found with provided parameters');
            return documents;

        } catch (Exception e) {
            System.debug('Exception in searchByOwner: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            return documents;
        }
    }

    /**
     * Parsing tolérant de la réponse owner search
     */
    private static List<Object> parseOwnerSearchResponse(String jsonResponse) {
        List<Object> documents = new List<Object>();
        try {
            if (String.isBlank(jsonResponse)) {
                return documents;
            }
            Object jsonObj = JSON.deserializeUntyped(jsonResponse);
            if (jsonObj instanceof List<Object>) {
                documents = (List<Object>) jsonObj;
            } else if (jsonObj instanceof Map<String, Object>) {
                Map<String, Object> jsonMap = (Map<String, Object>) jsonObj;
                // Ignorer si message d'erreur
                Object error = jsonMap.get('error');
                if (error == null) {
                    documents.add(jsonMap);
                }
            }
        } catch (Exception e) {
            System.debug('Exception in parseOwnerSearchResponse: ' + e.getMessage());
        }
        return documents;
    }

    /**
     * Exécuter une requête GET et parser la réponse pour la recherche propriétaire
     */
    private static List<Object> performOwnerRequest(String url, String apiKey) {
        try {
            HttpRequest req = new HttpRequest();
            req.setEndpoint(url);
            req.setMethod('GET');
            req.setHeader('x-api-key', apiKey);
            req.setHeader('Content-Type', 'application/json');
            req.setTimeout(30000);
            Http http = new Http();
            HttpResponse res = http.send(req);
            System.debug('Owner search URL: ' + url);
            System.debug('Owner search status: ' + res.getStatusCode());
            System.debug('Owner search body: ' + res.getBody());
            if (res.getStatusCode() != 200) {
                return new List<Object>();
            }
            return parseOwnerSearchResponse(res.getBody());
        } catch (Exception e) {
            System.debug('Exception in performOwnerRequest: ' + e.getMessage());
            return new List<Object>();
        }
    }

    /**
     * Suggestions de propriétaires (un seul champ Nom) – retourne une liste d'objets {id, value, display}
     */
    @AuraEnabled(cacheable=true)
    public static List<Object> searchOwnerSuggestions(String ownerName, String municipalityCode, String apiKey) {
        List<Object> suggestions = new List<Object>();
        try {
            System.debug('=== OWNER SUGGESTIONS DEBUG START ===');
            System.debug('Original ownerName: ' + ownerName);
            System.debug('Municipality: ' + municipalityCode);
            System.debug('API key (masked): len=' + (apiKey == null ? 0 : apiKey.length()) + ', last4=' + (apiKey == null || apiKey.length() < 4 ? 'NA' : apiKey.substring(apiKey.length()-4)));
            if (String.isBlank(apiKey)) {
                System.debug('Missing API key, returning empty suggestions');
                System.debug('=== OWNER SUGGESTIONS DEBUG END ===');
                return suggestions;
            }
            if (String.isBlank(ownerName) || ownerName.length() < 2) {
                System.debug('Owner name too short, returning empty suggestions');
                System.debug('=== OWNER SUGGESTIONS DEBUG END ===');
                return suggestions;
            }
            // Déterminer la collection à partir du code municipalité
            String collectionName = getCollectionName(municipalityCode);
            if (String.isBlank(collectionName)) {
                System.debug('Unsupported municipality: ' + municipalityCode);
                System.debug('=== OWNER SUGGESTIONS DEBUG END ===');
                return suggestions;
            }

            // Endpoint distinct propriétaire: même pattern que les rues (query params via helper)
            String endpoint = API_BASE_URL + '/search-distinct-owner';
            String upper = ownerName == null ? '' : ownerName.trim().toUpperCase();
            Map<String,String> qp = new Map<String,String>{
                'collection' => collectionName,
                'last_name' => upper
            };
            HttpRequest req = PropertySearchHttp.buildGet(endpoint, qp, apiKey, 20000);
            HttpResponse res = PropertySearchHttp.send(req);
            System.debug('Endpoint URL: ' + req.getEndpoint());
            System.debug('API call status: ' + (res == null ? -1 : res.getStatusCode()));
            System.debug('Raw response body: ' + (res == null ? 'null' : res.getBody()));
            String body = PropertySearchHttp.getBodyIfOk(res);
            if (body == null) {
                System.debug('Non-200 status or null response for owner suggestions, returning empty');
                System.debug('=== OWNER SUGGESTIONS DEBUG END ===');
                return suggestions;
            }

            // Primary parse: { owners: [ { RL0201Ax, RL0201Bx }, ... ] }
            Object jsonObj = JSON.deserializeUntyped(body);
            if (jsonObj instanceof Map<String, Object>) {
                Map<String, Object> mapResp = (Map<String, Object>) jsonObj;
                System.debug('Parsed response keys: ' + mapResp.keySet());
                Object ownersObj = mapResp.get('owners');
                if (ownersObj instanceof List<Object>) {
                    List<Object> owners = (List<Object>) ownersObj;
                    System.debug('Owners array size: ' + owners.size());
                    if (!owners.isEmpty()) {
                        System.debug('First owner (preview): ' + owners[0]);
                    }
                    List<Object> fromDistinct = buildOwnerSuggestionsFromDistinctOwners(owners);
                    if (!fromDistinct.isEmpty()) {
                        System.debug('Final suggestions size (distinct): ' + fromDistinct.size());
                        System.debug('=== OWNER SUGGESTIONS DEBUG END ===');
                        return fromDistinct;
                    }
                }
                System.debug('Response does not contain owners key or is empty; checking legacy list format');
            }

            // Legacy fallback: ancienne forme (tableau de documents MongoDB) renvoyée par le même endpoint
            if (jsonObj instanceof List<Object>) {
                List<Object> docs = (List<Object>) jsonObj;
                List<Object> fallbackSuggestions = buildOwnerSuggestionsFromDocuments(docs);
                System.debug('Final suggestions size (legacy docs): ' + fallbackSuggestions.size());
                System.debug('=== OWNER SUGGESTIONS DEBUG END ===');
                return fallbackSuggestions;
            }

            // Rien de parsable
            System.debug('No owners found in response; returning empty suggestions');
            System.debug('=== OWNER SUGGESTIONS DEBUG END ===');
            return suggestions;
        } catch (Exception e) {
            System.debug('Exception in searchOwnerSuggestions: ' + e.getMessage());
            System.debug('=== OWNER SUGGESTIONS DEBUG END ===');
            return suggestions;
        }
    }

    // Construit des suggestions à partir d'une liste de documents MongoDB
    private static List<Object> buildOwnerSuggestionsFromDocuments(List<Object> docs) {
        List<Object> suggestions = new List<Object>();
        Set<String> seen = new Set<String>();
        Integer idx = 0;
        for (Object d : docs) {
            if (!(d instanceof Map<String, Object>)) continue;
            Map<String, Object> doc = (Map<String, Object>) d;
            Object rluexObj = doc.get('RLUEx');
            if (!(rluexObj instanceof Map<String, Object>)) continue;
            Map<String, Object> rluex = (Map<String, Object>) rluexObj;
            Object rl0201Obj = rluex.get('RL0201');
            if (!(rl0201Obj instanceof Map<String, Object>)) continue;
            Map<String, Object> rl0201 = (Map<String, Object>) rl0201Obj;
            Object rl0201xObj = rl0201.get('RL0201x');
            if (rl0201xObj instanceof Map<String, Object>) {
                addOwnerSuggestionFromOwnerMap((Map<String, Object>) rl0201xObj, seen, suggestions, idx);
                idx++;
            } else if (rl0201xObj instanceof List<Object>) {
                for (Object o : (List<Object>) rl0201xObj) {
                    if (o instanceof Map<String, Object>) {
                        addOwnerSuggestionFromOwnerMap((Map<String, Object>) o, seen, suggestions, idx);
                        idx++;
                    }
                }
            }
        }
        return suggestions;
    }

    private static void addOwnerSuggestionFromOwnerMap(Map<String, Object> owner, Set<String> seen, List<Object> out, Integer idx) {
        String nomLegal = (String) owner.get('RL0201Ax');
        String prenom = (String) owner.get('RL0201Bx');
        String statut = (String) owner.get('RL0201Hx');
        if (String.isBlank(nomLegal)) return;
        String key = (prenom != null ? prenom : '') + '|' + nomLegal + '|' + (statut != null ? statut : '');
        if (seen.contains(key)) return;
        seen.add(key);
        String display = ('1' == statut && String.isNotBlank(prenom)) ? (nomLegal + ', ' + prenom) : nomLegal;
        Map<String, Object> suggestion = new Map<String, Object>();
        suggestion.put('id', String.valueOf(idx));
        suggestion.put('value', nomLegal);
        suggestion.put('display', display);
        out.add(suggestion);
    }

    // Construit des suggestions à partir du format distinct-owner: [{RL0201Ax, RL0201Bx}]
    private static List<Object> buildOwnerSuggestionsFromDistinctOwners(List<Object> owners) {
        List<Object> suggestions = new List<Object>();
        if (owners == null || owners.isEmpty()) {
            return suggestions;
        }
        Set<String> seen = new Set<String>();
        Integer idx = 0;
        for (Object o : owners) {
            if (!(o instanceof Map<String, Object>)) continue;
            Map<String, Object> owner = (Map<String, Object>) o;
            String nomLegal = (String) owner.get('RL0201Ax');
            String prenom = (String) owner.get('RL0201Bx');
            if (String.isBlank(nomLegal)) continue;
            String key = (prenom != null ? prenom : '') + '|' + nomLegal;
            if (seen.contains(key)) continue;
            seen.add(key);
            String display = String.isNotBlank(prenom) ? (nomLegal + ', ' + prenom) : nomLegal;
            Map<String, Object> suggestion = new Map<String, Object>();
            suggestion.put('id', String.valueOf(idx));
            suggestion.put('value', nomLegal);
            suggestion.put('display', display);
            suggestions.add(suggestion);
            idx++;
        }
        return suggestions;
    }
    
    /**
     * Extraction de l'ID du document depuis la réponse de recherche
     * @param searchResponse La réponse JSON de l'API de recherche
     * @return L'ID du document ou null si non trouvé
     */
    private static String extractDocumentId(String searchResponse) {
        try {
            List<Object> documents = (List<Object>) JSON.deserializeUntyped(searchResponse);
            if (documents != null && !documents.isEmpty()) {
                Object firstDoc = documents[0];
                if (firstDoc instanceof Map<String, Object>) {
                    Map<String, Object> document = (Map<String, Object>) firstDoc;
                    return String.valueOf(document.get('_id'));
                }
            }
            return null;
        } catch (Exception e) {
            System.debug('Exception in extractDocumentId: ' + e.getMessage());
            return null;
        }
    }
    
    /**
     * Parsing du document complet MongoDB
     * @param jsonResponse La réponse JSON de l'API document
     * @return Document MongoDB complet
     */
    private static Map<String, Object> parseCompletePropertyDetails(String jsonResponse) {
        try {
            // Parsing du JSON principal
            Object jsonObj = JSON.deserializeUntyped(jsonResponse);
            
            if (!(jsonObj instanceof Map<String, Object>)) {
                System.debug('JSON root is not a Map');
                return null;
            }
            
            Map<String, Object> document = (Map<String, Object>) jsonObj;
            System.debug('Complete document keys: ' + document.keySet());
            
            // Retourner directement le document MongoDB complet
            return document;
            
        } catch (Exception e) {
            System.debug('Exception in parseCompletePropertyDetails: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            return null;
        }
    }

    /**
     * Recherche d'une propriété par numéro de lot
     * Retourne le document MongoDB complet (même forme que la recherche adresse)
     */
    @AuraEnabled(cacheable=true)
    public static Map<String, Object> searchByLot(String apiKey, String municipalityCode, String lotNumber) {
        try {
            System.debug('=== AddressSearchController.searchByLot START ===');
            if (String.isBlank(apiKey)) {
                System.debug('Missing API key, returning null');
                return null;
            }
            // Déterminer la collection à partir du code municipalité
            String collectionName = getCollectionName(municipalityCode);
            if (String.isBlank(collectionName)) {
                System.debug('Unsupported municipality: ' + municipalityCode);
                return null;
            }
            if (String.isBlank(lotNumber)) {
                System.debug('Missing lotNumber, returning null');
                return null;
            }

            // Étape 1: rechercher par lot pour obtenir l'_id
            String searchEndpoint = API_BASE_URL + '/search-full-address';
            Map<String, String> searchQp = new Map<String, String>{
                'collection' => collectionName,
                'lot' => lotNumber
            };
            HttpRequest searchReq = PropertySearchHttp.buildGet(searchEndpoint, searchQp, apiKey, 30000);
            HttpResponse searchRes = PropertySearchHttp.send(searchReq);
            System.debug('Lot search URL: ' + searchReq.getEndpoint());
            System.debug('Lot search status: ' + (searchRes == null ? -1 : searchRes.getStatusCode()));
            System.debug('Lot search body: ' + (searchRes == null ? 'null' : searchRes.getBody()));
            String searchBody = PropertySearchHttp.getBodyIfOk(searchRes);
            if (searchBody == null) {
                System.debug('Lot search returned non-200 or null');
                return null;
            }

            String documentId = extractDocumentId(searchRes.getBody());
            if (String.isBlank(documentId)) {
                System.debug('No document ID found for lot search');
                return null;
            }

            // Étape 2: récupérer le document complet
            String documentEndpoint = API_BASE_URL + '/document/' + documentId;
            Map<String, String> docQp = new Map<String, String>{ 'collection' => collectionName };
            HttpRequest documentReq = PropertySearchHttp.buildGet(documentEndpoint, docQp, apiKey, 30000);
            HttpResponse documentRes = PropertySearchHttp.send(documentReq);
            System.debug('Lot document status: ' + (documentRes == null ? -1 : documentRes.getStatusCode()));
            System.debug('Lot document body: ' + (documentRes == null ? 'null' : documentRes.getBody()));
            String docBody = PropertySearchHttp.getBodyIfOk(documentRes);
            if (docBody == null) {
                System.debug('Lot document fetch returned non-200 or null');
                return null;
            }

            Map<String, Object> document = parseCompletePropertyDetails(docBody);
            System.debug('=== AddressSearchController.searchByLot END ===');
            return document;
        } catch (Exception e) {
            System.debug('Exception in searchByLot: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            return null;
        }
    }

    /**
     * Recherche d'une propriété par numéro de matricule
     * Retourne le document MongoDB complet (même forme que la recherche adresse)
     */
    @AuraEnabled(cacheable=true)
    public static Map<String, Object> searchByMatricule(String apiKey, String municipalityCode, String matriculeNumber) {
        try {
            System.debug('=== AddressSearchController.searchByMatricule START ===');
            if (String.isBlank(apiKey)) {
                System.debug('Missing API key, returning null');
                return null;
            }
            // Déterminer la collection à partir du code municipalité
            String collectionName = getCollectionName(municipalityCode);
            if (String.isBlank(collectionName)) {
                System.debug('Unsupported municipality: ' + municipalityCode);
                return null;
            }
            if (String.isBlank(matriculeNumber)) {
                System.debug('Missing matriculeNumber, returning null');
                return null;
            }

            // Étape 1: rechercher par matricule pour obtenir l'_id
            String searchEndpoint = API_BASE_URL + '/search-full-address';
            Map<String, String> searchQp = new Map<String, String>{
                'collection' => collectionName,
                'matricule' => matriculeNumber
            };
            HttpRequest searchReq = PropertySearchHttp.buildGet(searchEndpoint, searchQp, apiKey, 30000);
            HttpResponse searchRes = PropertySearchHttp.send(searchReq);
            System.debug('Matricule search URL: ' + searchReq.getEndpoint());
            System.debug('Matricule search status: ' + (searchRes == null ? -1 : searchRes.getStatusCode()));
            System.debug('Matricule search body: ' + (searchRes == null ? 'null' : searchRes.getBody()));
            String searchBody = PropertySearchHttp.getBodyIfOk(searchRes);
            if (searchBody == null) {
                System.debug('Matricule search returned non-200 or null');
                return null;
            }

            String documentId = extractDocumentId(searchRes.getBody());
            if (String.isBlank(documentId)) {
                System.debug('No document ID found for matricule search');
                return null;
            }

            // Étape 2: récupérer le document complet
            String documentEndpoint = API_BASE_URL + '/document/' + documentId;
            Map<String, String> docQp = new Map<String, String>{ 'collection' => collectionName };
            HttpRequest documentReq = PropertySearchHttp.buildGet(documentEndpoint, docQp, apiKey, 30000);
            HttpResponse documentRes = PropertySearchHttp.send(documentReq);
            System.debug('Matricule document status: ' + (documentRes == null ? -1 : documentRes.getStatusCode()));
            System.debug('Matricule document body: ' + (documentRes == null ? 'null' : documentRes.getBody()));
            String docBody = PropertySearchHttp.getBodyIfOk(documentRes);
            if (docBody == null) {
                System.debug('Matricule document fetch returned non-200 or null');
                return null;
            }

            Map<String, Object> document = parseCompletePropertyDetails(docBody);
            System.debug('=== AddressSearchController.searchByMatricule END ===');
            return document;
        } catch (Exception e) {
            System.debug('Exception in searchByMatricule: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            return null;
        }
    }
    
    /**
     * Extraction du numéro civique depuis un document MongoDB
     * @param rawResult Le document MongoDB brut
     * @return Le numéro civique extrait
     */
    private static String extractStreetNumberFromMongoDB(Object rawResult) {
        try {
            if (!(rawResult instanceof Map<String, Object>)) {
                return null;
            }
            
            Map<String, Object> document = (Map<String, Object>) rawResult;
            
            // Extraction de RLUEx
            Object rluexObj = document.get('RLUEx');
            if (!(rluexObj instanceof Map<String, Object>)) {
                return null;
            }
            Map<String, Object> rluex = (Map<String, Object>) rluexObj;
            
            // Extraction de RL0101 (adresse)
            Object rl0101Obj = rluex.get('RL0101');
            if (!(rl0101Obj instanceof Map<String, Object>)) {
                return null;
            }
            Map<String, Object> rl0101 = (Map<String, Object>) rl0101Obj;
            
            // Extraction de RL0101x (détails adresse)
            Object rl0101xObj = rl0101.get('RL0101x');
            if (!(rl0101xObj instanceof Map<String, Object>)) {
                return null;
            }
            Map<String, Object> addressData = (Map<String, Object>) rl0101xObj;
            
            // Extraction du numéro civique (RL0101Ax)
            Object streetNumberObj = addressData.get('RL0101Ax');
            if (streetNumberObj != null) {
                String streetNumber = String.valueOf(streetNumberObj);
                System.debug('Extracted street number: ' + streetNumber);
                return streetNumber;
            }
            
            return null;
            
        } catch (Exception e) {
            System.debug('Exception in extractStreetNumberFromMongoDB: ' + e.getMessage());
            return null;
        }
    }
    
    /**
     * Génère des numéros de test pour une rue donnée
     * @param streetName Le nom de la rue
     * @return Liste des numéros à tester
     */
    private static List<String> getTestNumbersForStreet(String streetName) {
        List<String> testNumbers = new List<String>();
        
        // Numéros de test basés sur les données connues
        if (streetName.toUpperCase().contains('HYMUS')) {
            testNumbers.add('17200');
            testNumbers.add('17201');
            testNumbers.add('17202');
        } else if (streetName.toUpperCase().contains('SAINT-CHARLES')) {
            testNumbers.add('2755');
            testNumbers.add('2756');
            testNumbers.add('2757');
        } else {
            // Numéros génériques pour les autres rues
            testNumbers.add('1');
            testNumbers.add('10');
            testNumbers.add('100');
            testNumbers.add('1000');
            testNumbers.add('2000');
        }
        
        return testNumbers;
    }
    

    

    

    

    

    @AuraEnabled
    public static String saveCompleteProperty(String propertyData) {
        try {
            System.debug('=== SAUVEGARDE COMPLETE (DOM -> APEX) ===');
            System.debug('propertyData reçu: ' + propertyData);
            if (String.isBlank(propertyData)) {
                throw new AuraHandledException('Données vides reçues');
            }

            Map<String, Object> data = (Map<String, Object>) JSON.deserializeUntyped(propertyData);
            System.debug('Données parsées: ' + data);

            // Extraction sûre des valeurs utiles
            String matricule = data.containsKey('matricule') ? String.valueOf(data.get('matricule')) : null;
            String ownerNameRaw = data.containsKey('ownerName') ? String.valueOf(data.get('ownerName')) : null;
            String totalValueStr = data.containsKey('totalValue') ? String.valueOf(data.get('totalValue')) : null;
            String postalCode = data.containsKey('postalCode') ? String.valueOf(data.get('postalCode')) : null;
            String fullAddress = data.containsKey('address') ? String.valueOf(data.get('address')) : null;

            // Normaliser les placeholders
            if (matricule != null && (matricule.trim().toLowerCase() == 'non disponible' || matricule.trim() == '-' || matricule.trim().toLowerCase() == 'n/a' || matricule.trim() == '')) {
                matricule = null;
            }
            if (ownerNameRaw != null && (ownerNameRaw.trim().toLowerCase() == 'non disponible' || ownerNameRaw.trim() == '-' || ownerNameRaw.trim().toLowerCase() == 'n/a')) {
                ownerNameRaw = null;
            }
            if (totalValueStr != null && (totalValueStr.trim().toLowerCase() == 'non disponible' || totalValueStr.trim() == '-' || totalValueStr.trim().toLowerCase() == 'n/a' || totalValueStr.trim() == '')) {
                totalValueStr = null;
            }
            if (postalCode != null && (postalCode.trim().toLowerCase() == 'non disponible' || postalCode.trim() == '-' || postalCode.trim().toLowerCase() == 'n/a' || postalCode.trim() == '')) {
                postalCode = null;
            }
            if (fullAddress != null && (fullAddress.trim().toLowerCase() == 'non disponible' || fullAddress.trim() == '-' || fullAddress.trim().toLowerCase() == 'n/a' || fullAddress.trim() == '')) {
                fullAddress = null;
            }

            System.debug('Valeurs extraites: matricule=' + matricule + ', ownerNameRaw=' + ownerNameRaw + ', totalValueStr=' + totalValueStr + ', postalCode=' + postalCode + ', address=' + fullAddress);

            if (String.isBlank(matricule)) {
                throw new AuraHandledException('Matricule requis manquant');
            }

            // Upsert Property__c par External_ID__c (matricule)
            Map<String, Object> propertyFields = new Map<String, Object>();
            if (!String.isBlank(postalCode)) propertyFields.put('Postal_Code__c', postalCode);
            // Optionnel: on pourrait parser l'adresse complète plus tard
            Property__c propertyRec = upsertProperty(matricule, propertyFields);
            System.debug('Property__c Id=' + propertyRec.Id);

            // Préparer Owner__c (split "NOM, PRENOM" si disponible)
            Id ownerId;
            if (!String.isBlank(ownerNameRaw)) {
                String legalName;
                String firstName;
                if (ownerNameRaw.contains(',')) {
                    List<String> parts = ownerNameRaw.split(',');
                    legalName = parts.size() > 0 ? parts[0].trim() : null;
                    firstName = parts.size() > 1 ? parts[1].trim() : null;
                } else {
                    // Pas de virgule: tout dans nom légal
                    legalName = ownerNameRaw.trim();
                    firstName = null;
                }
                Map<String, Object> ownerFields = new Map<String, Object>();
                if (!String.isBlank(legalName)) ownerFields.put('Legal_name_of_owner__c', legalName);
                if (!String.isBlank(firstName)) ownerFields.put('Owner_first_name__c', firstName);

                Owner__c ownerRec = upsertOwner(ownerFields, propertyRec.Id);
                ownerId = ownerRec != null ? ownerRec.Id : null;
                System.debug('Owner__c Id=' + ownerId);
            }

            // Créer Assessment__c
            Map<String, Object> assessInput = new Map<String, Object>();
            if (!String.isBlank(totalValueStr)) {
                assessInput.put('total_value', totalValueStr);
            }
            Assessment__c assessmentRec = createAssessment(propertyRec.Id, ownerId, assessInput);
            System.debug('Assessment__c Id=' + assessmentRec.Id);

            // Retour JSON avec IDs
            Map<String, String> result = new Map<String, String>();
            result.put('status', 'success');
            result.put('propertyId', propertyRec.Id);
            if (ownerId != null) result.put('ownerId', ownerId);
            result.put('assessmentId', assessmentRec.Id);
            String jsonOut = JSON.serialize(result);
            System.debug('saveCompleteProperty result=' + jsonOut);
            return jsonOut;

        } catch (Exception e) {
            System.debug('Erreur complète: ' + e.getMessage() + ' - ' + e.getStackTraceString());
            throw new AuraHandledException('Erreur sauvegarde: ' + e.getMessage());
        }
    }

    // =============================
    // Helpers persistance & mapping
    // =============================

    // Ancien mécanisme (remplacé par passage explicite de l'Id propriété)
    private static Id s_currentPropertyId;

    private static String extractMatricule(Map<String, Object> data) {
        try {
            System.debug('=== EXTRACT MATRICULE DEBUG ===');
            if (data == null) {
                System.debug('Data null');
                return null;
            }
            System.debug('Clés racine du document: ' + String.valueOf(data.keySet()));
            Object rluexObj = data.get('RLUEx');
            if (rluexObj == null) {
                System.debug('RLUEx est null');
                return null;
            }
            System.debug('Type de RLUEx (stringified): ' + String.valueOf(rluexObj));
            if (!(rluexObj instanceof Map<String, Object>)) {
                System.debug('RLUEx n est pas une Map');
                return null;
            }
            Map<String, Object> rluex = (Map<String, Object>) rluexObj;
            System.debug('Clés dans RLUEx: ' + String.valueOf(rluex.keySet()));
            Object matriculeObj = rluex.get('RL0106A');
            System.debug('RL0106A trouvé: ' + matriculeObj);
            return matriculeObj != null ? String.valueOf(matriculeObj) : null;
        } catch (Exception e) {
            System.debug('Erreur extractMatricule: ' + e.getMessage());
            return null;
        }
    }

    private static Map<String, Object> extractPropertyData(Map<String, Object> data) {
        Map<String, Object> out = new Map<String, Object>();
        if (data == null) return out;
        try {
            // Exemple: extraire quelques champs simples si disponibles
            Object rluexObj = data.get('RLUEx');
            if (rluexObj instanceof Map<String, Object>) {
                Map<String, Object> rluex = (Map<String, Object>) rluexObj;
                Object rl0101Obj = rluex.get('RL0101');
                if (rl0101Obj instanceof Map<String, Object>) {
                    Map<String, Object> rl0101 = (Map<String, Object>) rl0101Obj;
                    Object rl0101xObj = rl0101.get('RL0101x');
                    if (rl0101xObj instanceof Map<String, Object>) {
                        Map<String, Object> addr = (Map<String, Object>) rl0101xObj;
                        if (addr.get('RL0101Gx') != null) out.put('Street_name__c', String.valueOf(addr.get('RL0101Gx')));
                        if (addr.get('RL0101Nx') != null) out.put('Postal_Code__c', String.valueOf(addr.get('RL0101Nx')));
                        if (addr.get('RL0101Ax') != null) out.put('Building_number__c', String.valueOf(addr.get('RL0101Ax')));
                        if (addr.get('RL0101Dx') != null) out.put('Apartment_number__c', String.valueOf(addr.get('RL0101Dx')));
                    }
                }
            }
        } catch (Exception e) {
            System.debug('extractPropertyData warning: ' + e.getMessage());
        }
        return out;
    }

    private static Map<String, Object> extractOwnerData(Map<String, Object> data) {
        Map<String, Object> out = new Map<String, Object>();
        if (data == null) return out;
        try {
            Object rluexObj = data.get('RLUEx');
            if (rluexObj instanceof Map<String, Object>) {
                Map<String, Object> rluex = (Map<String, Object>) rluexObj;
                Object rl0201Obj = rluex.get('RL0201');
                if (rl0201Obj instanceof Map<String, Object>) {
                    Map<String, Object> rl0201 = (Map<String, Object>) rl0201Obj;
                    Object rl0201xObj = rl0201.get('RL0201x');
                    if (rl0201xObj instanceof Map<String, Object>) {
                        Map<String, Object> owner = (Map<String, Object>) rl0201xObj;
                        if (owner.get('RL0201Ax') != null) out.put('Legal_name_of_owner__c', String.valueOf(owner.get('RL0201Ax')));
                        if (owner.get('RL0201Bx') != null) out.put('Owner_first_name__c', String.valueOf(owner.get('RL0201Bx')));
                    }
                }
            }
        } catch (Exception e) {
            System.debug('extractOwnerData warning: ' + e.getMessage());
        }
        return out;
    }

    private static Property__c upsertProperty(String matricule, Map<String, Object> propertyData) {
        if (String.isBlank(matricule)) {
            System.debug('Matricule vide/absent dans upsertProperty. propertyData keys=' + (propertyData == null ? 'null' : String.valueOf(propertyData.keySet())));
            System.debug('AVANT ligne 1172 - variables état: matricule=' + matricule + ', propertyData keys=' + (propertyData == null ? 'null' : String.valueOf(propertyData.keySet())));
            throw new AuraHandledException('Matricule manquant pour Property__c');
        }
        System.debug('upsertProperty: recherche Property__c par External_ID__c=' + matricule);
        List<Property__c> propFound = [SELECT Id, External_ID__c FROM Property__c WHERE External_ID__c = :matricule LIMIT 1];
        Property__c existing = propFound.isEmpty() ? null : propFound[0];
        if (existing != null) {
            // Mise à jour légère des champs optionnels
            applyPropertyData(existing, propertyData);
            update existing;
            return existing;
        }
        Property__c rec = new Property__c();
        rec.External_ID__c = matricule;
        try {
            applyPropertyData(rec, propertyData);
        } catch (Exception e) {
            System.debug('applyPropertyData error: ' + e.getMessage());
        }
        insert rec;
        return rec;
    }

    private static void applyPropertyData(SObject target, Map<String, Object> data) {
        if (target == null || data == null || data.isEmpty()) return;
        // Applique uniquement les clés connues si présentes, en validant les types
        Object v;
        if (data.containsKey('Street_name__c')) {
            v = data.get('Street_name__c');
            if (v != null) target.put('Street_name__c', String.valueOf(v));
        }
        if (data.containsKey('Postal_Code__c')) {
            v = data.get('Postal_Code__c');
            if (v != null) target.put('Postal_Code__c', String.valueOf(v));
        }
        if (data.containsKey('Building_number__c')) {
            v = data.get('Building_number__c');
            if (v != null) target.put('Building_number__c', String.valueOf(v));
        }
        if (data.containsKey('Apartment_number__c')) {
            v = data.get('Apartment_number__c');
            if (v != null) target.put('Apartment_number__c', String.valueOf(v));
        }
    }

    private static Owner__c upsertOwner(Map<String, Object> ownerData, Id propertyId) {
        // Heuristique: dédoublonner par (Property__c, Legal_name_of_owner__c, Owner_first_name__c)
        String legalName = (String) ownerData.get('Legal_name_of_owner__c');
        String firstName = (String) ownerData.get('Owner_first_name__c');
        if (String.isBlank(legalName)) {
            // Sans nom légal, on tente de ne rien créer; retourner null
            return null;
        }
        Owner__c existing = null;
        if (propertyId != null) {
            if (String.isBlank(firstName)) {
                List<Owner__c> found = [
                    SELECT Id, Property__c, Legal_name_of_owner__c, Owner_first_name__c
                    FROM Owner__c
                    WHERE Property__c = :propertyId
                      AND Legal_name_of_owner__c = :legalName
                    LIMIT 1
                ];
                existing = found.isEmpty() ? null : found[0];
            } else {
                List<Owner__c> found = [
                    SELECT Id, Property__c, Legal_name_of_owner__c, Owner_first_name__c
                    FROM Owner__c
                    WHERE Property__c = :propertyId
                      AND Legal_name_of_owner__c = :legalName
                      AND Owner_first_name__c = :firstName
                    LIMIT 1
                ];
                existing = found.isEmpty() ? null : found[0];
            }
        }
        if (existing != null) {
            return existing;
        }
        if (propertyId == null) {
            throw new AuraHandledException('Property__c introuvable pour création Owner__c');
        }
        Owner__c rec = new Owner__c();
        rec.Property__c = propertyId;
        if (legalName != null) rec.Legal_name_of_owner__c = legalName;
        if (firstName != null) rec.Owner_first_name__c = firstName;
        insert rec;
        return rec;
    }

    private static Assessment__c createAssessment(Id propertyId, Id ownerId, Map<String, Object> data) {
        if (propertyId == null) {
            throw new AuraHandledException('PropertyId manquant pour créer Assessment__c');
        }
        Assessment__c rec = new Assessment__c();
        rec.Property__c = propertyId;
        if (ownerId != null) rec.Owner__c = ownerId;
        // Extraire quelques informations si disponibles
        String yearVal;
        Decimal totalVal;
        try {
            Object y = data == null ? null : data.get('assessment_year');
            if (y == null && data != null) y = data.get('year');
            if (y != null) yearVal = String.valueOf(y).left(4);
        } catch (Exception e) {}
        try {
            Object v = data == null ? null : data.get('total_value');
            if (v == null && data != null) v = data.get('Property_value__c');
            if (v != null) totalVal = Decimal.valueOf(String.valueOf(v));
        } catch (Exception e) {}
        if (yearVal != null) rec.Assessment_Year__c = yearVal;
        if (totalVal != null) rec.Total_Value__c = totalVal;
        rec.Is_Current__c = false;
        insert rec;
        return rec;
    }
} 