import React, { useState } from 'react';
import axios from 'axios';
import './ImporterEleves.css'; // Vous pouvez réutiliser le même style
import apiPaths from '../config/apiPaths';


const ImporterCodes = () => {
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
        formData.append('fichierCodes', selectedFile);

        // LIGNE MODIFIÉE : On récupère le token directement depuis le localStorage
        const token = localStorage.getItem('token');

        if (!token) {
            setError("Session expirée. Veuillez vous reconnecter.");
            setIsLoading(false);
            return;
        }

        try {
           const response = await axios.post(apiPaths.codes.importer, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    'Authorization': `Bearer ${token}`
                },
            });
            setMessage(response.data.message);
            setSelectedFile(null);
            if(document.getElementById('file-input-codes')) {
                document.getElementById('file-input-codes').value = '';
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Une erreur est survenue lors de l\'importation.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="importer-container">
            <h2>Importer la Liste des Codes Anonymes</h2>

            <div className="instructions">
                <p>Sélectionnez un fichier Excel (.xlsx, .xls) contenant la liste des codes anonymes à utiliser pour les copies.</p>
                 <p><strong>Règles d'importation :</strong></p>
                <ul>
                    <li>Le système lira <strong>uniquement la colonne A</strong> de votre fichier.</li>
                    <li>Les codes en double seront ignorés.</li>
                </ul>
                <p className="warning">
                    <strong>Attention :</strong> Cette action remplacera la liste précédente de codes anonymes disponibles.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="importer-form">
                <input
                    type="file"
                    id="file-input-codes"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleFileChange}
                />
                <button type="submit" disabled={isLoading || !selectedFile}>
                    {isLoading ? 'Importation en cours...' : 'Importer les Codes'}
                </button>
            </form>

            {message && <p className="success-message">{message}</p>}
            {error && <p className="error-message">{error}</p>}
        </div>
    );
};

export default ImporterCodes;
