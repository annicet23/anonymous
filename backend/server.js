// Contenu complet de backend/server.js mis à jour

require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const xlsx = require('xlsx');
const { jsPDF } = require("jspdf");
const autoTable = require('jspdf-autotable').default;
const apiPaths = require('./config/apiPaths');
const QRCode = require('qrcode');

const app = express();
const port = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error("ERREUR FATALE : La variable d'environnement JWT_SECRET n'est pas définie.");
    process.exit(1);
}

const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE
}).promise();

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.status(401).json({ message: "Accès non autorisé : Token manquant." });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: "Accès refusé : Token invalide ou expiré." });
        req.user = user;
        next();
    });
};

const checkRole = (rolesAutorises) => {
    return (req, res, next) => {
        if (!rolesAutorises.includes(req.user.role)) {
            return res.status(403).json({ message: "Accès refusé : Permissions insuffisantes." });
        }
        next();
    };
};

// ... (Toutes vos autres routes de login, register, eleves, etc. restent identiques)
// ...
// ...
app.post(apiPaths.login, async (req, res) => {
    try {
        const { nom_utilisateur, password } = req.body;
        if (!nom_utilisateur || !password) {
            return res.status(400).json({ message: "Nom d'utilisateur et mot de passe requis." });
        }
        const [users] = await db.query("SELECT * FROM utilisateurs WHERE nom_utilisateur = ?", [nom_utilisateur]);
        if (users.length === 0 || password !== users[0].mot_de_passe) {
            return res.status(401).json({ message: "Nom d'utilisateur ou mot de passe incorrect." });
        }
        const user = users[0];
        if (user.statut !== 'approuve') {
            return res.status(403).json({ message: "Votre compte n'a pas encore été validé par un administrateur." });
        }
        const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ token });
    } catch (err) {
        console.error("Erreur sur /api/login", err);
        res.status(500).json({ error: "Une erreur interne est survenue." });
    }
});

