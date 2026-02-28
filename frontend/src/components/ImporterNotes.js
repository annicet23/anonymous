// DANS src/components/ImporterNotes.js

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { FiUploadCloud, FiCheck, FiAlertTriangle, FiX, FiFileText, FiGrid } from 'react-icons/fi';
import './ImporterNotes.css';

// NOUVEAU : Import des bibliothèques pour la conversion
import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import * as XLSX from 'xlsx';

// NOUVEAU : Configuration du "worker" pour pdf.js (nécessaire pour le fonctionnement)
// DANS src/components/ImporterNotes.js

// NOUVELLE LIGNE CORRIGÉE
// DANS src/components/ImporterNotes.js

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const ImporterNotes = () => {
    // State pour les listes des menus déroulants
    const [matieres, setMatieres] = useState([]);
    const [examens, setExamens] = useState([]);
    const [escadrons, setEscadrons] = useState([]);
    const [pelotons, setPelotons] = useState([]);

    // State pour les valeurs sélectionnées
    const [selectedMatiere, setSelectedMatiere] = useState('');
    const [selectedTypeExamen, setSelectedTypeExamen] = useState('');
    const [selectedEscadron, setSelectedEscadron] = useState('');
    const [selectedPeloton, setSelectedPeloton] = useState('');

    // State pour la logique du composant
    const [file, setFile] = useState(null); // contiendra toujours le fichier de type Excel (original ou converti)
    const [fileName, setFileName] = useState(''); // NOUVEAU : Pour afficher le nom du fichier sélectionné
    const [isLoading, setIsLoading] = useState(false);
    const [isConvertingPdf, setIsConvertingPdf] = useState(false); // NOUVEAU : State pour le chargement de la conversion
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [previewData, setPreviewData] = useState({ donneesValides: [], erreurs: [] });
    
    // NOUVEAU : Référence pour l'input de fichier caché
    const fileInputRef = useRef(null);

    // Effet pour charger les données initiales (matières, examens, escadrons)
    useEffect(() => {
        const fetchData = async () => {
            try {
                const [matieresRes, examensRes, escadronsRes] = await Promise.all([
                    axios.get('/api/matieres'),
                    axios.get('/api/examens'),
                    axios.get('/api/escadrons')
                ]);

                const matieresUniques = Array.from(new Map(matieresRes.data.map(m => [m.nom_matiere, m])).values())
                                             .sort((a, b) => a.nom_matiere.localeCompare(b.nom_matiere));
                setMatieres(matieresUniques);
                setExamens(examensRes.data);
                setEscadrons(escadronsRes.data);

            } catch (err) {
                setError('Erreur critique : Impossible de charger les données du formulaire.');
            }
        };
        fetchData();
    }, []);

    // Effet pour charger les pelotons quand un escadron est sélectionné
    useEffect(() => {
        if (selectedEscadron) {
            setIsLoading(true);
            const fetchPelotons = async () => {
                try {
                    const { data } = await axios.get(`/api/pelotons/${selectedEscadron}`);
                    setPelotons(data);
                    setSelectedPeloton('all'); 
                } catch (err) {
                    setError('Erreur lors de la récupération des pelotons.');
                    setPelotons([]);
                } finally {
                    setIsLoading(false);
                }
            };
            fetchPelotons();
        } else {
            setPelotons([]);
            setSelectedPeloton('');
        }
    }, [selectedEscadron]);

    // NOUVEAU : Fonction pour déclencher le clic sur l'input caché
    const handleButtonClick = (acceptType) => {
        if (fileInputRef.current) {
            fileInputRef.current.accept = acceptType;
            fileInputRef.current.click();
        }
    };
    
    // MODIFIÉ : Gère à la fois les fichiers Excel et PDF
    const handleFileChange = async (e) => {
        const selectedFile = e.target.files[0];
        if (!selectedFile) return;

        setFileName(selectedFile.name);
        setFile(null);
        setError('');
        setSuccess('');

        if (selectedFile.type === 'application/pdf') {
            setIsConvertingPdf(true);
            try {
                const excelFile = await convertPdfToExcel(selectedFile);
                setFile(excelFile);
                setSuccess('Fichier PDF converti en Excel avec succès. Prêt pour la prévisualisation.');
            } catch (err) {
                setError(`Erreur lors de la conversion du PDF : ${err.message}`);
            } finally {
                setIsConvertingPdf(false);
            }
        } else {
            // C'est un fichier Excel, on le traite normalement
            setFile(selectedFile);
        }
        // Réinitialise l'input pour pouvoir sélectionner le même fichier à nouveau
        e.target.value = null; 
    };

    // NOUVEAU : La fonction magique de conversion PDF -> Excel
    const convertPdfToExcel = async (pdfFile) => {
        const fileReader = new FileReader();
        return new Promise((resolve, reject) => {
            fileReader.onload = async (e) => {
                try {
                    const typedarray = new Uint8Array(e.target.result);
                    const pdf = await pdfjsLib.getDocument(typedarray).promise;
                    let fullText = '';

                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const textContent = await page.getTextContent();
                        fullText += textContent.items.map(item => item.str).join(' ') + '\n';
                    }
                    
                    // Hypothèse : chaque ligne pertinente contient Nom, N° Incorp., Note
                    // Cette regex est une tentative. Elle pourrait nécessiter des ajustements
                    // en fonction du format EXACT de votre PDF.
                    const lines = fullText.split('\n');
                    const extractedData = [];

                    for (const line of lines) {
                         // Regex : (Texte avec espaces) (un mot/numéro) (un nombre décimal avec , ou .)
                        const match = line.match(/(.+?)\s+([\w\d-]+)\s+([\d,.]+)\s*$/);
                        if (match) {
                            const nom = match[1].trim();
                            const incorp = match[2].trim();
                            const note = match[3].replace(',', '.').trim(); // Normalise la note
                            if (!isNaN(parseFloat(note))) {
                                extractedData.push([nom, incorp, parseFloat(note)]);
                            }
                        }
                    }

                    if (extractedData.length === 0) {
                        throw new Error("Aucune donnée structurée (Nom, N° Incorp, Note) n'a pu être extraite. Vérifiez le format du PDF.");
                    }

                    // Création du fichier Excel en mémoire
                    const worksheet = XLSX.utils.aoa_to_sheet([['Nom & Prénom', 'N° Incorporation', 'Note'], ...extractedData]);
                    const workbook = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(workbook, worksheet, 'Feuille1');
                    
                    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
                    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                    
                    resolve(new File([blob], "converted_from_pdf.xlsx", { type: blob.type }));

                } catch (err) {
                    reject(err);
                }
            };
            fileReader.onerror = () => reject(new Error('Erreur de lecture du fichier PDF.'));
            fileReader.readAsArrayBuffer(pdfFile);
        });
    };


    const handlePreview = async (e) => {
        e.preventDefault();
        if (!file || !selectedMatiere || !selectedEscadron || !selectedTypeExamen) {
            setError('Veuillez remplir tous les champs et sélectionner un fichier.');
            return;
        }
        setIsLoading(true);
        setError('');
        setSuccess('');
        const formData = new FormData();
        formData.append('fichierNotes', file);
        formData.append('matiere_id', selectedMatiere);
        formData.append('escadron', selectedEscadron);
        formData.append('peloton', selectedPeloton);
        formData.append('type_examen', selectedTypeExamen);

        try {
            const { data } = await axios.post('/api/notes/importer-previsualisation', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setPreviewData(data);
            setIsModalOpen(true);
        } catch (err) {
            setError(err.response?.data?.message || 'Une erreur est survenue lors de la prévisualisation.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleConfirmImport = async () => {
        setIsLoading(true);
        setError('');
        setSuccess('');
        try {
            const payload = {
                notes: previewData.donneesValides,
                matiere_id: selectedMatiere,
                type_examen: selectedTypeExamen
            };
            const { data } = await axios.post('/api/notes/enregistrer-importation', payload);
            setSuccess(data.message);
            setIsModalOpen(false);
            setFile(null);
            setFileName('');
        } catch (err)
 {
            setError(err.response?.data?.message || "Erreur lors de l'enregistrement des notes.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="card">
            <h2>Importer des Notes</h2> {/* TITRE MODIFIÉ */}
            <form onSubmit={handlePreview}>
                <div className="form-grid">
                    <div className="form-group">
                        <label>Matière</label>
                        <select value={selectedMatiere} onChange={e => setSelectedMatiere(e.target.value)} required>
                            <option value="">Sélectionner une matière</option>
                            {matieres.map((m) => (
                                <option key={m.id} value={m.id}>{m.nom_matiere}</option>
                            ))}
                        </select>
                    </div>
                     <div className="form-group">
                        <label>Type d'Examen</label>
                        <select value={selectedTypeExamen} onChange={e => setSelectedTypeExamen(e.target.value)} required>
                            <option value="">Sélectionner un type</option>
                            {examens.map((ex) => (
                                <option key={ex.id} value={ex.nom_modele}>{ex.nom_modele}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Escadron</label>
                        <select value={selectedEscadron} onChange={e => setSelectedEscadron(e.target.value)} required>
                            <option value="">Sélectionner un escadron</option>
                             {escadrons.map((esc) => (
                                <option key={esc} value={esc}>{esc}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Peloton</label>
                        <select value={selectedPeloton} onChange={e => setSelectedPeloton(e.target.value)} disabled={!selectedEscadron || isLoading}>
                            <option value="">Sélectionner un peloton</option>
                            <option value="all">Tous les pelotons</option>
                            {pelotons.map((p) => (
                                <option key={p} value={p}>{p}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* NOUVEAU : Bloc d'importation de fichier amélioré */}
                <div className="form-group">
                    <label>Fichier de Notes</label>
                    <p className="file-format-info">Format requis : Colonne A: Nom & Prénom, B: N° Incorporation, C: Note</p>
                    <input id="file-input" type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />
                    <div className="file-import-buttons">
                        <button type="button" className="btn" onClick={() => handleButtonClick('.xlsx')} disabled={isConvertingPdf || isLoading}>
                            <FiGrid /> Importer Excel
                        </button>
                        <button type="button" className="btn" onClick={() => handleButtonClick('.pdf')} disabled={isConvertingPdf || isLoading}>
                           <FiFileText /> Importer PDF
                        </button>
                    </div>
                    {fileName && <p className="file-name-display">Fichier sélectionné : <strong>{fileName}</strong></p>}
                </div>
                
                {error && <div className="message error-message">{error}</div>}
                {success && <div className="message success-message">{success}</div>}

                <button type="submit" className="btn btn-primary" disabled={isLoading || isConvertingPdf || !file}>
                    <FiUploadCloud /> 
                    {isConvertingPdf ? 'Conversion du PDF...' : (isLoading ? 'Analyse en cours...' : 'Prévisualiser l\'importation')}
                </button>
            </form>

            {isModalOpen && (
                 <div className="modal-overlay">
                    <div className="modal-content">
                        <button className="modal-close" onClick={() => setIsModalOpen(false)}><FiX /></button>
                        <h3>Aperçu de l'Importation</h3>

                        {previewData.donneesValides.length > 0 && (
                            <div className="preview-section">
                                <h4><FiCheck /> {previewData.donneesValides.length} Lignes valides à importer</h4>
                                <div className="table-container">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>Nom & Prénom</th>
                                                <th>N° Incorporation</th>
                                                <th>Note</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {previewData.donneesValides.map(item => (
                                                <tr key={item.ligne}>
                                                    <td>{item.nom_prenom}</td>
                                                    <td>{item.numero_incorporation}</td>
                                                    <td>{item.note}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {previewData.erreurs.length > 0 && (
                             <div className="preview-section error-section">
                                <h4><FiAlertTriangle /> {previewData.erreurs.length} Lignes avec erreurs (ne seront pas importées)</h4>
                                 <div className="table-container">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>Ligne</th>
                                                <th>N° Incorp.</th>
                                                <th>Raison de l'erreur</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {previewData.erreurs.map(item => (
                                                <tr key={item.ligne}>
                                                    <td>{item.ligne}</td>
                                                    <td>{item.numero_incorporation || 'N/A'}</td>
                                                    <td>{item.message}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        <div className="modal-actions">
                            <button className="btn" onClick={() => setIsModalOpen(false)}>Annuler</button>
                            <button
                                className="btn btn-primary"
                                onClick={handleConfirmImport}
                                disabled={isLoading || previewData.donneesValides.length === 0}
                            >
                                {isLoading ? 'Enregistrement...' : `Confirmer et Enregistrer les ${previewData.donneesValides.length} notes`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ImporterNotes;
