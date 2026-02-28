import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import { 
    FaPlay, FaSave, FaUserPlus, FaUsers, FaArrowLeft, FaHistory, 
    FaEdit, FaTrash, FaCheckCircle, FaUserSlash, FaClipboardList, 
    FaInfoCircle, FaLock 
} from 'react-icons/fa';
import apiPaths from '../config/apiPaths';

const ModificationModal = ({ entry, onClose, onSave }) => {
    const [nouvelleNote, setNouvelleNote] = useState(entry.note || '');
    const [raison, setRaison] = useState('');
    const generateMotif = () => `Modification de la note de ${entry.prenom} ${entry.nom} (N° Inc ${entry.numero_incorporation}). Ancienne note : ${entry.note}. Nouvelle note : ${nouvelleNote}. Raison : ${raison}`;
    const handleSave = () => {
        const noteNum = parseFloat(nouvelleNote);
        if (isNaN(noteNum) || noteNum < 0 || noteNum > 20) {
            alert("Veuillez entrer une note valide entre 0 et 20.");
            return;
        }
        if (!raison.trim()) {
            alert("Veuillez fournir une raison pour la modification.");
            return;
        }
        onSave(entry.copie_id, nouvelleNote, generateMotif());
    };
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header"><h3>Modifier la note de {entry.prenom} {entry.nom}</h3><button className="close-button" onClick={onClose}>&times;</button></div>
                <div className="modal-body"><div className="form-group"><label>Matière</label><input type="text" value={entry.nom_matiere} disabled /></div><div className="form-group"><label>Ancienne Note</label><input type="text" value={entry.note} disabled /></div><div className="form-group"><label>Nouvelle Note</label><input type="number" min="0" max="20" step="0.01" value={nouvelleNote} onChange={(e) => setNouvelleNote(e.target.value)} placeholder="Note entre 0 et 20" autoFocus /></div><div className="form-group"><label>Raison de la modification</label><textarea rows="3" placeholder="Expliquez pourquoi la note est modifiée..." value={raison} onChange={(e) => setRaison(e.target.value)}></textarea></div></div>
                <div className="modal-actions"><button className="btn btn-primary" onClick={handleSave}>Enregistrer la Modification</button><button className="btn btn-secondary" onClick={onClose}>Annuler</button></div>
            </div>
        </div>
    );
};