app.post('/api/register', async (req, res) => {
    try {
        const { nom, prenom, matricule, service, numero_telephone, nom_utilisateur, mot_de_passe, role } = req.body;

        if (!nom || !prenom || !nom_utilisateur || !mot_de_passe || !role) {
            return res.status(400).json({ message: "Tous les champs marqués d'un * et le rôle sont requis." });
        }

        const rolesAutorises = ['admin', 'operateur_code', 'operateur_note'];
        if (!rolesAutorises.includes(role)) {
            return res.status(400).json({ message: "Le rôle sélectionné est invalide." });
        }

        const query = `
            INSERT INTO utilisateurs (nom, prenom, matricule, service, numero_telephone, nom_utilisateur, mot_de_passe, role)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await db.query(query, [nom, prenom, matricule, service, numero_telephone, nom_utilisateur, mot_de_passe, role]);

        res.status(201).json({ message: "Votre demande de création de compte a été envoyée. Elle est en attente de validation par un administrateur." });

    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: "Ce nom d'utilisateur est déjà pris." });
        }
        console.error("Erreur sur /api/register", err);
        res.status(500).json({ error: "Une erreur interne est survenue lors de l'enregistrement." });
    }
});

app.get(apiPaths.eleves.base, authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM eleves ORDER BY nom, prenom");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get(apiPaths.eleves.recherche, authenticateToken, async (req, res) => {
    try {
        const searchTerm = req.query.q;
        if (!searchTerm || searchTerm.trim() === '') return res.json([]);
        const nameSearchQuery = `%${searchTerm}%`;
        const incorpSearchQuery = `${searchTerm}%`;
        const query = `
            SELECT id, prenom, nom, numero_incorporation, escadron, peloton
            FROM eleves
            WHERE numero_incorporation LIKE ? OR CONCAT(prenom, ' ', nom) LIKE ? OR CONCAT(nom, ' ', prenom) LIKE ?
            ORDER BY nom, prenom LIMIT 20;
        `;
        const [rows] = await db.query(query, [incorpSearchQuery, nameSearchQuery, nameSearchQuery]);
        res.json(rows);
    } catch (err) {
        console.error("Erreur sur /api/eleves/recherche", err);
        res.status(500).json({ error: "Erreur lors de la recherche des élèves." });
    }
});

app.post(apiPaths.eleves.importer, authenticateToken, checkRole(['admin']), upload.single('fichierEleves'), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "Aucun fichier n'a été envoyé." });
    const connection = await db.getConnection();
    try {
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
        const elevesToInsert = [];
        const numerosIncorporationVus = new Set();
        for (const row of data.slice(1)) {
            if (!row || row.length === 0) continue;
            const numero_incorporation = row[0] ? String(row[0]).trim() : null;
            if (!numero_incorporation || numerosIncorporationVus.has(numero_incorporation)) {
                continue;
            }
            numerosIncorporationVus.add(numero_incorporation);
            const nom_prenom = row[1] ? String(row[1]).trim() : '';
            const sexeRaw = row[2] ? String(row[2]).trim().toUpperCase() : null;
            const escadronRaw = row[3];
            const pelotonRaw = row[4];
            let nom = '';
            let prenom = '';
            const firstSpaceIndex = nom_prenom.indexOf(' ');
            if (firstSpaceIndex > 0) {
                nom = nom_prenom.substring(0, firstSpaceIndex).trim();
                prenom = nom_prenom.substring(firstSpaceIndex + 1).trim();
            } else {
                nom = nom_prenom;
            }
            let sexe = null;
            if (sexeRaw === 'F' || sexeRaw === 'FEMININ') {
                sexe = 'feminin';
            } else if (sexeRaw === 'M' || sexeRaw === 'MASCULIN') {
                sexe = 'masculin';
            }
            const escadron = !isNaN(parseInt(escadronRaw, 10)) ? parseInt(escadronRaw, 10) : null;
            const peloton = !isNaN(parseInt(pelotonRaw, 10)) ? parseInt(pelotonRaw, 10) : null;
            elevesToInsert.push([nom, prenom, numero_incorporation, sexe, escadron, peloton]);
        }
        if (elevesToInsert.length === 0) {
            return res.status(400).json({ message: "Le fichier ne contient aucun élève valide à importer (vérifiez la colonne A pour les numéros d'incorporation)." });
        }
        await connection.beginTransaction();
        await connection.query("DELETE FROM copies");
        await connection.query("DELETE FROM eleves");
        const sql = "INSERT INTO eleves (nom, prenom, numero_incorporation, sexe, escadron, peloton) VALUES ?";
        await connection.query(sql, [elevesToInsert]);
        await connection.commit();
        res.json({ message: `Base de données réinitialisée. ${elevesToInsert.length} élèves uniques ont été importés avec succès.` });
    } catch (err) {
        await connection.rollback();
        console.error("Erreur lors de l'importation des élèves", err);
        res.status(500).json({ message: "Erreur interne lors du traitement du fichier." });
    } finally {
        connection.release();
    }
});

app.get(apiPaths.matieres.base, authenticateToken, async (req, res) => {
    try {
        // MODIFIÉ : On sélectionne aussi le coefficient
        const [rows] = await db.query("SELECT id, nom_matiere, code_prefixe AS prefixe, coefficient FROM matieres ORDER BY nom_matiere");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.post(apiPaths.matieres.base, authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { nom_matiere } = req.body;
        if (!nom_matiere || nom_matiere.trim() === '') {
            return res.status(400).json({ message: "Le nom de la matière est requis." });
        }
        await db.query("INSERT INTO matieres (nom_matiere) VALUES (?)", [nom_matiere.trim()]);
        res.status(201).json({ message: `La matière "${nom_matiere}" a été créée.` });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: "Cette matière existe déjà." });
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/codes/verifier/:code', authenticateToken, checkRole(['admin', 'operateur_note']), async (req, res) => {
    try {
        const { code } = req.params;
        const [rows] = await db.query("SELECT id FROM codes_anonymes_disponibles WHERE code = ?", [code]);
        if (rows.length > 0) {
            res.status(200).json({ isValid: true, message: "Code valide." });
        } else {
            res.status(404).json({ isValid: false, message: "Ce code n'existe pas dans la base." });
        }
    } catch (err) {
        console.error("Erreur sur /api/codes/verifier/:code", err);
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});

app.post(apiPaths.codes.importer, authenticateToken, checkRole(['admin']), upload.single('fichierCodes'), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "Aucun fichier n'a été envoyé." });
    const connection = await db.getConnection();
    try {
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
        const codesColonneA = data.slice(1).map(row => row && row[0]).filter(code => code !== null && code !== undefined && code.toString().trim() !== '');
        if (codesColonneA.length === 0) {
            return res.status(400).json({ message: "Le fichier ne contient aucun code valide dans la colonne A." });
        }
        const codesUniques = [...new Set(codesColonneA.map(code => code.toString().trim()))];
        const codesAInserer = codesUniques.map(code => [code]);
        await connection.beginTransaction();
        await connection.query("DELETE FROM codes_anonymes_disponibles");
        await connection.query("INSERT INTO codes_anonymes_disponibles (code) VALUES ?", [codesAInserer]);
        await connection.commit();
        res.status(200).json({ message: `Importation réussie. ${codesAInserer.length} codes anonymes uniques ont été enregistrés.` });
    } catch (err) {
        await connection.rollback();
        console.error("Erreur lors de l'importation des codes anonymes :", err);
        res.status(500).json({ message: "Une erreur interne est survenue lors du traitement du fichier." });
    } finally {
        if (connection) connection.release();
    }
});

// =================================================================
// MODIFICATION 1 : Logique de /api/noter-copie-anonyme
// =================================================================
app.post('/api/noter-copie-anonyme', authenticateToken, checkRole(['admin', 'operateur_note']), async (req, res) => {
    const { matiere_id, code_anonyme, note } = req.body;
    const utilisateurId = req.user.id;
    if (!matiere_id || !code_anonyme || note === undefined || note === '') {
        return res.status(400).json({ message: "Matière, code et note sont requis." });
    }
    const noteNum = parseFloat(note);
    if (isNaN(noteNum) || noteNum < 0 || noteNum > 20) {
         return res.status(400).json({ message: "La note doit être un nombre entre 0 et 20." });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Étape 1: Vérifier si le code existe dans la liste générale des codes
        const [codesDispo] = await connection.query("SELECT id FROM codes_anonymes_disponibles WHERE code = ?", [code_anonyme]);
        if (codesDispo.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Ce code anonyme n'existe pas dans la base de données générale." });
        }

        // Étape 2: Vérifier si une note a déjà été saisie pour ce code DANS CETTE MATIERE
        const [existingCopies] = await connection.query("SELECT note FROM copies WHERE code_anonyme = ? AND matiere_id = ?", [code_anonyme, matiere_id]);

        if (existingCopies.length > 0 && existingCopies[0].note !== null) {
            // Une note existe déjà, on renvoie une erreur de conflit (409)
            await connection.rollback();
            return res.status(409).json({ message: "Ce code a déjà une note enregistrée." });
        }

        // Étape 3: Insérer ou mettre à jour la note
        // L'utilisation de ON DUPLICATE KEY est utile si une copie a été créée sans note
        const query = `
            INSERT INTO copies (matiere_id, code_anonyme, note, note_saisie_par_utilisateur_id, eleve_id)
            VALUES (?, ?, ?, ?, NULL)
            ON DUPLICATE KEY UPDATE note = VALUES(note), note_saisie_par_utilisateur_id = VALUES(note_saisie_par_utilisateur_id)
        `;
        await connection.query(query, [matiere_id, code_anonyme, noteNum, utilisateurId]);

        await connection.commit();
        res.status(201).json({ message: `Note pour le code ${code_anonyme} enregistrée.` });

    } catch (err) {
        await connection.rollback();
        console.error("Erreur sur /api/noter-copie-anonyme", err);
        res.status(500).json({ error: "Erreur interne du serveur." });
    } finally {
        connection.release();
    }
});
// =================================================================
// FIN DE LA MODIFICATION 1
// =================================================================

// =================================================================
// AJOUT 1 : Nouvelle route pour les réclamations
// =================================================================
app.post('/api/reclamations', authenticateToken, checkRole(['admin', 'operateur_note']), async (req, res) => {
    const { matiere_id, code_anonyme, note_proposee } = req.body;
    const utilisateurId = req.user.id;

    if (!matiere_id || !code_anonyme || note_proposee === undefined) {
        return res.status(400).json({ message: "Toutes les informations sont requises pour le signalement." });
    }
    try {
        const query = `
            INSERT INTO reclamations (code_anonyme, matiere_id, note_proposee, signale_par_utilisateur_id)
            VALUES (?, ?, ?, ?)
        `;
        await db.query(query, [code_anonyme, matiere_id, note_proposee, utilisateurId]);
        res.status(201).json({ message: "L'incident a été signalé à l'administrateur. Merci." });
    } catch (err) {
        console.error("Erreur sur /api/reclamations", err);
        res.status(500).json({ error: "Erreur interne du serveur lors du signalement." });
    }
});
// Récupérer toutes les réclamations non résolues
app.get('/api/reclamations', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const query = `
            SELECT r.id, r.code_anonyme, r.note_proposee, r.date_reclamation, r.statut,
                   m.nom_matiere, u.nom_utilisateur as signale_par
            FROM reclamations r
            JOIN matieres m ON r.matiere_id = m.id
            JOIN utilisateurs u ON r.signale_par_utilisateur_id = u.id
            WHERE r.statut = 'nouveau'
            ORDER BY r.date_reclamation DESC
        `;
        const [reclamations] = await db.query(query);
        res.json(reclamations);
    } catch (err) {
        console.error("Erreur sur GET /api/reclamations", err);
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});

// Obtenir les détails de la saisie originale pour une réclamation
app.get('/api/reclamations/details/:code_anonyme/:matiereId', authenticateToken, checkRole(['admin']), async (req, res) => {
    const { code_anonyme, matiereId } = req.params;
    try {
        const query = `
            SELECT
                c.note AS note_originale,
                c.note_saisie_a AS date_saisie_originale, -- Colonne ajoutée via ALTER TABLE
                u.nom, u.prenom, u.matricule, u.service, u.numero_telephone, u.nom_utilisateur
            FROM copies c
            JOIN utilisateurs u ON c.note_saisie_par_utilisateur_id = u.id
            WHERE c.code_anonyme = ? AND c.matiere_id = ?
        `;
        const [details] = await db.query(query, [code_anonyme, matiereId]);

        if (details.length === 0) {
            return res.status(404).json({ message: "Impossible de trouver la saisie originale correspondante." });
        }
        res.json(details[0]);

    } catch (err) {
        console.error("Erreur sur GET /api/reclamations/details", err);
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});

// Marquer une réclamation comme résolue
app.put('/api/reclamations/:id/resoudre', authenticateToken, checkRole(['admin']), async (req, res) => {
    const { id } = req.params;
    try {
        await db.query("UPDATE reclamations SET statut = 'resolu' WHERE id = ?", [id]);
        res.json({ message: "Réclamation marquée comme résolue." });
    } catch (err) {
        console.error("Erreur sur PUT /api/reclamations/:id/resoudre", err);
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});

// AJOUT 3 : Nouvelle route pour corriger une note depuis une réclamation
// =================================================================
app.put('/api/reclamations/corriger', authenticateToken, checkRole(['admin']), async (req, res) => {
    const { reclamationId, code_anonyme, matiereId, nouvelle_note } = req.body;
    const adminId = req.user.id;

    if (!reclamationId || !code_anonyme || !matiereId || nouvelle_note === undefined) {
        return res.status(400).json({ message: "Toutes les informations sont requises pour la correction." });
    }

    const noteNum = parseFloat(nouvelle_note);
    if (isNaN(noteNum) || noteNum < 0 || noteNum > 20) {
        return res.status(400).json({ message: "La nouvelle note doit être un nombre entre 0 et 20." });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Trouver l'ID de la copie et l'ancienne note
        const [copies] = await connection.query("SELECT id, note FROM copies WHERE code_anonyme = ? AND matiere_id = ?", [code_anonyme, matiereId]);
        if (copies.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Copie originale non trouvée." });
        }
        const copieId = copies[0].id;
        const ancienne_note = copies[0].note;
        const motif = `Correction suite à la réclamation #${reclamationId}.`;

        // 2. Insérer dans l'historique des modifications
        await connection.query(
            "INSERT INTO historique_modifications_notes (copie_id, ancienne_note, nouvelle_note, motif, modifie_par_utilisateur_id) VALUES (?, ?, ?, ?, ?)",
            [copieId, ancienne_note, noteNum, motif, adminId]
        );

        // 3. Mettre à jour la note dans la table 'copies'
        await connection.query("UPDATE copies SET note = ? WHERE id = ?", [noteNum, copieId]);

        // 4. Marquer la réclamation comme résolue
        await connection.query("UPDATE reclamations SET statut = 'resolu' WHERE id = ?", [reclamationId]);

        await connection.commit();
        res.json({ message: "La note a été corrigée et la réclamation résolue." });
    } catch (err) {
        await connection.rollback();
        console.error("Erreur sur PUT /api/reclamations/corriger", err);
        res.status(500).json({ message: "Erreur interne du serveur lors de la correction." });
    } finally {
        connection.release();
    }
});

