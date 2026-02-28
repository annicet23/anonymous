import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './CopiesNotees.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || '';

function CopiesNotees() {
    const [currentView, setCurrentView] = useState('dashboard');
    const [selectedCard, setSelectedCard] = useState(null);
    const [copies, setCopies] = useState([]);
    const [matieres, setMatieres] = useState([]);
    const [dashboardData, setDashboardData] = useState([]);
    const [selectedMatiereFilter, setSelectedMatiereFilter] = useState('all');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalContent, setModalContent] = useState({ title: '', codes: [], layout: 'single-column' });
    const [isModalLoading, setIsModalLoading] = useState(false);

    // --- NOUVEAU : État pour la pagination ---
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10; // Limite de 10 lignes par page

    const getAuthHeaders = useCallback(() => ({
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    }), []);

    useEffect(() => {
        const fetchMatieres = async () => {
            try {
                const res = await axios.get(`${API_BASE_URL}/api/matieres`, getAuthHeaders());
                setMatieres(res.data);
            } catch (err) {
                console.error("Erreur chargement matières", err);
            }
        };
        fetchMatieres();
    }, [getAuthHeaders]);

    useEffect(() => {
        const fetchDashboardData = async () => {
             try {
                const res = await axios.get(`${API_BASE_URL}/api/stats/copies-par-matiere`, getAuthHeaders());
                setDashboardData(res.data);
            } catch (err) {
                console.error("Erreur chargement du tableau de bord", err);
            }
        };
        fetchDashboardData();
    }, [getAuthHeaders]);

    // Reset de la page à 1 quand on change de filtre ou de données
    useEffect(() => {
        setCurrentPage(1);
    }, [copies, selectedMatiereFilter]);

    useEffect(() => {
        if (currentView === 'table' || selectedCard) {
            const fetchCopies = async () => {
                setIsLoading(true);
                setError('');
                const matiereIdToFetch = selectedCard ? selectedCard.id : selectedMatiereFilter;
                try {
                    const res = await axios.get(`${API_BASE_URL}/api/copies/notees-non-liees?matiereId=${matiereIdToFetch}`, getAuthHeaders());
                    setCopies(res.data);
                } catch (err) {
                    setError('Erreur lors du chargement des données.');
                    console.error("Erreur chargement copies", err);
                } finally {
                    setIsLoading(false);
                }
            };
            fetchCopies();
        }
    }, [selectedMatiereFilter, selectedCard, currentView, getAuthHeaders]);

    const handleCardClick = (matiere) => {
        setSelectedCard(matiere);
    };

    const handleReturnToDashboard = () => {
        setSelectedCard(null);
    };

    const totalPendingCodes = dashboardData.reduce((total, item) => total + item.avec_note, 0);

    const handleSansNoteClick = async (matiereId, nomMatiere) => {
        document.body.classList.add('modal-print-active');
        setIsModalOpen(true);
        setIsModalLoading(true);
        setModalContent({ title: `Codes sans note pour ${nomMatiere}`, codes: [], layout: 'single-column' });
        try {
            const res = await axios.get(`${API_BASE_URL}/api/codes/sans-note/${matiereId}`, getAuthHeaders());
            const codes = res.data;
            let layout = codes.length > 0 && /^\d+$/.test(codes[0].code) ? 'multi-column' : 'single-column';
            setModalContent({ title: `Codes sans note pour ${nomMatiere}`, codes: codes, layout: layout });
        } catch (err) {
            console.error("Erreur chargement des codes sans note", err);
            setModalContent(prev => ({ ...prev, codes: [{ code: "Erreur de chargement." }] }));
        } finally {
            setIsModalLoading(false);
        }
    };

    const closeModal = () => {
        document.body.classList.remove('modal-print-active');
        setIsModalOpen(false);
    };

    const handlePrint = () => {
        window.print();
    };

    // --- NOUVEAU : Logique de changement de page ---
    const paginate = (pageNumber) => setCurrentPage(pageNumber);

    const CopiesTable = ({ isEmbedded = false }) => {
        // Calcul des index pour la pagination
        const indexOfLastItem = currentPage * itemsPerPage;
        const indexOfFirstItem = indexOfLastItem - itemsPerPage;
        const currentCopies = copies.slice(indexOfFirstItem, indexOfLastItem);
        const totalPages = Math.ceil(copies.length / itemsPerPage);

        return (
            <div className={`card ${isEmbedded ? 'embedded-table' : ''}`}>
                {!isEmbedded && (
                     <h2 className="card-title">Copies Notées en Attente de Liaison</h2>
                )}
                {currentView === 'table' && !selectedCard && (
                     <div className="filter-bar">
                        <label htmlFor="matiere-filter">Filtrer par matière :</label>
                        <select
                            id="matiere-filter"
                            value={selectedMatiereFilter}
                            onChange={(e) => setSelectedMatiereFilter(e.target.value)}>
                            <option value="all">Toutes les matières</option>
                            {matieres.map(m => (
                                <option key={m.id} value={m.id}>{m.nom_matiere}</option>
                            ))}
                        </select>
                    </div>
                )}
                {isLoading ? <p>Chargement...</p> : error ? <p className="error-message">{error}</p> : (
                    <>
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Matière</th>
                                        <th>Code Anonyme</th>
                                        <th>Note / 20</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {currentCopies.length > 0 ? (
                                        currentCopies.map(copie => (
                                            <tr key={copie.id}>
                                                <td>{copie.nom_matiere}</td>
                                                <td>{copie.code_anonyme}</td>
                                                <td>{copie.note}</td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="3">Aucune copie notée trouvée pour ce filtre.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        
                        {/* --- NOUVEAU : Contrôles de Pagination --- */}
                        {copies.length > 0 && (
                            <div className="pagination-container">
                                <div className="pagination-info">
                                    Affichage de {indexOfFirstItem + 1} à {Math.min(indexOfLastItem, copies.length)} sur {copies.length} copies
                                </div>
                                <div className="pagination-buttons">
                                    <button 
                                        onClick={() => paginate(currentPage - 1)} 
                                        disabled={currentPage === 1}
                                        className="btn-page"
                                    >
                                        &larr; Précédent
                                    </button>
                                    <span className="page-number">Page {currentPage} / {totalPages}</span>
                                    <button 
                                        onClick={() => paginate(currentPage + 1)} 
                                        disabled={currentPage === totalPages}
                                        className="btn-page"
                                    >
                                        Suivant &rarr;
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        );
    };

    return (
        <div className="page-container">
            <header className="main-header">
                <h1>Gestion de l'Anonymat</h1>
                <div className="view-selector">
                    <button
                        className={`btn-view ${currentView === 'dashboard' ? 'active' : ''}`}
                        onClick={() => { setCurrentView('dashboard'); setSelectedCard(null); }}>
                        Tableau de Bord
                    </button>
                    <button
                        className={`btn-view ${currentView === 'table' ? 'active' : ''}`}
                        onClick={() => { setCurrentView('table'); setSelectedCard(null); }}>
                        Copies en Attente
                        {totalPendingCodes > 0 && <span className="badge-notification">{totalPendingCodes}</span>}
                    </button>
                </div>
            </header>

            {currentView === 'dashboard' && (
                <div className="dashboard-wrapper">
                    {selectedCard ? (
                        <div className="selected-view-container">
                            <div className="selected-card-panel">
                                <button onClick={handleReturnToDashboard} className="btn-back">
                                    &larr; Retour
                                </button>
                                <div key={selectedCard.id} className="dashboard-item is-selected">
                                    <h4>{selectedCard.nom_matiere}</h4>
                                    <span className="badge badge-success">Avec note: {selectedCard.avec_note}</span>
                                    <span
                                        className={`badge badge-warning ${selectedCard.sans_note > 0 ? 'clickable-badge' : ''}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleSansNoteClick(selectedCard.id, selectedCard.nom_matiere);
                                        }}>
                                        Sans note: {selectedCard.sans_note}
                                    </span>
                                </div>
                            </div>
                            <div className="table-panel">
                                <CopiesTable isEmbedded={true} />
                            </div>
                        </div>
                    ) : (
                        <div className="card">
                            <h2 className="card-title">Statistiques par Matière</h2>
                            <div className="dashboard-container">
                                {dashboardData.map(item => (
                                    <div key={item.id} className="dashboard-item" onClick={() => handleCardClick(item)}>
                                        <h4>{item.nom_matiere}</h4>
                                        <span className="badge badge-success">Avec note: {item.avec_note}</span>
                                        <span
                                            className={`badge badge-warning ${item.sans_note > 0 ? 'clickable-badge' : ''}`}
                                            onClick={(e) => {
                                                if (item.sans_note > 0) {
                                                    e.stopPropagation();
                                                    handleSansNoteClick(item.id, item.nom_matiere);
                                                }
                                            }}>
                                            Sans note: {item.sans_note}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {currentView === 'table' && <CopiesTable />}

            {isModalOpen && (
                 <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3>{modalContent.title}</h3>
                            <button onClick={closeModal} className="close-btn">&times;</button>
                        </div>
                        <div className="modal-body">
                             <h3 className="print-only-title">{modalContent.title}</h3>
                            {isModalLoading ? <p>Chargement...</p> : (
                                <ul className={`code-list ${modalContent.layout}`}>
                                    {modalContent.codes.length > 0 ? (
                                        modalContent.codes.map((c, index) => <li key={index}>{c.code}</li>)
                                    ) : (
                                        <li>Aucun code sans note trouvé.</li>
                                    )}
                                </ul>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button onClick={handlePrint} className="print-btn">Imprimer la liste</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default CopiesNotees;
