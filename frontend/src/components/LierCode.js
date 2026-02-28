import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { jwtDecode } from "jwt-decode";
import Counter from './Counter';
import {
FaCheckCircle,
FaExclamationTriangle,
FaPencilAlt,
FaTrash,
FaSave,
FaTimes,
FaQuestionCircle,
FaPrint,
FaDoorOpen,
FaLock,
FaInfoCircle
} from 'react-icons/fa';
import FizzyButton from './FizzyButton';
import './LierCode.css';
import './NoterCopie.css';
import Joyride, { STATUS } from 'react-joyride';
import Toast from './Toast';

const API_BASE_URL = process.env.REACT_APP_API_URL || '';
const ROOM_DATA = {
1: 40, 2: 40, 3: 40, 4: 40, 5: 46, 6: 30, 7: 40, 8: 40, 9: 40, 10: 40,
11: 40, 12: 40, 13: 40, 14: 40, 15: 40, 16: 40, 17: 40, 18: 40, 19: 40, 20: 40,
21: 40, 22: 40, 23: 40, 24: 40, 25: 26, 26: 40, 27: 36, 28: 40, 29: 40, 30: 40,
31: 42, 32: 42, 33: 36, 34: 30, 35: 39, 36: 36, 37: 36, 38: 18, 39: 42
};

function LierCode() {
const [statsTotal, setStatsTotal] = useState(0);
const [statsParMatiere, setStatsParMatiere] = useState(0);
const [statsUtilisateur, setStatsUtilisateur] = useState(0);
const [matieres, setMatieres] = useState([]);
const [examens, setExamens] = useState([]);
const [selectedExamen, setSelectedExamen] = useState('');
const [rechercheEleve, setRechercheEleve] = useState('');
const [elevesTrouves, setElevesTrouves] = useState([]);
const [selectedMatiere, setSelectedMatiere] = useState('');
const [selectedEleve, setSelectedEleve] = useState(null);
const [codePrefix, setCodePrefix] = useState('');
const [codeSuffix, setCodeSuffix] = useState('');
const [message, setMessage] = useState('');
const [isError, setIsError] = useState(false);
const [isLoading, setIsLoading] = useState(false);
const [isSearchFocused, setIsSearchFocused] = useState(false);
const [isModalOpen, setIsModalOpen] = useState(false);
const [mesLiages, setMesLiages] = useState([]);
const [isLoadingModal, setIsLoadingModal] = useState(false);
const [isMilestoneModalOpen, setIsMilestoneModalOpen] = useState(false);
const [milestoneCount, setMilestoneCount] = useState(0);
const [editingLiageId, setEditingLiageId] = useState(null);
const [rechercheEleveModal, setRechercheEleveModal] = useState('');
const [elevesTrouvesModal, setElevesTrouvesModal] = useState([]);
const [selectedEleveModal, setSelectedEleveModal] = useState(null);
const [isSearchFocusedModal, setIsSearchFocusedModal] = useState(false);
const [runTour, setRunTour] = useState(false);
const [toast, setToast] = useState({ show: false, message: '' });
const [isAnomalieModalOpen, setIsAnomalieModalOpen] = useState(false);
const [anomalies, setAnomalies] = useState([]);
const [isLoadingAnomalies, setIsLoadingAnomalies] = useState(false);
const [selectedAnomalieMatiere, setSelectedAnomalieMatiere] = useState('');
const [anomalieMotif, setAnomalieMotif] = useState('');
const [anomalieMessage, setAnomalieMessage] = useState({ text: '', isError: false });
const [filteredMatiereAnomalie, setFilteredMatiereAnomalie] = useState('all');
const [isPacketMode, setIsPacketMode] = useState(false);
const [packetTotal, setPacketTotal] = useState(0);
const [packetCurrentCount, setPacketCurrentCount] = useState(0);
const [selectedSalle, setSelectedSalle] = useState('');
const [assignment, setAssignment] = useState(null);

const rechercheEleveInputRef = useRef(null);
const codeInputRef = useRef(null);
const prevStatsUtilisateur = useRef(statsUtilisateur);

const tourSteps = [
    { target: '.compteurs-grid', content: "Bienvenue !", placement: 'bottom' },
    { target: '.assignment-info-card', content: "Votre session configurée.", placement: 'bottom' },
    { target: '#recherche_field', content: "Cherchez l'élève.", placement: 'bottom' },
    { target: '.code-input-wrapper', content: "Saisissez le code.", placement: 'bottom' },
];

const handleJoyrideCallback = (data) => {
    const { status } = data;
    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
        setRunTour(false);
        localStorage.setItem('hasSeenLierCodeTutorial', 'true');
    }
};

