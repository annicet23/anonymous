import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import StudentDetailsModal from './StudentDetailsModal';
import DashboardModal from './DashboardModal';
import WelcomePage from './WelcomePage';
import './Dashboard.css';

const formatNom = (nom) => {
    return nom ? nom.toUpperCase() : '';
};

const formatPrenom = (prenom) => {
    if (!prenom) return '';
    return prenom
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};

const calculateCombinedHealthStats = (consultations, absences) => {
    const uniqueDaysSet = new Set();
    const daysConsult = new Set();
    const daysIG = new Set();
    const daysCHRR = new Set();

    if (consultations && consultations.length > 0) {
        consultations.forEach(c => {
            const start = new Date(c.dateDepart);
            const end = new Date(c.dateArrive);
            start.setHours(0, 0, 0, 0);
            end.setHours(0, 0, 0, 0);

            for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
                const ts = dt.getTime();
                uniqueDaysSet.add(ts);
                daysConsult.add(ts);
            }
        });
    }

    if (absences && absences.length > 0) {
        absences.forEach(a => {
            if (a.motif && a.date) {
                const motifUpper = a.motif.toUpperCase().trim();
                const d = new Date(a.date);
                d.setHours(0, 0, 0, 0);
                const ts = d.getTime();

                if (motifUpper.includes("ADMIS IG")) {
                    uniqueDaysSet.add(ts);
                    daysIG.add(ts);
                } else if (motifUpper.includes("ADMIS CHRR")) {
                    uniqueDaysSet.add(ts);
                    daysCHRR.add(ts);
                }
            }
        });
    }

    const total = daysConsult.size + daysIG.size + daysCHRR.size;

    if (uniqueDaysSet.size === 0) return { total: 0, maxContinuous: 0, details: { consult: 0, ig: 0, chrr: 0 } };

    const sortedTimestamps = Array.from(uniqueDaysSet).sort((a, b) => a - b);
    let maxContinuous = 1;
    let currentStreak = 1;

    for (let i = 1; i < sortedTimestamps.length; i++) {
        const diff = sortedTimestamps[i] - sortedTimestamps[i - 1];

        if (diff <= 86400000 + 3600000) {
            currentStreak++;
        } else {
            maxContinuous = Math.max(maxContinuous, currentStreak);
            currentStreak = 1;
        }
    }
    maxContinuous = Math.max(maxContinuous, currentStreak);

    return {
        total,
        maxContinuous,
        details: {
            consult: daysConsult.size,
            ig: daysIG.size,
            chrr: daysCHRR.size
        }
    };
};

