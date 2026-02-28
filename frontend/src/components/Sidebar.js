import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { IoPaperPlaneOutline } from 'react-icons/io5';
import { FiChevronLeft, FiLogOut } from "react-icons/fi";
import './Sidebar.css';

const NavLink = ({ item, isActive, isCollapsed }) => (
  <li className="nav-list-item">
    <Link to={item.to} className={`nav-link ${isActive ? 'active' : ''}`}>
      <div className="nav-icon">{item.icon}</div>
      <span className="nav-label">{item.label}</span>
    </Link>
  </li>
);

const NavGroup = ({ item, isCollapsed }) => {
  const location = useLocation();
  return (
    <li className="nav-group">
      {!isCollapsed && <h3 className="nav-group-title">{item.label}</h3>}
      <ul className="nav-group-list">
        {item.subItems.map(subItem => (
          <li key={subItem.to} className="nav-list-item">
            <Link
              to={subItem.to}
              className={`nav-link ${location.pathname === subItem.to ? 'active' : ''}`}
            >
             <div className="nav-icon">{subItem.icon}</div>
             <span className="nav-label">{subItem.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </li>
  );
};

const Sidebar = ({ items, onLogout, isCollapsed, toggleSidebar, user }) => {
  const location = useLocation();

  const userInitials = user?.nom_utilisateur
    ? user.nom_utilisateur.substring(0, 2).toUpperCase()
    : '??';

  const userRole = user?.role
    ? user.role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
    : 'Rôle inconnu';

  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <IoPaperPlaneOutline size={32} className="sidebar-logo-icon" />
        <h1 className="sidebar-logo-text">GestionNote</h1>
        <button className="sidebar-toggle" onClick={toggleSidebar}>
          <FiChevronLeft />
        </button>
      </div>

      <nav className="sidebar-nav">
        <ul>
          {items.map(item =>
            item.subItems ? (
              <NavGroup key={item.label} item={item} isCollapsed={isCollapsed} />
            ) : (
              <NavLink
                key={item.to}
                item={item}
                isActive={location.pathname === item.to}
                isCollapsed={isCollapsed}
              />
            )
          )}
        </ul>
      </nav>

      <div className="sidebar-footer">
        <div className="user-profile">
            <div className="user-avatar">
                <span>{userInitials}</span>
            </div>
            <div className="user-details">
                <span className="user-name">{user?.nom_utilisateur}</span>
                <span className="user-email">{userRole}</span>
            </div>
            <button onClick={onLogout} className="logout-button">
              <FiLogOut />
            </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
