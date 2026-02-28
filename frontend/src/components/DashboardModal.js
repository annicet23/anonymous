// frontend/src/components/DashboardModal.js
import React from 'react';
import './Dashboard.css'; // On réutilise le même CSS

const DashboardModal = ({ title, data, columns, onClose, isLoading }) => {
    if (!data) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{title}</h3>
                    <button className="close-button" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    {isLoading ? (
                        <p>Chargement...</p>
                    ) : (
                        data.length > 0 ? (
                            <div className="table-responsive-dashboard modal-table">
                                <table className="results-table dense">
                                    <thead>
                                        <tr>
                                            {columns.map(col => <th key={col.key}>{col.header}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.map((item, index) => (
                                            <tr key={index}>
                                                {columns.map(col => <td key={col.key}>{item[col.key]}</td>)}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="no-data-text">Aucune donnée à afficher.</p>
                        )
                    )}
                </div>
            </div>
        </div>
    );
};

export default DashboardModal;
