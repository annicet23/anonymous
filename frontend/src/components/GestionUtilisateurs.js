// src/components/GestionUtilisateurs.js

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './GestionUtilisateurs.css';

// Une icône simple pour la fermeture, pour ne pas dépendre d'une librairie externe
const CloseIcon = () => (
    <svg height="20" width="20" viewBox="0 0 20 20">
        <path d="M15.898,4.045c-0.271-0.272-0.713-0.272-0.986,0l-4.71,4.711L5.491,4.045c-0.272-0.272-0.714-0.272-0.986,0s-0.272,0.714,0,0.986l4.709,4.711l-4.71,4.711c-0.272,0.271-0.272,0.713,0,0.986c0.136,0.136,0.314,0.203,0.492,0.203c0.179,0,0.357-0.067,0.493-0.203l4.71-4.711l4.71,4.711c0.137,0.136,0.314,0.203,0.494,0.203c0.178,0,0.355-0.067,0.492-0.203c0.272-0.271,0.272-0.713,0-0.986l-4.71-4.711l4.71-4.711C16.172,4.759,16.172,4.317,15.898,4.045z"></path>
    </svg>
);

const GestionUtilisateurs = () => {
    const [users, setUsers] = useState([]);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [roleSelections, setRoleSelections] = useState({});

    // --- AJOUT 1: États pour gérer la modification en ligne ---
    const [editingUserId, setEditingUserId] = useState(null); // L'ID de l'utilisateur en cours de modification
    const [newRole, setNewRole] = useState(''); // Le nouveau rôle sélectionné pendant la modification

    // Sépare les utilisateurs pour un affichage plus clair
    const pendingUsers = users.filter(user => user.statut === 'en_attente');
    const activeUsers = users.filter(user => user.statut !== 'en_attente');
    const ROLES = ['admin', 'operateur_code', 'operateur_note'];

    const getAuthHeaders = () => {
        const token = localStorage.getItem('token');
        return { headers: { Authorization: `Bearer ${token}` } };
    };

    const fetchUsers = async () => {
        try {
            const response = await axios.get('/api/utilisateurs', getAuthHeaders());
            setUsers(response.data);
        } catch (err) {
            setError('Impossible de charger les utilisateurs.');
            setTimeout(() => setError(''), 5000);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleDelete = async (userId) => {
        if (window.confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ? Cette action est irréversible.')) {
            try {
                await axios.delete(`/api/utilisateurs/${userId}`, getAuthHeaders());
                setSuccess('Utilisateur supprimé avec succès !');
                fetchUsers();
            } catch (err) {
                setError(err.response?.data?.message || 'Erreur lors de la suppression.');
            } finally {
                setTimeout(() => setSuccess(''), 3000);
            }
        }
    };

    const handleApprove = async (user) => {
        const role = roleSelections[user.id];
        if (!role) {
            alert(`Veuillez sélectionner un rôle pour ${user.nom_utilisateur}.`);
            return;
        }

        try {
            await axios.put(`/api/utilisateurs/${user.id}/approuver`, { role }, getAuthHeaders());
            setSuccess('Utilisateur approuvé avec succès !');
            fetchUsers();
            if (pendingUsers.length === 1) { // Si c'était le dernier, on ferme la modale
                setIsModalOpen(false);
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Erreur lors de l\'approbation.');
        } finally {
            setTimeout(() => setSuccess(''), 3000);
        }
    };

    const handleReject = async (userId) => {
        if (window.confirm('Êtes-vous sûr de vouloir rejeter cette demande ?')) {
            try {
                await axios.put(`/api/utilisateurs/${userId}/rejeter`, {}, getAuthHeaders());
                setSuccess('Demande rejetée.');
                fetchUsers();
                if (pendingUsers.length === 1) {
                    setIsModalOpen(false);
                }
            } catch (err) {
                setError(err.response?.data?.message || 'Erreur lors du rejet.');
            } finally {
                setTimeout(() => setSuccess(''), 3000);
            }
        }
    };

    const handleRoleChange = (userId, role) => {
        setRoleSelections(prev => ({ ...prev, [userId]: role }));
    };

    // --- AJOUT 2: Fonctions pour gérer le mode édition ---

    // Active le mode édition pour une ligne
    const handleEditClick = (user) => {
        setEditingUserId(user.id);
        setNewRole(user.role); // Pré-remplit le select avec le rôle actuel
    };

    // Annule le mode édition
    const handleCancelEdit = () => {
        setEditingUserId(null);
        setNewRole('');
    };

    // Sauvegarde le nouveau rôle
    const handleSaveRole = async (userToUpdate) => {
        if (!newRole) {
            setError('Veuillez sélectionner un rôle.');
            setTimeout(() => setError(''), 3000);
            return;
        }

        try {
            // On utilise la route PUT existante. Elle nécessite le nom_utilisateur et le role.
            // On envoie le nom d'utilisateur actuel pour ne pas le changer.
            await axios.put(`/api/utilisateurs/${userToUpdate.id}`, {
                role: newRole,
                nom_utilisateur: userToUpdate.nom_utilisateur // Important: Le backend l'exige
            }, getAuthHeaders());

            setSuccess('Rôle mis à jour avec succès !');
            setEditingUserId(null); // Quitte le mode édition
            fetchUsers(); // Rafraîchit la liste des utilisateurs
        } catch (err) {
            setError(err.response?.data?.message || 'Erreur lors de la mise à jour du rôle.');
        } finally {
            setTimeout(() => setSuccess(''), 3000);
        }
    };

    return (
        <div className="gestion-container">
            <h2>Gestion des Utilisateurs</h2>

            {error && <p className="error-message">{error}</p>}
            {success && <p className="success-message">{success}</p>}

            <div className="gestion-header">
                <h3>Liste des utilisateurs</h3>
                <button className="requests-button" onClick={() => setIsModalOpen(true)}>
                    Demandes en attente
                    {pendingUsers.length > 0 && <span className="requests-count">{pendingUsers.length}</span>}
                </button>
            </div>

            <table className="users-table">
                <thead>
                    <tr>
                        <th>Nom Complet</th>
                        <th>Nom d'utilisateur</th>
                        <th>Rôle</th>
                        <th>Statut</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {activeUsers.length > 0 ? activeUsers.map((user) => (
                        <tr key={user.id}>
                            <td>{user.nom} {user.prenom}</td>
                            <td>{user.nom_utilisateur}</td>
                            {/* --- MODIFICATION 1: Affichage conditionnel du rôle --- */}
                            <td>
                                {editingUserId === user.id ? (
                                    <select
                                        className="role-select"
                                        value={newRole}
                                        onChange={(e) => setNewRole(e.target.value)}
                                    >
                                        <option value="" disabled>Choisir un rôle...</option>
                                        {ROLES.map(role => (
                                            <option key={role} value={role}>
                                                {role.replace('_', ' ')}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    user.role || 'N/A'
                                )}
                            </td>
                            <td>
                                <span className={`status-badge status-${user.statut}`}>
                                    {user.statut.replace('_', ' ')}
                                </span>
                            </td>
                            {/* --- MODIFICATION 2: Affichage conditionnel des boutons d'action --- */}
                            <td className="actions">
                                {editingUserId === user.id ? (
                                    <>
                                        <button className="approve-btn" onClick={() => handleSaveRole(user)}>Enregistrer</button>
                                        <button className="reject-btn" onClick={handleCancelEdit}>Annuler</button>
                                    </>
                                ) : (
                                    <>
                                        <button className="modify-btn" onClick={() => handleEditClick(user)}>Modifier Rôle</button>
                                        <button className="delete-btn" onClick={() => handleDelete(user.id)}>Supprimer</button>
                                    </>
                                )}
                            </td>
                        </tr>
                    )) : (
                        <tr>
                            <td colSpan="5" style={{ textAlign: 'center' }}>Aucun utilisateur actif.</td>
                        </tr>
                    )}
                </tbody>
            </table>

            {isModalOpen && (
                <div className="modal-overlay">
                    {/* ... (le contenu de la modale reste inchangé) ... */}
                    <div className="modal-content">
                        <div className="modal-header">
                            <h4>Demandes d'inscription en attente</h4>
                            <button className="modal-close-btn" onClick={() => setIsModalOpen(false)}>
                                <CloseIcon />
                            </button>
                        </div>
                        <div className="modal-body">
                            <table className="users-table modal-table">
                                <thead>
                                    <tr>
                                        <th>Nom Complet</th>
                                        <th>Nom d'utilisateur</th>
                                        <th>Attribuer un rôle</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pendingUsers.map((user) => (
                                        <tr key={user.id}>
                                            <td>{user.nom} {user.prenom}</td>
                                            <td>{user.nom_utilisateur}</td>
                                            <td>
                                                <select
                                                    className="role-select"
                                                    value={roleSelections[user.id] || ''}
                                                    onChange={(e) => handleRoleChange(user.id, e.target.value)}
                                                >
                                                    <option value="" disabled>Choisir un rôle...</option>
                                                    {ROLES.map(role => (
                                                        <option key={role} value={role}>
                                                            {role.replace('_', ' ')}
                                                        </option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td className="actions">
                                                <button className="approve-btn" onClick={() => handleApprove(user)}>Approuver</button>
                                                <button className="reject-btn" onClick={() => handleReject(user.id)}>Rejeter</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GestionUtilisateurs;
