const API_PREFIX = '/api';

const paths = {
    login: `${API_PREFIX}/login`,
    eleves: {
        base: `${API_PREFIX}/eleves`,
        recherche: `${API_PREFIX}/eleves/recherche`,
        importer: `${API_PREFIX}/eleves/importer`,
        parGroupe: `${API_PREFIX}/eleves-par-groupe`,
    },
    matieres: {
        base: `${API_PREFIX}/matieres`,
        elevesRestants: `${API_PREFIX}/matieres/:id/eleves-restants`,
    },
    copies: {
        lier: `${API_PREFIX}/lier-copie`,
        noter: `${API_PREFIX}/noter-copie`,
        verifier: `${API_PREFIX}/copies/verifier/:code`,
        noteDirecte: `${API_PREFIX}/note-directe`,
    },
    resultats: {
        base: `${API_PREFIX}/resultats`,
        exporter: `${API_PREFIX}/resultats/exporter`,
    },
    stats: {
        nonLiesTotal: `${API_PREFIX}/stats/non-lies-total`,
        liaisonsUtilisateur: `${API_PREFIX}/stats/liaisons-utilisateur`,
    },
    codes: {
        importer: `${API_PREFIX}/codes/importer`,
    },
    utilisateurs: {
        base: `${API_PREFIX}/utilisateurs`,
        byId: `${API_PREFIX}/utilisateurs/:id`,
    },
    logs: {
        activites: `${API_PREFIX}/logs/activites`,
        frontendActivity: `${API_PREFIX}/logs/frontend-activity`,
        unreadCount: `${API_PREFIX}/logs/unread-count`,
        markAsRead: `${API_PREFIX}/logs/mark-as-read`,
        unread: `${API_PREFIX}/logs/unread`, // <-- NOUVELLE ROUTE AJOUTÉE
    },
    incognito: {
        suggestions: `${API_PREFIX}/incognito/suggestions`,
        executerEchange: `${API_PREFIX}/incognito/executer-echange`,
        classementActuel: `${API_PREFIX}/incognito/classement-actuel`,
        suggestionsMoyenne: `${API_PREFIX}/incognito/suggestions-moyenne`,
        executerPlan: `${API_PREFIX}/incognito/executer-plan`
    },
    absences: {
        bulk: `${API_PREFIX}/absences/bulk`,
    },
};

module.exports = paths;
