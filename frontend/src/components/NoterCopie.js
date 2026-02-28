import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { jwtDecode } from "jwt-decode";
import Counter from './Counter';
import FizzyButton from './FizzyButton';
import {
    FaCheckCircle,
    FaExclamationTriangle,
    FaTimesCircle,
    FaSpinner,
    FaBell,
    FaPencilAlt,
    FaQuestionCircle,
    FaInfoCircle,
    FaLock
} from 'react-icons/fa';
import Joyride, { STATUS } from 'react-joyride';
import './NoterCopie.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || '';

function NoterCopie() {
    const [statsMatiere, setStatsMatiere] = useState({ totalInscrits: 0, notesManquantes: 0 });
    const [statsUtilisateur, setStatsUtilisateur] = useState(0);
    const [statsUtilisateurSpecifique, setStatsUtilisateurSpecifique] = useState(0);
    const [matieres, setMatieres] = useState([]);
    const [examTypes, setExamTypes] = useState([]);
    const [selectedMatiereId, setSelectedMatiereId] = useState('');
    const [selectedTypeExamen, setSelectedTypeExamen] = useState('');
    const [selectedMatierePrefix, setSelectedMatierePrefix] = useState('');
    const [codeSuffix, setCodeSuffix] = useState('');
    const [note, setNote] = useState('');
    const [codeValidation, setCodeValidation] = useState({ status: 'idle', message: '' });
    const [submitMessage, setSubmitMessage] = useState('');
    const [isSubmitError, setIsSubmitError] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [mesSaisies, setMesSaisies] = useState([]);
    const [isLoadingModal, setIsLoadingModal] = useState(false);
    const [notification, setNotification] = useState('');
    const [conflictData, setConflictData] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [reclamations, setReclamations] = useState([]);
    const [isReclamationModalOpen, setIsReclamationModalOpen] = useState(false);
    const [isLoadingReclamations, setIsLoadingReclamations] = useState(false);
    const [selectedReclamation, setSelectedReclamation] = useState(null);
    const [selectedReclamationDetails, setSelectedReclamationDetails] = useState(null);
    const [nouvelleNoteCorrection, setNouvelleNoteCorrection] = useState('');
    const [isMilestoneModalOpen, setIsMilestoneModalOpen] = useState(false);
    const [milestoneCount, setMilestoneCount] = useState(0);
    const [milestoneMessage, setMilestoneMessage] = useState({ title: '', body: '' });
    const [runTour, setRunTour] = useState(false);
    const [isPacketMode, setIsPacketMode] = useState(false);
    const [packetTotal, setPacketTotal] = useState(0);
    const [packetCurrentCount, setPacketCurrentCount] = useState(0);
    const [assignment, setAssignment] = useState(null);

    const noteInputRef = useRef(null);
    const codeInputRef = useRef(null);
    const prevStatsUtilisateur = useRef(statsUtilisateur);
    const submitButtonRef = useRef(null);

    const tourSteps = [
        { target: '.compteurs-grid', content: "Bienvenue ! Ces compteurs affichent les notes restantes pour la matière sélectionnée, celles déjà saisies, et le total de vos propres saisies.", placement: 'bottom' },
        { target: '.vos-saisies-box', content: "Cliquez ici pour voir la liste de vos 100 dernières saisies de notes, pratique pour une vérification rapide.", placement: 'top' },
        { target: '.noter-copie-form', content: "Ce formulaire est votre principal outil. Le processus est simple : choisir la matière, entrer le code, puis la note.", placement: 'top' },
        { target: '#matiere-select', content: "Commencez toujours par choisir la matière. Cela configure le préfixe du code et charge les bonnes statistiques.", placement: 'bottom' },
        { target: '#code-input', content: "Entrez les chiffres du code anonyme ici. Le code sera automatiquement vérifié dès que vous quitterez ce champ.", placement: 'bottom' },
        { target: '#note-input', content: "Une fois le code validé, ce champ devient actif. Saisissez la note de la copie.", placement: 'top' },
        { target: '.btn-submit-note', content: "Cliquez ici pour enregistrer la note. Une notification confirmera le succès, et le formulaire sera prêt pour la copie suivante.", placement: 'top' },
    ];

    const handleJoyrideCallback = (data) => {
        const { status } = data;
        if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
            setRunTour(false);
            localStorage.setItem('hasSeenNoterCopieTutorial', 'true');
        }
    };

    useEffect(() => {
        if (!localStorage.getItem('hasSeenNoterCopieTutorial')) {
            setRunTour(true);
        }
    }, []);

    const getAuthHeaders = useCallback(() => ({
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    }), []);

    const fetchStats = useCallback(async (matiereId) => {
        try {
            const resUser = await axios.get(`${API_BASE_URL}/api/stats/notes-utilisateur`, getAuthHeaders());
            setStatsUtilisateur(resUser.data.notesSaisies);
            if (matiereId) {
                const resMatiere = await axios.get(`${API_BASE_URL}/api/stats/notation/${matiereId}`, getAuthHeaders());
                setStatsMatiere({ totalInscrits: resMatiere.data.totalEleves, notesManquantes: resMatiere.data.notesManquantes });
            } else {
                setStatsMatiere({ totalInscrits: 0, notesManquantes: 0 });
            }
        } catch (error) { console.error("Erreur de chargement des statistiques", error); }
    }, [getAuthHeaders]);

    const fetchSpecificUserStats = useCallback(async () => {
        if (selectedMatiereId && selectedTypeExamen) {
            try {
                const res = await axios.get(`${API_BASE_URL}/api/stats/notes-utilisateur-specifique`, {
                    ...getAuthHeaders(),
                    params: {
                        matiereId: selectedMatiereId,
                        typeExamen: selectedTypeExamen
                    }
                });
                setStatsUtilisateurSpecifique(res.data.notesSaisies);
            } catch (error) {
                console.error("Erreur chargement stats spécifiques utilisateur", error);
                setStatsUtilisateurSpecifique(0);
            }
        } else {
            setStatsUtilisateurSpecifique(0);
        }
    }, [selectedMatiereId, selectedTypeExamen, getAuthHeaders]);

    useEffect(() => {
        fetchSpecificUserStats();
    }, [fetchSpecificUserStats]);

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const token = localStorage.getItem('token');
                let decodedToken = null;
                if (token) {
                    decodedToken = jwtDecode(token);
                    if (decodedToken.role === 'admin') setIsAdmin(true);
                }

                const [resMatieres, resExams] = await Promise.all([
                    axios.get(`${API_BASE_URL}/api/matieres`, getAuthHeaders()),
                    axios.get(`${API_BASE_URL}/api/examens`, getAuthHeaders())
                ]);

                setMatieres(resMatieres.data);
                setExamTypes(resExams.data);

                if (decodedToken && decodedToken.assigned_matiere_id) {
                    const assignedId = decodedToken.assigned_matiere_id;
                    const assignedExam = decodedToken.assigned_type_examen;
                    const assignedPromo = decodedToken.assigned_promotion;

                    const matiereObj = resMatieres.data.find(m => m.id === assignedId);

                    setAssignment({
                        matiereNom: matiereObj ? matiereObj.nom_matiere : 'Inconnue',
                        examen: assignedExam,
                        promotion: assignedPromo
                    });

                    setSelectedMatiereId(assignedId);
                    setSelectedTypeExamen(assignedExam);
                    if (matiereObj) setSelectedMatierePrefix(matiereObj.code_prefixe.trim().toUpperCase());
                    fetchStats(assignedId);
                } else {
                    if (resExams.data.length > 0) {
                        setSelectedTypeExamen(resExams.data[0].nom_modele);
                    }
                    fetchStats(null);
                }
            } catch (error) { console.error("Erreur de chargement des données initiales", error); }
        };
        fetchInitialData();
    }, [getAuthHeaders, fetchStats]);

    const fetchReclamations = useCallback(async () => {
        if (!isAdmin) return;
        setIsLoadingReclamations(true);
        try {
            const res = await axios.get(`${API_BASE_URL}/api/reclamations`, getAuthHeaders());
            setReclamations(res.data);
        } catch (error) { console.error("Erreur de chargement des réclamations", error); }
        finally { setIsLoadingReclamations(false); }
    }, [isAdmin, getAuthHeaders]);

    useEffect(() => { fetchReclamations(); }, [fetchReclamations]);

    useEffect(() => {
        const isMilestone = statsUtilisateur > 0 && statsUtilisateur % 100 === 0;
        const hasIncreased = statsUtilisateur > prevStatsUtilisateur.current;
        if (isMilestone && hasIncreased) {
            const totalNotes = statsMatiere.totalInscrits;
            let message = { title: '', body: '' };
            if (totalNotes > 0) {
                const progress = ((totalNotes - statsMatiere.notesManquantes) / totalNotes) * 100;
                if (progress <= 40) {
                    message = { title: 'Excellent départ !', body: 'Vous avez atteint un palier important. La route est encore longue, mais chaque saisie vous rapproche du but. Continuez sur cette lancée !' };
                } else if (progress <= 80) {
                    message = { title: 'Superbe progression !', body: 'Vous avez déjà fait une grande partie du travail. Votre persévérance paie, ne lâchez rien !' };
                } else {
                    message = { title: 'La ligne d\'arrivée est proche !', body: 'Le plus dur est clairement derrière vous. Un dernier effort et ce sera terminé. Bravo pour ce travail remarquable !' };
                }
            } else {
                message = { title: 'Félicitations !', body: 'Vous venez de franchir un nouveau cap ! Continuez comme ça !' };
            }
            setMilestoneMessage(message);
            setMilestoneCount(statsUtilisateur);
            setIsMilestoneModalOpen(true);
        }
        prevStatsUtilisateur.current = statsUtilisateur;
    }, [statsUtilisateur, statsMatiere.totalInscrits, statsMatiere.notesManquantes]);

    useEffect(() => {
        if (codeValidation.status === 'valid') {
            noteInputRef.current?.focus();
        }
    }, [codeValidation.status]);

    const resetFields = useCallback((resetMatiere = false) => {
        if (resetMatiere && !assignment) { setSelectedMatiereId(''); setSelectedMatierePrefix(''); }
        setCodeSuffix(''); setNote(''); setCodeValidation({ status: 'idle', message: '' });
        setSubmitMessage(''); setIsSubmitError(false); setConflictData(null);
        codeInputRef.current?.focus();
    }, [assignment]);

    const handleMatiereChange = (e) => {
        const matiereId = e.target.value;
        const selectedMatiere = matieres.find(m => m.id.toString() === matiereId);
        setSelectedMatiereId(matiereId);
        setSelectedMatierePrefix(selectedMatiere ? selectedMatiere.code_prefixe.trim().toUpperCase() : '');
        resetFields(false);
        fetchStats(matiereId);
    };

    const handleCodeSuffixChange = (e) => {
        const suffix = e.target.value.toUpperCase().replace(/[^0-9]/g, '');
        setCodeSuffix(suffix);
        if (codeValidation.status !== 'idle') setCodeValidation({ status: 'idle', message: '' });
    };

    const verifyCode = useCallback(async () => {
        if (!codeSuffix.trim() || !selectedMatierePrefix) return;
        if (codeValidation.status === 'checking' || codeValidation.status === 'valid') return;
        const fullCode = `${selectedMatierePrefix}${codeSuffix}`;
        setCodeValidation({ status: 'checking', message: 'Vérification...' });
        try {
            await axios.get(`${API_BASE_URL}/api/codes/verifier/${fullCode}`, getAuthHeaders());
            setCodeValidation({ status: 'valid', message: '' });
        } catch (error) {
            const errorMessage = error.response?.data?.message || "Erreur inconnue.";
            setCodeValidation({ status: 'invalid', message: `Erreur : ${errorMessage}` });
        }
    }, [codeSuffix, selectedMatierePrefix, getAuthHeaders, codeValidation.status]);

    const handleCodeKeyDown = (e) => { if (e.key === 'Enter') { e.preventDefault(); verifyCode(); } };

    const handleNoteKeyDown = (e) => {
        if (e.key === 'Enter' && !isNoteInputDisabled && note !== '') {
            e.preventDefault();
            submitButtonRef.current?.click();
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (codeValidation.status !== 'valid' || note === '') return;
        setSubmitMessage(''); setIsSubmitError(false); setConflictData(null);
        try {
            const fullCode = `${selectedMatierePrefix}${codeSuffix}`;
            await axios.post(`${API_BASE_URL}/api/noter-copie-anonyme`, {
                matiere_id: selectedMatiereId,
                code_anonyme: fullCode,
                note: note,
                type_examen: selectedTypeExamen
            }, getAuthHeaders());

            if (isPacketMode) {
                const newCount = packetCurrentCount + 1;
                setPacketCurrentCount(newCount);
                if (newCount >= packetTotal) {
                    alert(`🎉 Paquet terminé ! Les ${packetTotal} copies ont été enregistrées.`);
                    setIsPacketMode(false);
                    setPacketTotal(0);
                    setPacketCurrentCount(0);
                }
            }

            setNotification(`Note pour ${fullCode} enregistrée !`);
            setTimeout(() => setNotification(''), 4000);
            resetFields(false);
            await fetchStats(selectedMatiereId);
            await fetchSpecificUserStats();
        } catch (error) {
            if (error.response && error.response.status === 409) {
                const fullCode = `${selectedMatierePrefix}${codeSuffix}`;
                setConflictData({ code: fullCode, note: note, message: error.response.data.message || "Ce code a déjà une note." });
            } else {
                setSubmitMessage(error.response?.data?.message || 'Erreur lors de la soumission.');
                setIsSubmitError(true);
            }
        }
    };

    const handleSendReclamation = async () => {
        if (!conflictData) return;
        try {
            await axios.post(`${API_BASE_URL}/api/reclamations`, {
                matiere_id: selectedMatiereId,
                code_anonyme: conflictData.code,
                note_proposee: conflictData.note
            }, getAuthHeaders());
            setNotification(`Signalement pour ${conflictData.code} envoyé à l'admin.`);
            setTimeout(() => setNotification(''), 5000);
            resetFields(false);
            fetchReclamations();
        } catch (error) {
            setSubmitMessage(error.response?.data?.message || 'Erreur lors du signalement.');
            setIsSubmitError(true);
            setConflictData(null);
        }
    };

    const handleOpenMesSaisiesModal = async () => {
        setIsModalOpen(true);
        setIsLoadingModal(true);
        try {
            const res = await axios.get(`${API_BASE_URL}/api/copies/mes-saisies-notes`, getAuthHeaders());
            setMesSaisies(res.data);
        } catch (error) { console.error("Erreur chargement de mes saisies", error); }
        finally { setIsLoadingModal(false); }
    };

    const handleOpenReclamationModal = () => {
        setSelectedReclamation(null);
        setSelectedReclamationDetails(null);
        setIsReclamationModalOpen(true);
    };

    const handleFetchDetails = async (reclamation) => {
        setSelectedReclamation(reclamation);
        const matiere = matieres.find(m => m.nom_matiere === reclamation.nom_matiere);
        if (!matiere) return;
        setSelectedReclamationDetails({ isLoading: true });
        try {
            const res = await axios.get(`${API_BASE_URL}/api/reclamations/details/${reclamation.code_anonyme}/${matiere.id}`, getAuthHeaders());
            setSelectedReclamationDetails({ ...res.data, isLoading: false });
            setNouvelleNoteCorrection(reclamation.note_proposee);
        } catch (error) {
            setSelectedReclamationDetails({ error: "Détails non trouvés.", isLoading: false });
        }
    };

    const handleCorrectionSubmit = async (e) => {
        e.preventDefault();
        if (!selectedReclamation || nouvelleNoteCorrection === '') return;
        const matiere = matieres.find(m => m.nom_matiere === selectedReclamation.nom_matiere);
        if (!matiere) return;
        try {
            await axios.put(`${API_BASE_URL}/api/reclamations/corriger`, {
                reclamationId: selectedReclamation.id,
                code_anonyme: selectedReclamation.code_anonyme,
                matiereId: matiere.id,
                nouvelle_note: nouvelleNoteCorrection
            }, getAuthHeaders());
            setNotification('Note corrigée avec succès !');
            setTimeout(() => setNotification(''), 4000);
            setSelectedReclamation(null);
            setSelectedReclamationDetails(null);
            fetchReclamations();
        } catch (error) {
            alert(error.response?.data?.message || "Erreur lors de la correction.");
        }
    };

    const handleResolveReclamation = async (reclamationId) => {
        try {
            await axios.put(`${API_BASE_URL}/api/reclamations/${reclamationId}/resoudre`, {}, getAuthHeaders());
            fetchReclamations();
            if (selectedReclamation && selectedReclamation.id === reclamationId) {
                setSelectedReclamation(null);
                setSelectedReclamationDetails(null);
            }
        } catch (error) { console.error("Erreur résolution réclamation", error); }
    };

    const handleVerifyLast100 = () => {
        setIsMilestoneModalOpen(false);
        handleOpenMesSaisiesModal();
    };

    const handleStartPacket = () => {
        const total = window.prompt("Combien de copies y a-t-il dans ce paquet ?", "50");
        if (total && !isNaN(total) && parseInt(total, 10) > 0) {
            setPacketTotal(parseInt(total, 10));
            setPacketCurrentCount(0);
            setIsPacketMode(true);
        }
    };

    const handleResetPacket = () => {
        if (window.confirm("Voulez-vous vraiment réinitialiser le comptage de ce paquet ?")) {
            setIsPacketMode(false);
            setPacketTotal(0);
            setPacketCurrentCount(0);
        }
    };

    const isNoteInputDisabled = codeValidation.status !== 'valid';

    const ValidationIcon = () => {
        switch (codeValidation.status) {
            case 'checking': return <FaSpinner className="spinner" />;
            case 'valid': return <FaCheckCircle className="validation-icon valid" />;
            case 'invalid': return <FaTimesCircle className="validation-icon invalid" />;
            default: return null;
        }
    };

    return (
        <div className="noter-copie-container">
            <Joyride callback={handleJoyrideCallback} continuous run={runTour} scrollToFirstStep showProgress showSkipButton steps={tourSteps} styles={{ options: { zIndex: 10000, primaryColor: '#2c5282' } }} />
            <button className="help-button" onClick={() => setRunTour(true)} title="Afficher le tutoriel"><FaQuestionCircle /></button>
            <div className="compteurs-grid">
                <div className="stat-box large"><span className="stat-label">Notes Restantes</span><Counter value={statsMatiere.notesManquantes} places={[1000, 100, 10, 1]} fontSize={56} /></div>
                <div className="stat-box"><span className="stat-label">Notes Déjà Saisies</span><Counter value={statsMatiere.totalInscrits - statsMatiere.notesManquantes} places={[1000, 100, 10, 1]} fontSize={48} /></div>
                <div className="stat-box clickable vos-saisies-box" onClick={handleOpenMesSaisiesModal}>
                    <span className="stat-label">Vos Saisies (cet examen)</span>
                    <Counter value={statsUtilisateurSpecifique} places={[1000, 100, 10, 1]} fontSize={48} />
                </div>
                {isAdmin && (<div className="notification-bell" onClick={handleOpenReclamationModal}><FaBell size={32} />{reclamations.length > 0 && (<span className="notification-badge">{reclamations.length}</span>)}</div>)}
            </div>

            <div className="card packet-verifier-card">
                {!isPacketMode ? (
                    <>
                        <h3>Vérifier un nouveau paquet ?</h3>
                        <p>Cette fonction vous aide à vous assurer que vous avez saisi toutes les copies d'un lot physique.</p>
                        <button
                            className="btn btn-secondary"
                            onClick={handleStartPacket}
                            disabled={!selectedMatiereId || !selectedTypeExamen}
                        >
                            Démarrer le comptage d'un paquet
                        </button>
                        {(!selectedMatiereId || !selectedTypeExamen) && <small>Veuillez d'abord sélectionner une matière et un examen.</small>}
                    </>
                ) : (
                    <div className="packet-progress">
                        <h3>Paquet en cours...</h3>
                        <div className="packet-counter">
                            <span>{packetCurrentCount}</span> / {packetTotal}
                        </div>
                        <p>Copies saisies pour ce paquet.</p>
                        <button className="btn btn-danger-outline" onClick={handleResetPacket}>
                            Annuler et Réinitialiser le paquet
                        </button>
                    </div>
                )}
            </div>

            <div className="card noter-copie-form">
                <form onSubmit={handleSubmit}>
                    <h2>Étape 1 : Saisir Note et Code</h2>

                    {assignment ? (
                        <div className="assignment-info-card">
                            <div className="assignment-header">
                                <span className="assign-title"><FaLock /> Session de saisie sécurisée</span>
                                <span className="assign-badge">Configuré par l'Admin</span>
                            </div>
                            <div className="assignment-details-row">
                                <div className="assign-field"><strong>Matière :</strong> {assignment.matiereNom}</div>
                                <div className="assign-field"><strong>Examen :</strong> {assignment.examen}</div>
                                <div className="assign-field"><strong>Promotion :</strong> {assignment.promotion || 'N/A'}</div>
                            </div>
                            <div className="assignment-instruction">
                                <FaInfoCircle /> Veuillez saisir uniquement le <strong>Code</strong> et la <strong>Note</strong>.
                                Si ces informations ne correspondent pas à votre copie, signalez-le à l'administrateur.
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="form-group">
                                <label>Matière</label>
                                <select id="matiere-select" onChange={handleMatiereChange} value={selectedMatiereId} required>
                                    <option value="">-- Sélectionnez une matière --</option>
                                    {matieres.filter(m => m.code_prefixe).map(m => (<option key={m.id} value={m.id}>{m.nom_matiere}</option>))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Type d'Examen</label>
                                <select value={selectedTypeExamen} onChange={e => setSelectedTypeExamen(e.target.value)} required>
                                    <option value="">-- Sélectionnez un examen --</option>
                                    {examTypes.map(exam => (
                                        <option key={exam.id} value={exam.nom_modele}>{exam.nom_modele}</option>
                                    ))}
                                </select>
                            </div>
                        </>
                    )}

                    <div className="form-group">
                        <label>Code Anonyme</label>
                        <div className="code-input-wrapper">
                            <span className="code-prefix">{selectedMatierePrefix}</span>
                            <input id="code-input" ref={codeInputRef} type="text" placeholder={selectedMatierePrefix ? "Saisir les chiffres" : "Choisissez une matière"} value={codeSuffix} onChange={handleCodeSuffixChange} onBlur={verifyCode} onKeyDown={handleCodeKeyDown} disabled={!selectedMatiereId} autoComplete="off" required />
                            <ValidationIcon />
                        </div>
                        {codeValidation.message && (<p className={`validation-message ${codeValidation.status}`}>{codeValidation.message}</p>)}
                    </div>

                    <div className="form-group">
                        <label>Note / 20</label>
                        <input id="note-input" ref={noteInputRef} type="number" step="0.25" min="0" max="20" placeholder={isNoteInputDisabled ? "Validez le code d'abord" : "Saisir la note"} value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={handleNoteKeyDown} disabled={isNoteInputDisabled} required />
                    </div>

                    <button ref={submitButtonRef} className="btn btn-primary btn-block btn-submit-note" type="submit" disabled={isNoteInputDisabled || note === '' || !!conflictData}>Enregistrer la note</button>

                    {conflictData && (<div className="message warning"><FaExclamationTriangle /><div><span><strong>Attention :</strong> {conflictData.message}</span><p>Le code <strong>{conflictData.code}</strong> a déjà une note. Est-ce une erreur de saisie de votre part ?</p><div className="conflict-actions"><button type="button" className="btn btn-secondary" onClick={() => resetFields(false)}>Oui, c'est mon erreur</button><button type="button" className="btn btn-danger" onClick={handleSendReclamation}>Non, le code est correct (Signaler)</button></div></div></div>)}
                    {submitMessage && isSubmitError && (<div className="message error"><FaExclamationTriangle /><span>{submitMessage}</span></div>)}
                    <div className="form-notification-container">{notification && !isSubmitError && (<label className={`checkbox-wrapper show`}><input type="checkbox" checked readOnly /><div className="checkmark"><svg stroke="currentColor" fill="none" viewBox="0 0 24 24"><path strokeLinejoin="round" strokeLinecap="round" strokeWidth="3" d="M20 6L9 17L4 12"></path></svg></div><span className="label">{notification}</span></label>)}</div>
                </form>
            </div>
            {isModalOpen && (<div className="modal-overlay"><div className="modal-content"><button className="modal-close" onClick={() => setIsModalOpen(false)}>&times;</button><h2>Mes Dernières Saisies de Notes</h2>{isLoadingModal ? (<p>Chargement...</p>) : (<div className="modal-table-container"><table><thead><tr><th>Matière</th><th>Code Anonyme</th><th>Note</th></tr></thead><tbody>{mesSaisies.length > 0 ? (mesSaisies.map(saisie => (<tr key={saisie.id}><td>{saisie.nom_matiere}</td><td>{saisie.code_anonyme}</td><td>{saisie.note}</td></tr>))) : (<tr><td colSpan="3">Vous n'avez encore effectué aucune saisie.</td></tr>)}</tbody></table></div>)}</div></div>)}
            {isReclamationModalOpen && (<div className="modal-overlay"><div className="modal-content large"><button className="modal-close" onClick={() => setIsReclamationModalOpen(false)}>&times;</button><h2>Gestion des Réclamations</h2>{isLoadingReclamations ? (<p>Chargement...</p>) : (<div className="reclamation-modal-body"><div className="reclamation-list"><h3>Incidents en attente ({reclamations.length})</h3>{reclamations.length > 0 ? (<table><thead><tr><th>Code</th><th>Matière</th><th>Note proposée</th><th>Signalé par</th><th>Actions</th></tr></thead><tbody>{reclamations.map(rec => (<tr key={rec.id} className={selectedReclamation?.id === rec.id ? 'selected-row' : ''}><td>{rec.code_anonyme}</td><td>{rec.nom_matiere}</td><td>{rec.note_proposee}</td><td>{rec.signale_par}</td><td><button className="btn btn-sm" onClick={() => handleFetchDetails(rec)}>Voir Détails</button><button className="btn btn-sm btn-success" onClick={() => handleResolveReclamation(rec.id)}>Classer</button></td></tr>))}</tbody></table>) : (<p>Aucune réclamation en attente.</p>)}</div><div className="reclamation-details"><h3>Détails de la saisie</h3>{selectedReclamationDetails ? (selectedReclamationDetails.isLoading ? <FaSpinner className="spinner" /> : selectedReclamationDetails.error ? <p className="error-text">{selectedReclamationDetails.error}</p> : <div><p><strong>Auteur Original :</strong> {selectedReclamationDetails.prenom} {selectedReclamationDetails.nom}</p><p><strong>Note Originale :</strong> <span className="note-highlight">{selectedReclamationDetails.note_originale} / 20</span></p><p><strong>Date de Saisie :</strong> {new Date(selectedReclamationDetails.date_saisie_originale).toLocaleString('fr-FR')}</p><hr /><form onSubmit={handleCorrectionSubmit} className="correction-form"><h4><FaPencilAlt /> Corriger la note</h4><p>La note proposée par le signaleur est : <strong>{selectedReclamation?.note_proposee}</strong></p><div className="form-group"><label htmlFor="correction-note">Nouvelle note correcte :</label><input id="correction-note" type="number" step="0.25" min="0" max="20" value={nouvelleNoteCorrection} onChange={(e) => setNouvelleNoteCorrection(e.target.value)} required /></div><button type="submit" className="btn btn-primary">Valider la correction</button></form></div>) : (<p>Cliquez sur "Voir Détails" pour afficher les informations et corriger une note.</p>)}</div></div>)}</div></div>)}
            {isMilestoneModalOpen && (<div className="modal-overlay"><div className="modal-content milestone-modal-content"><button className="modal-close" onClick={() => setIsMilestoneModalOpen(false)}>&times;</button><h2>{milestoneMessage.title}</h2><p className="milestone-main-message">{milestoneMessage.body}</p><div className="milestone-number">{milestoneCount}</div><p>saisies effectuées au total par vous !</p><div className="fizzy-button-container"><FizzyButton triggerAnimation={isMilestoneModalOpen} /></div><p className="milestone-encouragement">Il ne reste plus que <strong>{statsMatiere.notesManquantes}</strong> copies pour cette matière. Courage !</p><div className="milestone-actions"><button className="btn btn-secondary" onClick={() => setIsMilestoneModalOpen(false)}>Continuer la saisie</button><button className="btn btn-primary" onClick={handleVerifyLast100}>Vérifier mes dernières saisies</button></div></div></div>)}
            <style jsx>{`
                .assignment-info-card { background: #ebf8ff; border: 1px solid #90cdf4; border-radius: 12px; padding: 18px; margin-bottom: 25px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
                .assignment-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid #bee3f8; padding-bottom: 10px; }
                .assign-title { color: #2c5282; font-weight: 700; font-size: 1.1rem; display: flex; align-items: center; gap: 10px; }
                .assign-badge { background: #bee3f8; color: #2c5282; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
                .assignment-details-row { display: flex; flex-wrap: wrap; gap: 25px; margin-bottom: 15px; }
                .assign-field { font-size: 1rem; color: #2d3748; }
                .assign-field strong { color: #4a5568; margin-right: 5px; }
                .assignment-instruction { background: #fff; border-left: 4px solid #3182ce; padding: 10px 15px; border-radius: 4px; font-size: 0.9rem; color: #4a5568; display: flex; align-items: center; gap: 10px; line-height: 1.4; }
                .assignment-instruction strong { color: #2b6cb0; }
            `}</style>
        </div>
    );
}

export default NoterCopie;
