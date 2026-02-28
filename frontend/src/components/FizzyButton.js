import React, { useState, useEffect } from 'react';
import { FaDownload, FaCheck } from 'react-icons/fa';
import './FizzyButton.css'; // <--- ON IMPORTE UN FICHIER .css MAINTENANT

const FizzyButton = ({ triggerAnimation }) => {
    const [isAnimating, setIsAnimating] = useState(false);
    const [buttonText, setButtonText] = useState('Bilan généré');

    useEffect(() => {
        let textTimeout;
        if (triggerAnimation) {
            setIsAnimating(true);

            textTimeout = setTimeout(() => {
                setButtonText('Enregistrement...');
            }, 100);
        }

        return () => {
            clearTimeout(textTimeout);
        };
    }, [triggerAnimation]);

    // Génère les 52 divs pour les particules
    const spots = Array.from({ length: 52 }).map((_, i) => (
        <div key={i} className="button_spots"></div>
    ));

    return (
        <div className={`button ${isAnimating ? 'is-animating' : ''}`}>
            <div className="button_inner q">
                <i className="l"> <FaDownload /> </i>
                <span className="t">{buttonText}</span>
                <span>
                    <i className="tick"> <FaCheck /> </i>
                </span>
                <div className="b_l_quad">
                    {spots}
                </div>
            </div>
        </div>
    );
};

export default FizzyButton;