const getAuthHeaders = useCallback(() => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
}), []);

const fetchAllStats = useCallback(async (currentMatiereId, currentExamen) => {
    try {
        let urlStatsUser = `${API_BASE_URL}/api/stats/liaisons-utilisateur`;
        const params = [];
        if (currentMatiereId) params.push(`matiere_id=${currentMatiereId}`);
        if (currentExamen) params.push(`type_examen=${encodeURIComponent(currentExamen)}`);
        if (params.length > 0) urlStatsUser += `?${params.join('&')}`;

        const [resTotal, resUser] = await Promise.all([
            axios.get(`${API_BASE_URL}/api/stats/non-lies-total`, getAuthHeaders()),
            axios.get(urlStatsUser, getAuthHeaders())
        ]);
        setStatsTotal(resTotal.data.totalRestant);
        setStatsUtilisateur(resUser.data.liaisonsCreees);

        if (currentMatiereId) {
            let url = `${API_BASE_URL}/api/matieres/${currentMatiereId}/eleves-restants`;
            if (currentExamen) url += `?type_examen=${encodeURIComponent(currentExamen)}`;
            const resMatiere = await axios.get(url, getAuthHeaders());
            setStatsParMatiere(resMatiere.data.restants);
        } else {
            setStatsParMatiere(0);
        }
    } catch (error) { console.error(error); }
}, [getAuthHeaders]);

useEffect(() => {
    const fetchInitialData = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;
            const decoded = jwtDecode(token);

            const [resMatieres, resExamens] = await Promise.all([
                axios.get(`${API_BASE_URL}/api/matieres`, getAuthHeaders()),
                axios.get(`${API_BASE_URL}/api/examens`, getAuthHeaders())
            ]);

            setMatieres(resMatieres.data);
            setExamens(resExamens.data);

            if (decoded && decoded.assigned_matiere_id) {
                const assignedId = decoded.assigned_matiere_id;
                const assignedExam = decoded.assigned_type_examen;
                const assignedPromo = decoded.assigned_promotion;
                const matiereObj = resMatieres.data.find(m => m.id === assignedId);

                setAssignment({
                    matiereNom: matiereObj ? matiereObj.nom_matiere : 'Inconnue',
                    examen: assignedExam,
                    promotion: assignedPromo
                });

                setSelectedMatiere(assignedId);
                setSelectedExamen(assignedExam);
                if (matiereObj) setCodePrefix(matiereObj.code_prefixe.trim().toUpperCase());
                fetchAllStats(assignedId, assignedExam);
            } else {
                setAssignment(null);
                fetchAllStats(null, null);
            }
        } catch (error) { console.error(error); }
    };
    fetchInitialData();
}, [fetchAllStats, getAuthHeaders]);

useEffect(() => {
    const isMilestone = statsUtilisateur > 0 && statsUtilisateur % 100 === 0;
    const hasIncreased = statsUtilisateur > prevStatsUtilisateur.current;
    if (isMilestone && hasIncreased) {
        setMilestoneCount(statsUtilisateur);
        setIsMilestoneModalOpen(true);
    }
    prevStatsUtilisateur.current = statsUtilisateur;
}, [statsUtilisateur]);

const handleVerifyLast100 = () => {
    setIsMilestoneModalOpen(false);
    handleOpenMesLiagesModal();
};

const formatNomEleve = useCallback((eleve) => {
    if (!eleve) return '';
    return `${eleve.numero_incorporation || 'N/A'}-${eleve.nom ? eleve.nom.toUpperCase() : ''} ${eleve.prenom || ''} (${eleve.escadron || '?'}/${eleve.peloton || '?'})`;
}, []);

const handleSelectEleve = useCallback((eleve) => {
    setSelectedEleve(eleve);
    setRechercheEleve(formatNomEleve(eleve));
    setElevesTrouves([]);
    setIsSearchFocused(false);
    codeInputRef.current?.focus();
}, [formatNomEleve]);

