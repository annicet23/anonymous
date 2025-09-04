// C:\Users\ANNICET\Desktop\projet-anonymat\frontend\src\config\apiPaths.js

const API_PREFIX = '/api';

const paths = {
    // Authentification
    login: `${API_PREFIX}/login`,

    // Élèves
    eleves: {
        base: `${API_PREFIX}/eleves`,
        recherche: `${API_PREFIX}/eleves/recherche`,
        importer: `${API_PREFIX}/eleves/importer`,
parGroupe: `${API_PREFIX}/eleves-par-groupe`,

    },

    // Matières
    matieres: {
        base: `${API_PREFIX}/matieres`,
        elevesRestants: `${API_PREFIX}/matieres/:id/eleves-restants`,
    },

    // Copies (Logique métier)
    copies: {
        lier: `${API_PREFIX}/lier-copie`,
        noter: `${API_PREFIX}/noter-copie`,
        verifier: `${API_PREFIX}/copies/verifier/:code`,
noteDirecte: `${API_PREFIX}/note-directe`,


    },

    // Résultats
    resultats: {
        base: `${API_PREFIX}/resultats`,
        exporter: `${API_PREFIX}/resultats/exporter`,
    },

    // Statistiques
    stats: {
        nonLiesTotal: `${API_PREFIX}/stats/non-lies-total`,
        liaisonsUtilisateur: `${API_PREFIX}/stats/liaisons-utilisateur`,
    },
      codes: {
        importer: `${API_PREFIX}/codes/importer`,
    },

    // Utilisateurs (Admin)
    utilisateurs: {
        base: `${API_PREFIX}/utilisateurs`,
        byId: `${API_PREFIX}/utilisateurs/:id`,
    },

    // >>> AJOUT DE LA NOUVELLE ROUTE ICI <<<
    // Absences
    absences: {
        bulk: `${API_PREFIX}/absences/bulk`,
    },
};

// Important: utilisez "export default" pour les applications React
module.exports = paths;
