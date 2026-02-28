import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { FiPrinter, FiPlusCircle, FiArchive, FiLoader, FiTrash2, FiAlertTriangle } from 'react-icons/fi';
import './CreerCodesMatiere.css';

const PreviewModal = ({ codes, onConfirm, onCancel, matiereNom, examenNom }) => {
    const printRef = useRef();

    const getPrintContent = () => {
        const title = `<h3>${matiereNom} - ${examenNom}</h3>`;
        const codePairs = codes.map(code => 
            `<div class="code-item">${code}</div><div class="code-item">${code}</div>`
        ).join('');
        return `${title}<div class="print-grid">${codePairs}</div>`;
    };

    const handlePrint = () => {
        const printWindow = window.open('', '_blank');
        printWindow.document.write('<html><head><title>Codes à Imprimer</title>');
        printWindow.document.write(`
            <style>
                body { font-family: 'Courier New', monospace; margin: 15px; }
                @page { size: A4; margin: 1cm; }
                .print-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 15px 5px; }
                .code-item { border: 1.5px solid black; padding: 10px 5px; font-size: 18px; font-weight: bold; text-align: center; page-break-inside: avoid; overflow-wrap: break-word; }
                h3 { grid-column: 1 / -1; text-align: center; font-size: 20px; margin-bottom: 20px; }
            </style>
        `);
        printWindow.document.write('</head><body>');
        printWindow.document.write(getPrintContent());
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        printWindow.print();
    };

    const handleConfirmAndPrint = () => {
        handlePrint();
        onConfirm();
    };

    return (
        <div className="modal-backdrop">
            <div className="modal-content">
                <h2>Prévisualisation des Codes</h2>
                <div className="modal-body" ref={printRef}>
                   <div dangerouslySetInnerHTML={{ __html: getPrintContent() }} />
                </div>
                <div className="modal-footer">
                    <button onClick={onCancel} className="btn-secondary">Annuler</button>
                    <button onClick={handleConfirmAndPrint} className="btn-primary"><FiPrinter /> Imprimer & Enregistrer</button>
                </div>
            </div>
        </div>
    );
};

const DeleteConfirmModal = ({ lot, onConfirm, onCancel }) => {
    if (!lot) return null;
    return (
        <div className="modal-backdrop">
            <div className="modal-content delete-modal-content">
                <FiAlertTriangle size={48} color="#d9534f" />
                <h2>Confirmer la Suppression</h2>
                <p>
                    Voulez-vous vraiment supprimer le lot pour <strong>{lot.nom_matiere} ({lot.type_examen})</strong> ?
                </p>
                <p>
                    Cette action supprimera définitivement les <strong>{lot.nombre_codes} codes</strong> associés. Cette opération est irréversible.
                </p>
                <div className="modal-footer">
                    <button onClick={onCancel} className="btn-secondary">Annuler</button>
                    <button onClick={onConfirm} className="btn-danger"><FiTrash2 /> Oui, Supprimer</button>
                </div>
            </div>
        </div>
    );
};