useEffect(() => {
    const chercher = async () => {
        if (rechercheEleve.trim() === '' || (selectedEleve && formatNomEleve(selectedEleve) === rechercheEleve)) {
            setElevesTrouves([]); return;
        }
        try {
            let url = `${API_BASE_URL}/api/eleves/recherche?q=${rechercheEleve}`;
            if (assignment?.promotion && assignment.promotion !== 'Toutes' && assignment.promotion !== '') {
                url += `&promotion=${encodeURIComponent(assignment.promotion)}`;
            }
            const res = await axios.get(url, getAuthHeaders());
            res.data.length === 1 ? handleSelectEleve(res.data[0]) : setElevesTrouves(res.data);
        } catch (error) { console.error(error); }
    };
    const debounce = setTimeout(() => chercher(), 300);
    return () => clearTimeout(debounce);
}, [rechercheEleve, selectedEleve, formatNomEleve, handleSelectEleve, getAuthHeaders, assignment]);

const handleSelectEleveModal = useCallback((eleve) => {
    setSelectedEleveModal(eleve);
    setRechercheEleveModal(formatNomEleve(eleve));
    setElevesTrouvesModal([]);
    setIsSearchFocusedModal(false);
}, [formatNomEleve]);

useEffect(() => {
    const chercherModal = async () => {
        if (rechercheEleveModal.trim() === '' || (selectedEleveModal && formatNomEleve(selectedEleveModal) === rechercheEleveModal)) {
            setElevesTrouvesModal([]); return;
        }
        try {
            const res = await axios.get(`${API_BASE_URL}/api/eleves/recherche?q=${rechercheEleveModal}`, getAuthHeaders());
            res.data.length === 1 ? handleSelectEleveModal(res.data[0]) : setElevesTrouvesModal(res.data);
        } catch (error) { setElevesTrouvesModal([]); }
    };
    const debounce = setTimeout(() => chercherModal(), 300);
    return () => clearTimeout(debounce);
}, [rechercheEleveModal, selectedEleveModal, getAuthHeaders, formatNomEleve, handleSelectEleveModal]);

const resetForm = useCallback(() => {
    setCodeSuffix('');
    setRechercheEleve('');
    setElevesTrouves([]);
    setSelectedEleve(null);
    rechercheEleveInputRef.current?.focus();
}, []);

const handleStartPacket = () => {
    if (!selectedSalle) return;
    const total = ROOM_DATA[selectedSalle];
    if (total) {
        setPacketTotal(total);
        setPacketCurrentCount(0);
        setIsPacketMode(true);
    }
};

const handleResetPacket = () => {
    if (window.confirm("Annuler le comptage ?")) {
        setIsPacketMode(false); setPacketTotal(0); setPacketCurrentCount(0); setSelectedSalle('');
    }
};

const handleSubmit = async (e) => {
    e.preventDefault();
    const fullCode = `${codePrefix}${codeSuffix}`;
    if (!selectedEleve || !selectedMatiere || !selectedExamen || !codeSuffix.trim()) {
        setMessage('Veuillez remplir tous les champs.');
        setIsError(true);
        return;
    }
    setIsLoading(true); setMessage('');
    try {
        const response = await axios.put(`${API_BASE_URL}/api/lier-copie`, {
            eleve_id: selectedEleve.id,
            matiere_id: selectedMatiere,
            code_anonyme: fullCode,
            type_examen: selectedExamen
        }, getAuthHeaders());

        setMessage(response.data.message);
        setIsError(false);

        if (isPacketMode) {
            const newCount = packetCurrentCount + 1;
            setPacketCurrentCount(newCount);
            if (newCount >= packetTotal) {
                alert(`✅ Salle ${selectedSalle} terminée !`);
                setIsPacketMode(false); setPacketTotal(0); setPacketCurrentCount(0); setSelectedSalle('');
            }
        }
        resetForm();
        await fetchAllStats(selectedMatiere, selectedExamen);
    } catch (error) {
        setMessage(error.response?.data?.message || 'Erreur lors du liage.');
        setIsError(true);
    } finally { setIsLoading(false); }
};

const handleMatiereChange = (e) => {
    const matiereId = e.target.value;
    setSelectedMatiere(matiereId);
    fetchAllStats(matiereId, selectedExamen);
    const matiereChoisie = matieres.find(m => m.id.toString() === matiereId);
    setCodePrefix(matiereChoisie?.code_prefixe ? matiereChoisie.code_prefixe.trim().toUpperCase() : '');
    setCodeSuffix('');
    resetForm();
};

