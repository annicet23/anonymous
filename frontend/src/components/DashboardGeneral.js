import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import DashboardModal from './DashboardModal';
import StudentDetailsModal from './StudentDetailsModal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import './DashboardRedesign.css';

const documentsList = [
    { id: 1, title: 'Liste des matieres aux examens', file: '/documents/LISTE DES MATIERES AUX EXAMENS.pdf' },
    { id: 2, title: 'Referentiele de formation de 79 em cours', file: '/documents/REFERENTIEL DE COMPETENCE ET DE FORMATION EG MISE A JOUR 14 FEV 25 OK.pdf' },
    { id: 3, title: 'Exécution des punitions', file: '/documents/Exécution des punitions.pdf' },
    { id: 4, title: 'Redoublement - Ajournement - Radiation', file: '/documents/REDOUBLEMENT-AJOURNEMENT-COMMISSION DE CONTRAT-RADIATION.pdf' },
    { id: 5, title: 'Sanctions', file: '/documents/sanction.pdf' }
];

const formatNom = (nom) => nom ? nom.toUpperCase() : '';
const formatPrenom = (prenom) => {
    if (!prenom) return '';
    return prenom.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

const StatCardRedesign = ({ title, value, subValue, onClick, highlight = false, isLoading = false, extraClass = '' }) => (
    <div className={`stat-card-redesign ${onClick ? 'clickable' : ''} ${highlight ? 'highlight' : ''} ${extraClass}`} onClick={onClick}>
        <h4>{title}</h4>
        <p>{isLoading ? '...' : value}</p>
        {subValue && <span style={{ fontSize: '0.8rem', color: '#666' }}>{subValue}</span>}
    </div>
);

const StatCardInput = ({ title, count, threshold, onThresholdChange, onClick }) => {
    const [isOpen, setIsOpen] = useState(true);
    return (
        <div className={`stat-card-redesign input-card ${isOpen ? 'clickable' : ''}`} onClick={isOpen ? onClick : undefined}>
            <div className="card-header-row">
                <h4>{title}</h4>
                <div onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }} style={{ cursor: 'pointer' }}>
                    <i className={`fa ${isOpen ? 'fa-eye' : 'fa-eye-slash'}`}></i>
                </div>
            </div>
            {isOpen && (
                <div className="card-content-wrapper">
                    <div className="input-wrapper" onClick={(e) => e.stopPropagation()}>
                        <label>Seuil &lt; </label>
                        <input type="number" step="0.1" value={threshold} onChange={(e) => onThresholdChange(e.target.value)} className="stat-input" />
                    </div>
                    <p className="highlight-text">{count} Élèves</p>
                </div>
            )}
        </div>
    );
};

const SidebarStatItem = ({ label, value }) => (
    <li className="sidebar-stat-item">
        <span className="stat-label">{label}</span>
        <span className="stat-value">{value}</span>
    </li>
);

const generatePdfHeader = (doc, titleOverride = null) => {
    return (data) => {
        if (data.pageNumber === 1) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.text("SECRETARIAT D'ETAT / CGN / EGN AMBOSITRA", 55, 15, { align: 'center' });
            doc.text("REPOBLIKAN'I MADAGASIKARA", 155, 15, { align: 'center' });
            doc.setFontSize(11); doc.setFont("helvetica", "bold");
            const mainTitle = titleOverride ? titleOverride.toUpperCase() : "ETAT FAISANT CONNAITRE LES RESULTATS";
            doc.text(mainTitle, 105, 60, { align: 'center' });
        }
    };
};

