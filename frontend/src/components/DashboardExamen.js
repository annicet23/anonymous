import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import DashboardModal from './DashboardModal';
import StudentDetailsModal from './StudentDetailsModal';
import './DashboardRedesign.css';

// MODIFICATION ICI : Ajout de subValue pour afficher le pourcentage
const StatCardRedesign = ({ title, value, subValue, onClick, highlight = false, isLoading = false }) => (
    <div className={`stat-card-redesign ${onClick ? 'clickable' : ''} ${highlight ? 'highlight' : ''}`} onClick={onClick}>
        <h4>{title}</h4>
        <p>{isLoading ? '...' : value}</p>
        {subValue && <span style={{ fontSize: '0.8rem', color: '#666' }}>{subValue}</span>}
    </div>
);

const SidebarStatItem = ({ label, value }) => (
    <li className="sidebar-stat-item">
        <span className="stat-label">{label}</span>
        <span className="stat-value">{value}</span>
    </li>
);

const DashboardExamen = () => {
    const { typeExamen } = useParams();

    const [summary, setSummary] = useState(null);
    const [details, setDetails] = useState(null);
    const [subjectStats, setSubjectStats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [modalData, setModalData] = useState(null);
    const [modalTitle, setModalTitle] = useState('');
    const [modalColumns, setModalColumns] = useState([]);
    const [isModalLoading, setIsModalLoading] = useState(false);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    const [classementWithDetails, setClassementWithDetails] = useState([]);
    const [isDataReady, setIsDataReady] = useState(false);

    useEffect(() => {
        if (!typeExamen) return;

        setClassementWithDetails([]);
        setIsDataReady(false);
        setLoading(true);

        const fetchData = async () => {
            try {
                const token = localStorage.getItem('token');
                const headers = { Authorization: `Bearer ${token}` };
                const [summaryRes, detailsRes, subjectsRes] = await Promise.all([
                    axios.get('/api/dashboard/summary-by-exam-type', { headers }),
                    axios.get(`/api/resultats/classement-details?typeExamen=${typeExamen}`, { headers }),
                    axios.get(`/api/dashboard/exam-subject-stats/${typeExamen}`, { headers })
                ]);

                const examSummary = summaryRes.data.find(e => e.typeExamen === typeExamen);

                if (examSummary && detailsRes.data && subjectsRes.data) {
                    setSummary(examSummary);
                    setDetails(detailsRes.data);
                    setSubjectStats(subjectsRes.data);
                } else {
                    setError(`Aucune donnée pour l'examen : ${typeExamen.replace(/_/g, ' ')}`);
                }
            } catch (err) {
                setError('Impossible de charger les données.');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [typeExamen]);

    useEffect(() => {
        if (!details || details.classement.length === 0) return;
        if (isDataReady) return;

        const calculateDaysBetween = (startDate, endDate) => {
            if (!startDate || !endDate) return 0;
            const start = new Date(startDate);
            const end = new Date(endDate);
            if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
            const diffTime = Math.abs(end - start);
            return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        };

        const fetchAllExtraData = async () => {
            const rawStudents = details.classement;
            const BATCH_SIZE = 5;
            let allEnrichedStudents = [];

            try {
                let allSanctions = [];
                try {
                    const sanctionsResponse = await axios.get('http://192.168.241.169:4000/api/sanctions');
                    allSanctions = sanctionsResponse.data || [];
                } catch (e) {
                    console.error("Erreur chargement sanctions globales", e);
                }

                for (let i = 0; i < rawStudents.length; i += BATCH_SIZE) {
                    const batch = rawStudents.slice(i, i + BATCH_SIZE);

                    const batchPromises = batch.map(async (student) => {
                        try {
                            const [consultRes, absenceRes] = await Promise.allSettled([
                                axios.get(`http://192.168.241.169:4000/api/consultation/incorp/${student.numero_incorporation}`),
                                axios.get(`http://192.168.241.169:4000/api/absence/eleve/${student.id}`)
                            ]);

                            let consultationDays = 0;
                            if (consultRes.status === 'fulfilled' && consultRes.value.data && Array.isArray(consultRes.value.data)) {
                                consultationDays = consultRes.value.data.reduce((total, consult) => {
                                    return total + (calculateDaysBetween(consult.dateDepart, consult.dateArrive) || 0);
                                }, 0);
                            }

                            let absenceDays = 0;
                            if (absenceRes.status === 'fulfilled' && absenceRes.value.data && Array.isArray(absenceRes.value.data)) {
                                absenceDays = absenceRes.value.data.length;
                            }

                            const studentIncorp = String(student.numero_incorporation || '').trim();
                            const sanctionsForStudent = allSanctions.filter(s =>
                                s.Eleve && String(s.Eleve.numeroIncorporation).trim() === studentIncorp
                            );
                            const sanctionCount = sanctionsForStudent.length;

                            return { ...student, consultationDays, absenceDays, sanctionCount };
                        } catch (innerErr) {
                            return { ...student, consultationDays: 0, absenceDays: 0, sanctionCount: 0 };
                        }
                    });

                    const batchResults = await Promise.all(batchPromises);
                    allEnrichedStudents = [...allEnrichedStudents, ...batchResults];
                }

                setClassementWithDetails(allEnrichedStudents);
                setIsDataReady(true);

            } catch (err) {
                console.error("Erreur batch load", err);
                setClassementWithDetails(rawStudents);
                setIsDataReady(true);
            }
        };

        fetchAllExtraData();

    }, [details, isDataReady]);

    const showModalWithData = (title, columns, data) => {
        setModalTitle(title);
        setModalColumns(columns);
        setModalData(data);
        setIsModalLoading(false);
    };

    const handleStudentSelectFromModal = (student) => {
        setModalData(null);
        setSelectedStudent(student);
    };

    const handleConsultationClick = () => {
        if (!isDataReady) return;

        const elevesEnConsultation = classementWithDetails.filter(s => s.consultationDays > 0);
        const sortedData = [...elevesEnConsultation].sort((a, b) => b.consultationDays - a.consultationDays);

        const modalDisplayData = sortedData.map(s => ({
            ...s,
            nomComplet: `${s.prenom} ${s.nom}`,
            actionBtn: (
                <button
                    className="btn-details-action"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleStudentSelectFromModal(s);
                    }}
                >
                    <i className="fa fa-eye"></i> Détail
                </button>
            )
        }));

        const modalColumns = [
            { key: 'rang', header: 'Rang' },
            { key: 'nomComplet', header: 'Nom Complet' },
            { key: 'consultationDays', header: 'Jours de Consultation' },
            { key: 'actionBtn', header: 'Action' }
        ];

        showModalWithData('Élèves avec le plus de jours de consultation', modalColumns, modalDisplayData);
    };

    const handleSanctionsClick = () => {
        if (!isDataReady) return;

        const elevesSanctionnes = classementWithDetails.filter(s => s.sanctionCount > 0);
        const sortedData = [...elevesSanctionnes].sort((a, b) => b.sanctionCount - a.sanctionCount);

        const modalDisplayData = sortedData.map(s => ({
            ...s,
            nomComplet: `${s.prenom} ${s.nom}`,
            incorporation: s.numero_incorporation,
            sanctionCountDisplay: `${s.sanctionCount} sanction(s)`,
            actionBtn: (
                <button
                    className="btn-details-action"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleStudentSelectFromModal(s);
                    }}
                    style={{
                        backgroundColor: '#3751FF',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '5px 10px',
                        cursor: 'pointer',
                        fontSize: '0.85rem'
                    }}
                >
                    <i className="fa fa-eye"></i> Détail
                </button>
            )
        }));

        const modalColumns = [
            { key: 'rang', header: 'Rang' },
            { key: 'nomComplet', header: 'Nom Complet' },
            { key: 'incorporation', header: 'Incorp.' },
            { key: 'sanctionCountDisplay', header: 'Nombre' },
            { key: 'actionBtn', header: 'Action' }
        ];

        showModalWithData('Liste des Élèves Sanctionnés', modalColumns, modalDisplayData);
    };


    if (loading) return <div className="card"><h2>Chargement...</h2></div>;
    if (error) return <div className="card"><h2>{error}</h2></div>;
    if (!summary || !details) return <div className="card"><h2>Aucune donnée disponible.</h2></div>;

    const sourceData = isDataReady ? classementWithDetails : details.classement;
    const totalStudents = sourceData.length;

    const elevesEnDifficulte = sourceData.filter(s => s.moyenne !== null && parseFloat(s.moyenne) < 10);
    const matieresReussite = subjectStats.filter(m => m.moyenne >= 12);
    const matieresEchec = subjectStats.filter(m => m.moyenne < 12);

    const studentsSup12 = sourceData.filter(s => s.moyenne !== null && parseFloat(s.moyenne) >= 12);
    const countSup12 = studentsSup12.length;
    const percentSup12 = totalStudents > 0 ? ((countSup12 / totalStudents) * 100).toFixed(1) : '0.0';

    const studentsInf12 = sourceData.filter(s => s.moyenne !== null && parseFloat(s.moyenne) < 12);
    const countInf12 = studentsInf12.length;
    const percentInf12 = totalStudents > 0 ? ((countInf12 / totalStudents) * 100).toFixed(1) : '0.0';

    // --- NOUVEAU : Calcul Dynamique Min / Max ---
    const validMoyennes = sourceData
        .filter(s => s.moyenne !== null)
        .map(s => parseFloat(s.moyenne));
    
    // Calcul des valeurs
    const minMoyenneVal = validMoyennes.length > 0 ? Math.min(...validMoyennes).toFixed(2) : '0.00';
    const maxMoyenneVal = validMoyennes.length > 0 ? Math.max(...validMoyennes).toFixed(2) : '0.00';

    // Récupération des élèves correspondants pour la modale
    const studentsWithMin = sourceData.filter(s => s.moyenne !== null && parseFloat(s.moyenne).toFixed(2) === minMoyenneVal);
    const studentsWithMax = sourceData.filter(s => s.moyenne !== null && parseFloat(s.moyenne).toFixed(2) === maxMoyenneVal);
    // --------------------------------------------

    const countConsultations = isDataReady
        ? classementWithDetails.filter(s => s.consultationDays > 0).length
        : '...';

    const countSanctions = isDataReady
        ? classementWithDetails.filter(s => s.sanctionCount > 0).length
        : '...';

    const handleSup12Click = () => {
        const displayData = studentsSup12.map(s => ({
            ...s,
            nomComplet: `${s.prenom} ${s.nom}`,
            actionBtn: (
                <button
                    className="btn-details-action"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleStudentSelectFromModal(s);
                    }}
                >
                    <i className="fa fa-eye"></i> Détail
                </button>
            )
        }));
        showModalWithData('Élèves Moyenne ≥ 12',
            [
                { key: 'rang', header: 'Rang' },
                { key: 'nomComplet', header: 'Nom' },
                { key: 'moyenne', header: 'Moyenne' },
                { key: 'actionBtn', header: 'Action' }
            ],
            displayData
        );
    };

    const handleInf12Click = () => {
        const displayData = studentsInf12.map(s => ({
            ...s,
            nomComplet: `${s.prenom} ${s.nom}`,
            actionBtn: (
                <button
                    className="btn-details-action"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleStudentSelectFromModal(s);
                    }}
                >
                    <i className="fa fa-eye"></i> Détail
                </button>
            )
        }));
        showModalWithData('Élèves Moyenne < 12',
            [
                { key: 'rang', header: 'Rang' },
                { key: 'nomComplet', header: 'Nom' },
                { key: 'moyenne', header: 'Moyenne' },
                { key: 'actionBtn', header: 'Action' }
            ],
            displayData
        );
    };

    // --- NOUVEAU : Handlers pour Min et Max ---
    const handleMaxClick = () => {
        const displayData = studentsWithMax.map(s => ({
            ...s,
            nomComplet: `${s.prenom} ${s.nom}`,
            actionBtn: <button className="btn-details-action" onClick={(e) => { e.stopPropagation(); handleStudentSelectFromModal(s); }}><i className="fa fa-eye"></i> Détail</button>
        }));
        showModalWithData(`Meilleure Moyenne (${maxMoyenneVal})`, [{ key: 'rang', header: 'Rang' }, { key: 'nomComplet', header: 'Nom' }, { key: 'moyenne', header: 'Moyenne' }, { key: 'actionBtn', header: 'Action' }], displayData);
    };

    const handleMinClick = () => {
        const displayData = studentsWithMin.map(s => ({
            ...s,
            nomComplet: `${s.prenom} ${s.nom}`,
            actionBtn: <button className="btn-details-action" onClick={(e) => { e.stopPropagation(); handleStudentSelectFromModal(s); }}><i className="fa fa-eye"></i> Détail</button>
        }));
        showModalWithData(`Moyenne la plus basse (${minMoyenneVal})`, [{ key: 'rang', header: 'Rang' }, { key: 'nomComplet', header: 'Nom' }, { key: 'moyenne', header: 'Moyenne' }, { key: 'actionBtn', header: 'Action' }], displayData);
    };
    // ------------------------------------------

    const filteredClassement = sourceData.filter(student =>
        `${student.prenom} ${student.nom}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (student.numero_incorporation && student.numero_incorporation.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="dashboard-redesign-container">
            {modalData && (
                <DashboardModal
                    title={modalTitle}
                    data={modalData}
                    columns={modalColumns}
                    onClose={() => setModalData(null)}
                    isLoading={isModalLoading}
                    onRowClick={handleStudentSelectFromModal}
                />
            )}

            {selectedStudent && (
                <StudentDetailsModal
                    student={selectedStudent}
                    examSubjects={details.matieres}
                    typeExamen={typeExamen}
                    onClose={() => setSelectedStudent(null)}
                />
            )}

            <Link to="/dashboard" className="back-link">&larr; Retour</Link>

            <div className="dashboard-redesign-header">
                <h1>{typeExamen.replace(/_/g, ' ')}</h1>
                <div className="stats-grid">
                    <StatCardRedesign title="Participants" value={summary.stats.participants} />

                    {/* --- NOUVELLES CARTES MIN / MAX --- */}
                    <StatCardRedesign
                        title="Moyenne Max"
                        value={maxMoyenneVal}
                        subValue="Note la plus haute"
                        onClick={handleMaxClick}
                        highlight={true}
                    />

                    <StatCardRedesign
                        title="Moyenne Min"
                        value={minMoyenneVal}
                        subValue="Note la plus basse"
                        onClick={handleMinClick}
                    />
                    {/* ---------------------------------- */}

                    <StatCardRedesign
                        title="Moyenne ≥ 12"
                        value={countSup12}
                        subValue={`${percentSup12}% des élèves`}
                        onClick={handleSup12Click}
                        highlight={true}
                    />

                    <StatCardRedesign
                        title="Moyenne < 12"
                        value={countInf12}
                        subValue={`${percentInf12}% des élèves`}
                        onClick={handleInf12Click}
                        highlight={countInf12 > 0}
                    />

                    <StatCardRedesign
                        title="Consultations Externes"
                        value={countConsultations}
                        isLoading={!isDataReady}
                        onClick={handleConsultationClick}
                        highlight={isDataReady && typeof countConsultations === 'number' && countConsultations > 0}
                    />

                    <StatCardRedesign
                        title="Élèves Sanctionnés"
                        value={countSanctions}
                        isLoading={!isDataReady}
                        onClick={handleSanctionsClick}
                        highlight={isDataReady && typeof countSanctions === 'number' && countSanctions > 0}
                    />

                    <StatCardRedesign title="Absents" value={summary.stats.absents} onClick={() => showModalWithData('Liste des Absents', [{ key: 'nom', header: 'Nom' }, { key: 'motif', header: 'Motif' }], summary.absents)} />
                    <StatCardRedesign title="Élèves < 10/20" value={elevesEnDifficulte.length} onClick={() => showModalWithData('Élèves en Difficulté', [{ key: 'nom', header: 'Nom' }, { key: 'moyenne', header: 'Moyenne' }], elevesEnDifficulte)} />
                </div>
            </div>

            <div className="dashboard-examen-layout">
                <div className="sidebar-area">
                    <div className="card">
                        <h3 className="content-title">Matières > 12/20 ({matieresReussite.length})</h3>
                        <ul className="sidebar-stats-list">
                            {matieresReussite.map(m => (
                                <SidebarStatItem key={m.nom_matiere} label={m.nom_matiere} value={parseFloat(m.moyenne).toFixed(2)} />
                            ))}
                        </ul>
                    </div>
                    <div className="card">
                        <h3 className="content-title">Matières &lt; 12/20 ({matieresEchec.length})</h3>
                        <ul className="sidebar-stats-list">
                            {matieresEchec.map(m => (
                                <SidebarStatItem key={m.nom_matiere} label={m.nom_matiere} value={parseFloat(m.moyenne).toFixed(2)} />
                            ))}
                        </ul>
                    </div>
                </div>

                <div className="main-content-area">
                    <div className="ranking-card">
                        <div className="ranking-card-header">
                            <h3 className="content-title">Classement de l'Examen</h3>
                            <div className="search-bar-container">
                                <input
                                    type="text"
                                    placeholder="Rechercher par nom ou incorporation..."
                                    className="search-input"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="table-responsive-dashboard">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Rang</th>
                                        <th>Nom</th>
                                        <th>Incorporation</th>
                                        <th>Moyenne</th>
                                        <th style={{ width: '150px' }}>Statut</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredClassement
                                        .filter(s => s.statut === 'Classé')
                                        .map(s => (
                                            <tr key={s.id} onClick={() => setSelectedStudent(s)} className="clickable-row">
                                                <td>{s.rang}</td>
                                                <td>{s.prenom} {s.nom}</td>
                                                <td>{s.numero_incorporation}</td>
                                                <td>{s.moyenne}</td>
                                                <td>
                                                    <div className="badges-container">
                                                        {s.consultationDays > 0 && (
                                                            <span className="status-badge consultation-badge" title={`${s.consultationDays} jour(s) de consultation`}>
                                                                {s.consultationDays} j
                                                            </span>
                                                        )}
                                                        {s.absenceDays > 0 && (
                                                            <span className="status-badge absence-badge" title={`${s.absenceDays} jour(s) d'absence`}>
                                                                {s.absenceDays} j
                                                            </span>
                                                        )}
                                                        {s.sanctionCount > 0 && (
                                                            <span className="status-badge sanction-badge" title={`${s.sanctionCount} sanction(s)`}>
                                                                {s.sanctionCount} S
                                                            </span>
                                                        )}
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
        </div>
    );
};

export default DashboardExamen;
