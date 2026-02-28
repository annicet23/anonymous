import React from 'react';
import { FaInfoCircle } from 'react-icons/fa';
import './Toast.css'; // Nous allons créer ce fichier CSS

function Toast({ message, show }) {
  return (
    // On utilise les classes pour contrôler la visibilité, comme dans votre exemple
    <div id="toast" className={show ? 'show' : ''}>
      <div id="img"><FaInfoCircle size={20} /></div>
      <div id="desc">{message}</div>
    </div>
  );
}

export default Toast;
