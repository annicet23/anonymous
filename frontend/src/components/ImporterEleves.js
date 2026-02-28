import React, { useState } from 'react';
import axios from 'axios';
import './ImporterEleves.css';
import apiPaths from '../config/apiPaths';

const ImporterEleves = () => {
    const [selectedFile, setSelectedFile] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const handleFileChange = (event) => {
        setSelectedFile(event.target.files[0]);
        setMessage('');
        setError('');
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!selectedFile) {
            setError('Veuillez sélectionner un fichier Excel.');
            return;
        }

        setIsLoading(true);
        setError('');
        setMessage('');

        const formData = new FormData();
        formData.append('fichierEleves', selectedFile);

        const token = localStorage.getItem('token');
        if (!token) {
            setError("Session expirée. Veuillez vous reconnecter.");
            setIsLoading(false);
            return;
        }

        try {
            const response = await axios.post(apiPaths.eleves.importer, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    'Authorization': `Bearer ${token}`
                },
            });
            setMessage(response.data.message);
            setSelectedFile(null);
            document.getElementById('file-input').value = '';
        } catch (err) {
            setError(err.response?.data?.message || 'Une erreur est survenue lors de l\'importation.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="importer-container">
            <h2>Importer la Liste des Élèves</h2>

            {/* --- PARAGRAPHE D'INSTRUCTIONS MODIFIÉ --- */}
            <p className="instructions">
                Sélectionnez un fichier Excel (.xlsx, .xls). Le fichier doit respecter le format suivant (la première ligne est ignorée) :
                <br/>
                <ul>
                    <li><strong>Colonne A :</strong> Numéro d'Incorporation (Obligatoire et unique)</li>
                    <li><strong>Colonne B :</strong> Nom et Prénom (Format : <code>NOM Prénom</code>)</li>
                    <li><strong>Colonne C :</strong> Sexe (<code>M</code> pour masculin, <code>F</code> pour féminin)</li>
                    <li><strong>Colonne D :</strong> Escadron (Numéro)</li>
                    <li><strong>Colonne E :</strong> Peloton (Numéro)</li>
                </ul>
                <strong>Attention :</strong> L'importation remplacera <strong>toutes</strong> les données des élèves et des copies existantes.
            </p>

            <form onSubmit={handleSubmit} className="importer-form">
                <input
                    type="file"
                    id="file-input"
                    accept=".xlsx, .xls"
                    onChange={handleFileChange}
                />
                <button type="submit" disabled={isLoading || !selectedFile}>
                    {isLoading ? 'Importation en cours...' : 'Importer'}
                </button>
            </form>

            {message && <p className="success-message">{message}</p>}
            {error && <p className="error-message">{error}</p>}
        </div>
    );
};

export default ImporterEleves;