// =================================================================
// FIN DE L'AJOUT 1
// =================================================================

// REMPLACEZ VOTRE ROUTE /api/lier-copie EXISTANTE PAR CELLE-CI

app.put('/api/lier-copie', authenticateToken, checkRole(['admin', 'operateur_code']), async (req, res) => {
    const { eleve_id, matiere_id, code_anonyme } = req.body;
    const utilisateurId = req.user.id;
    if (!eleve_id || !matiere_id || !code_anonyme) {
        return res.status(400).json({ message: "Élève, matière et code sont requis pour la liaison." });
    }

    // =========================================================================
    // NOUVEAU BLOC DE VÉRIFICATION DE L'ABSENCE
    // =========================================================================
    try {
        const [absenceCheck] = await db.query(
            "SELECT motif FROM absences WHERE eleve_id = ? AND matiere_id = ?",
            [eleve_id, matiere_id]
        );

        if (absenceCheck.length > 0) {
            const motif = absenceCheck[0].motif;
            let errorMessage = "Liaison impossible : cet élève est déclaré absent pour cette matière.";
            if (motif) {
                errorMessage += ` Motif : ${motif}`;
            }
            // On utilise le statut 409 (Conflit) car la demande est valide,
            // mais elle entre en conflit avec l'état actuel des données (l'absence).
            return res.status(409).json({ message: errorMessage });
        }
    } catch (err) {
        console.error("Erreur lors de la vérification de l'absence", err);
        return res.status(500).json({ error: "Erreur interne du serveur lors de la vérification de l'absence." });
    }
    // =========================================================================
    // FIN DU BLOC DE VÉRIFICATION
    // =========================================================================


    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [copies] = await connection.query("SELECT eleve_id, matiere_id FROM copies WHERE code_anonyme = ? FOR UPDATE", [code_anonyme]);
        if (copies.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Aucune note n'a été trouvée pour ce code. Veuillez le noter d'abord." });
        }
        const copie = copies[0];
        if (copie.eleve_id !== null) {
            await connection.rollback();
            return res.status(409).json({ message: "Cette copie est déjà liée à un autre élève." });
        }
        if (copie.matiere_id.toString() !== matiere_id.toString()) {
            await connection.rollback();
            return res.status(409).json({ message: `Conflit : Ce code a été noté pour une autre matière.` });
        }
        const [existingLink] = await connection.query("SELECT id FROM copies WHERE eleve_id = ? AND matiere_id = ?", [eleve_id, matiere_id]);
        if (existingLink.length > 0) {
             await connection.rollback();
             return res.status(409).json({ message: "Cet élève est déjà lié à une autre copie pour cette matière." });
        }
        await connection.query("UPDATE copies SET eleve_id = ?, cree_par_utilisateur_id = ? WHERE code_anonyme = ?", [eleve_id, utilisateurId, code_anonyme]);
        await connection.query("UPDATE codes_anonymes_disponibles SET est_utilise = 1 WHERE code = ?", [code_anonyme]);
        await connection.commit();
        res.status(200).json({ message: "Liaison effectuée avec succès." });
    } catch (err) {
        await connection.rollback();
        console.error("Erreur sur /api/lier-copie", err);
        res.status(500).json({ error: "Erreur interne du serveur." });
    } finally {
        connection.release();
    }
});

app.get(apiPaths.copies.verifier, authenticateToken, checkRole(['admin', 'operateur_note']), async (req, res) => {
    try {
        const { code } = req.params;
        if (!code) return res.status(400).json({ message: "Le code est requis." });
        const [rows] = await db.query("SELECT id FROM copies WHERE code_anonyme = ?", [code]);
        if (rows.length > 0) {
            res.status(200).json({ existe: true, message: "Code valide." });
        } else {
            res.status(404).json({ existe: false, message: "Ce code de copie n'existe pas." });
        }
    } catch (err) {
        console.error("Erreur sur /api/copies/verifier/:code", err);
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});

app.get('/api/copies/notees-non-liees', authenticateToken, checkRole(['admin', 'operateur_code']), async (req, res) => {
    try {
        const { matiereId } = req.query;
        let query = `
            SELECT c.id, c.code_anonyme, c.note, m.nom_matiere
            FROM copies c JOIN matieres m ON c.matiere_id = m.id
            WHERE c.eleve_id IS NULL AND c.note IS NOT NULL
        `;
        const params = [];
        if (matiereId && matiereId !== 'all') {
            query += ' AND c.matiere_id = ?';
            params.push(matiereId);
        }
        query += ' ORDER BY m.nom_matiere, c.code_anonyme';
        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error("Erreur sur /api/copies/notees-non-liees", err);
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});

app.get('/api/copies/mes-liages', authenticateToken, checkRole(['admin', 'operateur_code']), async (req, res) => {
    try {
        const utilisateurId = req.user.id;
        const query = `
            SELECT c.id, c.code_anonyme, c.note, m.nom_matiere, e.nom, e.prenom, e.numero_incorporation
            FROM copies c
            JOIN matieres m ON c.matiere_id = m.id
            JOIN eleves e ON c.eleve_id = e.id
            WHERE c.cree_par_utilisateur_id = ? ORDER BY c.id DESC
        `;
        const [rows] = await db.query(query, [utilisateurId]);
        res.json(rows);
    } catch (err) {
        console.error("Erreur sur /api/copies/mes-liages", err);
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});

app.get('/api/copies/mes-saisies-notes', authenticateToken, checkRole(['admin', 'operateur_note']), async (req, res) => {
    try {
        const utilisateurId = req.user.id;
        const query = `
            SELECT c.id, c.code_anonyme, c.note, m.nom_matiere
            FROM copies c JOIN matieres m ON c.matiere_id = m.id
            WHERE c.note_saisie_par_utilisateur_id = ? ORDER BY c.id DESC
        `;
        const [rows] = await db.query(query, [utilisateurId]);
        res.json(rows);
    } catch (err) {
        console.error("Erreur sur /api/copies/mes-saisies-notes", err);
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});

app.get(apiPaths.stats.nonLiesTotal, authenticateToken, checkRole(['admin', 'operateur_code']), async (req, res) => {
    try {
        const [[{ total: totalEleves }]] = await db.query("SELECT COUNT(*) as total FROM eleves");
        const [[{ total: totalMatieres }]] = await db.query("SELECT COUNT(*) as total FROM matieres");
        const [[{ total: totalCopies }]] = await db.query("SELECT COUNT(*) as total FROM copies");
        const liaisonsPossibles = totalEleves * totalMatieres;
        const liaisonsRestantes = liaisonsPossibles - totalCopies;
        res.json({ totalRestant: liaisonsRestantes >= 0 ? liaisonsRestantes : 0 });
    } catch (err) {
        console.error("Erreur sur /api/stats/non-lies-total", err);
        res.status(500).json({ error: "Erreur lors du calcul des statistiques globales." });
    }
});

app.get(apiPaths.stats.liaisonsUtilisateur, authenticateToken, checkRole(['admin', 'operateur_code']), async (req, res) => {
    try {
        const [[result]] = await db.query("SELECT COUNT(*) as liaisonsCreees FROM copies WHERE cree_par_utilisateur_id = ?", [req.user.id]);
        res.json(result);
    } catch (err) {
        console.error("Erreur sur /api/stats/liaisons-utilisateur", err);
        res.status(500).json({ error: "Erreur lors du calcul des statistiques utilisateur." });
    }
});

app.get('/api/stats/notes-utilisateur', authenticateToken, checkRole(['admin', 'operateur_note']), async (req, res) => {
    try {
        const [[result]] = await db.query("SELECT COUNT(*) as notesSaisies FROM copies WHERE note_saisie_par_utilisateur_id = ?", [req.user.id]);
        res.json(result);
    } catch (err) {
        console.error("Erreur sur /api/stats/notes-utilisateur", err);
        res.status(500).json({ error: "Erreur lors du calcul des statistiques utilisateur." });
    }
});

app.get('/api/stats/notation/:matiereId', authenticateToken, checkRole(['admin', 'operateur_note']), async (req, res) => {
    try {
        const { matiereId } = req.params;
        const [[{ totalEleves }]] = await db.query("SELECT COUNT(*) as totalEleves FROM eleves");
        const [[{ notesSaisies }]] = await db.query("SELECT COUNT(*) as notesSaisies FROM copies WHERE matiere_id = ? AND note IS NOT NULL", [matiereId]);
        const notesManquantes = totalEleves - notesSaisies;
        res.json({ totalEleves, notesManquantes });
    } catch (err) {
        console.error("Erreur sur /api/stats/notation/:matiereId", err);
        res.status(500).json({ error: "Erreur lors du calcul des statistiques de notation." });
    }
});

app.get(apiPaths.matieres.elevesRestants, authenticateToken, checkRole(['admin', 'operateur_code']), async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await db.query(`SELECT COUNT(*) as restants FROM eleves WHERE id NOT IN (SELECT eleve_id FROM copies WHERE matiere_id = ?)`, [id]);
        res.json(rows[0]);
    } catch (err) {
        console.error("Erreur sur /api/matieres/:id/eleves-restants", err);
        res.status(500).json({ error: "Erreur lors du calcul des élèves restants." });
    }
});

app.get(apiPaths.resultats.base, authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const query = `
            SELECT
                c.id AS copie_id, e.prenom, e.nom, e.numero_incorporation, e.escadron, e.peloton,
                m.nom_matiere, m.id as matiere_id, c.note, c.code_anonyme,
                u_note.nom_utilisateur AS operateur_note, u_code.nom_utilisateur AS operateur_code,
                (SELECT COUNT(*) FROM historique_modifications_notes h WHERE h.copie_id = c.id) AS modifications_count
            FROM copies c
            JOIN eleves e ON c.eleve_id = e.id
            JOIN matieres m ON c.matiere_id = m.id
            LEFT JOIN utilisateurs u_note ON c.note_saisie_par_utilisateur_id = u_note.id
            LEFT JOIN utilisateurs u_code ON c.cree_par_utilisateur_id = u_code.id
            WHERE c.note IS NOT NULL
            ORDER BY m.nom_matiere, e.escadron, e.peloton, CAST(e.numero_incorporation AS UNSIGNED) ASC;
        `;
        const [rows] = await db.query(query);
        res.json(rows);
    } catch (err) {
        console.error("Erreur sur /api/resultats", err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/resultats/:copieId', authenticateToken, checkRole(['admin']), async (req, res) => {
    const { copieId } = req.params;
    const { nouvelle_note, motif } = req.body;
    const utilisateurId = req.user.id;
    if (nouvelle_note === undefined || !motif) {
        return res.status(400).json({ message: "La nouvelle note et le motif sont requis." });
    }
    const noteNum = parseFloat(nouvelle_note);
    if (isNaN(noteNum) || noteNum < 0 || noteNum > 20) {
        return res.status(400).json({ message: "La note doit être un nombre entre 0 et 20." });
    }
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [copies] = await connection.query("SELECT note FROM copies WHERE id = ?", [copieId]);
        if (copies.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Résultat non trouvé." });
        }
        const ancienne_note = copies[0].note;
        await connection.query(
            "INSERT INTO historique_modifications_notes (copie_id, ancienne_note, nouvelle_note, motif, modifie_par_utilisateur_id) VALUES (?, ?, ?, ?, ?)",
            [copieId, ancienne_note, noteNum, motif, utilisateurId]
        );
        await connection.query("UPDATE copies SET note = ? WHERE id = ?", [noteNum, copieId]);
        await connection.commit();
        res.json({ message: "La note a été mise à jour avec succès." });
    } catch (err) {
        await connection.rollback();
        console.error("Erreur lors de la mise à jour de la note :", err);
        res.status(500).json({ message: "Erreur interne du serveur." });
    } finally {
        connection.release();
    }
});

app.delete('/api/resultats/:copieId', authenticateToken, checkRole(['admin']), async (req, res) => {
    const { copieId } = req.params;
    const utilisateurId = req.user.id;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [copies] = await connection.query("SELECT note FROM copies WHERE id = ?", [copieId]);
        if (copies.length === 0) {
             await connection.rollback();
             return res.status(404).json({ message: "Résultat non trouvé." });
        }
        const ancienne_note = copies[0].note;
        const motif = `Suppression de la note ${ancienne_note}.`;
        await connection.query(
            "INSERT INTO historique_modifications_notes (copie_id, ancienne_note, nouvelle_note, motif, modifie_par_utilisateur_id) VALUES (?, ?, NULL, ?, ?)",
            [copieId, ancienne_note, motif, utilisateurId]
        );
        await connection.query("UPDATE copies SET note = NULL WHERE id = ?", [copieId]);
        await connection.commit();
        res.json({ message: "La note a été supprimée et l'action archivée." });
    } catch (err) {
        await connection.rollback();
        console.error("Erreur lors de la suppression de la note :", err);
        res.status(500).json({ message: "Erreur interne du serveur." });
    } finally {
        connection.release();
    }
});