const Dashboard = () => {
    const [showIntro, setShowIntro] = useState(true);
    const [examSummaries, setExamSummaries] = useState([]);
    const [generalSummary, setGeneralSummary] = useState(null);
    const [error, setError] = useState('');
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [examExtremes, setExamExtremes] = useState({});

    const [detailedRanking, setDetailedRanking] = useState([]);
    const [classementWithDetails, setClassementWithDetails] = useState([]);
    const [isDataReady, setIsDataReady] = useState(false);
    const [motifStats, setMotifStats] = useState([]);

    const [modalData, setModalData] = useState(null);
    const [modalTitle, setModalTitle] = useState('');
    const [modalColumns, setModalColumns] = useState([]);

    const [ajournementThreshold, setAjournementThreshold] = useState(0);
    const [isAjournementBlurred, setIsAjournementBlurred] = useState(true);

    const [promotionsList, setPromotionsList] = useState([]);
    const [selectedPromotion, setSelectedPromotion] = useState('all');

    useEffect(() => {
        const fetchPromotions = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await axios.get('/api/promotions', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setPromotionsList(res.data);
            } catch (e) {
                console.error("Erreur chargement promotions", e);
            }
        };
        fetchPromotions();
    }, []);

    useEffect(() => {
        let isMounted = true;

        const fetchData = async () => {
            try {
                const token = localStorage.getItem('token');
                const headers = { Authorization: `Bearer ${token}` };
                const config = { headers, timeout: 60000 };

                let examsData = [];
                const promoQuery = selectedPromotion !== 'all' ? `?promotion=${selectedPromotion}` : '';
                const promoParam = selectedPromotion !== 'all' ? `&promotion=${selectedPromotion}` : '';

                try {
                    const examRes = await axios.get(`/api/dashboard/summary-by-exam-type${promoQuery}`, config);
                    examsData = examRes.data;
                    if (isMounted) {
                        setExamSummaries(examsData);
                    }
                } catch (e) {
                    console.error("Erreur chargement examens:", e);
                    if (isMounted) setError("Erreur chargement des examens.");
                    return;
                }

                try {
                    const [generalRes, rankingRes] = await Promise.all([
                        axios.get(`/api/dashboard/general-summary${promoQuery}`, config),
                        axios.get(`/api/resultats/classement-details?typeExamen=General${promoParam}`, config)
                    ]);

                    if (isMounted) {
                        setGeneralSummary(generalRes.data);
                        setDetailedRanking(rankingRes.data.classement || []);
                        setIsDataReady(false);
                        setClassementWithDetails([]);
                    }
                } catch (e) {
                    console.warn("Erreur chargement général:", e);
                }

                if (examsData && Array.isArray(examsData)) {
                    for (const exam of examsData) {
                        if (!isMounted) break;

                        try {
                            const encodedType = encodeURIComponent(exam.typeExamen);
                            const detailRes = await axios.get(`/api/resultats/classement-details?typeExamen=${encodedType}${promoParam}`, {
                                headers, timeout: 60000
                            });
                            const classements = detailRes.data.classement || [];
                            const moyennes = classements
                                .map(c => c.moyenne ? parseFloat(String(c.moyenne).replace(',', '.')) : null)
                                .filter(m => m !== null && !isNaN(m));

                            if (moyennes.length > 0) {
                                setExamExtremes(prev => ({
                                    ...prev,
                                    [exam.typeExamen]: {
                                        min: Math.min(...moyennes).toFixed(2),
                                        max: Math.max(...moyennes).toFixed(2)
                                    }
                                }));
                            } else {
                                setExamExtremes(prev => ({
                                    ...prev,
                                    [exam.typeExamen]: { min: '-', max: '-' }
                                }));
                            }
                        } catch (e) {
                            setExamExtremes(prev => ({
                                ...prev,
                                [exam.typeExamen]: { min: '?', max: '?' }
                            }));
                        }
                    }
                }
            } catch (err) {
                console.error("Erreur critique Dashboard:", err);
                if (isMounted) setError('Données indisponibles.');
            }
        };

        fetchData();
        return () => { isMounted = false; };
    }, [selectedPromotion]);

    useEffect(() => {
        if (!detailedRanking || detailedRanking.length === 0) {
            setClassementWithDetails([]);
            setIsDataReady(true);
            return;
        }
        if (isDataReady && classementWithDetails.length > 0) return;

        const fetchAllExtraData = async () => {
            const rawStudents = detailedRanking;
            const BATCH_SIZE = 5;
            let allEnrichedStudents = [];
            let globalCounts = {};

            try {
                let allSanctions = [];
                try {
                    const sanctionsResponse = await axios.get('http://192.168.241.169:4000/api/sanctions', { timeout: 3000 });
                    allSanctions = sanctionsResponse.data || [];
                } catch (e) { }

                for (let i = 0; i < rawStudents.length; i += BATCH_SIZE) {
                    const batch = rawStudents.slice(i, i + BATCH_SIZE);
                    const batchPromises = batch.map(async (student) => {
                        try {
                            if (!student.id) return student;

                            const [consultRes, absenceRes] = await Promise.allSettled([
                                axios.get(`http://192.168.241.169:4000/api/consultation/incorp/${student.numero_incorporation}`, { timeout: 2000 }),
                                axios.get(`http://192.168.241.169:4000/api/absence/incorp/${student.numero_incorporation}`, { timeout: 2000 })
                            ]);

                            const consults = (consultRes.status === 'fulfilled' && consultRes.value.data) ? consultRes.value.data : [];
                            const absences = (absenceRes.status === 'fulfilled' && absenceRes.value.data) ? absenceRes.value.data : [];

                            const healthStats = calculateCombinedHealthStats(consults, absences);

                            consults.forEach(c => {
                                const motif = c.service ? c.service.trim() : 'Service Inconnu';
                                if (!globalCounts[motif]) globalCounts[motif] = { count: 0, type: 'Santé/Service', students: {} };
                                globalCounts[motif].count += 1;
                                const sId = student.id;
                                if(!globalCounts[motif].students[sId]) {
                                    globalCounts[motif].students[sId] = {
                                        nom: student.nom, prenom: student.prenom,
                                        escadron: student.escadron || '-', peloton: student.peloton || '-', count: 0
                                    };
                                }
                                globalCounts[motif].students[sId].count += 1;
                            });

                            const absenceDays = absences.length;
                            absences.forEach(a => {
                                const motif = a.motif ? a.motif.trim() : 'Absence injustifiée';
                                if (!globalCounts[motif]) globalCounts[motif] = { count: 0, type: 'Absence', students: {} };
                                globalCounts[motif].count += 1;
                                const sId = student.id;
                                if(!globalCounts[motif].students[sId]) {
                                    globalCounts[motif].students[sId] = {
                                        nom: student.nom, prenom: student.prenom,
                                        escadron: student.escadron || '-', peloton: student.peloton || '-', count: 0
                                    };
                                }
                                globalCounts[motif].students[sId].count += 1;
                            });

                            const studentIncorp = String(student.numero_incorporation || '').trim();
                            const sanctionsForStudent = allSanctions.filter(s =>
                                s.Eleve && String(s.Eleve.numeroIncorporation).trim() === studentIncorp
                            );
                            const totalARDays = sanctionsForStudent.reduce((sum, s) => {
                                const tauxStr = (s.taux || '').toUpperCase();
                                if (tauxStr.includes('AR')) {
                                    const jours = parseInt(tauxStr, 10);
                                    return sum + (isNaN(jours) ? 0 : jours);
                                }
                                return sum;
                            }, 0);

                            return {
                                ...student,
                                consultationDays: healthStats.total,
                                consultationMaxContinuous: healthStats.maxContinuous,
                                healthDetails: healthStats.details,
                                absenceDays,
                                sanctionCount: sanctionsForStudent.length,
                                totalARDays: totalARDays
                            };
                        } catch (innerErr) { return student; }
                    });
                    const batchResults = await Promise.all(batchPromises);
                    allEnrichedStudents = [...allEnrichedStudents, ...batchResults];
                }

                const formattedStats = Object.keys(globalCounts).map(key => ({
                    motif: key,
                    count: globalCounts[key].count,
                    type: globalCounts[key].type,
                    uniquePeople: Object.keys(globalCounts[key].students).length,
                    studentDetails: globalCounts[key].students
                })).sort((a, b) => b.count - a.count);

                setMotifStats(formattedStats);
                setClassementWithDetails(allEnrichedStudents);
                setIsDataReady(true);
            } catch (err) {
                setClassementWithDetails(rawStudents);
                setIsDataReady(true);
            }
        };
        fetchAllExtraData();
    }, [detailedRanking, isDataReady]);

    const showModalWithData = (title, columns, data) => {
        setModalTitle(title);
        setModalColumns(columns);
        setModalData(data);
    };

    const generateActionBtn = (student) => (
        <button
            className="btn-details-action"
            onClick={(e) => {
                e.stopPropagation();
                setModalData(null);
                setSelectedStudent(student);
            }}
        >
            <i className="fa fa-eye"></i> Voir
        </button>
    );

    const getRedoublementList = () => {
        if (!isDataReady) return [];
        return classementWithDetails.filter(s => {
            const condConsultation = s.consultationMaxContinuous >= 45 || s.consultationDays >= 60;
            const condMoyenne = s.moyenne !== null && parseFloat(s.moyenne) < 8;
            const condSanction = s.totalARDays >= 20;
            return condConsultation || condMoyenne || condSanction;
        }).map(s => {
            let motifElements = [];

            if (s.consultationDays >= 60 || s.consultationMaxContinuous >= 45) {
                const style = { color: '#856404', backgroundColor: '#fff3cd', padding: '4px 8px', borderRadius: '4px', marginBottom: '4px', fontSize: '0.9em' };
                let text = '';
                if (s.consultationDays >= 60 && s.consultationMaxContinuous >= 45) text = `${s.consultationDays}j Total (dont ${s.consultationMaxContinuous}j continus)`;
                else if (s.consultationDays >= 60) text = `${s.consultationDays}j Total (discontinu)`;
                else text = `${s.consultationMaxContinuous}j Continus`;

                const d = s.healthDetails || { consult: 0, ig: 0, chrr: 0 };
                const detailsStr = ` = ${d.consult}j Consult. + ${d.ig}j IG + ${d.chrr}j CHRR`;

                motifElements.push(
                    <div key="health" style={style}>
                        <i className="fa fa-user-md"></i> <strong>Santé :</strong> {text}
                        <br/>
                        <span style={{fontSize: '0.85em', fontStyle: 'italic', color: '#555'}}>{detailsStr}</span>
                    </div>
                );
            }
            if (s.moyenne !== null && parseFloat(s.moyenne) < 8) {
                motifElements.push(<div key="grade" style={{ color: '#721c24', backgroundColor: '#f8d7da', padding: '4px 8px', borderRadius: '4px', marginBottom: '4px', fontSize: '0.9em' }}><i className="fa fa-graduation-cap"></i> <strong>Moyenne :</strong> {parseFloat(s.moyenne).toFixed(2)} / 20</div>);
            }
            if (s.totalARDays >= 20) {
                motifElements.push(<div key="discipline" style={{ color: '#fff', backgroundColor: '#dc3545', padding: '4px 8px', borderRadius: '4px', marginBottom: '4px', fontSize: '0.9em' }}><i className="fa fa-exclamation-triangle"></i> <strong>Discipline :</strong> {s.totalARDays} jours AR</div>);
            }
            return { ...s, motifRedoublement: <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>{motifElements}</div>, actionBtn: generateActionBtn(s) };
        });
    };

    const handleRedoublementClick = () => {
        if (!isDataReady) { alert("Calcul en cours..."); return; }

        const baseList = getRedoublementList();

        const groupeSante = [];
        const groupeDiscipline = [];
        const groupeMoyenne = [];

        baseList.forEach(student => {
            const isSante = (student.consultationMaxContinuous >= 45 || student.consultationDays >= 60);
            const isDiscipline = student.totalARDays >= 20;
            if (isSante) groupeSante.push(student);
            else if (isDiscipline) groupeDiscipline.push(student);
            else groupeMoyenne.push(student);
        });

        groupeSante.sort((a, b) => {
            return (b.consultationDays || 0) - (a.consultationDays || 0);
        });

        const formatGroup = (list, titre, couleur, bgCouleur) => {
            if (list.length === 0) return [];
            const headerRow = {
                id: `header-${titre}`,
                isHeader: true,
                ordre: '',
                nom: (<div style={{ textAlign: 'center', fontWeight: 'bold', color: couleur, backgroundColor: bgCouleur, padding: '8px', textTransform: 'uppercase', borderRadius: '4px', width: '100%' }}>{titre} ({list.length})</div>),
                prenom: '', escadron: '', peloton: '', numero_incorporation: '', motifRedoublement: '', actionBtn: ''
            };
            const studentRows = list.map((student, index) => ({
                ...student,
                nom: formatNom(student.nom),
                prenom: formatPrenom(student.prenom),
                ordre: <strong>{index + 1}</strong>
            }));
            return [headerRow, ...studentRows];
        };

        const finalSortedList = [
            ...formatGroup(groupeSante, 'Raison de Santé', '#856404', '#fff3cd'),
            ...formatGroup(groupeDiscipline, 'Discipline', '#721c24', '#f8d7da'),
            ...formatGroup(groupeMoyenne, 'Résultats Scolaires', '#1b1e21', '#d6d8d9')
        ];

        showModalWithData('Proposition de Redoublement', [
            { key: 'ordre', header: 'N°' },
            { key: 'nom', header: 'Nom / Catégorie' },
            { key: 'prenom', header: 'Prénom' },
            { key: 'escadron', header: 'Escadron' },
            { key: 'peloton', header: 'Peloton' },
            { key: 'numero_incorporation', header: 'Incorp' },
            { key: 'motifRedoublement', header: 'Détails' },
            { key: 'actionBtn', header: 'Action' }
        ], finalSortedList);
    };

    const handlePropositionAjournementClick = () => {
        const sourceData = isDataReady ? classementWithDetails : detailedRanking;

        const filteredList = sourceData.filter(s =>
            s.moyenne !== null && parseFloat(s.moyenne) < parseFloat(ajournementThreshold)
        );

        const formattedList = filteredList.map(s => ({
            ...s,
            rang: s.rang || s.statut,
            nom: formatNom(s.nom),
            prenom: formatPrenom(s.prenom),
            moyenne: parseFloat(s.moyenne).toFixed(3),
            actionBtn: generateActionBtn(s)
        }));

        formattedList.sort((a, b) => parseFloat(a.moyenne) - parseFloat(b.moyenne));

        showModalWithData(
            `Proposition Ajournement (Moyenne < ${ajournementThreshold})`,
            [
                { key: 'rang', header: 'Rang' },
                { key: 'nom', header: 'Nom' },
                { key: 'prenom', header: 'Prénom' },
                { key: 'numero_incorporation', header: 'Incorp' },
                { key: 'escadron', header: 'Escadron' },
                { key: 'peloton', header: 'Peloton' },
                { key: 'moyenne', header: 'Moyenne' },
                { key: 'actionBtn', header: 'Détails' }
            ],
            formattedList
        );
    };

    const handleSup12Click = () => {
        const source = isDataReady ? classementWithDetails : detailedRanking;
        const enrichedList = source.filter(s => s.moyenne >= 12).map(s => ({
            ...s,
            nom: formatNom(s.nom),
            prenom: formatPrenom(s.prenom),
            actionBtn: generateActionBtn(s)
        }));
        showModalWithData('Moyenne ≥ 12', [
            { key: 'rang', header: 'Rang' }, { key: 'nom', header: 'Nom' }, { key: 'prenom', header: 'Prénom' },
            { key: 'numero_incorporation', header: 'Incorp' }, { key: 'escadron', header: 'Escadron' }, { key: 'peloton', header: 'Peloton' },
            { key: 'moyenne', header: 'Moyenne' }, { key: 'actionBtn', header: 'Action' }
        ], enrichedList);
    };

    const handleInf12Click = () => {
        const source = isDataReady ? classementWithDetails : detailedRanking;
        const enrichedList = source.filter(s => s.moyenne < 12).map(s => ({
            ...s,
            nom: formatNom(s.nom),
            prenom: formatPrenom(s.prenom),
            actionBtn: generateActionBtn(s)
        }));
        showModalWithData('Moyenne < 12', [
            { key: 'rang', header: 'Rang' }, { key: 'nom', header: 'Nom' }, { key: 'prenom', header: 'Prénom' },
            { key: 'numero_incorporation', header: 'Incorp' }, { key: 'escadron', header: 'Escadron' }, { key: 'peloton', header: 'Peloton' },
            { key: 'moyenne', header: 'Moyenne' }, { key: 'actionBtn', header: 'Action' }
        ], enrichedList);
    };

    const handleDifficulteClick = () => {
        const eleves = generalSummary?.elevesEnDifficulte || [];
        const enrichedList = eleves.map(s => ({
            ...s,
            nom: formatNom(s.nom),
            prenom: formatPrenom(s.prenom),
            actionBtn: generateActionBtn(s)
        }));
        showModalWithData('Difficulté (Moyenne < 10)', [
            { key: 'rang', header: 'Rang' }, { key: 'nom', header: 'Nom' }, { key: 'prenom', header: 'Prénom' },
            { key: 'numero_incorporation', header: 'Incorp' }, { key: 'escadron', header: 'Escadron' }, { key: 'peloton', header: 'Peloton' },
            { key: 'moyenne', header: 'Moyenne' }, { key: 'actionBtn', header: 'Action' }
        ], enrichedList);
    };

    const handleConsultationClick = () => {
        if (!isDataReady) { alert("Calcul en cours..."); return; }
        const sortedData = classementWithDetails.filter(s => s.consultationDays > 0)
            .sort((a,b) => b.consultationDays - a.consultationDays)
            .map(s => ({
                ...s, nom: formatNom(s.nom), prenom: formatPrenom(s.prenom), actionBtn: generateActionBtn(s)
            }));
        showModalWithData('Consultations', [
            { key: 'rang', header: 'Rang' }, { key: 'nom', header: 'Nom' }, { key: 'prenom', header: 'Prénom' },
            { key: 'numero_incorporation', header: 'Incorp' }, { key: 'escadron', header: 'Escadron' }, { key: 'peloton', header: 'Peloton' },
            { key: 'consultationDays', header: 'Jours' }, { key: 'actionBtn', header: 'Action' }
        ], sortedData);
    };

    const handleSanctionsClick = () => {
        if (!isDataReady) { alert("Calcul en cours..."); return; }
        const sortedData = classementWithDetails.filter(s => s.sanctionCount > 0)
            .sort((a,b) => b.sanctionCount - a.sanctionCount)
            .map(s => ({
                ...s, nom: formatNom(s.nom), prenom: formatPrenom(s.prenom), actionBtn: generateActionBtn(s)
            }));
        showModalWithData('Sanctions', [
            { key: 'rang', header: 'Rang' }, { key: 'nom', header: 'Nom' }, { key: 'prenom', header: 'Prénom' },
            { key: 'numero_incorporation', header: 'Incorp' }, { key: 'escadron', header: 'Escadron' }, { key: 'peloton', header: 'Peloton' },
            { key: 'sanctionCount', header: 'Total (AS+AR)' }, { key: 'totalARDays', header: 'Jours AR' }, { key: 'actionBtn', header: 'Action' }
        ], sortedData);
    };

    const handleMotifDetailsClick = (motifStat) => {
        const studentsList = Object.values(motifStat.studentDetails).sort((a, b) => b.count - a.count).map(s => ({
            ...s, nom: formatNom(s.nom), prenom: formatPrenom(s.prenom)
        }));
        showModalWithData(`Détails : ${motifStat.motif}`, [
            { key: 'nom', header: 'Nom' }, { key: 'prenom', header: 'Prénom' },
            { key: 'escadron', header: 'Escadron' }, { key: 'peloton', header: 'Peloton' },
            { key: 'count', header: 'Fréq.' }
        ], studentsList);
    };

    const handleMotifStatsClick = () => {
        if (!isDataReady) { alert("Calcul en cours..."); return; }
        const data = motifStats.map(s => ({
            ...s, actionBtn: <button className="btn-details-action" onClick={(e) => { e.stopPropagation(); handleMotifDetailsClick(s); }}>Liste</button>
        }));
        showModalWithData('Motifs', [
            { key: 'motif', header: 'Motif' }, { key: 'count', header: 'Total' }, { key: 'uniquePeople', header: 'Nb Pers.' }, { key: 'actionBtn', header: 'Détail' }
        ], data);
    };

    const getExamRank = (examType) => {
        const name = examType.toUpperCase().replace(/_/g, ' ');
        if (name.includes('FETTA')) return 1;
        if (name.includes('TEST')) return 2;
        if (name.includes('MI') && name.includes('STAGE')) return 3;
        if (name.includes('FINAL')) return 4;
        if (name.includes('APTITUDE')) return 5;
        if (name.includes('GDF')) return 6;
        if (name.includes('RAID')) return 7;
        return 999;
    };

    const sortedExams = [...examSummaries].sort((a, b) => {
        return getExamRank(a.typeExamen) - getExamRank(b.typeExamen);
    });

    if (showIntro) {
        return <WelcomePage onComplete={() => setShowIntro(false)} />;
    }

    const sourceData = isDataReady ? classementWithDetails : detailedRanking;
    const totalStudents = sourceData.length;
    const countSup12 = sourceData.filter(s => s.moyenne >= 12).length;
    const percentSup12 = totalStudents > 0 ? ((countSup12 / totalStudents) * 100).toFixed(1) : '0.0';
    const countInf12 = sourceData.filter(s => s.moyenne < 12).length;
    const percentInf12 = totalStudents > 0 ? ((countInf12 / totalStudents) * 100).toFixed(1) : '0.0';

    const listRedoublement = getRedoublementList();
    const countRedoublement = isDataReady ? listRedoublement.length : '...';

    const countAjournement = sourceData.filter(s => s.moyenne !== null && parseFloat(s.moyenne) < parseFloat(ajournementThreshold)).length;

    const totalMotifsCount = isDataReady ? motifStats.reduce((acc, curr) => acc + curr.count, 0) : '...';
    const countConsultations = isDataReady ? classementWithDetails.filter(s => s.consultationDays > 0).length : '...';
    const countSanctions = isDataReady ? classementWithDetails.filter(s => s.sanctionCount > 0).length : '...';
    const elevesEnDifficulte = generalSummary?.elevesEnDifficulte || [];
    const escadronsAffiches = (generalSummary?.statsParEscadron || []).map((esc, i) => ({ ...esc, rang: i + 1 }));

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                 <h1 className="dashboard-title">Tableaux de Bord</h1>
                 <p className="dashboard-subtitle">Synthèse en temps réel.</p>
                 
                 <div style={{ marginTop: '1rem' }}>
                    <select
                        value={selectedPromotion}
                        onChange={(e) => setSelectedPromotion(e.target.value)}
                        style={{
                            padding: '0.5rem',
                            borderRadius: '8px',
                            backgroundColor: '#2d3748',
                            color: '#e2e8f0',
                            border: '1px solid #4a5568',
                            width: '100%',
                            fontSize: '1rem'
                        }}
                    >
                        <option value="all">Toutes Promotions</option>
                        {promotionsList.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                 </div>

                 {error && (
                     <div style={{color: '#ef4444', backgroundColor: '#fee2e2', padding: '10px', borderRadius: '5px', marginTop: '10px'}}>
                         ⚠️ {error}
                     </div>
                 )}
            </div>

            <div className="dashboard-main-content">
                <div className="dashboard-cards-list">
                    <div className="dashboard-cards-row">
                        {sortedExams.length > 0 ? sortedExams.map(exam => {
                            const stats = examExtremes[exam.typeExamen] || { min: '-', max: '-' };
                            return (
                                <div key={exam.typeExamen} className="exam-card-wrapper">
                                    <div className="exam-card-header">
                                        <div className="exam-card-title-section">
                                            <h3>{exam.typeExamen.replace(/_/g, ' ')}</h3>
                                            <span>Synthèse Examen</span>
                                        </div>
                                        <div className="exam-card-status"><span className="status-dot"></span>En cours</div>
                                    </div>
                                    <div className="exam-card-body" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.8rem' }}>
                                        <div className="exam-card-stat">
                                            <span className="stat-value">{(exam.stats.moyenne || 0).toFixed(2)}</span>
                                            <span className="stat-label">Moyenne Gen.</span>
                                        </div>
                                        <div className="exam-card-stat">
                                            <span className="stat-value">{exam.stats.participants}</span>
                                            <span className="stat-label">Participants</span>
                                        </div>
                                        <div className="exam-card-stat">
                                            <span className="stat-value" style={{color: '#4ade80'}}>{stats.max}</span>
                                            <span className="stat-label">Note Max</span>
                                        </div>
                                        <div className="exam-card-stat">
                                            <span className="stat-value" style={{color: '#f87171'}}>{stats.min}</span>
                                            <span className="stat-label">Note Min</span>
                                        </div>
                                    </div>
                                    <div className="exam-card-footer">
                                        <div className="progress-bar-container">
                                            <span>Progression</span>
                                            <div className="progress-bar-background">
                                                <div className="progress-bar-foreground" style={{width: `${exam.stats.completion}%`}}></div>
                                            </div>
                                        </div>
                                        <Link to={`/dashboard/${exam.typeExamen}`} className="details-button">Détails</Link>
                                    </div>
                                </div>
                            );
                        }) : (
                            <div style={{color: 'gray', fontStyle: 'italic', padding: '20px', width: '100%'}}>
                                {error ? 'Données inaccessibles.' : 'Chargement des examens...'}
                            </div>
                        )}
                    </div>

                    {generalSummary && (
                        <div className="exam-card-wrapper general">
                            <div className="exam-card-header">
                                <div className="exam-card-title-section">
                                    <h3>FIN FORMATION</h3>
                                    <span>Vue d'ensemble complète</span>
                                </div>
                            </div>
                            <div className="fin-formation-grid">
                                <div className="mini-stat-card">
                                    <h4>Effectif Total</h4>
                                    <p>{totalStudents}</p>
                                </div>
                                <div className="mini-stat-card clickable highlight-blue" onClick={handleSup12Click}>
                                    <h4>Moyenne ≥ 12</h4>
                                    <p style={{color:'#4ade80'}}>{countSup12}</p>
                                    <span>{percentSup12}% des élèves</span>
                                </div>
                                <div className="mini-stat-card clickable highlight-blue" onClick={handleInf12Click}>
                                    <h4>Moyenne &lt; 12</h4>
                                    <p style={{color:'#facc15'}}>{countInf12}</p>
                                    <span>{percentInf12}% des élèves</span>
                                </div>

                                <div
                                    className={`mini-stat-card highlight-blue input-card-mini ${!isAjournementBlurred ? 'clickable' : ''}`}
                                    style={{ position: 'relative' }}
                                    onClick={isAjournementBlurred ? undefined : handlePropositionAjournementClick}
                                >
                                    <button
                                        className={`reveal-overlay-btn ${isAjournementBlurred ? 'visible' : ''}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setIsAjournementBlurred(!isAjournementBlurred);
                                        }}
                                        title={isAjournementBlurred ? "Révéler la surprise" : "Masquer"}
                                    >
                                        <i className={`fa ${isAjournementBlurred ? 'fa-eye' : 'fa-eye-slash'}`}></i>
                                    </button>

                                    <div className={`card-content-wrapper ${isAjournementBlurred ? 'content-blurred' : ''}`}>
                                        <h4>Prop. Ajournement</h4>
                                        <div className="input-wrapper-mini" onClick={(e) => e.stopPropagation()}>
                                            <label>Seuil &lt; </label>
                                            <input
                                                type="number"
                                                step="0.1"
                                                min="0"
                                                max="20"
                                                value={ajournementThreshold}
                                                onChange={(e) => setAjournementThreshold(e.target.value)}
                                                className="mini-input"
                                                disabled={isAjournementBlurred}
                                            />
                                        </div>
                                        <p style={{color:'#f87171'}}>{countAjournement}</p>
                                    </div>
                                </div>

                                <div className="mini-stat-card clickable highlight-blue" onClick={handleRedoublementClick}>
                                    <h4>Prop. Redoublement</h4>
                                    <p style={{color:'#f87171'}}>{countRedoublement}</p>
                                </div>
                                <div className="mini-stat-card clickable highlight-blue" onClick={handleMotifStatsClick}>
                                    <h4>Répartition Motifs</h4>
                                    <p style={{color:'#60a5fa'}}>{totalMotifsCount}</p>
                                </div>
                                <div className="mini-stat-card clickable highlight-blue" onClick={handleConsultationClick}>
                                    <h4>Consultations</h4>
                                    <p>{countConsultations}</p>
                                </div>
                                <div className="mini-stat-card clickable highlight-blue" onClick={handleSanctionsClick}>
                                    <h4>Sanctions</h4>
                                    <p>{countSanctions}</p>
                                </div>

                                <div className="mini-stat-card clickable highlight-blue" onClick={handleDifficulteClick}>
                                    <h4>Moyenne &lt; 10</h4>
                                    <p>{elevesEnDifficulte.length}</p>
                                </div>
                            </div>
                            <div className="exam-card-footer">
                                <Link to="/dashboard/general" className="details-button">Voir Dashboard Complet</Link>
                            </div>
                        </div>
                    )}

                    {generalSummary && (
                        <div className="exam-card-wrapper follow-up-card">
                            <div className="exam-card-header">
                                <div className="exam-card-title-section">
                                    <h3>Suivi Pédagogique</h3>
                                    <span>Classement & Alertes</span>
                                </div>
                            </div>
                            <div className="exam-card-body follow-up-body">
                                <div className="follow-up-section">
                                    <h4>Classement Escadrons</h4>
                                    <div className="follow-up-list scrollable-list">
                                        {escadronsAffiches.map(esc => (
                                            <div key={esc.nom} className="follow-up-item">
                                                <span className="escadron-rank-info">
                                                    <span className="rank-badge">{esc.rang}e</span> Escadron {esc.nom}
                                                </span>
                                                <span className={`stat-value small ${esc.moyenne < 10 ? 'red' : ''}`}>{esc.moyenne.toFixed(2)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="follow-up-section">
                                    <h4>Élèves en Difficulté</h4>
                                     <div className="follow-up-list scrollable-list">
                                        {elevesEnDifficulte.map(eleve => (
                                            <div key={eleve.id} className="follow-up-item clickable-student" onClick={() => setSelectedStudent(eleve)}>
                                                <span className="student-link">{eleve.prenom} {eleve.nom}</span>
                                                <span className="stat-value small red">{parseFloat(eleve.moyenne).toFixed(2)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {selectedStudent && (
                <StudentDetailsModal
                    student={selectedStudent}
                    typeExamen="General"
                    examSubjects={[]}
                    onClose={() => setSelectedStudent(null)}
                />
            )}
            {modalData && (
                <DashboardModal title={modalTitle} data={modalData} columns={modalColumns} onClose={() => setModalData(null)} />
            )}
        </div>
    );
};

export default Dashboard;