const handleExamenChange = (e) => {
    const examen = e.target.value;
    setSelectedExamen(examen);
    fetchAllStats(selectedMatiere, examen);
};

const handleOpenMesLiagesModal = async () => {
    setIsModalOpen(true); setIsLoadingModal(true); setEditingLiageId(null);
    try {
        const params = new URLSearchParams();
        if (selectedMatiere) params.append('matiere_id', selectedMatiere);
        if (selectedExamen) params.append('type_examen', selectedExamen);
        const res = await axios.get(`${API_BASE_URL}/api/copies/mes-liages?${params.toString()}`, getAuthHeaders());
        setMesLiages(res.data.sort((a, b) => b.id - a.id));
    } catch (error) { setMesLiages([]); } finally { setIsLoadingModal(false); }
};

const handleModifierLiage = (liage) => {
    setEditingLiageId(liage.id);
    setRechercheEleveModal(formatNomEleve({ id: liage.eleve_id, nom: liage.nom, prenom: liage.prenom, numero_incorporation: liage.numero_incorporation }));
    setSelectedEleveModal({ id: liage.eleve_id, nom: liage.nom, prenom: liage.prenom, numero_incorporation: liage.numero_incorporation });
};

const handleCancelModification = () => {
    setEditingLiageId(null); setRechercheEleveModal(''); setElevesTrouvesModal([]); setSelectedEleveModal(null);
};

const handleSauvegarderModification = async (liage) => {
    if (!selectedEleveModal) return;
    try {
        await axios.put(`${API_BASE_URL}/api/copies/relier/${liage.id}`, { nouvel_eleve_id: selectedEleveModal.id, matiere_id: liage.matiere_id }, getAuthHeaders());
        setEditingLiageId(null); await handleOpenMesLiagesModal(); await fetchAllStats(selectedMatiere, selectedExamen);
    } catch (error) { alert("Erreur modification"); }
};

const handleSupprimerLiage = async (liage) => {
    if (window.confirm(`Supprimer ${liage.code_anonyme} ?`)) {
        try {
            await axios.delete(`${API_BASE_URL}/api/copies/delier/${liage.id}`, getAuthHeaders());
            await handleOpenMesLiagesModal(); await fetchAllStats(selectedMatiere, selectedExamen);
        } catch (error) { alert("Erreur suppression"); }
    }
};

const handleOpenAnomalieModal = () => {
    setIsAnomalieModalOpen(true); setSelectedAnomalieMatiere(selectedMatiere); setAnomalieMotif('');
};

const handleSubmitAnomalie = async (e) => {
    e.preventDefault();
    try {
        await axios.post(`${API_BASE_URL}/api/anomalies`, { matiere_id: selectedAnomalieMatiere, motif: anomalieMotif }, getAuthHeaders());
        setIsAnomalieModalOpen(false);
    } catch (error) { console.error(error); }
};