app.get('/api/resultats/:copieId/historique', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { copieId } = req.params;
        const query = `
            SELECT
                h.ancienne_note, h.nouvelle_note, h.motif, h.date_modification,
                u.nom_utilisateur AS modifie_par
            FROM historique_modifications_notes h
            JOIN utilisateurs u ON h.modifie_par_utilisateur_id = u.id
            WHERE h.copie_id = ?
            ORDER BY h.date_modification DESC;
        `;
        const [historique] = await db.query(query, [copieId]);
        if (historique.length === 0) {
            return res.status(404).json({ message: "Aucun historique trouvé pour cette note." });
        }
        res.json(historique);
    } catch (err) {
        console.error("Erreur lors de la récupération de l'historique:", err);
        res.status(500).json({ message: "Erreur interne du serveur." });
    }
});

app.get(apiPaths.resultats.exporter, authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { matiereId } = req.query;
        if (!matiereId) {
            return res.status(400).json({ message: "Veuillez spécifier une matière pour l'exportation." });
        }
        const query = `
            SELECT e.nom, e.prenom, e.numero_incorporation, e.escadron, e.peloton, e.sexe, m.nom_matiere, c.note
            FROM copies c
            JOIN eleves e ON c.eleve_id = e.id
            JOIN matieres m ON c.matiere_id = m.id
            WHERE c.note IS NOT NULL AND m.id = ?
            ORDER BY e.escadron, e.peloton, CAST(e.numero_incorporation AS UNSIGNED) ASC;
        `;
        const [results] = await db.query(query, [matiereId]);
        if (results.length === 0) {
            return res.status(404).json({ message: "Aucun résultat à exporter pour cette matière." });
        }
        const groupedData = results.reduce((acc, result) => {
            const key = `${result.escadron || 'Sans Escadron'} - ${result.peloton || 'Sans Peloton'}`;
            if (!acc[key]) acc[key] = [];
            acc[key].push(result);
            return acc;
        }, {});
        const workbook = xlsx.utils.book_new();
        const nomMatiere = results[0].nom_matiere.toUpperCase();
        for (const groupName in groupedData) {
            const sheetData = groupedData[groupName];
            const headers = ["N° ORDRE", "NOM ET PRENOM", "N° INCORPORATION", "ESCADRON", "PELOTON", "SEXE", "NOTE / 20"];
            const body = sheetData.map((row, index) => [
                index + 1, `${row.nom || ''} ${row.prenom || ''}`.trim(), row.numero_incorporation,
                row.escadron, row.peloton, (row.sexe === 'feminin' ? 'F' : 'M'), row.note
            ]);
            const finalSheetData = [[`FICHE DE RECUEIL DE NOTE - ${nomMatiere}`], [], headers, ...body];
            const worksheet = xlsx.utils.aoa_to_sheet(finalSheetData);
            worksheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
            worksheet['!cols'] = [{ wch: 10 }, { wch: 35 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 15 }];
            const sheetName = groupName.replace(/[\\/*?:]/g, '').substring(0, 31);
            xlsx.utils.book_append_sheet(workbook, worksheet, sheetName);
        }
        const buffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });
        const fileName = `Fiche_Notes_${nomMatiere.replace(/ /g, '_')}.xlsx`;
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (err) {
        console.error("Erreur sur /api/resultats/exporter", err);
        res.status(500).json({ error: "Erreur lors de la génération du fichier Excel." });
    }
});

app.post('/api/resultats/generer-document-pdf', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { matiereId } = req.body;
        if (!matiereId) {
            return res.status(400).json({ message: "Veuillez spécifier une matière pour la génération du document." });
        }
        const query = `
            SELECT e.nom, e.prenom, e.numero_incorporation, e.escadron, e.peloton, e.sexe, m.nom_matiere, c.note
            FROM copies c JOIN eleves e ON c.eleve_id = e.id JOIN matieres m ON c.matiere_id = m.id
            WHERE c.note IS NOT NULL AND m.id = ?
            ORDER BY e.escadron, e.peloton, CAST(e.numero_incorporation AS UNSIGNED) ASC;
        `;
        const [results] = await db.query(query, [matiereId]);
        if (results.length === 0) {
            return res.status(404).json({ message: "Aucun résultat à générer pour cette matière." });
        }
        const groupedData = results.reduce((acc, result) => {
            const key = `${result.escadron || 'Sans Escadron'} - ${result.peloton || 'Sans Peloton'}`;
            if (!acc[key]) acc[key] = [];
            acc[key].push(result);
            return acc;
        }, {});

        // Modification 1: Orientation en 'portrait'
        const doc = new jsPDF({ orientation: 'portrait' });
        const nomMatiere = results[0].nom_matiere.toUpperCase();
        let firstPage = true;

        for (const groupName in groupedData) {
            if (!firstPage) {
                // Modification 1: Ajout de page en 'portrait'
                doc.addPage('portrait');
            }
            firstPage = false;

            // --- DEBUT GENERATION QR CODE ---
            // Préparer les données pour le QR Code de la page actuelle
            const qrPageData = groupedData[groupName].map((row, index) => ({
                num: index + 1,
                nom: `${row.nom || ''} ${row.prenom || ''}`.trim(),
                inc: row.numero_incorporation,
                note: row.note
            }));
            const qrDataString = JSON.stringify(qrPageData);

            // Générer le QR Code en tant qu'image Data URL
            const qrCodeImage = await QRCode.toDataURL(qrDataString);

            // Ajouter le QR Code en haut à droite du document
            const qrCodeSize = 25; // taille du QR code en mm
            const pageMargin = 10; // marge de la page
            const qrX = doc.internal.pageSize.getWidth() - qrCodeSize - pageMargin;
            const qrY = pageMargin;
            doc.addImage(qrCodeImage, 'PNG', qrX, qrY, qrCodeSize, qrCodeSize);
            // --- FIN GENERATION QR CODE ---

            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text(`FICHE DE RECUEIL DE NOTE - ${nomMatiere}`, doc.internal.pageSize.getWidth() / 2, 20, { align: 'center' });

            // Modification 2: Nouveaux noms pour les colonnes de l'en-tête
            const head = [['N°', 'NOM/PRENOM', 'INCOR', 'ESC', 'PON', 'SEXE', 'NOTE / 20']];
            const body = groupedData[groupName].map((row, index) => [
                index + 1,
                `${row.nom || ''} ${row.prenom || ''}`.trim(),
                row.numero_incorporation,
                row.escadron,
                row.peloton,
                (row.sexe === 'feminin' ? 'F' : 'M'),
                // S'assure que la note est bien formatée
                parseFloat(row.note).toFixed(2)
            ]);

            autoTable(doc, {
                startY: 35, // On descend un peu pour laisser de la place au QR Code et au titre
                head: head,
                body: body,
                theme: 'grid',
                // Modification 3: Style pour l'en-tête (pas de fond, texte noir et gras)
                headStyles: {
                    fillColor: [255, 255, 255], // Fond blanc (pas de couleur)
                    textColor: [0, 0, 0],       // Texte noir
                    fontStyle: 'bold',          // Texte en gras
                    lineColor: [0, 0, 0],       // Lignes de la grille en noir
                    lineWidth: 0.1
                },
                // Modification 4: Style pour le corps (texte noir)
                styles: {
                    textColor: [0, 0, 0],        // Texte noir
                    lineColor: [0, 0, 0],        // Lignes de la grille en noir
                    lineWidth: 0.1
                }
            });
        }
        const pdfBuffer = doc.output('arraybuffer');
        const fileName = `Fiche_Notes_${nomMatiere.replace(/ /g, '_')}.pdf`;
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/pdf');
        res.send(Buffer.from(pdfBuffer));
    } catch (err) {
        console.error("Erreur sur /api/resultats/generer-document-pdf", err);
        res.status(500).json({ error: "Erreur lors de la génération du fichier PDF." });
    }
});

app.get(apiPaths.utilisateurs.base, authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const [users] = await db.query("SELECT id, nom, prenom, nom_utilisateur, role, statut FROM utilisateurs ORDER BY statut, nom_utilisateur");
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: "Erreur lors de la récupération des utilisateurs." });
    }
});

app.post(apiPaths.utilisateurs.base, authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { nom_utilisateur, mot_de_passe, role } = req.body;
        if (!nom_utilisateur || !mot_de_passe || !role) return res.status(400).json({ message: "Toutes les informations sont requises." });

        const query = "INSERT INTO utilisateurs (nom, prenom, nom_utilisateur, mot_de_passe, role, statut) VALUES (?, ?, ?, ?, ?, ?)";
        await db.query(query, [nom_utilisateur, '', nom_utilisateur, mot_de_passe, role, 'approuve']);

        res.status(201).json({ message: "Utilisateur créé avec succès." });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: "Ce nom d'utilisateur existe déjà." });
        res.status(500).json({ error: "Erreur lors de la création de l'utilisateur." });
    }
});

app.put(apiPaths.utilisateurs.byId, authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { nom_utilisateur, mot_de_passe, role } = req.body;
        if (!nom_utilisateur || !role) return res.status(400).json({ message: "Le nom d'utilisateur et le rôle sont requis." });
        let query, params;
        if (mot_de_passe) {
            query = "UPDATE utilisateurs SET nom_utilisateur = ?, mot_de_passe = ?, role = ? WHERE id = ?";
            params = [nom_utilisateur, mot_de_passe, role, id];
        } else {
            query = "UPDATE utilisateurs SET nom_utilisateur = ?, role = ? WHERE id = ?";
            params = [nom_utilisateur, role, id];
        }
        const [result] = await db.query(query, params);
        if (result.affectedRows === 0) return res.status(404).json({ message: "Utilisateur non trouvé." });
        res.json({ message: "Utilisateur mis à jour avec succès." });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: "Ce nom d'utilisateur existe déjà." });
        res.status(500).json({ error: "Erreur lors de la mise à jour de l'utilisateur." });
    }
});

app.delete(apiPaths.utilisateurs.byId, authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        if (parseInt(id, 10) === req.user.id) return res.status(403).json({ message: "Vous ne pouvez pas supprimer votre propre compte." });
        const [result] = await db.query("DELETE FROM utilisateurs WHERE id = ?", [id]);
        if (result.affectedRows === 0) return res.status(404).json({ message: "Utilisateur non trouvé." });
        res.json({ message: "Utilisateur supprimé avec succès." });
    } catch (err) {
        res.status(500).json({ error: "Erreur lors de la suppression de l'utilisateur." });
    }
});

app.put('/api/utilisateurs/:id/approuver', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;
        if (!role) {
            return res.status(400).json({ message: "Le rôle est requis pour approuver un utilisateur." });
        }
        const [result] = await db.query(
            "UPDATE utilisateurs SET statut = 'approuve', role = ? WHERE id = ?",
            [role, id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Utilisateur non trouvé." });
        }
        res.json({ message: "Utilisateur approuvé et rôle attribué avec succès." });
    } catch (err) {
        console.error("Erreur lors de l'approbation de l'utilisateur", err);
        res.status(500).json({ error: "Erreur lors de l'approbation de l'utilisateur." });
    }
});

app.put('/api/utilisateurs/:id/rejeter', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await db.query("UPDATE utilisateurs SET statut = 'rejete' WHERE id = ?", [id]);
        if (result.affectedRows === 0) return res.status(404).json({ message: "Utilisateur non trouvé." });
        res.json({ message: "Utilisateur rejeté." });
    } catch (err) {
        res.status(500).json({ error: "Erreur lors du rejet de l'utilisateur." });
    }
});

// AJOUT 1: Nouvelle route pour les statistiques du tableau de bord par matière

// COLLEZ CE BLOC CORRECT DANS VOTRE server.js

app.get('/api/stats/copies-par-matiere', authenticateToken, checkRole(['admin', 'operateur_code', 'operateur_note']), async (req, res) => {
    try {
        const query = `
            SELECT
                m.id,
                m.nom_matiere,
                COALESCE(copies_notees.count, 0) AS avec_note,
                COALESCE(codes_totaux.count, 0) - COALESCE(copies_notees.count, 0) AS sans_note
            FROM
                matieres m
            LEFT JOIN (
                SELECT m.id AS matiere_id, COUNT(cad.id) as count
                FROM matieres m
                JOIN codes_anonymes_disponibles cad ON cad.code LIKE CONCAT(m.code_prefixe, '%')
                GROUP BY m.id
            ) AS codes_totaux ON m.id = codes_totaux.matiere_id
            LEFT JOIN (
                SELECT matiere_id, COUNT(*) as count
                FROM copies
                WHERE note IS NOT NULL
                GROUP BY matiere_id
            ) AS copies_notees ON m.id = copies_notees.matiere_id
            ORDER BY m.nom_matiere;
        `;
        const [stats] = await db.query(query);
        res.json(stats);
    } catch (err) {
        console.error("Erreur sur /api/stats/copies-par-matiere", err);
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});

// AJOUT 2: Nouvelle route pour récupérer les copies créées mais SANS note et non liées
app.get('/api/copies/non-notees', authenticateToken, checkRole(['admin', 'operateur_code']), async (req, res) => {
    try {
        const { matiereId } = req.query;
        let query = `
            SELECT c.id, c.code_anonyme, m.nom_matiere
            FROM copies c JOIN matieres m ON c.matiere_id = m.id
            WHERE c.eleve_id IS NULL AND c.note IS NULL
        `;
        const params = [];
        if (matiereId && matiereId !== 'all') {
            query += ' AND c.matiere_id = ?';
            params.push(matiereId);
        }
        query += ' ORDER BY m.nom_matiere, c.code_anonyme';
        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error("Erreur sur /api/copies/non-notees", err);
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});

// AJOUT : Nouvelle route pour obtenir la liste des codes SANS note pour une matière
app.get('/api/codes/sans-note/:matiereId', authenticateToken, checkRole(['admin', 'operateur_code', 'operateur_note']), async (req, res) => {
    try {
        const { matiereId } = req.params;

        // On récupère d'abord le préfixe de la matière
        const [[matiere]] = await db.query("SELECT code_prefixe FROM matieres WHERE id = ?", [matiereId]);
        if (!matiere) {
            return res.status(404).json({ message: "Matière non trouvée." });
        }
        const prefixe = matiere.code_prefixe;

        // Requête pour trouver tous les codes qui ont le bon préfixe
        // MAIS qui N'APPARAISSENT PAS dans la table 'copies' pour cette matière.
        const query = `
            SELECT cad.code
            FROM codes_anonymes_disponibles cad
            LEFT JOIN copies c ON cad.code = c.code_anonyme AND c.matiere_id = ?
            WHERE cad.code LIKE ? AND c.id IS NULL
            ORDER BY cad.code;
        `;

        const [codes] = await db.query(query, [matiereId, `${prefixe}%`]);
        res.json(codes);

    } catch (err) {
        console.error("Erreur sur /api/codes/sans-note/:matiereId", err);
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});

// AJOUT : Nouvelle route pour enregistrer les absences en masse
// à ajouter dans backend/server.js

// REMPLACEZ l'ancienne route /api/absences/bulk par celle-ci dans server.js

app.post('/api/absences/bulk', authenticateToken, checkRole(['admin']), async (req, res) => {
    const absencesData = req.body;
    const utilisateurId = req.user.id;

    if (!Array.isArray(absencesData) || absencesData.length === 0) {
        return res.status(400).json({ message: "Aucune donnée d'absence fournie." });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const valuesToInsert = [];
        for (const absence of absencesData) {
            const eleveId = absence.eleve.id;
            const motif = absence.motif || null; // Récupère le motif, ou null s'il est vide
            for (const matiere of absence.matieres) {
                const matiereId = matiere.id;
                // Ajout du motif dans les valeurs à insérer
                valuesToInsert.push([eleveId, matiereId, utilisateurId, motif]);
            }
        }

        if (valuesToInsert.length === 0) {
            await connection.rollback();
            return res.status(400).json({ message: "Les données d'absence sont invalides ou vides." });
        }

        // Mise à jour de la requête SQL pour inclure le champ 'motif'
        const sql = "INSERT IGNORE INTO absences (eleve_id, matiere_id, enregistre_par_utilisateur_id, motif) VALUES ?";
        const [result] = await connection.query(sql, [valuesToInsert]);

        await connection.commit();

        res.status(201).json({
            message: `${result.affectedRows} absence(s) ont été enregistrée(s) avec succès. ${valuesToInsert.length - result.affectedRows} étaient déjà enregistrées.`
        });

    } catch (err) {
        await connection.rollback();
        console.error("Erreur sur /api/absences/bulk", err);
        res.status(500).json({ message: "Erreur interne lors de l'enregistrement des absences." });
    } finally {
        connection.release();
    }
});

app.get('/api/absences', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const query = `
            SELECT
                a.eleve_id, a.matiere_id, a.motif,
                e.nom, e.prenom, e.numero_incorporation,
                m.nom_matiere
            FROM absences a
            JOIN eleves e ON a.eleve_id = e.id
            JOIN matieres m ON a.matiere_id = m.id
            ORDER BY e.nom, e.prenom;
        `;
        const [rows] = await db.query(query);

        // Grouper les résultats par élève
        const absencesGroupees = rows.reduce((acc, row) => {
            if (!acc[row.eleve_id]) {
                acc[row.eleve_id] = {
                    eleve: {
                        id: row.eleve_id,
                        nom: row.nom,
                        prenom: row.prenom,
                        numero_incorporation: row.numero_incorporation
                    },
                    matieres: [],
                    motif: row.motif
                };
            }
            acc[row.eleve_id].matieres.push({
                matiere_id: row.matiere_id,
                nom_matiere: row.nom_matiere
            });
            return acc;
        }, {});

        res.json(Object.values(absencesGroupees)); // Renvoyer un tableau d'objets

    } catch (err) {
        console.error("Erreur sur GET /api/absences", err);
        res.status(500).json({ message: "Erreur interne lors de la récupération des absences." });
    }
});

// Supprimer toutes les absences pour un élève donné
app.delete('/api/absences/:eleveId', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { eleveId } = req.params;
        await db.query("DELETE FROM absences WHERE eleve_id = ?", [eleveId]);
        res.json({ message: "Absence(s) supprimée(s) avec succès." });
    } catch (err) {
        console.error("Erreur sur DELETE /api/absences/:eleveId", err);
        res.status(500).json({ message: "Erreur interne lors de la suppression." });
    }
});

// Mettre à jour les absences pour un élève donné
app.put('/api/absences/:eleveId', authenticateToken, checkRole(['admin']), async (req, res) => {
    const { eleveId } = req.params;
    const { matieres, motif } = req.body;
    const utilisateurId = req.user.id;

    if (!Array.isArray(matieres) || matieres.length === 0) {
        return res.status(400).json({ message: "Veuillez sélectionner au moins une matière." });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Supprimer les anciennes absences pour cet élève
        await connection.query("DELETE FROM absences WHERE eleve_id = ?", [eleveId]);

        // 2. Insérer les nouvelles absences
        const valuesToInsert = matieres.map(matiereId => [
            eleveId,
            matiereId,
            utilisateurId,
            motif || null
        ]);

        const sql = "INSERT INTO absences (eleve_id, matiere_id, enregistre_par_utilisateur_id, motif) VALUES ?";
        await connection.query(sql, [valuesToInsert]);

        await connection.commit();
        res.json({ message: "Les absences de l'élève ont été mises à jour avec succès." });

    } catch (err) {
        await connection.rollback();
        console.error("Erreur sur PUT /api/absences/:eleveId", err);
        res.status(500).json({ message: "Erreur interne lors de la mise à jour." });
    } finally {
        connection.release();
    }
});

// NOUVELLE ROUTE POUR LA SAISIE DIRECTE SANS CODE
app.post(apiPaths.copies.noteDirecte, authenticateToken, checkRole(['admin']), async (req, res) => { // <<< MODIFIÉ
    const { eleve_id, matiere_id, note } = req.body;
    const utilisateurId = req.user.id;

    if (!eleve_id || !matiere_id || note === undefined || note === '') {
        return res.status(400).json({ message: "Élève, matière et note sont requis." });
    }
    const noteNum = parseFloat(note);
    if (isNaN(noteNum) || noteNum < 0 || noteNum > 20) {
         return res.status(400).json({ message: "La note doit être un nombre valide entre 0 et 20." });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [absenceCheck] = await connection.query(
            "SELECT id FROM absences WHERE eleve_id = ? AND matiere_id = ?",
            [eleve_id, matiere_id]
        );
        if (absenceCheck.length > 0) {
             await connection.rollback();
             return res.status(409).json({ message: "Impossible d'enregistrer la note : cet élève est déclaré absent pour cette matière." });
        }

        const query = `
            INSERT INTO copies (eleve_id, matiere_id, note, note_saisie_par_utilisateur_id, code_anonyme)
            VALUES (?, ?, ?, ?, NULL)
            ON DUPLICATE KEY UPDATE
                note = VALUES(note),
                note_saisie_par_utilisateur_id = VALUES(note_saisie_par_utilisateur_id);
        `;
        await connection.query(query, [eleve_id, matiere_id, noteNum, utilisateurId]);

        await connection.commit();
        res.status(201).json({ message: "Note enregistrée avec succès." });

    } catch (err) {
        await connection.rollback();
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Une erreur de conflit est survenue. Vérifiez les données.' });
        }
        console.error("Erreur sur /api/note-directe", err);
        res.status(500).json({ error: "Erreur interne du serveur." });
    } finally {
        connection.release();
    }
});

// NOUVELLE ROUTE POUR LE MODE DE SAISIE EN SÉRIE
app.get('/api/eleves-par-groupe', authenticateToken, checkRole(['admin']), async (req, res) => {
    const { matiereId, escadron, peloton } = req.query;

    if (!matiereId || !escadron) {
        return res.status(400).json({ message: "La matière et l'escadron sont requis." });
    }

    try {
        let params = [matiereId, matiereId, escadron];
        let pelotonFilter = '';
        if (peloton && peloton !== 'all') {
            pelotonFilter = 'AND e.peloton = ?';
            params.push(peloton);
        }

        // Cette requête est le coeur de la fonctionnalité :
        // 1. Elle sélectionne les élèves d'un escadron/peloton.
        // 2. Elle EXCLUT les élèves déjà notés dans cette matière.
        // 3. Elle EXCLUT les élèves marqués absents pour cette matière.
        // 4. Elle ORDONNE le résultat pour une saisie séquentielle logique.
        const query = `
            SELECT e.id, e.nom, e.prenom, e.numero_incorporation, e.escadron, e.peloton
            FROM eleves e
            LEFT JOIN copies c ON e.id = c.eleve_id AND c.matiere_id = ?
            LEFT JOIN absences a ON e.id = a.eleve_id AND a.matiere_id = ?
            WHERE c.id IS NULL
              AND a.id IS NULL
              AND e.escadron = ?
              ${pelotonFilter}
            ORDER BY e.peloton ASC, CAST(e.numero_incorporation AS UNSIGNED) ASC;
        `;

        const [eleves] = await db.query(query, params);
        res.json(eleves);

    } catch (err) {
        console.error("Erreur sur /api/eleves-par-groupe", err);
        res.status(500).json({ message: "Erreur interne lors de la récupération des élèves." });
    }
});

// DANS server.js, à ajouter

app.put('/api/matieres/coefficients', authenticateToken, checkRole(['admin']), async (req, res) => {
    const coefficients = req.body; // Attendu : [{ id: 1, coefficient: 2.5 }, { id: 2, coefficient: 3.0 }]
    if (!Array.isArray(coefficients) || coefficients.length === 0) {
        return res.status(400).json({ message: "Les données des coefficients sont invalides." });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const promises = coefficients.map(item => {
            const coeffNum = parseFloat(item.coefficient);
            if (isNaN(coeffNum) || coeffNum < 0) {
                throw new Error(`Coefficient invalide pour la matière ID ${item.id}`);
            }
            return connection.query("UPDATE matieres SET coefficient = ? WHERE id = ?", [coeffNum, item.id]);
        });
        await Promise.all(promises);
        await connection.commit();
        res.json({ message: "Les coefficients ont été mis à jour avec succès." });
    } catch (err) {
        await connection.rollback();
        console.error("Erreur lors de la mise à jour des coefficients :", err);
        res.status(500).json({ message: err.message || "Erreur interne du serveur." });
    } finally {
        connection.release();
    }
});

// DANS server.js, à ajouter

app.get('/api/resultats/classement', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        // 1. Récupérer toutes les données nécessaires
        const [eleves] = await db.query("SELECT id, prenom, nom, numero_incorporation FROM eleves");
        const [matieres] = await db.query("SELECT id, coefficient FROM matieres");
        const [notes] = await db.query("SELECT eleve_id, matiere_id, note FROM copies WHERE note IS NOT NULL");

        // 2. Préparer les données pour un accès facile
        const notesMap = new Map(); // "eleveId-matiereId" -> note
        notes.forEach(n => {
            notesMap.set(`${n.eleve_id}-${n.matiere_id}`, n.note);
        });

        const totalCoefficients = matieres.reduce((sum, m) => sum + parseFloat(m.coefficient), 0);
        if (totalCoefficients === 0) {
             return res.json([]); // Évite la division par zéro si aucun coeff n'est défini
        }


        // 3. Calculer la moyenne pour chaque élève
        const resultatsCalcules = eleves.map(eleve => {
            let totalPoints = 0;
            let hasAtLeastOneNote = false;

            matieres.forEach(matiere => {
                const note = notesMap.get(`${eleve.id}-${matiere.id}`);
                if (note !== undefined && note !== null) {
                    totalPoints += parseFloat(note) * parseFloat(matiere.coefficient);
                    hasAtLeastOneNote = true;
                }
                // Si la note n'existe pas, c'est comme si on ajoutait 0 * coeff, donc on ne fait rien.
            });

            // Si l'élève n'a aucune note, il est non classé
            if (!hasAtLeastOneNote) {
                return { ...eleve, moyenne: null, statut: 'Non classé' };
            }

            const moyenne = totalPoints / totalCoefficients;
            return { ...eleve, moyenne: moyenne.toFixed(2), statut: 'Classé' };
        });

        // 4. Séparer les classés et les non-classés
        const classes = resultatsCalcules.filter(r => r.statut === 'Classé');
        const nonClasses = resultatsCalcules.filter(r => r.statut === 'Non classé');

        // 5. Trier les élèves classés par moyenne (décroissant)
        classes.sort((a, b) => b.moyenne - a.moyenne);

        // 6. Attribuer le rang en gérant les ex aequo
        let rang = 0;
        let lastMoyenne = -1;
        let studentsAtCurrentRank = 1;

        const classesAvecRang = classes.map((eleve, index) => {
            if (eleve.moyenne !== lastMoyenne) {
                rang = rang + studentsAtCurrentRank;
                studentsAtCurrentRank = 1;
            } else {
                 studentsAtCurrentRank++;
            }
            lastMoyenne = eleve.moyenne;

            // On ajoute "ex" pour ex aequo si l'élève précédent ou suivant a la même moyenne
            const isExAequo = (index > 0 && eleve.moyenne === classes[index - 1].moyenne) ||
                              (index < classes.length - 1 && eleve.moyenne === classes[index + 1].moyenne);

            return { ...eleve, rang: isExAequo ? `${rang} ex` : rang };
        });

        // 7. Combiner les deux listes et envoyer
        const classementFinal = [...classesAvecRang, ...nonClasses];
        res.json(classementFinal);

    } catch (err) {
        console.error("Erreur sur /api/resultats/classement :", err);
        res.status(500).json({ error: "Erreur lors du calcul du classement." });
    }
});

// DANS backend/server.js, AJOUTER CETTE NOUVELLE ROUTE
// DANS backend/server.js, REMPLACEZ LA ROUTE EXISTANTE PAR CELLE-CI

app.get('/api/resultats/classement-details', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        // MODIFICATION 1: Ajouter escadron et peloton à la sélection des élèves
        const [eleves] = await db.query("SELECT id, prenom, nom, numero_incorporation, escadron, peloton FROM eleves ORDER BY nom, prenom");

        // MODIFICATION 2: Ajouter code_prefixe à la sélection des matières
        const [matieres] = await db.query("SELECT id, nom_matiere, code_prefixe, coefficient FROM matieres ORDER BY nom_matiere");

        const [notes] = await db.query("SELECT eleve_id, matiere_id, note FROM copies WHERE note IS NOT NULL");

        const notesMap = new Map();
        notes.forEach(n => {
            notesMap.set(`${n.eleve_id}-${n.matiere_id}`, parseFloat(n.note).toFixed(2));
        });

        const totalCoefficients = matieres.reduce((sum, m) => sum + parseFloat(m.coefficient), 0);
        if (totalCoefficients === 0) {
            return res.json({ classement: [], matieres: [] });
        }

        const resultatsCalcules = eleves.map(eleve => {
            let totalPoints = 0;
            let hasAtLeastOneNote = false;
            const notesDetail = {};

            matieres.forEach(matiere => {
                const note = notesMap.get(`${eleve.id}-${matiere.id}`);
                if (note !== undefined) {
                    totalPoints += parseFloat(note) * parseFloat(matiere.coefficient);
                    hasAtLeastOneNote = true;
                    notesDetail[matiere.id] = note;
                } else {
                    notesDetail[matiere.id] = '0.00';
                }
            });

            if (!hasAtLeastOneNote) {
                return { ...eleve, moyenne: null, statut: 'Non classé', notesDetail };
            }

            const moyenne = totalPoints / totalCoefficients;
            // L'objet 'eleve' contient maintenant escadron et peloton qui seront passés
            return { ...eleve, moyenne: moyenne.toFixed(2), statut: 'Classé', notesDetail };
        });

        const classes = resultatsCalcules.filter(r => r.statut === 'Classé');
        const nonClasses = resultatsCalcules.filter(r => r.statut === 'Non classé');

        classes.sort((a, b) => b.moyenne - a.moyenne);
        let rang = 0;
        let lastMoyenne = -1;
        let studentsAtCurrentRank = 1;
        const classesAvecRang = classes.map((eleve, index) => {
            if (eleve.moyenne !== lastMoyenne) {
                rang = rang + studentsAtCurrentRank;
                studentsAtCurrentRank = 1;
            } else {
                 studentsAtCurrentRank++;
            }
            lastMoyenne = eleve.moyenne;
            const isExAequo = (index > 0 && eleve.moyenne === classes[index - 1].moyenne) ||
                              (index < classes.length - 1 && eleve.moyenne === classes[index + 1].moyenne);
            return { ...eleve, rang: isExAequo ? `${rang} ex` : rang };
        });

        // La réponse contient maintenant les données enrichies
        res.json({
            classement: [...classesAvecRang, ...nonClasses],
            matieres: matieres
        });

    } catch (err) {
        console.error("Erreur sur /api/resultats/classement-details :", err);
        res.status(500).json({ error: "Erreur lors du calcul détaillé du classement." });
    }
});

// DANS backend/server.js, AJOUTER CETTE NOUVELLE ROUTE AVANT app.listen()
// DANS backend/server.js, REMPLACEZ LA ROUTE EXISTANTE PAR CELLE-CI (VERSION CORRIGÉE)

// Helper function pour obtenir la mention
const getMentionForExcel = (moyenne) => {
    if (moyenne === null || moyenne === undefined) return '-';
    const m = parseFloat(moyenne);
    if (m >= 18) return 'Excellent';
    if (m >= 16) return 'Très bien';
    if (m >= 14) return 'Bien';
    if (m >= 12) return 'Assez bien';
    if (m >= 10) return 'Passable';
    return 'Insuffisant';
};

// Helper function pour attribuer le rang au sein d'un groupe
const assignRankInGroup = (group) => {
    group.sort((a, b) => b.moyenne - a.moyenne);
    let rang = 0;
    let lastMoyenne = -1;
    let studentsAtCurrentRank = 1;
    return group.map((eleve, index) => {
        if (eleve.moyenne !== lastMoyenne) {
            rang = rang + studentsAtCurrentRank;
            studentsAtCurrentRank = 1;
        } else {
            studentsAtCurrentRank++;
        }
        lastMoyenne = eleve.moyenne;
        const isExAequo = (index > 0 && eleve.moyenne === group[index - 1].moyenne) ||
                          (index < group.length - 1 && eleve.moyenne === group[index + 1].moyenne);
        return { ...eleve, rang_groupe: isExAequo ? `${rang} ex` : rang };
    });
};


app.get('/api/resultats/exporter-classement-excel', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        // --- 1. Récupérer et calculer le classement général (logique existante) ---
        const [eleves] = await db.query("SELECT id, prenom, nom, numero_incorporation, escadron, peloton FROM eleves ORDER BY nom, prenom");
        const [matieres] = await db.query("SELECT id, coefficient FROM matieres");
        const [notes] = await db.query("SELECT eleve_id, matiere_id, note FROM copies WHERE note IS NOT NULL");

        const notesMap = new Map();
        notes.forEach(n => { notesMap.set(`${n.eleve_id}-${n.matiere_id}`, parseFloat(n.note)); });

        const totalCoefficients = matieres.reduce((sum, m) => sum + parseFloat(m.coefficient), 0);
        if (totalCoefficients === 0) {
            return res.status(400).json({ message: "Impossible d'exporter, aucun coefficient n'est défini."});
        }

        const resultatsCalcules = eleves.map(eleve => {
            let totalPoints = 0;
            let hasAtLeastOneNote = false;
            matieres.forEach(matiere => {
                const note = notesMap.get(`${eleve.id}-${matiere.id}`);
                if (note !== undefined) {
                    totalPoints += note * parseFloat(matiere.coefficient);
                    hasAtLeastOneNote = true;
                }
            });
            const moyenne = hasAtLeastOneNote ? (totalPoints / totalCoefficients) : null;
            return { ...eleve, moyenne };
        });

        const classes = resultatsCalcules.filter(r => r.moyenne !== null);
        const nonClasses = resultatsCalcules.filter(r => r.moyenne === null);

        classes.sort((a, b) => b.moyenne - a.moyenne);
        let rang = 0;
        let lastMoyenne = -1;
        let studentsAtCurrentRank = 1;
        const classesAvecRang = classes.map((eleve, index) => {
            if (eleve.moyenne !== lastMoyenne) {
                rang += studentsAtCurrentRank;
                studentsAtCurrentRank = 1;
            } else {
                studentsAtCurrentRank++;
            }
            lastMoyenne = eleve.moyenne;
            const isExAequo = (index > 0 && eleve.moyenne === classes[index - 1].moyenne) || (index < classes.length - 1 && eleve.moyenne === classes[index + 1].moyenne);
            return { ...eleve, rang_general: isExAequo ? `${rang} ex` : rang };
        });

        const classementFinal = [...classesAvecRang, ...nonClasses.map(e => ({...e, rang_general: 'Non classé'}))];

        const workbook = xlsx.utils.book_new();
        const generalSheetData = [
            ['RANG GÉNÉRAL', 'NOM ET PRÉNOM', 'N° INCORP.', 'ESCADRON', 'PELOTON', 'MOYENNE', 'MENTION'],
            ...classementFinal.map(e => [
                e.rang_general, `${e.nom} ${e.prenom}`, e.numero_incorporation,
                e.escadron || '-', e.peloton || '-',
                e.moyenne !== null ? e.moyenne.toFixed(2) : '-', getMentionForExcel(e.moyenne)
            ])
        ];
        const generalWorksheet = xlsx.utils.aoa_to_sheet(generalSheetData);
        generalWorksheet['!cols'] = [{wch: 15}, {wch: 30}, {wch: 15}, {wch: 10}, {wch: 10}, {wch: 10}, {wch: 15}];
        xlsx.utils.book_append_sheet(workbook, generalWorksheet, 'Classement Général');

        const groupedByEscadron = classementFinal
            .filter(e => e.moyenne !== null && e.escadron)
            .reduce((acc, eleve) => {
                // CORRECTION ICI: On remplace le slash '/' par un tiret '-'
                const key = eleve.peloton ? `${eleve.escadron}-${eleve.peloton}` : `${eleve.escadron}`;

                if (!acc[key]) acc[key] = [];
                acc[key].push(eleve);
                return acc;
            }, {});

        const sortedGroupNames = Object.keys(groupedByEscadron).sort((a, b) => {
             // CORRECTION ICI: On utilise le tiret '-' pour le tri également
            const partsA = a.split('-').map(Number);
            const partsB = b.split('-').map(Number);
            if (partsA[0] !== partsB[0]) return partsA[0] - partsB[0];
            return (partsA[1] || 0) - (partsB[1] || 0);
        });

        for (const groupName of sortedGroupNames) {
            const group = groupedByEscadron[groupName];
            const groupWithRank = assignRankInGroup(group);

            const groupSheetData = [
                ['RANG GROUPE', 'RANG GÉNÉRAL', 'NOM ET PRÉNOM', 'N° INCORP.', 'MOYENNE', 'MENTION'],
                ...groupWithRank.map(e => [
                    e.rang_groupe, e.rang_general, `${e.nom} ${e.prenom}`,
                    e.numero_incorporation, e.moyenne.toFixed(2), getMentionForExcel(e.moyenne)
                ])
            ];
            const groupWorksheet = xlsx.utils.aoa_to_sheet(groupSheetData);
            groupWorksheet['!cols'] = [{wch: 15}, {wch: 15}, {wch: 30}, {wch: 15}, {wch: 10}, {wch: 15}];
            xlsx.utils.book_append_sheet(workbook, groupWorksheet, groupName);
        }

        const buffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });
        res.setHeader('Content-Disposition', 'attachment; filename="Classement_General_Detaille.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);

    } catch (err) {
        console.error("Erreur sur /api/resultats/exporter-classement-excel :", err);
        res.status(500).json({ error: "Erreur lors de la génération du fichier Excel." });
    }
});


const HOST = '0.0.0.0';
app.listen(port, HOST, () => {
    console.log(`Serveur backend démarré sur le port ${port} et accessible sur le réseau.`);
});
