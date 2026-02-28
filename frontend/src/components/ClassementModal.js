import React, { useState, useEffect } from 'react';
import axios from 'axios';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './Resultats.css';

const IconExcel = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>;

const overlayStyles = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2000,
    color: 'white',
    fontSize: '1.5rem',
};

const ClassementModal = ({ onClose, modeleExamen }) => {
    const [classementData, setClassementData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isAnimating, setIsAnimating] = useState(false);
    const [animationText, setAnimationText] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchClassementDetails = () => {
            setLoading(true);
            const token = localStorage.getItem('token');
            const url = `/api/resultats/classement-details${modeleExamen && modeleExamen !== 'General' ? `?typeExamen=${modeleExamen}` : ''}`;

            axios.get(url, { headers: { Authorization: `Bearer ${token}` } })
                .then(response => {
                    setClassementData(response.data);
                })
                .catch(error => {
                    console.error("Erreur lors du chargement du classement détaillé:", error);
                    setClassementData({ classement: [], matieres: [] });
                })
                .finally(() => setLoading(false));
        };
        fetchClassementDetails();
    }, [modeleExamen]);

    const isDataReady = () => {
        if (!classementData || !classementData.classement) {
            alert("Les données du classement ne sont pas prêtes ou sont invalides.");
            return false;
        }
        return true;
    };

    // Fonction utilitaire pour déterminer l'affichage du rang
    // Si l'élève n'a AUCUNE note de détail, il est considéré comme "Non classé" même si la moyenne est 0.00
    const getRangAffiche = (eleve) => {
        const aDesNotes = eleve.notesDetail && Object.keys(eleve.notesDetail).length > 0;
        if (!aDesNotes) return 'Non classé';
        return eleve.rang || eleve.statut;
    };

    const handleDownload = (actionFn, text) => {
        if (!isDataReady()) return;
        setAnimationText(text);
        setIsAnimating(true);
        actionFn();
        setTimeout(() => {
            setIsAnimating(false);
        }, 2000);
    };

    const performExcelExport = () => {
        const token = localStorage.getItem('token');
        const url = `/api/resultats/exporter-classement-excel${modeleExamen && modeleExamen !== 'General' ? `?typeExamen=${modeleExamen}` : ''}`;

        axios({
            url: url,
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
            responseType: 'blob',
        })
        .then((response) => {
            const href = URL.createObjectURL(response.data);
            const link = document.createElement('a');
            link.href = href;
            const fileName = `Classement_${modeleExamen || 'General'}_Detaille.xlsx`;
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(href);
        })
        .catch(error => {
            console.error("Erreur d'exportation en Excel !", error);
            alert("Une erreur est survenue lors de l'exportation Excel.");
        });
    };

    const performPrintDetail = () => {
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.setFontSize(16);
        const title = `Classement ${modeleExamen || 'Général'} - Détaillé`;
        doc.text(title, doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });

        const head = [['RANG', 'NOM ET PRÉNOM', ...classementData.matieres.map(m => (m.code_prefixe || m.nom_matiere.substring(0, 3)).toUpperCase()), 'MOYENNE']];
        
        const body = classementData.classement.map(eleve => [
            getRangAffiche(eleve), // Utilisation de la fonction corrigée
            `${eleve.nom} ${eleve.prenom}`,
            ...classementData.matieres.map(m => eleve.notesDetail[m.id] || '-'),
            eleve.moyenne !== null ? eleve.moyenne : '-'
        ]);

        autoTable(doc, {
            startY: 25, head, body, theme: 'grid',
            styles: { fontSize: 8, textColor: [0, 0, 0] },
            headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold' }
        });
        doc.save(`Classement_Detaille_${modeleExamen || 'General'}.pdf`);
    };

    const performPrintSynthese = () => {
        const doc = new jsPDF({ orientation: 'portrait' });
        doc.setFontSize(16);
        const title = `Classement ${modeleExamen || 'Général'} - Synthèse`;
        doc.text(title, doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });
        
        // On affiche tout le monde, même les "non classés"
        const head = [['RANG', 'NOM ET PRÉNOM', 'MOYENNE', 'MENTION']];
        const body = classementData.classement.map(eleve => [ 
            getRangAffiche(eleve), // Utilisation de la fonction corrigée
            `${eleve.nom} ${eleve.prenom}`, 
            eleve.moyenne !== null ? parseFloat(eleve.moyenne).toFixed(2) : '-', 
            getMention(eleve.moyenne) 
        ]);

        autoTable(doc, {
            startY: 25, head, body, theme: 'grid',
            styles: { fontSize: 8, textColor: [0, 0, 0] },
            headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold' }
        });
        doc.save(`Classement_Synthese_${modeleExamen || 'General'}.pdf`);
    };

    const getMention = (moyenne) => {
        if (moyenne === null || moyenne === undefined) return '-';
        const m = parseFloat(moyenne);
        if (m >= 18) return 'Excellent';
        if (m >= 16) return 'Très bien';
        if (m >= 14) return 'Bien';
        if (m >= 12) return 'Assez bien';
        if (m >= 10) return 'Passable';
        return 'Insuffisant';
    };

    const classement = classementData ? classementData.classement : [];

    const filteredClassement = classement.filter(eleve => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
            (eleve.nom && eleve.nom.toLowerCase().includes(term)) ||
            (eleve.prenom && eleve.prenom.toLowerCase().includes(term)) ||
            (eleve.numero_incorporation && eleve.numero_incorporation.toString().includes(term))
        );
    });

    return (
        <>
            {isAnimating && (
                <div style={overlayStyles}>
                    <p>{animationText}</p>
                </div>
            )}
            <div className="modal-overlay" onClick={onClose}>
                <div className="modal-content large-modal" onClick={e => e.stopPropagation()}>
                    <div className="modal-header">
                        <h3>Classement - {modeleExamen || 'Général'}</h3>
                        <button className="close-button" onClick={onClose}>&times;</button>
                    </div>
                    <div className="modal-body">
                         {loading ? <p>Calcul en cours...</p> : (
                            <>
                                <div style={{ marginBottom: '15px' }}>
                                    <input
                                        type="text"
                                        placeholder="Rechercher un élève (Nom, Prénom, N°)..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            fontSize: '1rem',
                                            border: '1px solid #ccc',
                                            borderRadius: '4px'
                                        }}
                                    />
                                </div>

                                <div className="table-responsive">
                                    <table className="results-table">
                                        <thead>
                                            <tr>
                                                <th>Rang</th><th>Prénom</th><th>Nom</th><th>N° Incorp.</th><th>Moyenne / 20</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredClassement.length > 0 ? (
                                                filteredClassement.map((eleve, index) => (
                                                    <tr key={eleve.id || index}>
                                                        {/* Affichage conditionnel : Si pas de notes, on force "Non classé" */}
                                                        <td><strong>{getRangAffiche(eleve)}</strong></td>
                                                        <td>{eleve.prenom}</td>
                                                        <td>{eleve.nom}</td>
                                                        <td>{eleve.numero_incorporation}</td>
                                                        <td className={eleve.moyenne ? (eleve.moyenne >= 10 ? 'moyenne-success' : 'moyenne-danger') : ''}>
                                                            {eleve.moyenne !== null ? eleve.moyenne : '-'}
                                                        </td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr><td colSpan="5" className="no-results">
                                                    {searchTerm ? "Aucun résultat pour cette recherche." : "Aucun élève à classer."}
                                                </td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>
                    <div className="modal-actions" style={{justifyContent: 'space-between'}}>
                        <div>
                            <button className="btn-excel" onClick={() => handleDownload(performExcelExport, 'Exportation Excel...')} disabled={loading || isAnimating}>
                                <IconExcel /> {isAnimating ? 'En cours...' : 'Exporter en Excel'}
                            </button>
                        </div>
                        <div>
                            <button className="btn-primary" onClick={() => handleDownload(performPrintSynthese, 'Impression de la synthèse...')} disabled={loading || isAnimating}>
                                Imprimer la synthèse
                            </button>
                            <button className="btn-secondary" onClick={() => handleDownload(performPrintDetail, 'Impression du détail...')} disabled={loading || isAnimating}>
                                Imprimer le détail
                            </button>
                            <button className="btn-cancel" onClick={onClose}>Fermer</button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default ClassementModal;
