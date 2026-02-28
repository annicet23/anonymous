import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './AuthPage.css';

// MODIFIÉ : Le composant Notification a une nouvelle logique de style
const Notification = ({ title, message, index, total }) => {
    // Le nombre de notifications qui doivent rester parfaitement visibles
    const visibleLimit = 3;

    // Calcule la "position" de la notification : 0 = la plus récente, 1 = la précédente, etc.
    const position = total - 1 - index;

    let style = {
        zIndex: total - position // Assure que les nouvelles sont toujours au-dessus
    };

    // Si la notification fait partie des 3 plus récentes (position 0, 1, ou 2),
    // elle reste claire et nette.
    if (position < visibleLimit) {
        style = {
            ...style,
            opacity: 1,
            filter: 'blur(0px)',
            transform: 'scale(1)'
        };
    } else {
        // Sinon (si c'est la 4ème ou plus ancienne), on applique le flou et la transparence
        // L'effet est progressif : la 4ème est un peu floue, la 5ème le serait encore plus, etc.
        const effectIndex = position - visibleLimit + 1;
        style = {
            ...style,
            opacity: Math.max(1 - effectIndex * 0.5, 0),
            filter: `blur(${effectIndex * 2}px)`,
            transform: `scale(${1 - effectIndex * 0.05})`
        };
    }

    return (
        <div className="note" style={style}>
            <div className="note__inner">
                <div className="note__content">
                    <h3 className="note__title">{title}</h3>
                    <p className="note__message">{message}</p>
                </div>
            </div>
        </div>
    );
};