const HistoriqueSaisiesModal = ({ isOpen, onClose, saisies, onEdit, isLoading }) => {
    if (!isOpen) return null;
    return (
        <div className="modal-overlay" onClick={onClose}><div className="modal-content large" onClick={e => e.stopPropagation()}><div className="modal-header"><h3>Mes 150 dernières saisies directes</h3><button className="close-button" onClick={onClose}>&times;</button></div><div className="modal-body">{isLoading ? <p>Chargement de l'historique...</p> : (<div className="table-responsive"><table className="results-table"><thead><tr><th>Date</th><th>Élève</th><th>Matière</th><th>Note</th><th>Action</th></tr></thead><tbody>{saisies.length > 0 ? saisies.map(saisie => (<tr key={saisie.copie_id}><td>{new Date(saisie.date_saisie).toLocaleString('fr-FR')}</td><td>{saisie.prenom} {saisie.nom} ({saisie.numero_incorporation})</td><td>{saisie.nom_matiere}</td><td>{saisie.note}</td><td><button className="btn-icon btn-edit" onClick={() => onEdit(saisie)} title="Modifier cette note"><FaEdit /></button></td></tr>)) : (<tr><td colSpan="5">Aucune saisie récente trouvée.</td></tr>)}</tbody></table></div>)}</div><div className="modal-actions"><button className="btn btn-secondary" onClick={onClose}>Fermer</button></div></div></div>
    );
};

const AbsenceModal = ({ eleve, onConfirm, onCancel }) => {
    const [motif, setMotif] = useState('');
    const inputRef = useRef(null);
    useEffect(() => { inputRef.current?.focus(); }, []);
    const handleConfirm = () => { onConfirm(motif); };
    const handleKeyDown = (e) => { if (e.key === 'Enter') { e.preventDefault(); handleConfirm(); } };
    return (<div className="modal-overlay"><div className="modal-content" style={{ maxWidth: '500px' }}><div className="modal-header"><h3>Absence de {eleve.prenom} {eleve.nom}</h3><button className="close-button" onClick={onCancel}>&times;</button></div><div className="modal-body"><div className="form-group"><label htmlFor="motif_absence">Motif (optionnel)</label><input ref={inputRef} type="text" id="motif_absence" value={motif} onChange={(e) => setMotif(e.target.value)} onKeyDown={handleKeyDown} placeholder="Ex: Raison médicale..." /></div></div><div className="modal-actions"><button className="btn btn-primary" onClick={handleConfirm}>Confirmer l'Absence</button><button className="btn btn-secondary" onClick={onCancel}>Annuler</button></div></div></div>);
};

const ValidationModal = ({ isOpen, onClose, saisies, onValider, onVider, onSupprimer, onModifier, isSaving }) => {
    const [editingId, setEditingId] = useState(null);
    const [editingValue, setEditingValue] = useState('');
    const editInputRef = useRef(null);
    useEffect(() => { if (editingId && editInputRef.current) { editInputRef.current.focus(); } }, [editingId]);
    if (!isOpen) return null;
    const handleStartEditing = (saisie) => { if (saisie.type === 'note') { setEditingId(saisie.temp_id); setEditingValue(saisie.note); } };
    const handleSaveEdit = () => { if (editingId) { const noteNum = parseFloat(editingValue); if (!isNaN(noteNum) && noteNum >= 0 && noteNum <= 20) { onModifier(editingId, editingValue); } setEditingId(null); } };
    const handleKeyDown = (e) => { if (e.key === 'Enter') { handleSaveEdit(); } else if (e.key === 'Escape') { setEditingId(null); } };
    return (
         <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content large" onClick={e => e.stopPropagation()}>
                <div className="modal-header"><h3>Saisies en attente de validation ({saisies.length})</h3><button className="close-button" onClick={onClose}>&times;</button></div>
                <div className="modal-body">
                    <div className="table-responsive">
                        <table className="results-table">
                            <thead><tr><th>Élève</th><th>Note / Motif</th><th>Action</th></tr></thead>
                            <tbody>
                                {saisies.map((saisie) => (
                                    <tr key={saisie.temp_id} className={saisie.type === 'absence' ? 'absence-row' : ''}>
                                        <td>{saisie.eleve_nom}</td>
                                        <td onClick={() => handleStartEditing(saisie)} title={saisie.type === 'note' ? 'Cliquer pour modifier' : ''}>
                                            {editingId === saisie.temp_id ? (
                                                <input ref={editInputRef} type="number" value={editingValue} onChange={(e) => setEditingValue(e.target.value)} onBlur={handleSaveEdit} onKeyDown={handleKeyDown} min="0" max="20" step="0.01" style={{ width: '80px', textAlign: 'center' }} />
                                            ) : (
                                                saisie.type === 'note' ? <strong>{saisie.note} / 20 <FaEdit style={{ marginLeft: '10px', color: '#007bff', cursor: 'pointer', fontSize: '0.9em' }} /></strong> : <span className="motif-display"><FaUserSlash /> <em>{saisie.motif}</em></span>
                                            )}
                                        </td>
                                        <td><button className="btn-icon btn-delete" onClick={() => onSupprimer(saisie.temp_id)} title="Retirer cette saisie"><FaTrash /></button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div className="modal-actions">
                    <button className="btn btn-secondary" onClick={onVider} disabled={saisies.length === 0 || isSaving}>Vider la liste</button>
                    <button className="btn btn-primary" onClick={onValider} disabled={saisies.length === 0 || isSaving}><FaCheckCircle /> {isSaving ? 'Enregistrement...' : `Valider les ${saisies.length} Saisie(s)`}</button>
                </div>
            </div>
        </div>
    );
};

const SaisieDirecte = () => {
    const [allEleves, setAllEleves] = useState([]);
    const [examTypes, setExamTypes] = useState([]);
    const [availableMatieres, setAvailableMatieres] = useState([]);
    const [selectedMatiereId, setSelectedMatiereId] = useState('');
    const [selectedTypeExamen, setSelectedTypeExamen] = useState('');
    const [note, setNote] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isMatiereLoading, setIsMatiereLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [mode, setMode] = useState('serie');
    const [saisiesTemporaires, setSaisiesTemporaires] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [selectedEscadron, setSelectedEscadron] = useState('');
    const [selectedPeloton, setSelectedPeloton] = useState('all');
    const [isSaisieSerieActive, setIsSaisieSerieActive] = useState(false);
    const [listeElevesSerie, setListeElevesSerie] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [rechercheEleve, setRechercheEleve] = useState('');
    const [elevesTrouves, setElevesTrouves] = useState([]);
    const [selectedEleve, setSelectedEleve] = useState(null);
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [recentSaisies, setRecentSaisies] = useState([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [editingEntry, setEditingEntry] = useState(null);
    const [isAbsenceModalOpen, setIsAbsenceModalOpen] = useState(false);
    const [elevePourAbsence, setElevePourAbsence] = useState(null);
    const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);
    const [assignment, setAssignment] = useState(null);

    const noteInputRef = useRef(null);
    const rechercheEleveInputRef = useRef(null);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const token = localStorage.getItem('token');
                const config = { headers: { Authorization: `Bearer ${token}` } };
                const decoded = jwtDecode(token);

                const [elevesRes, examTypesRes, matieresRes] = await Promise.all([
                    axios.get(apiPaths.eleves.base, config),
                    axios.get('/api/examens', config),
                    axios.get('/api/matieres', config)
                ]);

                setAllEleves(elevesRes.data);
                setExamTypes(examTypesRes.data);

                if (decoded.assigned_matiere_id) {
                    const matiereObj = matieresRes.data.find(m => m.id === decoded.assigned_matiere_id);
                    setAssignment({
                        matiereNom: matiereObj ? matiereObj.nom_matiere : 'Inconnue',
                        examen: decoded.assigned_type_examen,
                        promotion: decoded.assigned_promotion
                    });
                    setSelectedMatiereId(decoded.assigned_matiere_id);
                    setSelectedTypeExamen(decoded.assigned_type_examen);
                } else if (examTypesRes.data.length > 0) {
                    setSelectedTypeExamen(examTypesRes.data[0].nom_modele);
                }
            } catch (err) { setError("Erreur critique lors du chargement des données."); }
            setIsLoading(false);
        };
        fetchData();
    }, []);

    useEffect(() => {
        const fetchMatieresForExamen = async () => {
            if (!selectedTypeExamen || assignment) return;
            setIsMatiereLoading(true);
            try {
                const token = localStorage.getItem('token');
                const response = await axios.get(`/api/matieres-par-examen?typeExamen=${selectedTypeExamen}`, { headers: { Authorization: `Bearer ${token}` } });
                setAvailableMatieres(response.data);
            } catch (err) { setAvailableMatieres([]); } finally { setIsMatiereLoading(false); }
        };
        fetchMatieresForExamen();
    }, [selectedTypeExamen, assignment]);

    const escadrons = useMemo(() => {
        let filtered = allEleves;
        if (assignment && assignment.promotion) {
            filtered = allEleves.filter(e => e.promotion === assignment.promotion);
        }
        return [...new Set(filtered.map(e => e.escadron).filter(Boolean))].sort((a, b) => a - b);
    }, [allEleves, assignment]);

    const pelotons = useMemo(() => {
        if (!selectedEscadron) return [];
        let filtered = allEleves.filter(e => e.escadron === selectedEscadron);
        if (assignment && assignment.promotion) {
            filtered = filtered.filter(e => e.promotion === assignment.promotion);
        }
        return [...new Set(filtered.map(e => e.peloton).filter(Boolean))].sort((a, b) => a - b);
    }, [allEleves, selectedEscadron, assignment]);

    const fetchRecentSaisies = async () => {
        setIsLoadingHistory(true);
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get('/api/copies/mes-saisies-directes-recentes', { headers: { Authorization: `Bearer ${token}` } });
            setRecentSaisies(response.data);
        } catch (err) { alert("Impossible de charger l'historique."); } finally { setIsLoadingHistory(false); }
    };

    const handleOpenHistoryModal = () => { setIsHistoryModalOpen(true); fetchRecentSaisies(); };

    const handleSaveModification = (copieId, nouvelleNote, motif) => {
        const token = localStorage.getItem('token');
        axios.put(`/api/resultats/${copieId}`, { nouvelle_note: nouvelleNote, motif }, { headers: { Authorization: `Bearer ${token}` } })
            .then(response => { alert(response.data.message); setEditingEntry(null); fetchRecentSaisies(); })
            .catch(error => alert(error.response?.data?.message || "Erreur de mise à jour."));
    };

    const goToNextStudent = () => {
        setNote('');
        if (currentIndex < listeElevesSerie.length - 1) { setCurrentIndex(prev => prev + 1); } 
        else { setMessage("Session terminée !"); setIsSaisieSerieActive(false); setIsValidationModalOpen(true); }
    };

    const handleStartSaisieSerie = async () => {
        if (!selectedMatiereId || !selectedEscadron || !selectedTypeExamen) {
            setError("Veuillez sélectionner la matière, l'examen et l'escadron.");
            return;
        }
        setIsLoading(true); setError(''); setMessage('');
        try {
            const params = { matiereId: selectedMatiereId, typeExamen: selectedTypeExamen, escadron: selectedEscadron, peloton: selectedPeloton };
            const response = await axios.get(apiPaths.eleves.parGroupe, { params });
            if (response.data.length === 0) {
                setMessage("Aucun élève à noter dans ce groupe.");
                setListeElevesSerie([]);
            } else {
                setListeElevesSerie(response.data);
                setCurrentIndex(0);
                setIsSaisieSerieActive(true);
            }
        } catch (err) { setError("Erreur de chargement de la liste."); }
        setIsLoading(false);
    };

    const handleSubmitNoteSerie = (e) => {
        e.preventDefault();
        const noteNum = parseFloat(note);
        if (note === '' || isNaN(noteNum) || noteNum < 0 || noteNum > 20) { setError("Note invalide (0-20)."); return; }
        const currentEleve = listeElevesSerie[currentIndex];
        setError('');
        const nouvelleSaisie = { type: 'note', eleve_id: currentEleve.id, eleve_nom: `${currentEleve.nom} ${currentEleve.prenom} (${currentEleve.numero_incorporation})`, matiere_id: selectedMatiereId, note: note, type_examen: selectedTypeExamen, temp_id: `${Date.now()}-${currentEleve.id}` };
        setSaisiesTemporaires(prev => [...prev, nouvelleSaisie]);
        goToNextStudent();
    };

    const handleOpenAbsenceModal = () => { setElevePourAbsence(listeElevesSerie[currentIndex]); setIsAbsenceModalOpen(true); };

    const handleConfirmAbsence = (motif) => {
        const nouvelleSaisie = { type: 'absence', eleve_id: elevePourAbsence.id, eleve_nom: `${elevePourAbsence.nom} ${elevePourAbsence.prenom} (${elevePourAbsence.numero_incorporation})`, matiere_id: selectedMatiereId, motif: motif || 'Non spécifié', type_examen: selectedTypeExamen, temp_id: `${Date.now()}-${elevePourAbsence.id}` };
        setSaisiesTemporaires(prev => [...prev, nouvelleSaisie]);
        setIsAbsenceModalOpen(false); setElevePourAbsence(null); goToNextStudent();
    };

    useEffect(() => { if (isSaisieSerieActive && noteInputRef.current) { noteInputRef.current.focus(); } }, [currentIndex, isSaisieSerieActive]);

    const handleSelectEleve = (eleve) => { setSelectedEleve(eleve); setRechercheEleve(formatNomEleve(eleve)); setElevesTrouves([]); setIsSearchFocused(false); noteInputRef.current?.focus(); };

    const formatNomEleve = (eleve) => { if (!eleve) return ''; return `${eleve.numero_incorporation} - ${eleve.nom?.toUpperCase()} ${eleve.prenom || ''}`; };

    useEffect(() => {
        const chercher = async () => {
            if (rechercheEleve.trim().length < 2 || (selectedEleve && formatNomEleve(selectedEleve) === rechercheEleve)) { setElevesTrouves([]); return; }
            try {
                const res = await axios.get(apiPaths.eleves.recherche, { params: { q: rechercheEleve, promotion: assignment?.promotion } });
                setElevesTrouves(res.data);
            } catch (error) { console.error(error); }
        };
        const debounce = setTimeout(chercher, 300);
        return () => clearTimeout(debounce);
    }, [rechercheEleve, selectedEleve, assignment]);

    const handleSubmitNoteManuel = (e) => {
        e.preventDefault();
        const noteNum = parseFloat(note);
        if (!selectedEleve || note === '' || isNaN(noteNum) || noteNum < 0 || noteNum > 20) { setError("Sélectionnez un élève et une note valide."); return; }
        const nouvelleSaisie = { type: 'note', eleve_id: selectedEleve.id, eleve_nom: `${selectedEleve.nom} ${selectedEleve.prenom} (${selectedEleve.numero_incorporation})`, matiere_id: selectedMatiereId, note: note, type_examen: selectedTypeExamen, temp_id: `${Date.now()}-${selectedEleve.id}` };
        setSaisiesTemporaires(prev => [...prev, nouvelleSaisie]);
        setNote(''); setSelectedEleve(null); setRechercheEleve(''); rechercheEleveInputRef.current?.focus();
    };

    const handleSupprimerSaisieTemporaire = (temp_id) => { setSaisiesTemporaires(prev => prev.filter(saisie => saisie.temp_id !== temp_id)); };
    const handleModifierSaisieTemporaire = (temp_id, nouvelleNote) => { setSaisiesTemporaires(prev => prev.map(saisie => saisie.temp_id === temp_id ? { ...saisie, note: nouvelleNote } : saisie)); };

    const handleValiderSaisies = async () => {
        setIsSaving(true); setError('');
        const notesToSave = saisiesTemporaires.filter(s => s.type === 'note');
        const absencesToSave = saisiesTemporaires.filter(s => s.type === 'absence');
        try {
            const token = localStorage.getItem('token');
            const promises = [];
            if (notesToSave.length > 0) promises.push(axios.post('/api/copies/notes-directes-bulk', { notes: notesToSave }, { headers: { Authorization: `Bearer ${token}` } }));
            if (absencesToSave.length > 0) promises.push(axios.post('/api/absences/direct-bulk', { absences: absencesToSave }, { headers: { Authorization: `Bearer ${token}` } }));
            await Promise.all(promises);
            setSaisiesTemporaires([]); setMessage("Saisies enregistrées avec succès."); setIsValidationModalOpen(false);
        } catch (err) { alert(err.response?.data?.message || "Erreur lors de l'enregistrement."); } finally { setIsSaving(false); }
    };

    const resetSaisieSerie = () => { setIsSaisieSerieActive(false); setListeElevesSerie([]); setCurrentIndex(0); if (!assignment) { setSelectedMatiereId(''); } setError(''); };

    const renderModeSelection = () => (
        <>
            {assignment ? (
                <div className="assignment-info-card">
                    <div className="assignment-header"><span className="assign-title"><FaLock /> Session de saisie directe sécurisée</span><span className="assign-badge">Configuré par l'Admin</span></div>
                    <div className="assignment-details-row">
                        <div className="assign-field"><strong>Matière :</strong> {assignment.matiereNom}</div>
                        <div className="assign-field"><strong>Examen :</strong> {assignment.examen}</div>
                        <div className="assign-field"><strong>Promotion :</strong> {assignment.promotion || 'N/A'}</div>
                    </div>
                    <div className="assignment-instruction"><FaInfoCircle /> Vous n'avez pas besoin de sélectionner la matière ou l'examen. Vérifiez les informations ci-dessus et commencez la saisie.</div>
                </div>
            ) : (
                <>
                    <div className="form-group"><label>Type d'Examen</label><select value={selectedTypeExamen} onChange={e => setSelectedTypeExamen(e.target.value)} disabled={saisiesTemporaires.length > 0}><option value="">-- Choisissez un type --</option>{examTypes.map(exam => (<option key={exam.id} value={exam.nom_modele}>{exam.nom_modele}</option>))}</select></div>
                    <div className="form-group"><label>Matière</label><select value={selectedMatiereId} onChange={e => setSelectedMatiereId(e.target.value)} disabled={saisiesTemporaires.length > 0 || !selectedTypeExamen || isMatiereLoading}><option value="">-- Choisissez une matière --</option>{isMatiereLoading ? <option>Chargement...</option> : availableMatieres.map(m => <option key={m.id} value={m.id}>{m.nom_matiere}</option>)}</select></div>
                </>
            )}
            {saisiesTemporaires.length > 0 && <p className="alert alert-info">Validez ou videz la liste pour changer de mode.</p>}
        </>
    );

    const renderModeSerie = () => (
        <>
            <div className="form-group"> <label>Escadron</label> <select value={selectedEscadron} onChange={e => setSelectedEscadron(e.target.value)}> <option value="">-- Choisissez un escadron --</option> {escadrons.map(e => <option key={e} value={e}>{e}</option>)} </select> </div>
            {selectedEscadron && (<div className="form-group"> <label>Peloton (Optionnel)</label> <select value={selectedPeloton} onChange={e => setSelectedPeloton(e.target.value)}> <option value="all">-- Tous les pelotons --</option> {pelotons.map(p => <option key={p} value={p}>{p}</option>)} </select> </div>)}
            <button className="btn btn-primary" onClick={handleStartSaisieSerie} disabled={!selectedMatiereId || !selectedEscadron || isLoading}> <FaPlay /> {isLoading ? "Chargement..." : "Commencer la Saisie"} </button>
        </>
    );

    const renderModeManuel = () => (
        <form onSubmit={handleSubmitNoteManuel}>
            <div className="form-group search-container">
                <label htmlFor="recherche_field">Rechercher un élève (nom ou N° incorp.)</label>
                <input id="recherche_field" ref={rechercheEleveInputRef} type="text" value={rechercheEleve} onChange={e => { setRechercheEleve(e.target.value); setSelectedEleve(null); }} onFocus={() => setIsSearchFocused(true)} onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)} placeholder="Ex: 324 ou rakoto..." autoComplete="off" disabled={!selectedMatiereId || !selectedTypeExamen} />
                {isSearchFocused && elevesTrouves.length > 0 && (<div className="search-results"> {elevesTrouves.map(eleve => (<div key={eleve.id} className="search-result-item" onMouseDown={() => handleSelectEleve(eleve)}> {formatNomEleve(eleve)} </div>))} </div>)}
            </div>
            <div className="form-group">
                <label htmlFor="note">Note / 20</label>
                <input ref={noteInputRef} type="number" id="note" value={note} onChange={e => setNote(e.target.value)} min="0" max="20" step="0.01" placeholder="Saisir la note et appuyer sur Entrée" disabled={!selectedEleve} required />
            </div>
            <button type="submit" className="btn btn-primary" disabled={!selectedEleve}> <FaSave /> Ajouter à la liste </button>
        </form>
    );

    if (isLoading && !isSaisieSerieActive) return <div className="card"><h2>Chargement...</h2></div>;

    const currentEleveSerie = listeElevesSerie[currentIndex];

    return (
        <div className="card">
            {isAbsenceModalOpen && elevePourAbsence && (<AbsenceModal eleve={elevePourAbsence} onConfirm={handleConfirmAbsence} onCancel={() => setIsAbsenceModalOpen(false)} />)}
            <HistoriqueSaisiesModal isOpen={isHistoryModalOpen} onClose={() => setIsHistoryModalOpen(false)} saisies={recentSaisies} isLoading={isLoadingHistory} onEdit={(entry) => setEditingEntry(entry)} />
            {editingEntry && <ModificationModal entry={editingEntry} onClose={() => setEditingEntry(null)} onSave={handleSaveModification} />}
            <ValidationModal isOpen={isValidationModalOpen} onClose={() => setIsValidationModalOpen(false)} saisies={saisiesTemporaires} onValider={handleValiderSaisies} onVider={() => setSaisiesTemporaires([])} onSupprimer={handleSupprimerSaisieTemporaire} onModifier={handleModifierSaisieTemporaire} isSaving={isSaving} />

            {saisiesTemporaires.length > 0 && (
                <div className="validation-badge" onClick={() => setIsValidationModalOpen(true)}>
                    <FaClipboardList /><span>{saisiesTemporaires.length}</span><div className="badge-tooltip">Voir les saisies en attente</div>
                </div>
            )}

            {isSaisieSerieActive ? (
                <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2>Notation en Série...</h2>
                        <button onClick={resetSaisieSerie} className="btn btn-secondary" style={{ backgroundColor: 'var(--text-secondary-color)' }}><FaArrowLeft /> Changer de groupe</button>
                    </div>
                    <p style={{ color: 'var(--text-secondary-color)', marginBottom: '10px' }}> Matière: <strong>{assignment ? assignment.matiereNom : availableMatieres.find(m => m.id == selectedMatiereId)?.nom_matiere}</strong> | Type: <strong>{selectedTypeExamen.replace('_', ' ')}</strong> </p>
                    <p style={{ color: 'var(--text-secondary-color)', marginBottom: '25px' }}> Progression: <strong>Élève {currentIndex + 1} / {listeElevesSerie.length}</strong> </p>
                    <div className="student-info-card">
                        <h3>{currentEleveSerie.nom} {currentEleveSerie.prenom}</h3>
                        <p>N° Incorporation: {currentEleveSerie.numero_incorporation}</p>
                        <p>Escadron: {currentEleveSerie.escadron} | Peloton: {currentEleveSerie.peloton}</p>
                    </div>
                    <form onSubmit={handleSubmitNoteSerie}>
                        <div className="form-group"> <label htmlFor="note_serie">Note / 20</label> <input ref={noteInputRef} type="number" id="note_serie" value={note} onChange={e => setNote(e.target.value)} min="0" max="20" step="0.01" placeholder="Saisir la note et appuyer sur Entrée" required /> </div>
                        {error && <div className="alert alert-danger">{error}</div>}
                        <div className="saisie-serie-actions">
                            <button type="submit" className="btn btn-primary"> <FaSave /> Ajouter et Suivant </button>
                            <button type="button" className="btn btn-warning" onClick={handleOpenAbsenceModal}> <FaUserSlash /> Déclarer Absent </button>
                        </div>
                    </form>
                </>
            ) : (
                <>
                    <div className="card-header-actions"><h2>Saisie Directe des Notes</h2><button onClick={handleOpenHistoryModal} className="btn-icon history-btn" title="Voir mes dernières saisies"> <FaHistory /> </button></div>
                    <div className="mode-selector">
                        <button onClick={() => setMode('serie')} className={`btn ${mode === 'serie' ? 'btn-primary' : 'btn-secondary'}`}><FaUsers /> Série par Escadron ou Péloton</button>
                        <button onClick={() => setMode('manuel')} className={`btn ${mode === 'manuel' ? 'btn-primary' : 'btn-secondary'}`}><FaUserPlus /> Manuelle par recherche</button>
                    </div>
                    <hr />
                    {message && <div className="alert alert-success">{message}</div>}
                    {error && <div className="alert alert-danger">{error}</div>}
                    {renderModeSelection()}
                    {mode === 'serie' ? renderModeSerie() : renderModeManuel()}
                </>
            )}

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
                .alert{padding:15px;margin-bottom:20px;border:1px solid transparent;border-radius:var(--border-radius)}.alert-success{color:#155724;background-color:#d4edda;border-color:#c3e6cb}.alert-danger{color:#721c24;background-color:#f8d7da;border-color:#f5c6cb}.alert-info{color:#0c5460;background-color:#d1ecf1;border-color:#bee5eb}.student-info-card{background-color:var(--background-color);padding:20px;border-radius:var(--border-radius);margin-bottom:25px;border-left:5px solid var(--primary-color)}.student-info-card h3{margin:0 0 10px 0}.student-info-card p{margin:0;color:var(--text-secondary-color)}.mode-selector{display:flex;gap:10px;margin-bottom:20px}hr{border:none;border-top:1px solid var(--border-color);margin:20px 0}.search-container{position:relative}.search-results{position:absolute;top:100%;left:0;right:0;background-color:#fff;border:1px solid #ccc;border-radius:var(--border-radius);z-index:1000;max-height:200px;overflow-y:auto;box-shadow:0 4px 8px rgba(0,0,0,0.1)}.search-result-item{padding:10px;cursor:pointer}.search-result-item:hover{background-color:#f0f0f0}.card-header-actions{display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem}.history-btn{background-color:transparent;border:1px solid var(--border-color);color:var(--text-secondary-color);font-size:1.2rem;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .2s ease-in-out}.history-btn:hover{background-color:var(--primary-color);color:white;border-color:var(--primary-color)}.modal-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background-color:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:1000}.modal-content{background:white;padding:25px;border-radius:8px;max-width:600px;width:90%;box-shadow:0 5px 15px rgba(0,0,0,.3)}.modal-content.large{max-width:900px}.modal-header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #eee;padding-bottom:15px;margin-bottom:20px}.modal-header h3{margin:0}.close-button{background:none;border:none;font-size:1.8rem;cursor:pointer;color:#888}.modal-body{max-height:70vh;overflow-y:auto}.modal-actions{margin-top:20px;display:flex;justify-content:flex-end;gap:10px}.table-responsive{width:100%;overflow-x:auto;margin-bottom:1rem}.results-table{width:100%;border-collapse:collapse}.results-table th,.results-table td{padding:10px 15px;border:1px solid #ddd;text-align:left}.results-table th{background-color:#f7f7f7}.btn-icon{background:none;border:none;cursor:pointer;padding:5px;font-size:1.1rem}.btn-edit{color:#007bff}.btn-delete{color:#dc3545}.saisie-serie-actions{display:flex;gap:10px}.absence-row{background-color:#fffbe6}.motif-display{color:#856404;font-style:italic;display:flex;align-items:center;gap:8px}.validation-badge{position:fixed;bottom:20px;right:20px;background-color:var(--primary-color);color:white;width:60px;height:60px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.2);transition:transform .2s ease-in-out;z-index:999}.validation-badge:hover{transform:scale(1.1)}.validation-badge:hover .badge-tooltip{opacity:1;visibility:visible}.validation-badge span{font-size:1.2rem;font-weight:700}.validation-badge .badge-tooltip{position:absolute;bottom:100%;right:0;margin-bottom:10px;background-color:#333;color:white;padding:5px 10px;border-radius:4px;font-size:.9rem;white-space:nowrap;opacity:0;visibility:hidden;transition:opacity .2s ease-in-out}
            `}</style>
        </div>
    );
};

export default SaisieDirecte;