return (
    <div className="lier-code-container">
        <Toast message={toast.message} show={toast.show} />
        <Joyride callback={handleJoyrideCallback} continuous run={runTour} steps={tourSteps} styles={{ options: { zIndex: 10000, primaryColor: '#2c5282' } }} />
        <button className="help-button" onClick={() => setRunTour(true)} title="Tutoriel"><FaQuestionCircle /></button>

        <div className="compteurs-grid">
            <div className="stat-box large"><span className="stat-label">Total restant</span><Counter value={statsTotal} places={[10000, 1000, 100, 10, 1]} fontSize={56} /></div>
            <div className="stat-box"><span className="stat-label">Restant {selectedExamen ? `(${selectedExamen.substring(0, 12)}...)` : '(Matière)'}</span><Counter value={statsParMatiere} places={[1000, 100, 10, 1]} fontSize={48} /></div>
            <div className="stat-box clickable vos-liages-box" onClick={handleOpenMesLiagesModal}><span className="stat-label">Vos liages</span><Counter value={statsUtilisateur} places={[1000, 100, 10, 1]} fontSize={48} /></div>
        </div>

        <div className="card packet-verifier-card">
            {!isPacketMode ? (
                <div className="packet-selector-container">
                    <h3><FaDoorOpen /> Sélection de la Salle</h3>
                    <div className="salle-selection-controls">
                        <select value={selectedSalle} onChange={(e) => setSelectedSalle(e.target.value)} className="salle-select" disabled={!selectedMatiere || !selectedExamen}>
                            <option value="">-- Choisir Salle --</option>
                            {Object.keys(ROOM_DATA).map(num => <option key={num} value={num}>Salle {num} ({ROOM_DATA[num]} copies)</option>)}
                        </select>
                        <button className="btn btn-secondary" onClick={handleStartPacket} disabled={!selectedSalle || !selectedMatiere || !selectedExamen}>Démarrer Salle {selectedSalle}</button>
                    </div>
                </div>
            ) : (
                <div className="packet-progress">
                    <h3>Salle {selectedSalle} en cours...</h3>
                    <div className="packet-counter"><span>{packetCurrentCount}</span> / {packetTotal}</div>
                    <button className="btn btn-danger-outline" onClick={handleResetPacket}>Changer/Annuler</button>
                </div>
            )}
        </div>

        <div className="card lier-code-form">
            <form onSubmit={handleSubmit}>
                <h2>Lier une copie anonyme</h2>

                {assignment ? (
                    <div className="assignment-info-card">
                        <div className="assignment-header">
                            <span className="assign-title"><FaLock /> Session de liaison sécurisée</span>
                            <span className="assign-badge">Configuré par l'Admin</span>
                        </div>
                        <div className="assignment-details-row">
                            <div className="assign-field"><strong>Matière :</strong> {assignment.matiereNom}</div>
                            <div className="assign-field"><strong>Examen :</strong> {assignment.examen}</div>
                            <div className="assign-field"><strong>Promotion :</strong> {assignment.promotion || 'Toutes'}</div>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="form-group">
                            <label htmlFor="matiere_field">Matière</label>
                            <select id="matiere_field" value={selectedMatiere} onChange={handleMatiereChange} required>
                                <option value="">-- Choisir une matière --</option>
                                {matieres.filter(m => m.code_prefixe).map(m => <option key={m.id} value={m.id}>{m.nom_matiere}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label htmlFor="examen_field">Type d'examen</label>
                            <select id="examen_field" value={selectedExamen} onChange={handleExamenChange} required>
                                <option value="">-- Choisir un examen --</option>
                                {examens.map(ex => (<option key={ex.id} value={ex.nom_modele}>{ex.nom_modele}</option>))}
                            </select>
                        </div>
                    </>
                )}

                <div className="form-group search-container">
                    <label htmlFor="recherche_field">Rechercher un élève (nom ou N° incorp.)</label>
                    <input
                        id="recherche_field"
                        ref={rechercheEleveInputRef}
                        type="text"
                        value={rechercheEleve}
                        onChange={e => { setRechercheEleve(e.target.value); setSelectedEleve(null); }}
                        onFocus={() => setIsSearchFocused(true)}
                        onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                        placeholder="Ex: 324 ou rakoto..."
                        autoComplete="off"
                    />
                    {isSearchFocused && elevesTrouves.length > 0 && (
                        <div className="search-results">
                            {elevesTrouves.map(eleve => (
                                <div key={eleve.id} className="search-result-item" onMouseDown={() => handleSelectEleve(eleve)}>
                                    {formatNomEleve(eleve)}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="form-group">
                    <label htmlFor="code_field">Code Anonyme</label>
                    <div className="code-input-wrapper">
                        <span className="code-prefix">{codePrefix}</span>
                        <input
                            id="code_field"
                            ref={codeInputRef}
                            type="text"
                            value={codeSuffix}
                            onChange={(e) => setCodeSuffix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                            placeholder={codePrefix ? "Saisir les chiffres" : "Choisissez une matière"}
                            required
                            disabled={!selectedMatiere}
                            autoComplete="off"
                        />
                    </div>
                </div>

                <button className="btn btn-primary btn-block lier-bouton" type="submit" disabled={isLoading || !selectedEleve || !selectedExamen}>
                    {isLoading ? "LIAGE EN COURS..." : "LIER LE CODE"}
                </button>
                {message && (<div className={`message ${isError ? 'error' : 'success'}`}><span>{message}</span></div>)}
            </form>
            <button className="btn-secondary" onClick={handleOpenAnomalieModal} style={{marginTop: '15px'}}><FaExclamationTriangle /> Signaler une anomalie</button>
        </div>

        {isModalOpen && (<div className="modal-overlay"><div className="modal-content large"><button className="modal-close" onClick={() => setIsModalOpen(false)}>&times;</button><h2>Mes Derniers Liages</h2>{isLoadingModal ? (<p>Chargement...</p>) : (<div className="modal-table-container"><table><thead><tr><th>Matière</th><th>Code</th><th>Élève</th><th>Actions</th></tr></thead><tbody>{mesLiages.length > 0 ? (mesLiages.map(liage => (<tr key={liage.id}><td>{liage.nom_matiere}</td><td>{liage.code_anonyme}</td><td>{editingLiageId === liage.id ? (<div className="search-container-modal"><input type="text" value={rechercheEleveModal} onChange={e => { setRechercheEleveModal(e.target.value); setSelectedEleveModal(null); }} onFocus={() => setIsSearchFocusedModal(true)} onBlur={() => setTimeout(() => setIsSearchFocusedModal(false), 200)} placeholder="Rechercher..." autoComplete="off" autoFocus />{isSearchFocusedModal && elevesTrouvesModal.length > 0 && (<div className="search-results">{elevesTrouvesModal.map(eleve => (<div key={eleve.id} className="search-result-item" onMouseDown={() => handleSelectEleveModal(eleve)}>{formatNomEleve(eleve)}</div>))}</div>)}</div>) : (`${liage.numero_incorporation} - ${liage.nom.toUpperCase()} ${liage.prenom}`)}</td><td className="actions-cell">{editingLiageId === liage.id ? (<><button className="btn-icon" onClick={() => handleSauvegarderModification(liage)}><FaSave color="green" /></button><button className="btn-icon" onClick={handleCancelModification}><FaTimes color="grey" /></button></>) : (<><button className="btn-icon" onClick={() => handleModifierLiage(liage)}><FaPencilAlt color="orange" /></button><button className="btn-icon" onClick={() => handleSupprimerLiage(liage)}><FaTrash color="red" /></button></>)}</td></tr>))) : (<tr><td colSpan="4">Aucun liage.</td></tr>)}</tbody></table></div>)}</div></div>)}

        {isAnomalieModalOpen && (<div className="modal-overlay"><div className="modal-content large"><button className="modal-close" onClick={() => setIsAnomalieModalOpen(false)}>&times;</button><h2>Signalement</h2><form onSubmit={handleSubmitAnomalie}><div className="form-group"><label>Matière</label><select value={selectedAnomalieMatiere} onChange={e => setSelectedAnomalieMatiere(e.target.value)} required><option value="">-- Choisir --</option>{matieres.map(m => <option key={m.id} value={m.id}>{m.nom_matiere}</option>)}</select></div><div className="form-group"><label>Description</label><textarea value={anomalieMotif} onChange={e => setAnomalieMotif(e.target.value)} required></textarea></div><button type="submit" className="btn btn-primary">Signaler</button></form></div></div>)}

        {isMilestoneModalOpen && (
            <div className="modal-overlay">
                <div className="modal-content milestone-modal-content">
                    <h2>Félicitations !</h2>
                    <div className="milestone-number">{milestoneCount}</div>
                    <p>liages atteints !</p>
                    <div className="fizzy-button-container"><FizzyButton triggerAnimation={isMilestoneModalOpen} /></div>
                    <div className="milestone-actions">
                        <button className="btn btn-secondary" onClick={() => setIsMilestoneModalOpen(false)}>Continuer</button>
                        <button className="btn btn-primary" onClick={handleVerifyLast100}>Vérifier</button>
                    </div>
                </div>
            </div>
        )}

        <style jsx>{`
            .assignment-info-card { background: #ebf8ff; border: 1px solid #90cdf4; border-radius: 12px; padding: 18px; margin-bottom: 25px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); text-align: left; }
            .assignment-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid #bee3f8; padding-bottom: 10px; }
            .assign-title { color: #2c5282; font-weight: 700; font-size: 1.1rem; display: flex; align-items: center; gap: 10px; }
            .assign-badge { background: #bee3f8; color: #2c5282; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
            .assignment-details-row { display: flex; flex-wrap: wrap; gap: 25px; margin-bottom: 15px; }
            .assign-field { font-size: 1rem; color: #2d3748; }
            .assign-field strong { color: #4a5568; margin-right: 5px; }
        `}</style>
    </div>
);
}
export default LierCode;
