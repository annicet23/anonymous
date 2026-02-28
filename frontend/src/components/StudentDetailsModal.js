import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import './StudentDetailsModal.css';

const DEFAULT_AVATAR_URL = "https://www.w3schools.com/w3images/avatar_hat.jpg";
const FALLBACK_COUR_ID = 79;

const formatOrdinal = (n) => {
    if (!n) return '';
    if (n === 1) return `${n}er`;
    return `${n}em`;
};

const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'N/A';
        return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(date);
    } catch (e) {
        return dateString;
    }
};

const calculateDaysBetween = (startDate, endDate) => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
    const diffTime = Math.abs(end - start);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
};

const SanctionItem = ({ sanction }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <li className="sanction-item" onClick={() => setIsExpanded(!isExpanded)}>
            <div className="sanction-summary">
                <span><strong>PUNITION : {sanction.taux}</strong></span>
                <span className="sanction-date">{formatDate(sanction.createdAt)}</span>
            </div>
            {isExpanded && (
                <div className="sanction-details">
                    <p><strong>Motif :</strong></p>
                    <p className="sanction-motif-text">{sanction.motif}</p>
                    <p><small>Enregistré le : {formatDate(sanction.createdAt)}</small></p>
                </div>
            )}
        </li>
    );
};

const ConsultationItem = ({ consult }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const duration = calculateDaysBetween(consult.dateDepart, consult.dateArrive);

    return (
        <li className="consultation-item">
            <div className="consultation-summary" onClick={() => setIsExpanded(!isExpanded)}>
                <span><strong>{consult.service}</strong> @ {consult.refere}</span>
                <span className="consultation-duration">{duration ? `${duration} jour(s)` : 'Durée N/A'}</span>
            </div>
            {isExpanded && (
                <div className="consultation-details">
                    <p><strong>Période :</strong> Du {formatDate(consult.dateDepart)} au {formatDate(consult.dateArrive)}</p>
                    <p><strong>Cadre référent :</strong> {consult.Cadre?.nom} ({consult.Cadre?.grade})</p>
                    <p><strong>Référence message :</strong> {consult.refMessage}</p>
                    <p><strong>Contact :</strong> {consult.phone}</p>

                    <p><strong>Status :</strong> {consult.status || 'Non renseigné'}</p>

                    <div style={{ margin: '10px 0', padding: '5px', backgroundColor: '#f0f4f8', borderRadius: '4px' }}>
                        <p style={{ margin: '2px 0' }}>
                            <i className="fa fa-bed fa-fw"></i> <strong>Hospitalisation :</strong> {consult.hospitalisation} jour(s)
                        </p>
                        <p style={{ margin: '2px 0' }}>
                            <i className="fa fa-heartbeat fa-fw"></i> <strong>Ambulatoire (Non hosp.) :</strong> {consult.Nonhospitalisation ?? 0} jour(s)
                        </p>
                    </div>

                    {consult.observation && (
                        <div style={{ marginTop: '10px' }}>
                            <strong>Observation :</strong>
                            <p className="consultation-observation" style={{
                                whiteSpace: 'pre-wrap',
                                fontStyle: 'italic',
                                color: '#555',
                                background: '#fff',
                                padding: '8px',
                                borderLeft: '3px solid #007bff',
                                marginTop: '5px'
                            }}>
                                {consult.observation}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </li>
    );
};

const AbsenceGroupItem = ({ group }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <li className="absence-item" onClick={() => setIsExpanded(!isExpanded)}>
            <div className="absence-summary">
                <span><strong>{group.motif}</strong> <span style={{fontSize: '0.8em', color: '#666'}}>({group.count})</span></span>
                <span className="absence-duration">Total : {group.totalDays} jour(s)</span>
            </div>
            {isExpanded && (
                 <div className="absence-details">
                    <p className="text-primary"><strong>Total cumulé :</strong> {group.totalDays} jours</p>
                    <hr style={{margin: '5px 0', borderColor: '#eee'}}/>
                    <p><strong>Détails des dates :</strong></p>
                    <ul style={{paddingLeft: '20px', margin: 0}}>
                        {group.dates.map((date, index) => (
                            <li key={index} style={{fontSize: '0.9em', color: '#555'}}>
                                {formatDate(date)}
                            </li>
                        ))}
                    </ul>
                 </div>
            )}
        </li>
    );
};

const ProfileInfoItem = ({ label, value, icon }) => (
    <div className="profile-info-item">
        <i className={`fa ${icon} fa-fw`}></i>
        <div>
            <span className="profile-info-label">{label}</span>
            <span className="profile-info-value">{value || 'Non renseigné'}</span>
        </div>
    </div>
);


const StudentDetailsModal = ({ student, examSubjects, typeExamen, onClose }) => {
    const [absences, setAbsences] = useState([]);
    const [processedAbsences, setProcessedAbsences] = useState([]);
    const [consultations, setConsultations] = useState([]);
    const [sanctions, setSanctions] = useState([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [photoUrl, setPhotoUrl] = useState(DEFAULT_AVATAR_URL);
    const [studentDetails, setStudentDetails] = useState(null);
    const [isImageFullscreen, setIsImageFullscreen] = useState(false);

    const [generalResults, setGeneralResults] = useState([]);
    const [loadingGeneral, setLoadingGeneral] = useState(false);

    useEffect(() => {
        if (!student) return;

        const currentIncorp = String(student.numero_incorporation || student.numeroIncorporation || '').trim();
        const eleveId = student.id;

        const fetchExternalData = async () => {
            setLoading(true);
            setError('');
            setStudentDetails(student);
            try {
                const [consultRes, absenceRes, detailsRes, sanctionsRes] = await Promise.allSettled([
                    axios.get(`http://192.168.241.169:4000/api/consultation/incorp/${currentIncorp}`),
                    axios.get(`http://192.168.241.169:4000/api/absence/incorp/${currentIncorp}`),
                    axios.get(`http://192.168.241.169:4000/api/eleve/incorporation/${currentIncorp}?cour=${FALLBACK_COUR_ID}`),
                    axios.get(`http://192.168.241.169:4000/api/sanctions`)
                ]);

                if (consultRes.status === 'fulfilled' && consultRes.value.data) {
                    setConsultations(Array.isArray(consultRes.value.data) ? consultRes.value.data : []);
                }
                if (absenceRes.status === 'fulfilled' && absenceRes.value.data) {
                    setAbsences(Array.isArray(absenceRes.value.data) ? absenceRes.value.data : []);
                }

                if (sanctionsRes.status === 'fulfilled' && sanctionsRes.value.data) {
                    const allSanctions = Array.isArray(sanctionsRes.value.data) ? sanctionsRes.value.data : [];
                    const studentSanctions = allSanctions.filter(s => {
                        return s.Eleve && String(s.Eleve.numeroIncorporation).trim() === currentIncorp;
                    });
                    setSanctions(studentSanctions);
                }

                if (detailsRes.status === 'fulfilled' && detailsRes.value.data?.eleve) {
                    const eleveInfo = detailsRes.value.data.eleve;
                    setStudentDetails(eleveInfo);
                    if (eleveInfo.image) {
                        setPhotoUrl(`http://192.168.241.169:4000${eleveInfo.image}`);
                    }
                }
            } catch (err) {
                setError('Impossible de charger les détails complets.');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchExternalData();
    }, [student]);

    useEffect(() => {
        if (typeExamen === 'General' && student) {
            const fetchGeneralBreakdown = async () => {
                setLoadingGeneral(true);
                const token = localStorage.getItem('token');
                const headers = { Authorization: `Bearer ${token}` };

                try {
                    const configRes = await axios.get('/api/configuration/examens', { headers });
                    const models = configRes.data;

                    const results = await Promise.all(models.map(async (model) => {
                        try {
                            const rankRes = await axios.get(`/api/resultats/classement-details?typeExamen=${model.nom_modele}`, { headers });
                            const studentData = rankRes.data.classement.find(s => s.id === student.id);

                            const hasNote = studentData && studentData.moyenne !== null;

                            return {
                                id: model.id,
                                name: model.nom_modele,
                                average: hasNote ? parseFloat(studentData.moyenne).toFixed(2) : null,
                                rank: hasNote ? (studentData.rang || studentData.statut) : 'Non classé',
                                isPassed: hasNote ? parseFloat(studentData.moyenne) >= 12 : false,
                                hasNote: hasNote
                            };
                        } catch (e) { 
                            return {
                                id: model.id,
                                name: model.nom_modele,
                                average: null,
                                rank: 'Erreur',
                                isPassed: false,
                                hasNote: false
                            };
                        }
                    }));

                    setGeneralResults(results.filter(r => r !== null));
                } catch (e) {
                    console.error("Erreur chargement détail général", e);
                } finally {
                    setLoadingGeneral(false);
                }
            };
            fetchGeneralBreakdown();
        }
    }, [student, typeExamen]);

    useEffect(() => {
        if (absences.length === 0) {
            setProcessedAbsences([]);
            return;
        }

        const groupedByMotif = absences.reduce((acc, current) => {
            const motifKey = current.motif || 'Non spécifié';
            if (!acc[motifKey]) acc[motifKey] = { motif: motifKey, count: 0, totalDays: 0, dates: [] };
            acc[motifKey].count += 1;
            acc[motifKey].totalDays += 1;
            acc[motifKey].dates.push(current.date);
            return acc;
        }, {});

        setProcessedAbsences(Object.values(groupedByMotif));
    }, [absences]);

    const consultationStats = useMemo(() => {
        if (consultations.length === 0) return null;
        const totalDays = consultations.reduce((sum, c) => sum + calculateDaysBetween(c.dateDepart, c.dateArrive), 0);
        let label = consultations.length === 1 ? `${totalDays} jours continue` : `${totalDays} jours discontinus`;
        return { totalDays, label };
    }, [consultations]);


    if (!student) return null;

    const displayStudent = studentDetails || student;
    const escadronText = displayStudent.escadron ? `${formatOrdinal(displayStudent.escadron)} Escadron` : '';
    const pelotonText = displayStudent.peloton ? `${formatOrdinal(displayStudent.peloton)} Peloton` : '';
    const groupText = [escadronText, pelotonText].filter(Boolean).join(' / ');

    return (
        <div className="modal-overlay" onClick={onClose}>
            {isImageFullscreen && (
                <div className="fullscreen-image-overlay" onClick={() => setIsImageFullscreen(false)}>
                    <img
                        src={photoUrl}
                        alt={`Photo de ${displayStudent.prenom} en plein écran`}
                        onError={() => setPhotoUrl(DEFAULT_AVATAR_URL)}
                    />
                </div>
            )}

            <div className="student-modal-cv-content" onClick={e => e.stopPropagation()}>
                <span onClick={onClose} className="cv-close-button">&times;</span>

                <div className="cv-grid">
                    <aside className="cv-profile-column">
                        <div className="cv-avatar-container">
                            {loading ? (
                                <div className="avatar-loader-wrapper">
                                    <div className='loading'>
                                      <div className='ball'></div>
                                      <div className='ball'></div>
                                      <div className='ball'></div>
                                      <div className='ball'></div>
                                      <svg viewBox="0 0 180 180" className="loading-text" width="180" height="180">
                                        <defs><path id="circlePath" d="M90,90 m-70,0 a70,70 0 1,1 140,0 a70,70 0 1,1 -140,0" /></defs>
                                        <text fill="white" fontSize="15" fontFamily="cursive" letterSpacing="2">
                                          <textPath href="#circlePath" startOffset="0%">
                                            EGNA...........................DI/SIT-INFO....................................
                                          </textPath>
                                        </text>
                                      </svg>
                                    </div>
                                </div>
                            ) : (
                                <img
                                    src={photoUrl}
                                    className="cv-avatar"
                                    alt={`Photo de ${displayStudent.prenom} ${displayStudent.nom}`}
                                    onError={() => setPhotoUrl(DEFAULT_AVATAR_URL)}
                                    onClick={() => setIsImageFullscreen(true)}
                                />
                            )}
                        </div>
                        <p className="cv-title-eg">EG</p>
                        <h2 className="cv-student-name">{displayStudent.prenom} {displayStudent.nom}</h2>

                        <hr style={{ margin: '20px 0' }} />
                        <div className="cv-info-list">
                            <div className="info-line"><i className="fa fa-home fa-fw"></i><span>{groupText || 'Groupe non défini'}</span></div>
                            <div className="info-line"><i className="fa fa-hashtag fa-fw"></i><span>Incorp: {displayStudent.numeroIncorporation || displayStudent.numero_incorporation}</span></div>
                            <div className="info-line"><i className="fa fa-id-card-o fa-fw"></i><span>Matricule: {displayStudent.matricule || 'N/A'}</span></div>
                            <div className="info-line"><i className="fa fa-vcard fa-fw"></i><span>CIN: {displayStudent.CIN || 'N/A'}</span></div>
                        </div>
                        <hr style={{ margin: '20px 0' }} />

                        <div className="cv-personal-details-list">
                            <ProfileInfoItem label="Date de Naissance" value={formatDate(displayStudent.dateNaissance)} icon="fa-calendar" />
                            <ProfileInfoItem label="Lieu de Naissance" value={displayStudent.lieuNaissance} icon="fa-map-pin" />
                            <ProfileInfoItem label="Situation Familiale" value={displayStudent.situationFamiliale} icon="fa-users" />
                            <ProfileInfoItem label="Téléphone" value={displayStudent.telephone1} icon="fa-phone" />
                            <ProfileInfoItem label="Niveau d'étude" value={displayStudent.niveau} icon="fa-graduation-cap" />
                            <ProfileInfoItem label="Religion" value={displayStudent.religion} icon="fa-book" />
                            <ProfileInfoItem label="N° Candidature" value={displayStudent.numCandidature} icon="fa-ticket" />
                        </div>
                    </aside>

                    <main className="cv-main-column">
                        <section className="cv-section">
                            <h3 className="cv-section-title"><i className="fa fa-pencil fa-fw"></i>Résultats - {typeExamen.replace(/_/g, ' ')}</h3>
                            <h4 className={`cv-average-display ${parseFloat(student.moyenne) < 12 ? 'average-fail' : ''}`}>Moyenne Générale : {student.moyenne} / 20</h4>
                            <div className="notes-grid">
                                {typeExamen === 'General' ? (
                                    loadingGeneral ? <p>Chargement des détails par examen...</p> : (
                                        generalResults.length > 0 ? (
                                            generalResults.map(res => (
                                                <div className="note-item" key={res.id} style={{
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '10px',
                                                    background: '#f8f9fa', marginBottom: '5px', 
                                                    borderLeft: res.hasNote ? (res.isPassed ? '4px solid #28a745' : '4px solid #dc3545') : '4px solid #6c757d'
                                                }}>
                                                    <span className="note-subject" style={{flex: 1, fontWeight: 'bold'}}>{res.name}</span>
                                                    <span className="note-score" style={{flex: 1, textAlign: 'center'}}>{res.hasNote ? `${res.average} / 20` : 'Non classé'}</span>
                                                    <span style={{flex: 1, textAlign: 'right', fontSize: '0.9em', color: '#555'}}>Rang: <strong>{res.rank}</strong></span>
                                                </div>
                                            ))
                                        ) : <p>Aucun résultat d'examen disponible.</p>
                                    )
                                ) : (
                                    examSubjects && examSubjects.length > 0 ? (
                                        examSubjects.map(subject => {
                                            const note = student.notesDetail && student.notesDetail[subject.id];
                                            const scoreClass = !note ? 'na' : parseFloat(note) < 12 ? 'low-score' : '';
                                            return (
                                                <div className="note-item" key={subject.id}>
                                                    <span className="note-subject">{subject.nom_matiere}</span>
                                                    <span className={`note-score ${scoreClass}`}>{note || 'N/A'}</span>
                                                </div>
                                            );
                                        })
                                    ) : <p>Aucune matière configurée.</p>
                                )}
                            </div>
                        </section>

                        <section className="cv-section">
                            <h3 className="cv-section-title"><i className="fa fa-medkit fa-fw"></i>Discipline & Suivi</h3>
                            {loading ? <p>Chargement...</p> : error ? <p>{error}</p> : (
                                <>
                                    <div className="external-info-item">
                                        <h5>Discipline</h5>
                                        {sanctions.length > 0 ? (
                                            <div className="sanction-container">
                                                <div className="sanction-alert-header">
                                                    <i className="fa fa-exclamation-triangle"></i>
                                                    <span>Attention : {sanctions.length} Sanction(s) enregistrée(s)</span>
                                                </div>
                                                <ul className="details-list">
                                                    {sanctions.map((s) => <SanctionItem key={s.id} sanction={s} />)}
                                                </ul>
                                            </div>
                                        ) : (
                                            <div className="sanction-clean">
                                                <i className="fa fa-check-circle"></i> <span>Élève non sanctionné</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="external-info-item">
                                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                            <h5>Consultations Externes ({consultations.length})</h5>
                                            {consultationStats && (
                                                <span className="absence-duration" style={{backgroundColor: '#28a745', color: '#fff'}}>
                                                    {consultationStats.label}
                                                </span>
                                            )}
                                        </div>

                                        {consultations.length > 0 ? (
                                            <ul className="details-list">
                                                {consultations.map((c) => <ConsultationItem key={c.id} consult={c} />)}
                                            </ul>
                                        ) : <p className="text-muted">Aucune consultation enregistrée.</p>}
                                    </div>

                                    <div className="external-info-item">
                                        <h5>Absences ({processedAbsences.reduce((acc, g) => acc + g.count, 0)})</h5>
                                        {processedAbsences.length > 0 ? (
                                            <ul className="details-list">
                                                {processedAbsences.map((group, index) => (
                                                    <AbsenceGroupItem key={group.motif || index} group={group} />
                                                ))}
                                            </ul>
                                        ) : <p className="text-muted">Aucune absence enregistrée.</p>}
                                    </div>
                                </>
                            )}
                        </section>
                    </main>
                </div>
            </div>
        </div>
    );
};

export default StudentDetailsModal;
