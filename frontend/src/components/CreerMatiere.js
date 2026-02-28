import React, { useState } from 'react';
import axios from 'axios';

function CreerMatiere() {
    const [nomMatiere, setNomMatiere] = useState('');
    const [message, setMessage] = useState('');
    const [isError, setIsError] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (nomMatiere.trim() === '') {
            setMessage('Veuillez entrer un nom de matière.');
            setIsError(true);
            return;
        }

        const token = localStorage.getItem('token');
        if (!token) {
            setMessage('Session expirée. Veuillez vous reconnecter.');
            setIsError(true);
            return;
        }

        try {
            const response = await axios.post('/api/matieres', {
                nom_matiere: nomMatiere
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setMessage(response.data.message);
            setIsError(false);
            setNomMatiere('');
        } catch (error) {
            setMessage(error.response?.data?.message || 'Une erreur est survenue.');
            setIsError(true);
            console.error(error);
        }
    };

    return (
        <div>
            <h2>Créer une nouvelle matière</h2>
            <form onSubmit={handleSubmit}>
                <div>
                    <label>Nom de la matière : </label>
                    <input
                        type="text"
                        placeholder="Ex:APJ"
                        value={nomMatiere}
                        onChange={(e) => setNomMatiere(e.target.value)}
                    />
                </div>
                <br/>
                <button type="submit">Créer la matière</button>
            </form>
            {message && <p style={{ color: isError ? 'red' : 'green', marginTop: '15px' }}>{message}</p>}
        </div>
    );
}

export default CreerMatiere;
