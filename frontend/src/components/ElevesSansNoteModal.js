import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Resultats.css';

const IconPrint = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>;

// 1. AJOUT de 'typeExamen' dans les props reçues
const ElevesSansNoteModal = ({ matiereId, nomMatiere, typeExamen, onClose }) => {
    const [eleves, setEleves] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // 2. AJOUT de la vérification de typeExamen
        if (!matiereId || !typeExamen) return;

        const fetchElevesSansNote = () => {
            const token = localStorage.getItem('token');
            // 3. MODIFICATION de l'URL pour inclure le type d'examen
            axios.get(`/api/resultats/sans-note/${matiereId}?type_examen=${encodeURIComponent(typeExamen)}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            .then(response => {
                setEleves(response.data);
            })
            .catch(error => {
                console.error("Erreur lors du chargement des élèves sans note", error);
                // Optionnel : ne pas alerter si c'est juste une annulation, mais utile pour le debug
            })
            .finally(() => {
                setLoading(false);
            });
        };

        fetchElevesSansNote();
    // 4. AJOUT de typeExamen dans les dépendances pour recharger si ça change
    }, [matiereId, typeExamen]);

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content large-modal" onClick={e => e.stopPropagation()}>
                <div id="printableElevesSansNote">
                    <div className="modal-header">
                        {/* 5. AFFICHAGE du type d'examen dans le titre pour plus de clarté */}
                        <h3>Élèves sans note : {nomMatiere} <br/><small>({typeExamen})</small></h3>
                        <button className="close-button no-print" onClick={onClose}>&times;</button>
                    </div>
                    <div className="modal-body">
                        {loading ? (
                            <p>Chargement de la liste...</p>
                        ) : (
                            <div className="table-responsive">
                                <table className="results-table">
                                    <thead>
                                        <tr>
                                            <th>Prénom</th>
                                            <th>Nom</th>
                                            <th>N° Incorp.</th>
                                            <th>Escadron</th>
                                            <th>Peloton</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {eleves.length > 0 ? (
                                            eleves.map(eleve => (
                                                <tr key={eleve.id}>
                                                    <td>{eleve.prenom}</td>
                                                    <td>{eleve.nom}</td>
                                                    <td>{eleve.numero_incorporation}</td>
                                                    <td>{eleve.escadron}</td>
                                                    <td>{eleve.peloton}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="5" className="no-results">
                                                    Tous les élèves ont une note pour cet examen (ou sont absents).
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                <div className="modal-actions no-print">
                    <button className="btn btn-primary" onClick={handlePrint}>
                        <IconPrint /> <span>Imprimer la liste</span>
                    </button>
                    <button className="btn-cancel" onClick={onClose}>Fermer</button>
                </div>
            </div>
        </div>
    );
};

export default ElevesSansNoteModal;
