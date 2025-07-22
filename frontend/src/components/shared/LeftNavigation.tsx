import React from 'react';
import {
  Nav,
  NavItem,
  NavList,
  Title,
} from '@patternfly/react-core';
import { 
  FlaskIcon,
  ChartLineIcon,
  CodeIcon,
  CogIcon,
  HistoryIcon,
} from '@patternfly/react-icons';

export type NavigationPage = 'playground' | 'prompt' | 'evaluation' | 'backend-testing' | 'settings';

interface LeftNavigationProps {
  activePage: NavigationPage;
  onPageChange: (page: NavigationPage) => void;
  projectName: string;
}

interface NavMenuItem {
  id: NavigationPage;
  label: string;
  icon: React.ComponentType;
  description: string;
}

const navigationItems: NavMenuItem[] = [
  {
    id: 'playground',
    label: 'Playground',
    icon: FlaskIcon,
    description: 'Interactive prompt experimentation'
  },
  {
    id: 'prompt',
    label: 'Prompts',
    icon: HistoryIcon,
    description: 'Browse and analyze prompt history'
  },
  // Future menu items (commented out for now)
  // {
  //   id: 'evaluation',
  //   label: 'Evaluation',
  //   icon: ChartLineIcon,
  //   description: 'Automated prompt evaluation'
  // },
  // {
  //   id: 'backend-testing',
  //   label: 'Backend Testing',
  //   icon: CodeIcon,
  //   description: 'Test external API endpoints'
  // },
  // {
  //   id: 'settings',
  //   label: 'Settings',
  //   icon: CogIcon,
  //   description: 'Project configuration'
  // },
];

export const LeftNavigation: React.FC<LeftNavigationProps> = ({
  activePage,
  onPageChange,
  projectName,
}) => {
  return (
    <div style={{
      width: '250px',
      height: '100%',
      backgroundColor: '#ffffff',
      borderRight: '1px solid #d2d2d2',
      display: 'flex',
      flexDirection: 'column',
      padding: '1rem 0',
    }}>
      {/* Project Header */}
      <div style={{ 
        padding: '0 1rem 1rem 1rem', 
        borderBottom: '1px solid #e0e0e0',
        marginBottom: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
          <img 
            src="/grimoire-logo.png" 
            alt="Grimoire Logo" 
            style={{ width: '24px', height: '24px', marginRight: '8px' }}
          />
          <Title headingLevel="h3" size="md" style={{ margin: 0, color: '#333' }}>
            {projectName}
          </Title>
        </div>
        <div style={{ 
          fontSize: '0.875rem', 
          color: '#666',
          fontWeight: 500 
        }}>
          Experiment Workspace
        </div>
      </div>

      {/* Navigation Menu */}
      <div style={{ flex: 1, padding: '0 0.5rem' }}>
        <Nav variant="tertiary">
          <NavList>
            {navigationItems.map((item) => {
              const IconComponent = item.icon;
              const isActive = activePage === item.id;
              
              return (
                <NavItem
                  key={item.id}
                  isActive={isActive}
                  onClick={() => onPageChange(item.id)}
                  style={{
                    cursor: 'pointer',
                    borderRadius: '6px',
                    margin: '2px 0',
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '8px 12px',
                    color: isActive ? '#0066cc' : '#333',
                    backgroundColor: isActive ? '#f0f8ff' : 'transparent',
                    borderRadius: '6px',
                    transition: 'all 0.2s ease',
                    fontWeight: isActive ? 600 : 400,
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = '#f5f5f5';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                  >
                    <IconComponent 
                      style={{ 
                        fontSize: '16px',
                        color: isActive ? '#0066cc' : '#666'
                      }} 
                    />
                    <div>
                      <div style={{ 
                        fontSize: '0.875rem',
                        lineHeight: '1.2',
                        marginBottom: '2px'
                      }}>
                        {item.label}
                      </div>
                      <div style={{ 
                        fontSize: '0.75rem',
                        color: '#666',
                        lineHeight: '1.1'
                      }}>
                        {item.description}
                      </div>
                    </div>
                  </div>
                </NavItem>
              );
            })}
          </NavList>
        </Nav>
      </div>

      {/* Footer */}
      <div style={{
        padding: '1rem',
        borderTop: '1px solid #e0e0e0',
        fontSize: '0.75rem',
        color: '#999',
        textAlign: 'center'
      }}>
        Grimoire v1.0
      </div>
    </div>
  );
};