const DashboardGeneral = () => {
    const [generalData, setGeneralData] = useState(null);
    const [detailedRanking, setDetailedRanking] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [classementWithDetails, setClassementWithDetails] = useState([]);
    const [isDataReady, setIsDataReady] = useState(false);
    const [motifStats, setMotifStats] = useState([]);
    const [modalData, setModalData] = useState(null);
    const [modalTitle, setModalTitle] = useState('');
    const [modalColumns, setModalColumns] = useState([]);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isDocModalOpen, setIsDocModalOpen] = useState(false);
    const [selectedPdf, setSelectedPdf] = useState(null);
    const [ajournementThreshold, setAjournementThreshold] = useState(9.0);
    const [loadingProgress, setLoadingProgress] = useState(0);

    const [isConseilModalOpen, setIsConseilModalOpen] = useState(false);
    const [decisionsSaved, setDecisionsSaved] = useState([]);
    const [quotas, setQuotas] = useState({ ajour3: 0, ajour6: 0, redouble: 0, radiation: 0 });
    const [searchStudent, setSearchStudent] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [selectedType, setSelectedType] = useState('ajournement_3m');
    const [selectedMotif, setSelectedMotif] = useState('Santé');
    const [editingDecision, setEditingDecision] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const token = localStorage.getItem('token');
                const headers = { Authorization: `Bearer ${token}` };
                const [summaryRes, rankingRes, decisionsRes] = await Promise.all([
                    axios.get('/api/dashboard/general-summary', { headers }),
                    axios.get('/api/resultats/classement-details?typeExamen=General', { headers }),
                    axios.get('/api/decisions-conseil', { headers })
                ]);
                setGeneralData(summaryRes.data);
                setDetailedRanking(rankingRes.data.classement || []);
                setDecisionsSaved(decisionsRes.data || []);
            } catch (err) { setError('Erreur de chargement'); } finally { setLoading(false); }
        };
        fetchData();
    }, []);

    const fetchDecisions = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get('/api/decisions-conseil', { headers: { Authorization: `Bearer ${token}` } });
            setDecisionsSaved(res.data);
        } catch (e) { }
    };

    const handleSearchEleve = async (query) => {
        setSearchStudent(query);
        if (query.length > 1) {
            try {
                const token = localStorage.getItem('token');
                const res = await axios.get(`/api/eleves/recherche?q=${query}`, { headers: { Authorization: `Bearer ${token}` } });
                setSearchResults(res.data);
            } catch (e) { }
        } else setSearchResults([]);
    };

    const handleSelectFromSearch = async (eleve) => {
        try {
            const token = localStorage.getItem('token');
            await axios.post('/api/decisions-conseil', { eleve_id: eleve.id, type_decision: selectedType, motif: selectedMotif }, { headers: { Authorization: `Bearer ${token}` } });
            fetchDecisions(); setSearchStudent(''); setSearchResults([]);
        } catch (e) { alert("Erreur: Déjà présent."); }
    };

    const handleAddOrUpdateDecision = async () => {
        const token = localStorage.getItem('token');
        try {
            if (editingDecision) {
                await axios.put(`/api/decisions-conseil/${editingDecision.id}`, { type_decision: selectedType, motif: selectedMotif }, { headers: { Authorization: `Bearer ${token}` } });
                setEditingDecision(null); setSearchStudent(''); fetchDecisions();
            }
        } catch (e) { }
    };

    const handleDeleteDecision = async (id) => {
        if (!window.confirm("Voulez-vous supprimer cette décision ?")) return;
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`/api/decisions-conseil/${id}`, { headers: { Authorization: `Bearer ${token}` } });
            fetchDecisions();
        } catch (e) { }
    };

    const handleEditClick = (d) => {
        setEditingDecision(d); setSelectedType(d.type_decision); setSelectedMotif(d.motif);
        setSearchStudent(`${formatNom(d.nom)} ${formatPrenom(d.prenom)}`);
    };

    const getRestant = (type, key) => {
        const utilise = decisionsSaved.filter(d => d.type_decision === type).length;
        const res = quotas[key] - utilise;
        return res < 0 ? 0 : res;
    };

    useEffect(() => {
        if (!detailedRanking || detailedRanking.length === 0 || isDataReady) return;
        const fetchExtra = async () => {
            let enriched = []; let motifsCount = {};
            const sancRes = await axios.get('http://192.168.241.169:4000/api/sanctions');
            const allSanctions = sancRes.data || [];
            for (let i = 0; i < detailedRanking.length; i++) {
                const s = detailedRanking[i];
                const [cRes, aRes] = await Promise.allSettled([
                    axios.get(`http://192.168.241.169:4000/api/consultation/incorp/${s.numero_incorporation}`),
                    axios.get(`http://192.168.241.169:4000/api/absence/incorp/${s.numero_incorporation}`)
                ]);
                const cData = cRes.status === 'fulfilled' ? cRes.value.data : [];
                const aData = aRes.status === 'fulfilled' ? aRes.value.data : [];
                cData.forEach(c => { if(c.service) motifsCount[c.service] = (motifsCount[c.service] || 0) + 1; });
                aData.forEach(a => { if(a.motif) motifsCount[a.motif] = (motifsCount[a.motif] || 0) + 1; });
                const studentSanc = allSanctions.filter(sa => sa.Eleve && String(sa.Eleve.numeroIncorporation) === String(s.numero_incorporation));
                enriched.push({ ...s, consultationDays: cData.length, sanctionCount: studentSanc.length, totalARDays: studentSanc.length });
                setLoadingProgress(Math.round(((i + 1) / detailedRanking.length) * 100));
            }
            setMotifStats(Object.keys(motifsCount).map(k => ({ motif: k, count: motifsCount[k] })));
            setClassementWithDetails(enriched); setIsDataReady(true);
        };
        fetchExtra();
    }, [detailedRanking, isDataReady]);

    const handleExportPDF = () => {
        const doc = new jsPDF();
        autoTable(doc, { head: [['RANG', 'NOM COMPLET', 'INCORP', 'MOYENNE']], body: classementWithDetails.map(s => [s.rang, `${formatNom(s.nom)} ${formatPrenom(s.prenom)}`, s.numero_incorporation, s.moyenne]), didDrawPage: generatePdfHeader(doc) });
        doc.save("Resultats.pdf");
    };

    const handleExportExcel = () => {
        const ws = XLSX.utils.json_to_sheet(classementWithDetails);
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Resultats");
        XLSX.writeFile(wb, "Resultats.xlsx");
    };

    const handleExportModalPDF = () => {
        const doc = new jsPDF(); autoTable(doc, { head: [modalColumns.filter(c => c.key !== 'actionBtn').map(c => c.header)], body: modalData.map(d => modalColumns.filter(c => c.key !== 'actionBtn').map(c => d[c.key])) });
        doc.save(`${modalTitle}.pdf`);
    };

    const generateActionBtn = (s) => ( <button className="btn-details-action" onClick={(e) => { e.stopPropagation(); setModalData(null); setSelectedStudent(s); }}> <i className="fa fa-eye"></i> Voir </button> );

    const handleSup12Click = () => {
        const list = classementWithDetails.filter(s => parseFloat(s.moyenne) >= 12).map(s => ({ ...s, actionBtn: generateActionBtn(s) }));
        setModalTitle("Élèves Moyenne ≥ 12"); setModalColumns([{key:'nom', header:'Nom'},{key:'moyenne', header:'Moyenne'},{key:'actionBtn', header:'Action'}]); setModalData(list);
    };

    const handleInf12Click = () => {
        const list = classementWithDetails.filter(s => parseFloat(s.moyenne) < 12).map(s => ({ ...s, actionBtn: generateActionBtn(s) }));
        setModalTitle("Élèves Moyenne < 12"); setModalColumns([{key:'nom', header:'Nom'},{key:'moyenne', header:'Moyenne'},{key:'actionBtn', header:'Action'}]); setModalData(list);
    };

    const handlePropositionAjournementClick = () => {
        const list = classementWithDetails.filter(s => parseFloat(s.moyenne) < ajournementThreshold).map(s => ({ ...s, actionBtn: generateActionBtn(s) }));
        setModalTitle("Proposition Ajournement"); setModalColumns([{key:'nom', header:'Nom'},{key:'moyenne', header:'Moyenne'},{key:'actionBtn', header:'Action'}]); setModalData(list);
    };

    const handleRedoublementClick = () => {
        const list = classementWithDetails.filter(s => s.consultationDays >= 60 || s.moyenne < 8).map(s => ({ ...s, actionBtn: generateActionBtn(s) }));
        setModalTitle("Proposition Redoublement"); setModalColumns([{key:'nom', header:'Nom'},{key:'moyenne', header:'Moyenne'},{key:'actionBtn', header:'Action'}]); setModalData(list);
    };

    const handleMotifStatsClick = () => { setModalTitle("Motifs"); setModalColumns([{key:'motif', header:'Motif'},{key:'count', header:'Nombre'}]); setModalData(motifStats); };
    const handleConsultationClick = () => { setModalTitle("Santé"); setModalColumns([{key:'nom', header:'Nom'},{key:'consultationDays', header:'Jours'}]); setModalData(classementWithDetails.filter(s => s.consultationDays > 0)); };
    const handleSanctionsClick = () => { setModalTitle("Sanctions"); setModalColumns([{key:'nom', header:'Nom'},{key:'sanctionCount', header:'Nombre'}]); setModalData(classementWithDetails.filter(s => s.sanctionCount > 0)); };

    const filteredRanking = classementWithDetails.filter(s => `${s.nom} ${s.prenom} ${s.numero_incorporation}`.toLowerCase().includes(searchTerm.toLowerCase()));

    if (loading) return <div className="loader-wrapper"><p className="text">Chargement... {loadingProgress}%</p></div>;

    const { classementMatieres } = generalData;
    const matieresReussite = classementMatieres.filter(m => parseFloat(m.moyenne) >= 12);
    const matieresEchec = classementMatieres.filter(m => parseFloat(m.moyenne) < 12);

    return (
        <div className="dashboard-redesign-container">
            {modalData && <DashboardModal title={modalTitle} data={modalData} columns={modalColumns} onClose={() => setModalData(null)} onExport={handleExportModalPDF} />}
            {selectedStudent && <StudentDetailsModal student={selectedStudent} typeExamen="General" onClose={() => setSelectedStudent(null)} />}

            <div className="top-nav-bar">
                <Link to="/dashboard" className="back-link">&larr; Retour</Link>
                <div className="export-buttons">
                    <button onClick={() => setIsConseilModalOpen(true)} className="btn-export" style={{ backgroundColor: '#6c757d' }}><i className="fa fa-gavel"></i> Conseil de Formation</button>
                    <button onClick={handleExportPDF} className="btn-export pdf-btn" disabled={!isDataReady}>PDF Officiel</button>
                    <button onClick={handleExportExcel} className="btn-export excel-btn" disabled={!isDataReady}>Excel</button>
                </div>
            </div>

            <div className="dashboard-redesign-header">
                <h1>Synthèse Générale</h1>
                <div className="stats-grid">
                    <StatCardRedesign title="Effectif Total" value={detailedRanking.length} />
                    <StatCardRedesign title="Moyenne ≥ 12" value={classementWithDetails.filter(s => parseFloat(s.moyenne) >= 12).length} highlight onClick={handleSup12Click} />
                    <StatCardRedesign title="Moyenne < 12" value={classementWithDetails.filter(s => parseFloat(s.moyenne) < 12).length} onClick={handleInf12Click} />
                    <StatCardInput title="Prop. Ajournement" count={classementWithDetails.filter(s => parseFloat(s.moyenne) < ajournementThreshold).length} threshold={ajournementThreshold} onThresholdChange={setAjournementThreshold} onClick={handlePropositionAjournementClick} />
                    <StatCardRedesign title="Prop. Redoublement" value={classementWithDetails.filter(s => s.consultationDays >= 60 || s.moyenne < 8).length} onClick={handleRedoublementClick} extraClass="redoublement-card" />
                    <StatCardRedesign title="Répartition Motifs" value={motifStats.length} onClick={handleMotifStatsClick} />
                    <StatCardRedesign title="Santé Total" value={classementWithDetails.filter(s => s.consultationDays > 0).length} onClick={handleConsultationClick} />
                    <StatCardRedesign title="Sanctions" value={classementWithDetails.filter(s => s.sanctionCount > 0).length} onClick={handleSanctionsClick} />
                </div>
            </div>

            <div className="dashboard-examen-layout">
                <div className="sidebar-area">
                    <div className="card">
                        <h3>Matières ≥ 12 ({matieresReussite.length})</h3>
                        <ul className="sidebar-stats-list">{matieresReussite.map(m => <SidebarStatItem key={m.nom_matiere} label={m.nom_matiere} value={parseFloat(m.moyenne).toFixed(2)} />)}</ul>
                    </div>
                    <div className="card">
                        <h3>Matières &lt; 12 ({matieresEchec.length})</h3>
                        <ul className="sidebar-stats-list">{matieresEchec.map(m => <SidebarStatItem key={m.nom_matiere} label={m.nom_matiere} value={parseFloat(m.moyenne).toFixed(2)} />)}</ul>
                    </div>
                </div>
                <div className="main-content-area">
                    <div className="ranking-card">
                        <div className="ranking-card-header">
                            <h3>Classement Général</h3>
                            <input type="text" placeholder="Recherche..." className="search-input" onChange={e => setSearchTerm(e.target.value)} />
                        </div>
                        <div className="table-responsive-dashboard">
                            <table>
                                <thead><tr><th>Rang</th><th>Nom Complet</th><th>N° INC</th><th>Moyenne</th><th>Statut</th></tr></thead>
                                <tbody>
                                    {filteredRanking.map((s, i) => (
                                        <tr key={i} onClick={() => setSelectedStudent(s)} className="clickable-row">
                                            <td><strong>{s.rang}</strong></td>
                                            <td>{formatNom(s.nom)} {formatPrenom(s.prenom)}</td>
                                            <td>{s.numero_incorporation}</td>
                                            <td>{s.moyenne}</td>
                                            <td>
                                                <div className="badges-container">
                                                    {decisionsSaved.some(d => d.eleve_id === s.id) && <span className="status-badge" style={{ backgroundColor: '#6f42c1' }}>CONSEIL</span>}
                                                    {(s.consultationDays >= 60 || s.moyenne < 8) && <span className="status-badge" style={{ backgroundColor: '#000' }}>RED?</span>}
                                                    {s.consultationDays > 0 && <span className="status-badge consultation-badge">{s.consultationDays}j</span>}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {isConseilModalOpen && (
                <div className="doc-modal-overlay">
                    <div className="doc-modal-content" style={{ width: '95%', maxWidth: '1350px' }}>
                        <div className="doc-modal-header">
                            <h3>Conseil de Formation</h3>
                            <button className="close-doc-btn" onClick={() => { setIsConseilModalOpen(false); setEditingDecision(null); }}>&times;</button>
                        </div>
                        <div className="doc-modal-body" style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '25px' }}>
                            <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '8px', border: '1px solid #ddd' }}>
                                <h4>{editingDecision ? '📝 Modifier' : '➕ Ajouter'}</h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px' }}>
                                    <label style={{ fontSize: '0.75rem' }}>Ajour. 3m ({getRestant('ajournement_3m','ajour3')}) <input type="number" className="stat-input" value={quotas.ajour3} onChange={e=>setQuotas({...quotas,ajour3:e.target.value})}/></label>
                                    <label style={{ fontSize: '0.75rem' }}>Ajour. 6m ({getRestant('ajournement_6m','ajour6')}) <input type="number" className="stat-input" value={quotas.ajour6} onChange={e=>setQuotas({...quotas,ajour6:e.target.value})}/></label>
                                    <label style={{ fontSize: '0.75rem' }}>Redoubl. ({getRestant('redoublement','redouble')}) <input type="number" className="stat-input" value={quotas.redouble} onChange={e=>setQuotas({...quotas,redouble:e.target.value})}/></label>
                                    <label style={{ fontSize: '0.75rem' }}>Radiation ({getRestant('radiation','radiation')}) <input type="number" className="stat-input" value={quotas.radiation} onChange={e=>setQuotas({...quotas,radiation:e.target.value})}/></label>
                                </div>
                                <select className="search-input" style={{ width: '100%', marginBottom: '10px' }} value={selectedType} onChange={e => setSelectedType(e.target.value)}>
                                    <option value="ajournement_3m">Ajournement 3 mois</option><option value="ajournement_6m">Ajournement 6 mois</option><option value="redoublement">Redoublement</option><option value="radiation">Remise à la famille</option>
                                </select>
                                <select className="search-input" style={{ width: '100%', marginBottom: '10px' }} value={selectedMotif} onChange={e => setSelectedMotif(e.target.value)}>
                                    <option value="Santé">Santé</option><option value="Insuffisance Intellectuelle">Insuffisance Intellectuelle</option><option value="Discipline">Discipline</option>
                                </select>
                                {!editingDecision && (
                                    <>
                                        <input type="text" className="search-input" placeholder="Chercher élève..." value={searchStudent} onChange={e => handleSearchEleve(e.target.value)} />
                                        <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid #eee', marginTop: '5px', backgroundColor: '#fff' }}>
                                            {searchResults.map(e => (
                                                <div key={e.id} className="clickable-row" style={{ padding: '10px', display: 'flex', justifyContent: 'space-between' }} onClick={() => handleSelectFromSearch(e)}>
                                                    <span>{e.numero_incorporation} - {formatNom(e.nom)} {formatPrenom(e.prenom)}</span>
                                                    <i className="fa fa-plus-circle" style={{ color: 'green' }}></i>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                                {editingDecision && (
                                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                        <button className="btn-export excel-btn" style={{ flex: 1 }} onClick={handleAddOrUpdateDecision}>Enregistrer</button>
                                        <button className="btn-export pdf-btn" style={{ flex: 1 }} onClick={() => { setEditingDecision(null); setSearchStudent(''); }}>Annuler</button>
                                    </div>
                                )}
                            </div>
                            <div className="table-responsive-dashboard">
                                <table>
                                    <thead><tr><th>N° INC</th><th>NOM COMPLET</th><th>DÉCISION</th><th>MOTIF</th><th style={{ textAlign: 'center' }}>ACTIONS</th></tr></thead>
                                    <tbody>
                                        {decisionsSaved.map(d => (
                                            <tr key={d.id}>
                                                <td><strong>{d.numero_incorporation}</strong></td>
                                                <td>{formatNom(d.nom)} {formatPrenom(d.prenom)}</td>
                                                <td><span className="status-badge" style={{ backgroundColor: '#3751FF' }}>{d.type_decision.replace('_', ' ')}</span></td>
                                                <td>{d.motif}</td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <i className="fa fa-pencil" style={{ color: '#ffc107', cursor: 'pointer', marginRight: '15px', fontSize:'1.2rem' }} onClick={() => handleEditClick(d)}></i>
                                                    <i className="fa fa-trash" style={{ color: '#dc3545', cursor: 'pointer', fontSize:'1.2rem' }} onClick={() => handleDeleteDecision(d.id)}></i>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <button className="floating-doc-btn" onClick={() => setIsDocModalOpen(true)} title="Documentation"><i className="fa fa-book"></i> Documentation</button>
        </div>
    );
};
export default DashboardGeneral;
