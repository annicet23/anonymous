import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import Select from 'react-select';
import apiPaths from '../config/apiPaths';
import './IncognitoMoyenne.css';

const IncognitoAnalyse = ({ onBack }) => {
    const [loading, setLoading] = useState(true);
    const [calculating, setCalculating] = useState(false);
    const [error, setError] = useState('');

    // Données
    const [classementGeneral, setClassementGeneral] = useState([]);
    const [classementMap, setClassementMap] = useState(new Map());
    const [examConfigs, setExamConfigs] = useState([]); 
    
    // Inputs
    const [selectedEleveId, setSelectedEleveId] = useState('');
    const [targetGenerale, setTargetGenerale] = useState('');

    // Résultats (Groupés par examen)
    const [analysisResult, setAnalysisResult] = useState(null);

    // Initialisation
    useEffect(() => {
        const token = localStorage.getItem('token');
        const config = { headers: { Authorization: `Bearer ${token}` } };
        setLoading(true);

        Promise.all([
            axios.get(apiPaths.incognito.classementActuel, config),
            axios.get('/api/configuration/examens', config)
        ]).then(([resClassement, resConfigs]) => {
            setClassementGeneral(resClassement.data);
            const map = new Map(resClassement.data.map(e => [e.id, e]));
            setClassementMap(map);
            setExamConfigs(resConfigs.data);
            setLoading(false);
        }).catch(err => {
            console.error(err);
            setError("Impossible de charger les données.");
            setLoading(false);
        });
    }, []);

    const selectedEleveData = useMemo(() => selectedEleveId ? classementMap.get(parseInt(selectedEleveId, 10)) : null, [selectedEleveId, classementMap]);

    const eleveOptions = useMemo(() => classementGeneral.map(e => ({
        value: e.id,
        label: `${e.rang || e.statut}. ${e.prenom} ${e.nom} (Moyenne: ${e.moyenne || 'N/A'})`
    })), [classementGeneral]);

    // --- ALGORITHME DE RÉSOLUTION GLOBAL ---
    const handleLaunchGlobalAnalysis = async (e) => {
        e.preventDefault();
        if (!selectedEleveId || !targetGenerale) return;

        setCalculating(true);
        setError('');
        setAnalysisResult(null);
        
        const token = localStorage.getItem('token');
        const config = { headers: { Authorization: `Bearer ${token}` } };

        try {
            // 1. Calculer les poids globaux
            let totalCoeffsGeneraux = 0;
            const examsDetails = examConfigs.map(exam => {
                const coeffGen = parseFloat(exam.coefficient_general || 0);
                totalCoeffsGeneraux += coeffGen;
                const totalCoeffsInternes = exam.configurations.reduce((sum, c) => sum + parseFloat(c.coefficient), 0);
                return { ...exam, coeffGen, totalCoeffsInternes };
            });

            if (totalCoeffsGeneraux === 0) throw new Error("Configuration des coefficients invalide.");

            // 2. Récupérer TOUTES les opportunités d'amélioration pour chaque examen
            let allOpportunities = [];

            for (const exam of examsDetails) {
                // On récupère les IDs des matières de cet examen
                const matiereIds = exam.configurations.map(c => c.matiere_id);
                if (matiereIds.length === 0) continue;

                // Appel Backend avec forceExploration = true (pour éviter l'erreur 400)
                const payload = { 
                    eleveCibleId: selectedEleveId, 
                    matiereIds: matiereIds, 
                    typeExamen: exam.nom_modele, // Important pour le contexte
                    forceExploration: true 
                };

                const res = await axios.post(apiPaths.incognito.suggestionsMoyenne, payload, config);
                const suggestions = res.data;

                // Calcul de l'Impact Global de chaque suggestion
                suggestions.forEach(sugg => {
                    const confMatiere = exam.configurations.find(c => c.matiere_id === sugg.matiere.id);
                    if (!confMatiere) return;
                    const coeffMatiere = parseFloat(confMatiere.coefficient);
                    
                    // Formule : Gain Global = (GainNote * CoeffMatiere / TotalCoeffExam) * CoeffGenExam / TotalCoeffGen
                    const gainNote = parseFloat(sugg.noteAEchanger) - parseFloat(sugg.noteActuelle);
                    if (gainNote <= 0) return;

                    const gainSurMoyenneExamen = (gainNote * coeffMatiere) / exam.totalCoeffsInternes;
                    const gainSurMoyenneGenerale = (gainSurMoyenneExamen * exam.coeffGen) / totalCoeffsGeneraux;

                    allOpportunities.push({
                        ...sugg,
                        examId: exam.id,
                        examName: exam.nom_modele,
                        coeffMatiere,
                        gainSurMoyenneExamen,
                        gainSurMoyenneGenerale,
                        gainNote
                    });
                });
            }

            // 3. Sélectionner les meilleurs échanges pour atteindre la cible
            // On trie par efficacité (Impact Global par point de note échangé) ou par impact brut.
            // Ici impact brut pour aller vite.
            allOpportunities.sort((a, b) => b.gainSurMoyenneGenerale - a.gainSurMoyenneGenerale);

            let currentGlobalAvg = parseFloat(selectedEleveData.moyenne || 0);
            const target = parseFloat(targetGenerale);
            const selectedMoves = [];
            const usedKeys = new Set(); // Pour éviter de modifier 2 fois la même matière du même examen

            for (const move of allOpportunities) {
                if (currentGlobalAvg >= target) break; // Cible atteinte

                const uniqueKey = `${move.examName}-${move.matiere.id}`;
                
                // Si on n'a pas encore touché à cette matière
                if (!usedKeys.has(uniqueKey)) {
                    selectedMoves.push(move);
                    currentGlobalAvg += move.gainSurMoyenneGenerale;
                    usedKeys.add(uniqueKey);
                }
            }

            if (selectedMoves.length === 0 && currentGlobalAvg < target) {
                setError("Impossible d'améliorer la moyenne : aucune meilleure note disponible chez les autres élèves.");
                setCalculating(false);
                return;
            }

            // 4. Organiser le résultat par Examen pour l'affichage
            const resultArray = examsDetails.map(exam => {
                // Trouver les moves pour cet examen
                const movesForThisExam = selectedMoves.filter(m => m.examId === exam.id);
                
                // Calculer la nouvelle moyenne de cet examen
                const gainTotalExamen = movesForThisExam.reduce((sum, m) => sum + m.gainSurMoyenneExamen, 0);
                
                // Note: On n'a pas la moyenne actuelle exacte de chaque examen ici (sauf si on fait une requête dédiée),
                // donc on affiche l'amélioration (+X pts).
                
                return {
                    examName: exam.nom_modele,
                    moves: movesForThisExam,
                    status: movesForThisExam.length > 0 ? 'modified' : 'ok',
                    gainMoyenne: gainTotalExamen.toFixed(2)
                };
            });

            setAnalysisResult({
                finalGlobalAvg: currentGlobalAvg.toFixed(2),
                details: resultArray,
                fullPlan: selectedMoves // Pour l'exécution
            });

        } catch (err) {
            console.error(err);
            setError("Erreur lors du calcul global.");
        } finally {
            setCalculating(false);
        }
    };

    const handleExecutePlan = async () => {
        if (!analysisResult || !analysisResult.fullPlan.length) return;
        if (!window.confirm(`Exécuter ces ${analysisResult.fullPlan.length} échanges pour atteindre ${analysisResult.finalGlobalAvg} de moyenne générale ?`)) return;

        const token = localStorage.getItem('token');
        const planPayload = analysisResult.fullPlan.map(item => ({
            copieIdCible: item.copieIdCible,
            donneur: item.donneur
        }));

        try {
            await axios.post(apiPaths.incognito.executerPlan, { plan: planPayload }, { headers: { Authorization: `Bearer ${token}` } });
            alert("Plan global exécuté avec succès !");
            window.location.reload();
        } catch (err) {
            alert("Erreur lors de l'exécution : " + err.message);
        }
    };

    // Styles Select
    const customSelectStyles = {
        control: (provided) => ({ ...provided, backgroundColor: 'var(--surface-color)', borderColor: 'var(--border-color)', borderRadius: 'var(--border-radius)' }),
        singleValue: (provided) => ({ ...provided, color: 'var(--text-primary-color)' }),
        input: (provided) => ({ ...provided, color: 'var(--text-primary-color)' }),
        menu: (provided) => ({ ...provided, backgroundColor: 'var(--surface-color)', borderRadius: 'var(--border-radius)', zIndex: 5 }),
        option: (provided, state) => ({ ...provided, backgroundColor: state.isFocused ? 'var(--background-color)' : 'var(--surface-color)', color: 'var(--text-primary-color)' }),
    };

    if (loading) return <div className="card">Chargement de la configuration...</div>;

    return (
        <div className="card strategic-mode-card">
            <div className="card-header">
                <h2 className="card-header-title"><span className="icon">🌍</span>Planificateur Global (Multi-Examens)</h2>
                <button className="btn btn-secondary" onClick={onBack}>Retour</button>
            </div>

            <p className="warning-text">
                Définissez la <strong>Moyenne Générale (Synthèse)</strong> souhaitée. Le système analysera chaque examen (Trimestres, Final...) pour proposer un plan complet.
            </p>

            <form onSubmit={handleLaunchGlobalAnalysis} style={{ marginTop: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '20px' }}>
                <div className="form-grid">
                    <div className="form-group">
                        <label>Élève Cible</label>
                        <Select
                            options={eleveOptions}
                            value={eleveOptions.find(o => o.value === selectedEleveId)}
                            onChange={val => setSelectedEleveId(val ? val.value : '')}
                            placeholder="Choisir l'élève..."
                            styles={customSelectStyles}
                        />
                    </div>
                    <div className="form-group">
                        <label>Objectif : Moyenne Synthèse Générale</label>
                        <input 
                            type="number" 
                            step="0.01" 
                            className="form-control"
                            value={targetGenerale}
                            onChange={e => setTargetGenerale(e.target.value)}
                            placeholder="Ex: 12.00"
                            required
                        />
                    </div>
                </div>

                {selectedEleveData && (
                    <div className="current-info-centered" style={{margin: '15px 0'}}>
                        Actuel : <strong>{selectedEleveData.moyenne}</strong> ➔ Visé : <strong>{targetGenerale}</strong>
                    </div>
                )}

                <button type="submit" className="btn btn-primary btn-block" disabled={calculating || !selectedEleveId || !targetGenerale}>
                    {calculating ? 'Analyse de tous les examens en cours...' : 'Générer le Plan Global'}
                </button>
            </form>

            {error && <div className="error-message" style={{marginTop: '15px'}}>{error}</div>}

            {analysisResult && (
                <div className="global-plan-results" style={{marginTop: '20px'}}>
                    
                    <div className="simulation-header" style={{textAlign: 'center', marginBottom: '30px', padding: '15px', backgroundColor: 'rgba(76, 175, 80, 0.1)', borderRadius: '8px', border: '1px solid #4caf50'}}>
                        <h3>Résultat Projeté : {analysisResult.finalGlobalAvg} / 20</h3>
                        <p style={{margin: 0}}>Voici les modifications nécessaires par examen :</p>
                    </div>

                    <div className="exams-breakdown">
                        {analysisResult.details.map((examDetail, idx) => (
                            <div key={idx} className={`exam-card ${examDetail.status === 'ok' ? 'exam-ok' : 'exam-modified'}`} 
                                 style={{marginBottom: '20px', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden'}}>
                                
                                <div className="exam-card-header" style={{padding: '10px 15px', backgroundColor: examDetail.status === 'ok' ? 'rgba(255,255,255,0.05)' : 'rgba(33, 150, 243, 0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                    <h4 style={{margin: 0}}>{examDetail.examName}</h4>
                                    {examDetail.status === 'modified' ? (
                                        <span className="badge badge-blue">Moyenne +{examDetail.gainMoyenne} pts</span>
                                    ) : (
                                        <span className="badge badge-green">Pas de changement nécessaire</span>
                                    )}
                                </div>

                                {examDetail.status === 'modified' ? (
                                    <div className="exam-card-body" style={{padding: '0'}}>
                                        <table className="results-table" style={{margin: 0, width: '100%'}}>
                                            <thead>
                                                <tr>
                                                    <th>Matière</th>
                                                    <th>Note Actuelle</th>
                                                    <th>Note Cible</th>
                                                    <th>Donneur</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {examDetail.moves.map((move, mIdx) => (
                                                    <tr key={mIdx}>
                                                        <td>{move.matiere.nom}</td>
                                                        <td style={{color: '#ff4444'}}>{move.noteActuelle.toFixed(2)}</td>
                                                        <td style={{color: '#4caf50', fontWeight: 'bold'}}>{parseFloat(move.noteAEchanger).toFixed(2)}</td>
                                                        <td>{move.donneur.prenom} {move.donneur.nom}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div style={{padding: '15px', textAlign: 'center', color: 'var(--text-secondary-color)', fontStyle: 'italic'}}>
                                        Les notes de cet examen restent inchangées.
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <button 
                        onClick={handleExecutePlan} 
                        className="btn btn-success btn-block" 
                        style={{marginTop: '20px', padding: '15px', fontSize: '1.2em', marginBottom: '30px'}}
                    >
                        Valider et Appliquer le Plan Complet ({analysisResult.fullPlan.length} échanges)
                    </button>
                </div>
            )}
        </div>
    );
};

export default IncognitoAnalyse;
