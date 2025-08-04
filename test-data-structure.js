// Test de validation de la structure des données MongoDB
// Ce fichier simule les données que nous devrions recevoir de l'API

const testMongoDBDocument = {
    "_id": {"$oid": "68151322f53a4bc552e85ed0"},
    "VERSION": "2.6",
    "RLM01A": "66102",
    "RLM02A": "2023",
    "RENSEIGNEMENTS_ANNEXABLES_GLOBAL": {
        "RLZG0001": "2.20",
        "RLZG0002": "2022-09-10"
    },
    "RLUEx": {
        "RL0101": {
            "RL0101x": {
                "RL0101Ax": "17200",
                "RL0101Ex": "BO",
                "RL0101Gx": "HYMUS",
                "POSTALCODE": "H9J 3Y8"
            }
        },
        "RL0103": {
            "RL0103x": {
                "RL0103Ax": "1991964"
            }
        },
        "RL0104": {
            "RL0104A": "7634",
            "RL0104B": "73",
            "RL0104C": "2340",
            "RL0104D": "4",
            "RL0104G": "08"
        },
        "RL0105A": "6799",
        "RL0106A": "10-F03220000",
        "RL0107A": "0222",
        "RL0201": {
            "RL0201x": {
                "RL0201Ax": "VILLE DE KIRKLAND",
                "RL0201Cx": "17200 BOUL HYMUS",
                "RL0201Dx": "KIRKLAND",
                "RL0201Ex": "H9J 3Y8",
                "RL0201Gx": "2001-05-12",
                "RL0201Hx": "2",
                "RL0201Ix": "17200",
                "RL0201Kx": "BO",
                "RL0201Mx": "HYMUS"
            },
            "RL0201U": "1"
        },
        "RL0301A": "77.58",
        "RL0302A": "5055.80",
        "RL0303A": "0",
        "RL0401A": "2021-07-01",
        "RL0402A": "1516700",
        "RL0403A": "3912800",
        "RL0404A": "5429500",
        "RL0405A": "4615800",
        "RL0501A": "0",
        "RL0504": {
            "RL0504x": [
                {
                    "RL0504Ax": "F-2.1",
                    "RL0504Bx": "204",
                    "RL0504Cx": "3",
                    "RL0504Dx": "1516700",
                    "RL0504Ex": "T",
                    "RL0504Fx": "2"
                }
            ]
        },
        "RENSEIGNEMENTS_ANNEXABLES_UNITE": {
            "RLZU1007": {
                "RLZU1007x": {
                    "RLZU1007Ax": "1",
                    "RLZU1007Bx": "4640"
                }
            },
            "RLZU1008": {
                "RLZU1008x": {
                    "RLZU1008Ax": "1",
                    "RLZU1008Bx": "77.58",
                    "RLZU1008Cx": "5055.80",
                    "RLZU1008Dx": "R"
                }
            },
            "RLZU2001": {
                "RLZU2001x": {
                    "RLZU2001Ax": "1",
                    "RLZU2001Bx": "4083638",
                    "RLZU2001Ex": "5",
                    "RLZU2001Fx": "F"
                }
            },
            "RLZU3005A": "R",
            "RLZU3005B": "6F",
            "RLZU3005C": "N",
            "RLZU3006B": "N",
            "RLZU3007x": "TEF006",
            "RLZU3101": "2022-09-14",
            "RLZU3102": "2023-01-01",
            "RLZU3103": "2025-12-31",
            "RLZU3104": "5085386",
            "RLZU4001": "3402400",
            "RLZU4002": "1213400"
        }
    },
    "RL0601A": "Côté",
    "RL0601B": "Bernard",
    "RL0602A": "Évaluateur de la Ville",
    "RL0603A": "Ville de Montréal",
    "RL0604A": "2023-09-14",
    "RL0605A": "Ville de Montréal"
};

// Test des getters
console.log('=== TEST DES GETTERS ===');

// Test Section 1 - Identification de l'unité d'évaluation
console.log('📍 Section 1 - Identification de l\'unité d\'évaluation:');
console.log('Adresse:', testMongoDBDocument.RLUEx.RL0101.RL0101x.RL0101Ax + ' ' + 
            testMongoDBDocument.RLUEx.RL0101.RL0101x.RL0101Ex + ' ' + 
            testMongoDBDocument.RLUEx.RL0101.RL0101x.RL0101Gx);
console.log('Code postal:', testMongoDBDocument.RLUEx.RL0101.RL0101x.POSTALCODE);
console.log('Matricule:', testMongoDBDocument.RLUEx.RL0103.RL0103x.RL0103Ax);
console.log('Numéro de lot:', testMongoDBDocument.RLUEx.RL0104.RL0104A + '-' + 
            testMongoDBDocument.RLUEx.RL0104.RL0104B + '-' + 
            testMongoDBDocument.RLUEx.RL0104.RL0104C + '-' + 
            testMongoDBDocument.RLUEx.RL0104.RL0104D);

// Test Section 2 - Identification du propriétaire
console.log('\n👤 Section 2 - Identification du propriétaire:');
console.log('Nom du propriétaire:', testMongoDBDocument.RLUEx.RL0201.RL0201x.RL0201Ax);
console.log('Adresse du propriétaire:', testMongoDBDocument.RLUEx.RL0201.RL0201x.RL0201Cx + ', ' + 
            testMongoDBDocument.RLUEx.RL0201.RL0201x.RL0201Dx + ' ' + 
            testMongoDBDocument.RLUEx.RL0201.RL0201x.RL0201Ex);
console.log('Date d\'acquisition:', testMongoDBDocument.RLUEx.RL0201.RL0201x.RL0201Gx);

// Test Section 4 - Valeurs portées au rôle
console.log('\n💰 Section 4 - Valeurs portées au rôle:');
console.log('Valeur du terrain:', testMongoDBDocument.RLUEx.RL0402A);
console.log('Valeur du bâtiment:', testMongoDBDocument.RLUEx.RL0403A);
console.log('Valeur de l\'immeuble:', testMongoDBDocument.RLUEx.RL0404A);

// Test des méthodes de formatage
function formatCurrency(amount) {
    if (!amount || amount === '0') return 'Non disponible';
    return new Intl.NumberFormat('fr-CA', {
        style: 'currency',
        currency: 'CAD'
    }).format(parseFloat(amount));
}

function formatDate(dateString) {
    if (!dateString) return 'Non disponible';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('fr-CA');
    } catch (error) {
        return dateString;
    }
}

console.log('\n=== VALEURS FORMATÉES ===');
console.log('Valeur du terrain formatée:', formatCurrency(testMongoDBDocument.RLUEx.RL0402A));
console.log('Valeur du bâtiment formatée:', formatCurrency(testMongoDBDocument.RLUEx.RL0403A));
console.log('Valeur de l\'immeuble formatée:', formatCurrency(testMongoDBDocument.RLUEx.RL0404A));
console.log('Date d\'acquisition formatée:', formatDate(testMongoDBDocument.RLUEx.RL0201.RL0201x.RL0201Gx));

console.log('\n✅ Test de validation terminé'); 