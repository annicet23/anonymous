// src/components/GlobalActivityTracker.js
import { useEffect, useRef } from 'react';
import axios from 'axios';

const GlobalActivityTracker = () => {
    const typingTimeoutRef = useRef(null);
    const lastClickTimeRef = useRef(0);

    // Fonction pour envoyer le log au backend
    const logActivity = async (description) => {
        try {
            const token = localStorage.getItem('token');
            // On ne loggue que si l'utilisateur est connecté
            if (!token) return; 

            // Adaptez le chemin si nécessaire, ici c'est celui par défaut
            const url = '/api/logs/frontend-activity'; 
            
            await axios.post(url, { description }, { headers: { Authorization: `Bearer ${token}` } });
        } catch (error) {
            // On reste silencieux en cas d'erreur pour ne pas bloquer l'interface
        }
    };

    useEffect(() => {
        // --- 1. HEARTBEAT (Présence en ligne) ---
        const sendHeartbeat = async () => {
            try {
                const token = localStorage.getItem('token');
                if (token) {
                    await axios.post('/api/user/heartbeat', {}, { headers: { Authorization: `Bearer ${token}` } });
                }
            } catch (e) {}
        };

        // Envoyer immédiatement au chargement, puis toutes les 30 secondes
        sendHeartbeat();
        const interval = setInterval(sendHeartbeat, 30000);

        // --- 2. SURVEILLANCE DES CLICS ---
        const handleClick = (e) => {
            const now = Date.now();
            // Anti-doublon (debounce) pour éviter trop de requêtes sur un double clic rapide
            if (now - lastClickTimeRef.current < 500) return;
            lastClickTimeRef.current = now;

            let target = e.target;
            // Si on clique sur une icône dans un bouton, on essaie de récupérer le parent
            if (!target.innerText && target.parentElement) target = target.parentElement;

            // Récupérer des infos sur l'élément (Tag, ID, Classe)
            const elementInfo = target.tagName + 
                                (target.id ? `#${target.id}` : '') + 
                                (target.className && typeof target.className === 'string' ? `.${target.className.split(' ')[0]}` : '');
            
            // Récupérer le texte (limité à 30 chars)
            const textContent = target.innerText ? target.innerText.substring(0, 30) : '';

            logActivity(`CLIC sur [${elementInfo}] : "${textContent.replace(/\n/g, ' ')}"`);
        };

        // --- 3. SURVEILLANCE DU CLAVIER ---
        const handleInput = (e) => {
            const target = e.target;
            
            // SÉCURITÉ : Ne jamais lire le contenu des champs mot de passe
            if (target.type === 'password') {
                logActivity(`ÉCRITURE dans champ mot de passe (masqué)`);
                return;
            }

            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

            // On attend 1.5 seconde après la dernière frappe pour envoyer le log
            // afin d'avoir le contenu complet et non lettre par lettre
            typingTimeoutRef.current = setTimeout(() => {
                const fieldName = target.name || target.id || target.placeholder || 'Champ inconnu';
                const value = target.value;
                if (value && value.trim().length > 0) {
                    logActivity(`A ÉCRIT dans [${fieldName}] : "${value}"`);
                }
            }, 1500);
        };

        // Attacher les écouteurs sur tout le document
        document.addEventListener('click', handleClick);
        document.addEventListener('input', handleInput);

        // Nettoyage quand le composant est démonté
        return () => {
            clearInterval(interval);
            document.removeEventListener('click', handleClick);
            document.removeEventListener('input', handleInput);
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        };
    }, []);

    // Ce composant est invisible
    return null;
};

export default GlobalActivityTracker;