const CreerCodesMatiere = () => {
    const [matieres, setMatieres] = useState([]);
    const [examens, setExamens] = useState([]);
    const [selectedMatiere, setSelectedMatiere] = useState('');
    const [selectedExamen, setSelectedExamen] = useState('');
    const [nombreCodes, setNombreCodes] = useState(10);
    const [historique, setHistorique] = useState([]);

    const [codesAPrevisualiser, setCodesAPrevisualiser] = useState([]);
    const [dataPourSauvegarde, setDataPourSauvegarde] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [lotToDelete, setLotToDelete] = useState(null);
    
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const fetchInitialData = async () => {
        try {
            const [resMatieres, resExamens, resLots] = await Promise.all([
                axios.get('/api/matieres'),
                axios.get('/api/examens'),
                axios.get('/api/codes/lots')
            ]);
            setMatieres(resMatieres.data);
            setExamens(resExamens.data);
            setHistorique(resLots.data);
        } catch (err) {
            setError('Erreur lors de la récupération des données.');
        }
    };

    useEffect(() => {
        fetchInitialData();
    }, []);
    
    const handlePreview = async (e) => {
        e.preventDefault();
        if (!selectedMatiere || !selectedExamen || nombreCodes <= 0) {
            setError('Veuillez remplir tous les champs et spécifier un nombre positif.');
            return;
        }

        setIsLoading(true);
        setError('');
        setSuccess('');
        
        try {
            const response = await axios.post('/api/codes/previsualiser', {
                matiereId: selectedMatiere,
                nombreCodes: parseInt(nombreCodes, 10),
            });
            setCodesAPrevisualiser(response.data.codes);
            setDataPourSauvegarde({
                matiereId: selectedMatiere,
                typeExamen: selectedExamen,
                codes: response.data.codes,
            });
            setIsModalOpen(true);
        } catch (err) {
            setError(err.response?.data?.message || 'Une erreur est survenue lors de la prévisualisation.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleConfirmSave = async () => {
        setIsLoading(true);
        setError('');
        try {
            const response = await axios.post('/api/codes/sauvegarder', dataPourSauvegarde);
            setSuccess(response.data.message);
            setIsModalOpen(false);
            fetchInitialData();
        } catch (err) {
            setError(err.response?.data?.message || 'Erreur lors de la sauvegarde.');
            setIsModalOpen(false);
        } finally {
            setIsLoading(false);
        }
    };

    const handleReprint = async (lotId) => {
        try {
            const response = await axios.get(`/api/codes/lot/${lotId}`);
            const lotInfo = historique.find(lot => lot.id === lotId);
            const codes = response.data.codes;

            const printWindow = window.open('', '_blank');
            printWindow.document.write('<html><head><title>Réimpression</title>');
            printWindow.document.write(`
                <style>
                    body { font-family: 'Courier New', monospace; margin: 15px; }
                    @page { size: A4; margin: 1cm; }
                    .print-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 15px 5px; }
                    .code-item { border: 1.5px solid black; padding: 10px 5px; font-size: 18px; font-weight: bold; text-align: center; page-break-inside: avoid; overflow-wrap: break-word; }
                    h3 { grid-column: 1 / -1; text-align: center; font-size: 20px; margin-bottom: 20px; }
                </style>
            `);
            printWindow.document.write('</head><body>');
            
            const title = `<h3>${lotInfo.nom_matiere} - ${lotInfo.type_examen}</h3>`;
            const codePairs = codes.map(code => 
                `<div class="code-item">${code}</div><div class="code-item">${code}</div>`
            ).join('');
            
            printWindow.document.write(`${title}<div class="print-grid">${codePairs}</div>`);
            printWindow.document.write('</body></html>');
            printWindow.document.close();
            printWindow.print();
        } catch (err) {
            setError('Impossible de récupérer les codes pour la réimpression.');
        }
    };

    const handleDeleteRequest = (lot) => {
        setLotToDelete(lot);
        setShowDeleteConfirm(true);
    };

    const handleConfirmDelete = async () => {
        if (!lotToDelete) return;
        setIsLoading(true);
        setError('');
        try {
            const response = await axios.delete(`/api/codes/lot/${lotToDelete.id}`);
            setSuccess(response.data.message);
            fetchInitialData();
        } catch (err) {
            setError(err.response?.data?.message || 'Erreur lors de la suppression.');
        } finally {
            setIsLoading(false);
            setShowDeleteConfirm(false);
            setLotToDelete(null);
        }
    };

    return (
        <div className="creer-codes-container">
            {isModalOpen && (
                <PreviewModal
                    codes={codesAPrevisualiser}
                    onConfirm={handleConfirmSave}
                    onCancel={() => setIsModalOpen(false)}
                    matiereNom={matieres.find(m => m.id.toString() === selectedMatiere)?.nom_matiere}
                    examenNom={selectedExamen}
                />
            )}
            {showDeleteConfirm && (
                <DeleteConfirmModal
                    lot={lotToDelete}
                    onConfirm={handleConfirmDelete}
                    onCancel={() => setShowDeleteConfirm(false)}
                />
            )}

            <div className="generation-section">
                <h2><FiPlusCircle /> Générer un nouveau lot de codes</h2>
                <form onSubmit={handlePreview} className="creer-codes-form">
                    <div className="form-group">
                        <label htmlFor="matiere">Matière</label>
                        <select id="matiere" value={selectedMatiere} onChange={e => setSelectedMatiere(e.target.value)} required>
                            <option value="">-- Choisir une matière --</option>
                            {matieres.map(m => <option key={m.id} value={m.id}>{m.nom_matiere}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label htmlFor="examen">Type d'Examen</label>
                         <select id="examen" value={selectedExamen} onChange={e => setSelectedExamen(e.target.value)} required>
                            <option value="">-- Choisir un type d'examen --</option>
                            {examens.map(ex => <option key={ex.id} value={ex.nom_modele}>{ex.nom_modele}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label htmlFor="nombre">Nombre de codes (supplémentaires)</label>
                        <input id="nombre" type="number" value={nombreCodes} onChange={e => setNombreCodes(e.target.value)} min="1" max="1500" required />
                    </div>
                    <button type="submit" className="btn-primary" disabled={isLoading}>
                        {isLoading ? <FiLoader className="spinner"/> : 'Prévisualiser les codes'}
                    </button>
                </form>
                {error && <div className="message error-message">{error}</div>}
                {success && <div className="message success-message">{success}</div>}
            </div>

            <div className="historique-section">
                <h2><FiArchive /> Historique des générations</h2>
                <div className="historique-grid">
                    {historique.length === 0 && <p>Aucun lot de codes n'a encore été généré.</p>}
                    {historique.map(lot => (
                        <div key={lot.id} className="lot-card">
                            <div className="lot-card-header">
                                <h3>{lot.nom_matiere}</h3>
                                <span>{lot.type_examen}</span>
                            </div>
                            <div className="lot-card-body">
                                <p><strong>{lot.nombre_codes}</strong> codes générés</p>
                                <p>{new Date(lot.date_generation).toLocaleString()}</p>
                            </div>
                            <div className="lot-card-footer">
                                <button onClick={() => handleReprint(lot.id)} className="btn-success"><FiPrinter /> Réimprimer</button>
                                <button onClick={() => handleDeleteRequest(lot)} className="btn-danger" disabled={isLoading}><FiTrash2 /> Supprimer</button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default CreerCodesMatiere;