// MODIFIÉ : On s'assure que notesMax est à 4 pour voir l'effet
const NotificationCenter = () => {
    const messages = [
        { title: "Technologie Avancée", text: "Découvrez une technologie de pointe au service de l’équité et de la performance." },
        { title: "Sécurité Garantie", text: "Connexion sécurisée, données protégées, et une évaluation totalement impartiale." },
        { title: "Confidentialité", text: "Chaque donnée est traitée avec la plus grande précision, chaque note reste confidentielle." },
        { title: "Évaluation Impartiale", text: "Notre plateforme garantit une évaluation impartiale, anonyme et rapide." },
        { title: "Transparence", text: "Une traçabilité complète pour assurer transparence, fiabilité et responsabilité à chaque étape." }
    ];

    const [notifications, setNotifications] = useState([]);
    const messageIndexRef = useRef(0);
    // On garde 4 notifications à l'écran : 3 visibles + 1 qui commence à disparaître
    const notesMax = 4;

    useEffect(() => {
        const intervalId = setInterval(() => {
            const currentMessage = messages[messageIndexRef.current];
            messageIndexRef.current = (messageIndexRef.current + 1) % messages.length;

            const newNotification = {
                id: Date.now(),
                title: currentMessage.title,
                message: currentMessage.text,
            };

            setNotifications(prev => {
                const updated = [...prev, newNotification];
                return updated.slice(-notesMax);
            });

        }, 5000);

        return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="notification-center">
            {notifications.map((note, index) => (
                <Notification key={note.id} {...note} index={index} total={notifications.length} />
            ))}
        </div>
    );
};


const AuthPage = ({ onLoginSuccess }) => {
    const [isSignUpActive, setIsSignUpActive] = useState(false);

    const [loginData, setLoginData] = useState({ nom_utilisateur: '', password: '' });
    const [isLoginLoading, setIsLoginLoading] = useState(false);
    const [loginError, setLoginError] = useState('');

    const [registerData, setRegisterData] = useState({
        nom: '', prenom: '', matricule: '', service: '', numero_telephone: '',
        nom_utilisateur: '', mot_de_passe: '', role: 'operateur_note'
    });
    const [isRegisterLoading, setIsRegisterLoading] = useState(false);
    const [registerError, setRegisterError] = useState('');
    const [registerSuccess, setRegisterSuccess] = useState('');

    const handleLoginChange = (e) => setLoginData({ ...loginData, [e.target.name]: e.target.value });
    const handleRegisterChange = (e) => setRegisterData({ ...registerData, [e.target.name]: e.target.value });

    const handleLoginSubmit = async (e) => {
        e.preventDefault();
        setIsLoginLoading(true);
        setLoginError('');
        try {
            const response = await axios.post('/api/login', loginData);
            localStorage.setItem('token', response.data.token);
            onLoginSuccess();
        } catch (err) {
            setLoginError(err.response?.data?.message || "Nom d'utilisateur ou mot de passe incorrect.");
        } finally {
            setIsLoginLoading(false);
        }
    };

    const handleRegisterSubmit = async (e) => {
        e.preventDefault();
        setIsRegisterLoading(true);
        setRegisterError('');
        setRegisterSuccess('');
        try {
            const response = await axios.post('/api/register', registerData);
            setRegisterSuccess(response.data.message);
            setRegisterData({
                nom: '', prenom: '', matricule: '', service: '',
                numero_telephone: '', nom_utilisateur: '', mot_de_passe: '', role: 'operateur_note'
            });
        } catch (err) {
            setRegisterError(err.response?.data?.message || 'Une erreur est survenue.');
        } finally {
            setIsRegisterLoading(false);
        }
    };

    return (
        <div className="auth-page-wrapper">
            <div className={`container ${isSignUpActive ? 'right-panel-active' : ''}`}>
                <div className="container__form container--signup">
                    <form className="form" onSubmit={handleRegisterSubmit}>
                        <h2 className="form__title">Créer un compte</h2>
                        <input type="text" placeholder="Nom *" name="nom" value={registerData.nom} onChange={handleRegisterChange} className="input" required />
                        <input type="text" placeholder="Prénom *" name="prenom" value={registerData.prenom} onChange={handleRegisterChange} className="input" required />
                        <input type="text" placeholder="Matricule" name="matricule" value={registerData.matricule} onChange={handleRegisterChange} className="input" />
                        <input type="text" placeholder="Service" name="service" value={registerData.service} onChange={handleRegisterChange} className="input" />
                        <input type="tel" placeholder="N° de téléphone" name="numero_telephone" value={registerData.numero_telephone} onChange={handleRegisterChange} className="input" />
                        <select name="role" value={registerData.role} onChange={handleRegisterChange} className="input" required>
                            <option value="operateur_note">Demander le rôle: Opérateur de Note</option>
                            <option value="operateur_code">Demander le rôle: Opérateur de Code</option>
                            <option value="admin">Demander le rôle: Administrateur</option>
                        </select>
                        <input type="text" placeholder="Nom d'utilisateur *" name="nom_utilisateur" value={registerData.nom_utilisateur} onChange={handleRegisterChange} className="input" autoComplete="username" required />
                        <input type="password" placeholder="Mot de passe *" name="mot_de_passe" value={registerData.mot_de_passe} onChange={handleRegisterChange} className="input" autoComplete="new-password" required />
                        <button className="btn" type="submit" disabled={isRegisterLoading}>
                            {isRegisterLoading ? 'Envoi...' : 'Envoyer la demande'}
                        </button>
                        {registerError && <p className="message error">{registerError}</p>}
                        {registerSuccess && <p className="message success">{registerSuccess}</p>}
                    </form>
                </div>

                <div className="container__form container--signin">
                    <form className="form" onSubmit={handleLoginSubmit}>
                        <h2 className="form__title">Se connecter</h2>
                        <input type="text" placeholder="Nom d'utilisateur" name="nom_utilisateur" value={loginData.nom_utilisateur} onChange={handleLoginChange} className="input" autoComplete="username" required />
                        <input type="password" placeholder="Mot de passe" name="password" value={loginData.password} onChange={handleLoginChange} className="input" autoComplete="current-password" required />
                        <a href="#" className="link">Mot de passe oublié ?</a>
                        <button className="btn" type="submit" disabled={isLoginLoading}>
                            {isLoginLoading ? 'Connexion...' : 'Se connecter'}
                        </button>
                         {loginError && <p className="message error">{loginError}</p>}
                    </form>
                </div>

                <div className="container__overlay">
                    <div className="overlay">
                        <div className="overlay__panel overlay--left">
                            <h1>Heureux de vous revoir !</h1>
                            <p>Pour rester connecté avec nous, veuillez vous connecter avec vos informations personnelles</p>
                            <button className="btn" onClick={() => setIsSignUpActive(false)}>Se connecter</button>
                        </div>
                        <div className="overlay__panel overlay--right">
                            <h1>Mes respect !</h1>
                            <p>Veuillez saisir vos informations personnelles. Elles sont indispensables pour que l’administrateur puisse examiner et approuver votre accès à l’application.</p>
                            <button className="btn" onClick={() => setIsSignUpActive(true)}>Créer un compte</button>
                        </div>
                    </div>
                </div>
            </div>

            <NotificationCenter />
        </div>
    );
};

export default AuthPage;

